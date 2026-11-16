const pool = require('./pool');

// Runs fn(client) inside BEGIN/COMMIT on one dedicated connection.
// A transaction has to use the same client for every statement: pool.query() could hand
// each statement a different connection, and those would run outside the transaction.
// If fn throws, everything is rolled back, so a multi-step write either fully happens or not at all.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    // Always return the connection to the pool, even after an error, or the pool runs dry.
    client.release();
  }
}

module.exports = { withTransaction };
