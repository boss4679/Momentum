// SQL for calorie goals. A goal applies from its effective_from date until the next goal's
// date, so the table is a history of goals rather than a single current value.

async function listGoals(db, userId, { limit, offset }) {
  const { rows } = await db.query(
    `SELECT id, calorie_goal AS "calorieGoal", effective_from AS "effectiveFrom",
            created_at AS "createdAt"
     FROM daily_goals
     WHERE user_id = $1
     ORDER BY effective_from DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );
  return rows;
}

async function countGoals(db, userId) {
  const { rows } = await db.query('SELECT count(*) AS total FROM daily_goals WHERE user_id = $1', [
    userId,
  ]);
  return rows[0].total;
}

async function findGoal(db, userId, id) {
  const { rows } = await db.query(
    `SELECT id, calorie_goal AS "calorieGoal", effective_from AS "effectiveFrom",
            created_at AS "createdAt"
     FROM daily_goals
     WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return rows[0] ?? null;
}

// The goal in force on `date`: the most recent one that started on or before it.
// The UNIQUE (user_id, effective_from) constraint's index serves this directly. Postgres
// walks it backwards from `date` and stops at the first row (LIMIT 1).
async function findGoalForDate(db, userId, date) {
  const { rows } = await db.query(
    `SELECT id, calorie_goal AS "calorieGoal", effective_from AS "effectiveFrom",
            created_at AS "createdAt"
     FROM daily_goals
     WHERE user_id = $1 AND effective_from <= $2
     ORDER BY effective_from DESC
     LIMIT 1`,
    [userId, date],
  );
  return rows[0] ?? null;
}

async function createGoal(db, userId, { calorieGoal, effectiveFrom }) {
  const { rows } = await db.query(
    `INSERT INTO daily_goals (user_id, calorie_goal, effective_from)
     VALUES ($1, $2, $3)
     RETURNING id, calorie_goal AS "calorieGoal", effective_from AS "effectiveFrom",
               created_at AS "createdAt"`,
    [userId, calorieGoal, effectiveFrom],
  );
  return rows[0];
}

async function updateGoal(db, userId, id, { calorieGoal, effectiveFrom }) {
  const { rows } = await db.query(
    `UPDATE daily_goals
     SET calorie_goal = $3, effective_from = $4
     WHERE id = $1 AND user_id = $2
     RETURNING id, calorie_goal AS "calorieGoal", effective_from AS "effectiveFrom",
               created_at AS "createdAt"`,
    [id, userId, calorieGoal, effectiveFrom],
  );
  return rows[0] ?? null;
}

async function deleteGoal(db, userId, id) {
  const { rowCount } = await db.query('DELETE FROM daily_goals WHERE id = $1 AND user_id = $2', [
    id,
    userId,
  ]);
  return rowCount > 0;
}

module.exports = {
  listGoals,
  countGoals,
  findGoal,
  findGoalForDate,
  createGoal,
  updateGoal,
  deleteGoal,
};
