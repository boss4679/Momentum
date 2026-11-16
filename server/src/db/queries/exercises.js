// SQL for the exercise catalog. Every query includes `user_id = $n`: that's how users only
// ever see and change their own rows. A row that exists but belongs to someone else is
// simply "not found".

async function listExercises(db, userId, { category, limit, offset }) {
  // ($2::text IS NULL OR category = $2) is an optional filter: when no category is given,
  // the condition is true for every row. The ::text cast tells Postgres the parameter's
  // type, which it can't infer from "IS NULL" alone.
  const { rows } = await db.query(
    `SELECT id, name, category, created_at AS "createdAt"
     FROM exercises
     WHERE user_id = $1
       AND ($2::text IS NULL OR category = $2)
     ORDER BY lower(name), id
     LIMIT $3 OFFSET $4`,
    [userId, category ?? null, limit, offset],
  );
  return rows;
}

async function countExercises(db, userId, { category }) {
  const { rows } = await db.query(
    `SELECT count(*) AS total
     FROM exercises
     WHERE user_id = $1
       AND ($2::text IS NULL OR category = $2)`,
    [userId, category ?? null],
  );
  return rows[0].total;
}

async function findExercise(db, userId, id) {
  const { rows } = await db.query(
    `SELECT id, name, category, created_at AS "createdAt"
     FROM exercises
     WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return rows[0] ?? null;
}

async function createExercise(db, userId, { name, category }) {
  const { rows } = await db.query(
    `INSERT INTO exercises (user_id, name, category)
     VALUES ($1, $2, $3)
     RETURNING id, name, category, created_at AS "createdAt"`,
    [userId, name, category],
  );
  return rows[0];
}

// Inserts several exercises in one statement (used for new users' starter catalog).
// unnest() turns the two arrays back into rows.
async function createExercises(db, userId, exercises) {
  await db.query(
    `INSERT INTO exercises (user_id, name, category)
     SELECT $1, name, category
     FROM unnest($2::text[], $3::text[]) AS t(name, category)`,
    [userId, exercises.map((e) => e.name), exercises.map((e) => e.category)],
  );
}

// Returns the updated row, or null when no row matched (missing, or not this user's).
async function updateExercise(db, userId, id, { name, category }) {
  const { rows } = await db.query(
    `UPDATE exercises
     SET name = $3, category = $4
     WHERE id = $1 AND user_id = $2
     RETURNING id, name, category, created_at AS "createdAt"`,
    [id, userId, name, category],
  );
  return rows[0] ?? null;
}

// Returns true if a row was deleted. If the exercise is used by any workout set, the
// deferred foreign key makes this fail with 23503, which the error handler turns into a 409.
async function deleteExercise(db, userId, id) {
  const { rowCount } = await db.query('DELETE FROM exercises WHERE id = $1 AND user_id = $2', [
    id,
    userId,
  ]);
  return rowCount > 0;
}

// Which of `ids` are exercises owned by this user. Used before inserting workout sets: the
// foreign key only proves an exercise *exists*, not that it's this user's.
async function findOwnedExerciseIds(db, userId, ids) {
  const { rows } = await db.query(
    `SELECT id FROM exercises WHERE user_id = $1 AND id = ANY($2::int[])`,
    [userId, ids],
  );
  return new Set(rows.map((r) => r.id));
}

module.exports = {
  listExercises,
  countExercises,
  findExercise,
  createExercise,
  createExercises,
  updateExercise,
  deleteExercise,
  findOwnedExerciseIds,
};
