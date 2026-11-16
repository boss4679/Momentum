// SQL for food log entries.

// Within a day, entries are ordered in meal order (breakfast, lunch, dinner, snack), not
// alphabetically. array_position() returns a meal's index in that array, and sorting by the
// index gives the natural order.
async function listFoodEntries(db, userId, { from, to, meal, limit, offset }) {
  const { rows } = await db.query(
    `SELECT id, eaten_on AS "eatenOn", meal, name, calories,
            protein_g AS "proteinG", carbs_g AS "carbsG", fat_g AS "fatG",
            created_at AS "createdAt"
     FROM food_entries
     WHERE user_id = $1
       AND ($2::date IS NULL OR eaten_on >= $2)
       AND ($3::date IS NULL OR eaten_on <= $3)
       AND ($4::text IS NULL OR meal = $4)
     ORDER BY eaten_on DESC,
              array_position(ARRAY['breakfast', 'lunch', 'dinner', 'snack'], meal),
              id
     LIMIT $5 OFFSET $6`,
    [userId, from ?? null, to ?? null, meal ?? null, limit, offset],
  );
  return rows;
}

async function countFoodEntries(db, userId, { from, to, meal }) {
  const { rows } = await db.query(
    `SELECT count(*) AS total
     FROM food_entries
     WHERE user_id = $1
       AND ($2::date IS NULL OR eaten_on >= $2)
       AND ($3::date IS NULL OR eaten_on <= $3)
       AND ($4::text IS NULL OR meal = $4)`,
    [userId, from ?? null, to ?? null, meal ?? null],
  );
  return rows[0].total;
}

async function findFoodEntry(db, userId, id) {
  const { rows } = await db.query(
    `SELECT id, eaten_on AS "eatenOn", meal, name, calories,
            protein_g AS "proteinG", carbs_g AS "carbsG", fat_g AS "fatG",
            created_at AS "createdAt"
     FROM food_entries
     WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return rows[0] ?? null;
}

async function createFoodEntry(db, userId, entry) {
  const { rows } = await db.query(
    `INSERT INTO food_entries (user_id, eaten_on, meal, name, calories, protein_g, carbs_g, fat_g)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, eaten_on AS "eatenOn", meal, name, calories,
               protein_g AS "proteinG", carbs_g AS "carbsG", fat_g AS "fatG",
               created_at AS "createdAt"`,
    [
      userId,
      entry.eatenOn,
      entry.meal,
      entry.name,
      entry.calories,
      entry.proteinG ?? null,
      entry.carbsG ?? null,
      entry.fatG ?? null,
    ],
  );
  return rows[0];
}

async function updateFoodEntry(db, userId, id, entry) {
  const { rows } = await db.query(
    `UPDATE food_entries
     SET eaten_on = $3, meal = $4, name = $5, calories = $6,
         protein_g = $7, carbs_g = $8, fat_g = $9
     WHERE id = $1 AND user_id = $2
     RETURNING id, eaten_on AS "eatenOn", meal, name, calories,
               protein_g AS "proteinG", carbs_g AS "carbsG", fat_g AS "fatG",
               created_at AS "createdAt"`,
    [
      id,
      userId,
      entry.eatenOn,
      entry.meal,
      entry.name,
      entry.calories,
      entry.proteinG ?? null,
      entry.carbsG ?? null,
      entry.fatG ?? null,
    ],
  );
  return rows[0] ?? null;
}

async function deleteFoodEntry(db, userId, id) {
  const { rowCount } = await db.query('DELETE FROM food_entries WHERE id = $1 AND user_id = $2', [
    id,
    userId,
  ]);
  return rowCount > 0;
}

module.exports = {
  listFoodEntries,
  countFoodEntries,
  findFoodEntry,
  createFoodEntry,
  updateFoodEntry,
  deleteFoodEntry,
};
