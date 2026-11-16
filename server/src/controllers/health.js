const pool = require('../db/pool');

// "The process is up" isn't enough: a running API that can't reach the database is still
// broken. 503 tells a load balancer or Docker healthcheck to stop sending it traffic.
async function health(req, res) {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'up' });
  } catch {
    res.status(503).json({ status: 'degraded', database: 'down' });
  }
}

module.exports = { health };
