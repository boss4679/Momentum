// Usage: npm run seed                         demo user only
//        npm run seed -- --extra-users=500    plus 500 load-test users
//
// Creates (or re-creates) a demo user with ~4 months of workouts, meals, goals and events,
// so the dashboard, trends and charts have real-looking data to show.
// Log in as demo@momentum.dev / password123.
//
// --extra-users adds that many more users with the same kind of history. They're there for
// docs/indexes.md: with a single user, every row in every table is "this user's" row and an
// index on user_id can't help. With 500 users the demo user owns 0.2% of the rows, as one
// user would in a real app, and EXPLAIN shows what the indexes do. Load-test users are named
// loadtest+N@example.com and are replaced on every run.
const bcrypt = require('bcrypt');
const pool = require('../src/db/pool');
const { withTransaction } = require('../src/db/transaction');
const { createRandom } = require('./seed/random');
const { todayIn, addDays, isWeekend } = require('../src/utils/dates');
const { EXERCISES, ROUTINES, FOODS, WEEKDAY_EVENTS, WEEKEND_EVENTS } = require('./seed/catalog');

const DEMO_EMAIL = 'demo@momentum.dev';
const DEMO_PASSWORD = 'password123';
const DEMO_TIMEZONE = 'America/Los_Angeles';
const HISTORY_DAYS = 120; // past days of data, including today
const FUTURE_DAYS = 14; // calendar events also run two weeks ahead
const SEED = 42;
const LOADTEST_EMAIL_PATTERN = 'loadtest+%@example.com';

const BCRYPT_ROUNDS = 10;

// Days with no workouts, so the history isn't uniform:
// a week-long break in the middle, and a rest day right before the current streak.
const VACATION = { from: -70, to: -64 };
const CURRENT_STREAK_DAYS = 6; // offsets -5..0 always have a workout

// ---------------------------------------------------------------------------
// Data generation (pure functions: they build plain arrays, no database access)
// ---------------------------------------------------------------------------

function roundTo(value, step) {
  return Math.round(value / step) * step;
}

function isWorkoutDay(offset, rng) {
  if (offset > -CURRENT_STREAK_DAYS) return true;
  if (offset === -CURRENT_STREAK_DAYS) return false; // ends the previous streak
  if (offset >= VACATION.from && offset <= VACATION.to) return false;
  return rng.chance(0.6);
}

// One exercise's sets in one workout. `progress` goes from 0 (first day) to 1 (today) and
// drives a slow strength increase, so personal bests climb over the seeded period.
function generateSets(exercise, progress, rng) {
  if (exercise.name === 'Running') {
    return [{ reps: null, weightKg: null, durationSec: rng.int(25, 50) * 60 }];
  }
  if (exercise.name === 'Cycling') {
    return [{ reps: null, weightKg: null, durationSec: rng.int(40, 75) * 60 }];
  }
  if (exercise.name === 'Plank') {
    return Array.from({ length: 3 }, () => ({
      reps: null,
      weightKg: null,
      durationSec: rng.int(45, 60 + Math.round(progress * 45)),
    }));
  }

  const setCount = rng.int(3, 4);
  return Array.from({ length: setCount }, () => ({
    reps: rng.int(5, 10),
    // Bodyweight exercises (pull-ups) have no weight; NULL means "not applicable", not 0 kg.
    weightKg:
      exercise.startKg > 0
        ? roundTo(exercise.startKg * (1 + 0.15 * progress) + rng.between(-2.5, 2.5), 2.5)
        : null,
    durationSec: null,
  }));
}

function generateWorkouts(today, rng) {
  const workouts = [];
  let routineIndex = 0;

  for (let offset = -(HISTORY_DAYS - 1); offset <= 0; offset++) {
    if (!isWorkoutDay(offset, rng)) continue;

    const routine = ROUTINES[routineIndex % ROUTINES.length];
    routineIndex++;
    const progress = (offset + HISTORY_DAYS - 1) / (HISTORY_DAYS - 1);

    const exercises = routine.exercises.map((name) => {
      const exercise = EXERCISES.find((e) => e.name === name);
      return { name, sets: generateSets(exercise, progress, rng) };
    });

    workouts.push({ performedOn: addDays(today, offset), notes: routine.notes, exercises });
  }
  return workouts;
}

