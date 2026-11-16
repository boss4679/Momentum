// A single shared connection pool for the whole process. Opening a Postgres connection
// is expensive, so the pool keeps a few open and lends them out per query.
const { Pool, types } = require('pg');
const config = require('../config');

// Type parsers: pg's defaults are surprising for three of the types we use.

// DATE (oid 1082): by default pg turns '2026-11-16' into a JS Date at *local* midnight,
// which can show up as the previous day once it's serialized to UTC. A calendar date
// has no time or timezone, so we keep the plain 'YYYY-MM-DD' string.
types.setTypeParser(1082, (value) => value);

// NUMERIC (oid 1700): by default pg returns a string, because numeric can hold values
// that a JS number can't represent exactly. Our numerics are small (weights, macros), so
// a float is safe and makes the JSON easier to use.
types.setTypeParser(1700, (value) => parseFloat(value));

// INT8/BIGINT (oid 20): COUNT(*) and SUM(integer) return bigint, which pg also returns
// as a string. Our counts and sums are far below 2^53, so parsing to a number is safe.
types.setTypeParser(20, (value) => parseInt(value, 10));

const pool = new Pool({ connectionString: config.databaseUrl });

module.exports = pool;
