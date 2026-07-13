// Workout module — RESTful CRUD for workouts and their nested exercises.
import { Router } from 'express';
import { db } from '../db.js';
import { ApiError, validate, parseId, asyncHandler } from '../validation.js';

export const workoutsRouter = Router();

const workoutRules = {
  name: { type: 'string', required: true, min: 1, max: 120 },
  date: { type: 'date', required: true },
  notes: { type: 'string', max: 1000, default: null },
};

const exerciseRules = {
  name: { type: 'string', required: true, min: 1, max: 120 },
  sets: { type: 'number', integer: true, min: 0, max: 1000, default: 0 },
  reps: { type: 'number', integer: true, min: 0, max: 10000, default: 0 },
  weight: { type: 'number', min: 0, max: 10000, default: 0 },
};

// Assemble a workout with its ordered exercises attached.
function hydrate(workout) {
  if (!workout) return workout;
  const exercises = db
    .prepare('SELECT id, name, sets, reps, weight FROM exercises WHERE workout_id = ? ORDER BY position, id')
    .all(workout.id);
  return { ...workout, exercises };
}

function getWorkout(id) {
  const workout = db
    .prepare('SELECT id, name, date, notes, created_at FROM workouts WHERE id = ?')
    .get(id);
  if (!workout) throw new ApiError(404, `Workout ${id} not found`);
  return workout;
}

// Validate the optional exercises array and return cleaned rows.
function cleanExercises(raw) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new ApiError(422, 'Validation failed', { exercises: 'must be an array' });
  return raw.map((ex, i) => {
    try {
      return validate(ex, exerciseRules);
    } catch (err) {
      // Re-scope field errors under the array index for a clearer message.
      const details = {};
      for (const [k, v] of Object.entries(err.details || {})) details[`exercises[${i}].${k}`] = v;
      throw new ApiError(422, 'Validation failed', details);
    }
  });
}

function replaceExercises(workoutId, exercises) {
  db.prepare('DELETE FROM exercises WHERE workout_id = ?').run(workoutId);
  const insert = db.prepare(
    'INSERT INTO exercises (workout_id, name, sets, reps, weight, position) VALUES (?, ?, ?, ?, ?, ?)'
  );
  exercises.forEach((ex, i) => insert.run(workoutId, ex.name, ex.sets, ex.reps, ex.weight, i));
}

// GET /api/workouts — list, newest first, with exercises nested.
workoutsRouter.get('/', asyncHandler((req, res) => {
  const workouts = db
    .prepare('SELECT id, name, date, notes, created_at FROM workouts ORDER BY date DESC, id DESC')
    .all();
  res.json(workouts.map(hydrate));
}));

// GET /api/workouts/:id
workoutsRouter.get('/:id', asyncHandler((req, res) => {
  const id = parseId(req.params.id);
  res.json(hydrate(getWorkout(id)));
}));

// POST /api/workouts
workoutsRouter.post('/', asyncHandler((req, res) => {
  const data = validate(req.body, workoutRules);
  const exercises = cleanExercises(req.body.exercises);

  const info = db
    .prepare('INSERT INTO workouts (name, date, notes) VALUES (?, ?, ?)')
    .run(data.name, data.date, data.notes);
  const workoutId = Number(info.lastInsertRowid);
  replaceExercises(workoutId, exercises);

  res.status(201).json(hydrate(getWorkout(workoutId)));
}));

// PUT /api/workouts/:id — full update, replaces the exercise list.
workoutsRouter.put('/:id', asyncHandler((req, res) => {
  const id = parseId(req.params.id);
  getWorkout(id); // 404 if missing
  const data = validate(req.body, workoutRules);
  const exercises = cleanExercises(req.body.exercises);

  db.prepare('UPDATE workouts SET name = ?, date = ?, notes = ? WHERE id = ?')
    .run(data.name, data.date, data.notes, id);
  replaceExercises(id, exercises);

  res.json(hydrate(getWorkout(id)));
}));

// DELETE /api/workouts/:id — cascades to exercises via the FK.
workoutsRouter.delete('/:id', asyncHandler((req, res) => {
  const id = parseId(req.params.id);
  getWorkout(id);
  db.prepare('DELETE FROM workouts WHERE id = ?').run(id);
  res.status(204).end();
}));
