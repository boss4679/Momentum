// SQL for workouts and their sets.

// Reads workouts with their sets nested inside, in ONE query. Used for the list endpoint
// (a page of workouts in a date range) and for a single workout (pass `id`).
//
// How it works:
// 1. The `page` CTE picks which workouts to return: this user's, optionally one id or a
//    date range, newest first, with LIMIT/OFFSET. Paginating here, *before* joining sets,
//    means LIMIT counts workouts, not set rows.
// 2. The outer query LEFT JOINs each workout to its sets and their exercise names.
// 3. GROUP BY collapses those rows back to one per workout, and json_agg(...) gathers that
//    workout's sets into a JSON array, ordered by s.id (the order they were sent in).
//    FILTER (WHERE s.id IS NOT NULL) plus COALESCE(..., '[]') gives an empty array instead
//    of [null] if a workout ever had no sets.
//
// The alternative, one query for the workouts and then one per workout for its sets, is the
// classic "N+1 queries" problem: 21 round trips for a page of 20 instead of 1.
const SELECT_WORKOUTS = `
  WITH page AS (
    SELECT id, performed_on, notes, created_at
    FROM workouts
    WHERE user_id = $1
      AND ($2::int  IS NULL OR id = $2)
      AND ($3::date IS NULL OR performed_on >= $3)
      AND ($4::date IS NULL OR performed_on <= $4)
    ORDER BY performed_on DESC, id DESC
    LIMIT $5 OFFSET $6
  )
  SELECT p.id,
         p.performed_on AS "performedOn",
         p.notes,
         p.created_at AS "createdAt",
         COALESCE(
           json_agg(
             json_build_object(
               'id', s.id,
               'exerciseId', s.exercise_id,
               'exerciseName', e.name,
               'category', e.category,
               'setNumber', s.set_number,
               'reps', s.reps,
               'weightKg', s.weight_kg,
               'durationSec', s.duration_sec
             ) ORDER BY s.id
           ) FILTER (WHERE s.id IS NOT NULL),
           '[]'
         ) AS sets
  FROM page p
  LEFT JOIN workout_sets s ON s.workout_id = p.id
  LEFT JOIN exercises e ON e.id = s.exercise_id
  GROUP BY p.id, p.performed_on, p.notes, p.created_at
  ORDER BY p.performed_on DESC, p.id DESC`;

async function listWorkouts(db, userId, { from, to, limit, offset }) {
  const { rows } = await db.query(SELECT_WORKOUTS, [
    userId,
    null,
    from ?? null,
    to ?? null,
    limit,
    offset,
  ]);
  return rows;
}

async function findWorkout(db, userId, id) {
  const { rows } = await db.query(SELECT_WORKOUTS, [userId, id, null, null, 1, 0]);
  return rows[0] ?? null;
}

async function countWorkouts(db, userId, { from, to }) {
  const { rows } = await db.query(
    `SELECT count(*) AS total
     FROM workouts
     WHERE user_id = $1
       AND ($2::date IS NULL OR performed_on >= $2)
       AND ($3::date IS NULL OR performed_on <= $3)`,
    [userId, from ?? null, to ?? null],
  );
  return rows[0].total;
}

