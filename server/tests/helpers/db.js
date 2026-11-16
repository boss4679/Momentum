const pool = require('../../src/db/pool');

// Empties every table so each test file starts from a known, empty state, and no test can
// depend on data another file left behind. TRUNCATE is much faster than DELETE (it drops
// the data files instead of removing rows one by one), and RESTART IDENTITY resets the
// id counters too.
async function resetDb() {
  await pool.query(
    `TRUNCATE users, exercises, workouts, workout_sets, calendar_events, food_entries, daily_goals
     RESTART IDENTITY CASCADE`,
  );
}

// Each test file gets its own copy of the pool module (Jest isolates modules per file), so
// each file must close its pool, or Jest waits forever on the open connections.
async function closeDb() {
  await pool.end();
}

module.exports = { pool, resetDb, closeDb };
