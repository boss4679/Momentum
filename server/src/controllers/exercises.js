const pool = require('../db/pool');
const exercises = require('../db/queries/exercises');
const { notFound } = require('../errors/AppError');
const { paginated } = require('./pagination');

async function list(req, res) {
  const query = req.validated.query;
  const [rows, total] = await Promise.all([
    exercises.listExercises(pool, req.user.id, query),
    exercises.countExercises(pool, req.user.id, query),
  ]);
  res.json(paginated(rows, total, query));
}

async function get(req, res) {
  const exercise = await exercises.findExercise(pool, req.user.id, req.validated.params.id);
  if (!exercise) throw notFound('Exercise');
  res.json(exercise);
}

// A duplicate name (case-insensitive) hits the exercises_user_name_key unique index -> 409.
async function create(req, res) {
  const exercise = await exercises.createExercise(pool, req.user.id, req.validated.body);
  res.status(201).json(exercise);
}

async function update(req, res) {
  const exercise = await exercises.updateExercise(
    pool,
    req.user.id,
    req.validated.params.id,
    req.validated.body,
  );
  if (!exercise) throw notFound('Exercise');
  res.json(exercise);
}

// An exercise used in logged workouts can't be deleted: the foreign key from workout_sets
// raises 23503, which the error handler maps to 409.
async function remove(req, res) {
  const deleted = await exercises.deleteExercise(pool, req.user.id, req.validated.params.id);
  if (!deleted) throw notFound('Exercise');
  res.status(204).end();
}

module.exports = { list, get, create, update, remove };
