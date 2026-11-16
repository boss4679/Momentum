const pool = require('../db/pool');
const { withTransaction } = require('../db/transaction');
const workouts = require('../db/queries/workouts');
const exercises = require('../db/queries/exercises');
const { notFound, validationError } = require('../errors/AppError');
const { paginated } = require('./pagination');

// Every set must reference one of *this user's* exercises. The foreign key only proves the
// exercise exists, so without this check a user could attach another user's exercise
// (and see its name in their own workout). Reported as 422, pointing at each bad set.
async function assertExercisesOwned(db, userId, sets) {
  const ids = [...new Set(sets.map((s) => s.exerciseId))];
  const owned = await exercises.findOwnedExerciseIds(db, userId, ids);

  const details = [];
  sets.forEach((s, index) => {
    if (!owned.has(s.exerciseId)) {
      details.push({ field: `sets.${index}.exerciseId`, message: 'Exercise not found' });
    }
  });
  if (details.length > 0) {
    throw validationError('Validation failed', details);
  }
}

async function list(req, res) {
  const query = req.validated.query;
  const [rows, total] = await Promise.all([
    workouts.listWorkouts(pool, req.user.id, query),
    workouts.countWorkouts(pool, req.user.id, query),
  ]);
  res.json(paginated(rows, total, query));
}

async function get(req, res) {
  const workout = await workouts.findWorkout(pool, req.user.id, req.validated.params.id);
  if (!workout) throw notFound('Workout');
  res.json(workout);
}

// Creating a workout is several statements (check exercises, insert the workout, insert its
// sets), so it runs in a transaction: if any step fails, no half-saved workout is left behind.
async function create(req, res) {
  const userId = req.user.id;
  const body = req.validated.body;

  const workoutId = await withTransaction(async (client) => {
    await assertExercisesOwned(client, userId, body.sets);
    const id = await workouts.insertWorkout(client, userId, body);
    await workouts.insertSets(client, id, body.sets);
    return id;
  });

  // Read it back after COMMIT, through the same query GET uses, so the response has exactly
  // the shape a later GET will return (exercise names, set ids, and so on).
  res.status(201).json(await workouts.findWorkout(pool, userId, workoutId));
}

// PUT replaces the whole workout, sets included. Replacing every set (delete all, insert the
// new list) is simpler and easier to reason about than diffing old sets against new ones.
// The transaction makes the swap atomic: other requests see the old sets or the new ones,
// never a mix.
async function update(req, res) {
  const userId = req.user.id;
  const { id } = req.validated.params;
  const body = req.validated.body;

  await withTransaction(async (client) => {
    if (!(await workouts.lockWorkout(client, userId, id))) throw notFound('Workout');
    await assertExercisesOwned(client, userId, body.sets);
    await workouts.updateWorkout(client, userId, id, body);
    await workouts.deleteSets(client, id);
    await workouts.insertSets(client, id, body.sets);
  });

  res.json(await workouts.findWorkout(pool, userId, id));
}

async function remove(req, res) {
  const deleted = await workouts.deleteWorkout(pool, req.user.id, req.validated.params.id);
  if (!deleted) throw notFound('Workout');
  res.status(204).end();
}

async function personalBests(req, res) {
  res.json({ data: await workouts.findPersonalBests(pool, req.user.id) });
}

module.exports = { list, get, create, update, remove, personalBests };