async function insertWorkout(db, userId, { performedOn, notes }) {
  const { rows } = await db.query(
    `INSERT INTO workouts (user_id, performed_on, notes)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [userId, performedOn, notes],
  );
  return rows[0].id;
}

// Returns true if the workout exists and belongs to the user.
// FOR UPDATE locks the row until the transaction ends, so two simultaneous edits of the
// same workout run one after the other instead of interleaving their set replacements.
async function lockWorkout(db, userId, id) {
  const { rowCount } = await db.query(
    'SELECT 1 FROM workouts WHERE id = $1 AND user_id = $2 FOR UPDATE',
    [id, userId],
  );
  return rowCount > 0;
}

async function updateWorkout(db, userId, id, { performedOn, notes }) {
  await db.query(
    `UPDATE workouts
     SET performed_on = $3, notes = $4
     WHERE id = $1 AND user_id = $2`,
    [id, userId, performedOn, notes],
  );
}

// All sets in one statement: each column is one array parameter, and unnest() zips the
// arrays back into rows. Missing optional values are sent as NULL.
async function insertSets(db, workoutId, sets) {
  await db.query(
    `INSERT INTO workout_sets (workout_id, exercise_id, set_number, reps, weight_kg, duration_sec)
     SELECT $1, t.*
     FROM unnest($2::int[], $3::int[], $4::int[], $5::numeric[], $6::int[])
          AS t(exercise_id, set_number, reps, weight_kg, duration_sec)`,
    [
      workoutId,
      sets.map((s) => s.exerciseId),
      sets.map((s) => s.setNumber),
      sets.map((s) => s.reps ?? null),
      sets.map((s) => s.weightKg ?? null),
      sets.map((s) => s.durationSec ?? null),
    ],
  );
}

async function deleteSets(db, workoutId) {
  await db.query('DELETE FROM workout_sets WHERE workout_id = $1', [workoutId]);
}

// The sets go too, via ON DELETE CASCADE.
async function deleteWorkout(db, userId, id) {
  const { rowCount } = await db.query('DELETE FROM workouts WHERE id = $1 AND user_id = $2', [
    id,
    userId,
  ]);
  return rowCount > 0;
}

// Personal bests per exercise, for every exercise the user has logged at least one set of.
//
// How it works:
// - user_sets: all of this user's sets, with the date of the workout they belong to.
// - heaviest: the single heaviest set per exercise. DISTINCT ON (exercise_id) keeps only
//   the FIRST row for each exercise in the ORDER BY order, so sorting by weight DESC puts
//   the heaviest set first. Ties go to more reps, then to the earliest date (when the
//   record was first set). Unlike max(weight_kg), this keeps the other columns of that
//   row: the reps and the date of the record set.
// - totals: plain aggregates per exercise (best reps, longest duration, how many sets).
// - The final SELECT joins those to the exercise names. LEFT JOIN heaviest because cardio
//   and bodyweight exercises have no weighted sets, so they have no row there.
async function findPersonalBests(db, userId) {
  const { rows } = await db.query(
    `WITH user_sets AS (
       SELECT s.exercise_id, s.reps, s.weight_kg, s.duration_sec, w.performed_on
       FROM workout_sets s
       JOIN workouts w ON w.id = s.workout_id
       WHERE w.user_id = $1
     ),
     heaviest AS (
       SELECT DISTINCT ON (exercise_id) exercise_id, weight_kg, reps, performed_on
       FROM user_sets
       WHERE weight_kg IS NOT NULL
       ORDER BY exercise_id, weight_kg DESC, reps DESC, performed_on ASC
     ),
     totals AS (
       SELECT exercise_id,
              max(reps)          AS max_reps,
              max(duration_sec)  AS max_duration_sec,
              count(*)           AS set_count,
              max(performed_on)  AS last_performed_on
       FROM user_sets
       GROUP BY exercise_id
     )
     SELECT e.id                AS "exerciseId",
            e.name              AS "exerciseName",
            e.category,
            h.weight_kg         AS "maxWeightKg",
            h.reps              AS "repsAtMaxWeight",
            h.performed_on      AS "maxWeightOn",
            t.max_reps          AS "maxReps",
            t.max_duration_sec  AS "maxDurationSec",
            t.set_count         AS "setCount",
            t.last_performed_on AS "lastPerformedOn"
     FROM exercises e
     JOIN totals t ON t.exercise_id = e.id
     LEFT JOIN heaviest h ON h.exercise_id = e.id
     WHERE e.user_id = $1
     ORDER BY lower(e.name)`,
    [userId],
  );
  return rows;
}

module.exports = {
  listWorkouts,
  findWorkout,
  countWorkouts,
  insertWorkout,
  lockWorkout,
  updateWorkout,
  insertSets,
  deleteSets,
  deleteWorkout,
  findPersonalBests,
};