function scaledFood(food, rng) {
  const portion = rng.between(0.9, 1.35);
  return {
    name: food.name,
    calories: Math.round(food.calories * portion),
    protein_g: Math.round(food.protein_g * portion * 10) / 10,
    carbs_g: Math.round(food.carbs_g * portion * 10) / 10,
    fat_g: Math.round(food.fat_g * portion * 10) / 10,
  };
}

function generateFoodEntries(today, rng) {
  const entries = [];

  for (let offset = -(HISTORY_DAYS - 1); offset <= 0; offset++) {
    const eatenOn = addDays(today, offset);
    const isToday = offset === 0;

    // Real logs have gaps: about 1 day in 25 isn't logged at all. These gaps also give
    // the 7-day rolling average something interesting to handle.
    if (!isToday && rng.chance(0.04)) continue;

    // Today is only "half eaten", so the dashboard shows calories still remaining.
    const meals = isToday ? ['breakfast', 'lunch'] : ['breakfast', 'lunch', 'dinner'];
    for (const meal of meals) {
      entries.push({ eatenOn, meal, ...scaledFood(rng.pick(FOODS[meal]), rng) });
    }

    const snackCount = isWeekend(eatenOn) ? rng.int(1, 3) : rng.int(0, 2);
    for (let i = 0; i < snackCount; i++) {
      entries.push({ eatenOn, meal: 'snack', ...scaledFood(rng.pick(FOODS.snack), rng) });
    }
  }
  return entries;
}

// Two goals, so "which goal applied on this date" has a real answer to test against.
function generateGoals(today) {
  const firstDay = addDays(today, -(HISTORY_DAYS - 1));
  return [
    { calorieGoal: 2400, effectiveFrom: firstDay },
    { calorieGoal: 2200, effectiveFrom: addDays(firstDay, 60) },
  ];
}

function generateEvents(today, rng) {
  const events = [];

  for (let offset = -(HISTORY_DAYS - 1); offset <= FUTURE_DAYS; offset++) {
    const date = addDays(today, offset);
    const templates = isWeekend(date) ? WEEKEND_EVENTS : WEEKDAY_EVENTS;
    for (const t of templates) {
      if (rng.chance(t.probability)) {
        events.push({ ...t, date, notes: null });
      }
    }
  }

  // A few one-off events in the coming days, so "upcoming events" has variety.
  events.push(
    {
      title: 'Dentist appointment',
      date: addDays(today, 2),
      start: '16:15',
      end: '17:00',
      category: 'personal',
      notes: 'Bring insurance card',
    },
    {
      title: "Sam's birthday drinks",
      date: addDays(today, 5),
      start: '21:45',
      end: '23:30',
      category: 'social',
      notes: null,
    },
  );
  return events;
}

// ---------------------------------------------------------------------------
// Database writes
// ---------------------------------------------------------------------------
// Bulk inserts use unnest(): each column is sent as ONE array parameter, and Postgres
// turns the arrays back into rows. That's a single round trip for hundreds of rows, and
// it's still fully parameterized. No SQL is built from strings.

