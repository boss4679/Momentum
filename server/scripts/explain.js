// Usage: npm run explain
// Runs EXPLAIN (ANALYZE, BUFFERS) on the API's main read queries for the demo user and
// prints each plan plus the median execution time over 5 runs. Used to produce
// docs/indexes.md; seed with --extra-users=500 first so the numbers mean something.
//
// The SQL comes straight from the query modules, so this measures exactly what the API runs.
const pool = require('../src/db/pool');
const { addDays } = require('../src/utils/dates');
const summary = require('../src/db/queries/summary');
const workouts = require('../src/db/queries/workouts');
const events = require('../src/db/queries/events');

const RUNS = 5;

// The one place in the codebase where SQL text is joined together: a fixed EXPLAIN prefix
// in front of a fixed query constant, in a dev-only script. Neither part ever contains
// input, so this can't be used for injection. The values still go in as $n parameters.
const EXPLAIN_PREFIX = 'EXPLAIN (ANALYZE, BUFFERS) ';

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function explain(name, sql, params) {
  const times = [];
  let plan = [];
  for (let i = 0; i < RUNS; i++) {
    const { rows } = await pool.query(EXPLAIN_PREFIX + sql, params);
    plan = rows.map((r) => r['QUERY PLAN']);
    const timing = plan.find((line) => line.startsWith('Execution Time'));
    times.push(parseFloat(timing.replace(/[^0-9.]/g, '')));
  }

  console.log(`\n=== ${name}: median ${median(times).toFixed(3)} ms over ${RUNS} runs ===`);
  console.log(plan.join('\n'));
}

async function main() {
  const { rows } = await pool.query(
    `SELECT id, (now() AT TIME ZONE timezone)::date AS today FROM users WHERE email = $1`,
    ['demo@momentum.dev'],
  );
  if (rows.length === 0) throw new Error('Demo user not found. Run `npm run seed` first.');
  const { id: userId, today } = rows[0];
  const monthAgo = addDays(today, -29);

  const { rows: indexes } = await pool.query(
    `SELECT count(*) AS n FROM pg_indexes WHERE indexname LIKE '%\\_user\\_%\\_idx'`,
  );
  console.log(`(user/date indexes present: ${indexes[0].n})`);

  await explain('Trends: daily calories, 30 days', summary.SQL.DAILY_CALORIES_SQL, [
    userId,
    monthAgo,
    today,
  ]);
  await explain('Workouts list: last 30 days, first page', workouts.SQL.SELECT_WORKOUTS, [
    userId,
    null,
    monthAgo,
    today,
    20,
    0,
  ]);
  await explain('Calendar: one week of events', events.SQL.LIST_EVENTS_SQL, [
    userId,
    `${today}T00:00:00Z`,
    `${addDays(today, 7)}T00:00:00Z`,
    100,
    0,
  ]);
  await explain('Workout streak', summary.SQL.STREAK_SQL, [userId, today]);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
