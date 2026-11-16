// SQL for the users table. Every value goes in as a $n parameter: pg sends the SQL text and
// the values to Postgres separately, so a value can never change the structure of the query.
// The SQL itself is always a fixed string. Even column lists aren't spliced in with
// template literals, so every query can be read exactly as Postgres runs it.
//
// Column aliases (created_at AS "createdAt") convert Postgres snake_case to the API's
// camelCase right in the query. The quotes keep the capital letter, since Postgres
// lower-cases unquoted identifiers.
//
// password_hash is only selected by the one query that needs it (login), so it can't end
// up in an API response by accident.
const pool = require('../pool');

async function createUser({ email, passwordHash, timezone }) {
  // COALESCE($3, 'UTC'): when no timezone is given, fall back to the same default as the column.
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, timezone)
     VALUES ($1, $2, COALESCE($3, 'UTC'))
     RETURNING id, email, timezone, created_at AS "createdAt"`,
    [email, passwordHash, timezone ?? null],
  );
  return rows[0];
}

async function findUserWithHashByEmail(email) {
  const { rows } = await pool.query(
    `SELECT id, email, timezone, created_at AS "createdAt", password_hash AS "passwordHash"
     FROM users
     WHERE email = $1`,
    [email],
  );
  return rows[0] ?? null;
}

async function findUserById(id) {
  const { rows } = await pool.query(
    `SELECT id, email, timezone, created_at AS "createdAt"
     FROM users
     WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

module.exports = { createUser, findUserWithHashByEmail, findUserById };