async function insertUser(client, { email, passwordHash, timezone }) {
  const { rows } = await client.query(
    `INSERT INTO users (email, password_hash, timezone)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [email, passwordHash, timezone],
  );
  return rows[0].id;
}

// Returns a Map of exercise name -> id, used to link sets to their exercise.
async function insertExercises(client, userId) {
  const { rows } = await client.query(
    `INSERT INTO exercises (user_id, name, category)
     SELECT $1, name, category
     FROM unnest($2::text[], $3::text[]) AS t(name, category)
     RETURNING id, name`,
    [userId, EXERCISES.map((e) => e.name), EXERCISES.map((e) => e.category)],
  );
  return new Map(rows.map((r) => [r.name, r.id]));
}

async function insertWorkouts(client, userId, workouts, exerciseIds) {
  // Collect every set across every workout into parallel column arrays for one bulk insert.
  const sets = {
    workoutId: [],
    exerciseId: [],
    setNumber: [],
    reps: [],
    weightKg: [],
    durationSec: [],
  };

  // All workouts in one statement. Each set needs its workout's generated id, so RETURNING
  // gives back (id, performed_on) pairs. The generator makes at most one workout per day,
  // so the date identifies the workout. (SQL doesn't promise RETURNING rows come back in
  // insert order, so matching by position would be fragile.)
  const { rows } = await client.query(
    `INSERT INTO workouts (user_id, performed_on, notes)
     SELECT $1, t.performed_on, t.notes
     FROM unnest($2::date[], $3::text[]) AS t(performed_on, notes)
     RETURNING id, performed_on`,
    [userId, workouts.map((w) => w.performedOn), workouts.map((w) => w.notes)],
  );
  const workoutIdByDate = new Map(rows.map((r) => [r.performed_on, r.id]));

  for (const workout of workouts) {
    const workoutId = workoutIdByDate.get(workout.performedOn);
    for (const exercise of workout.exercises) {
      exercise.sets.forEach((set, index) => {
        sets.workoutId.push(workoutId);
        sets.exerciseId.push(exerciseIds.get(exercise.name));
        sets.setNumber.push(index + 1);
        sets.reps.push(set.reps);
        sets.weightKg.push(set.weightKg);
        sets.durationSec.push(set.durationSec);
      });
    }
  }

  await client.query(
    `INSERT INTO workout_sets (workout_id, exercise_id, set_number, reps, weight_kg, duration_sec)
     SELECT *
     FROM unnest($1::int[], $2::int[], $3::int[], $4::int[], $5::numeric[], $6::int[])`,
    [sets.workoutId, sets.exerciseId, sets.setNumber, sets.reps, sets.weightKg, sets.durationSec],
  );
  return sets.workoutId.length;
}

async function insertFoodEntries(client, userId, entries) {
  await client.query(
    `INSERT INTO food_entries (user_id, eaten_on, meal, name, calories, protein_g, carbs_g, fat_g)
     SELECT $1, t.*
     FROM unnest($2::date[], $3::text[], $4::text[], $5::int[],
                 $6::numeric[], $7::numeric[], $8::numeric[])
          AS t(eaten_on, meal, name, calories, protein_g, carbs_g, fat_g)`,
    [
      userId,
      entries.map((e) => e.eatenOn),
      entries.map((e) => e.meal),
      entries.map((e) => e.name),
      entries.map((e) => e.calories),
      entries.map((e) => e.protein_g),
      entries.map((e) => e.carbs_g),
      entries.map((e) => e.fat_g),
    ],
  );
}

async function insertGoals(client, userId, goals) {
  await client.query(
    `INSERT INTO daily_goals (user_id, calorie_goal, effective_from)
     SELECT $1, t.*
     FROM unnest($2::int[], $3::date[]) AS t(calorie_goal, effective_from)`,
    [userId, goals.map((g) => g.calorieGoal), goals.map((g) => g.effectiveFrom)],
  );
}

async function insertEvents(client, userId, timeZone, events) {
  // date + time gives a timestamp with no zone (a "wall clock" time). AT TIME ZONE then
  // reads that wall-clock time as local time in the user's zone and converts it to an
  // absolute timestamptz, so DST is handled by Postgres, not by us.
  await client.query(
    `INSERT INTO calendar_events (user_id, title, starts_at, ends_at, category, notes)
     SELECT $1,
            t.title,
            (t.day + t.start_time) AT TIME ZONE $2,
            (t.day + t.end_time)   AT TIME ZONE $2,
            t.category,
            t.notes
     FROM unnest($3::text[], $4::date[], $5::time[], $6::time[], $7::text[], $8::text[])
          AS t(title, day, start_time, end_time, category, notes)`,
    [
      userId,
      timeZone,
      events.map((e) => e.title),
      events.map((e) => e.date),
      events.map((e) => e.start),
      events.map((e) => e.end),
      events.map((e) => e.category),
      events.map((e) => e.notes),
    ],
  );
}

// ---------------------------------------------------------------------------

// Generates and inserts one user's whole history, in one transaction, so a failure never
// leaves a half-seeded user behind. Returns row counts for the log.
async function seedUser({ email, passwordHash, timezone, seed }) {
  const rng = createRandom(seed);
  const today = todayIn(timezone);
  const workouts = generateWorkouts(today, rng);
  const foodEntries = generateFoodEntries(today, rng);
  const goals = generateGoals(today);
  const events = generateEvents(today, rng);

  const setCount = await withTransaction(async (client) => {
    const userId = await insertUser(client, { email, passwordHash, timezone });
    const exerciseIds = await insertExercises(client, userId);
    const sets = await insertWorkouts(client, userId, workouts, exerciseIds);
    await insertFoodEntries(client, userId, foodEntries);
    await insertGoals(client, userId, goals);
    await insertEvents(client, userId, timezone, events);
    return sets;
  });

  return {
    today,
    workouts: workouts.length,
    sets: setCount,
    foodEntries: foodEntries.length,
    goals: goals.length,
    events: events.length,
  };
}

function parseExtraUsers(argv) {
  const arg = argv.find((a) => a.startsWith('--extra-users='));
  if (!arg) return 0;
  const count = Number(arg.split('=')[1]);
  if (!Number.isInteger(count) || count < 0) {
    throw new Error('--extra-users must be a whole number, e.g. --extra-users=500');
  }
  return count;
}

async function main() {
  const extraUsers = parseExtraUsers(process.argv.slice(2));

  // Deleting old seeded users cascades to all of their rows, which makes the seed re-runnable.
  await pool.query('DELETE FROM users WHERE email = $1', [DEMO_EMAIL]);
  await pool.query('DELETE FROM users WHERE email LIKE $1', [LOADTEST_EMAIL_PATTERN]);

  const demoHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);
  const demo = await seedUser({
    email: DEMO_EMAIL,
    passwordHash: demoHash,
    timezone: DEMO_TIMEZONE,
    seed: SEED,
  });

  console.log(`Seeded ${DEMO_EMAIL} (password: ${DEMO_PASSWORD}), today = ${demo.today}`);
  console.log(`  exercises:       ${EXERCISES.length}`);
  console.log(`  workouts:        ${demo.workouts} (${demo.sets} sets)`);
  console.log(`  food entries:    ${demo.foodEntries}`);
  console.log(`  goals:           ${demo.goals}`);
  console.log(`  calendar events: ${demo.events}`);

  if (extraUsers > 0) {
    // One hash shared by every load-test user: bcrypt is slow on purpose, and hashing 500
    // passwords would add most of a minute for accounts nobody logs into.
    const sharedHash = await bcrypt.hash('loadtest-password', BCRYPT_ROUNDS);
    for (let i = 1; i <= extraUsers; i++) {
      await seedUser({
        email: `loadtest+${i}@example.com`,
        passwordHash: sharedHash,
        timezone: 'UTC',
        seed: SEED + i, // a different but repeatable history per user
      });
      if (i % 100 === 0 || i === extraUsers) console.log(`  load-test users: ${i}/${extraUsers}`);
    }
  }

  // Refresh the planner's statistics (row counts, value distributions) after a big load,
  // so EXPLAIN reflects the new data instead of stale estimates.
  await pool.query('ANALYZE');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  })
  // Close the pool so Node can exit; an open pool keeps the process alive.
  .finally(() => pool.end());
