// Nutrition module — a reusable food catalog plus dated calorie log entries.
// Entries reference foods (N:1) so calorie/macro facts live in exactly one row.
import { Router } from 'express';
import { db } from '../db.js';
import { ApiError, validate, parseId, asyncHandler } from '../validation.js';

export const nutritionRouter = Router();

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];

const foodRules = {
  name: { type: 'string', required: true, min: 1, max: 120 },
  calories: { type: 'number', required: true, integer: true, min: 0, max: 10000 },
  protein: { type: 'number', min: 0, max: 5000, default: 0 },
  carbs: { type: 'number', min: 0, max: 5000, default: 0 },
  fat: { type: 'number', min: 0, max: 5000, default: 0 },
};

const entryRules = {
  food_id: { type: 'number', required: true, integer: true, min: 1 },
  date: { type: 'date', required: true },
  meal: { type: 'enum', values: MEALS, default: 'breakfast' },
  servings: { type: 'number', min: 0.01, max: 100, default: 1 },
};

// ---- Food catalog -----------------------------------------------------------

// GET /api/nutrition/foods — the shared catalog.
nutritionRouter.get('/foods', asyncHandler((req, res) => {
  const foods = db.prepare('SELECT id, name, calories, protein, carbs, fat FROM foods ORDER BY name').all();
  res.json(foods);
}));

// POST /api/nutrition/foods — add a food to the catalog.
nutritionRouter.post('/foods', asyncHandler((req, res) => {
  const data = validate(req.body, foodRules);
  const exists = db.prepare('SELECT id FROM foods WHERE name = ? COLLATE NOCASE').get(data.name);
  if (exists) throw new ApiError(409, `A food named "${data.name}" already exists`);
  const info = db
    .prepare('INSERT INTO foods (name, calories, protein, carbs, fat) VALUES (?, ?, ?, ?, ?)')
    .run(data.name, data.calories, data.protein, data.carbs, data.fat);
  const food = db.prepare('SELECT id, name, calories, protein, carbs, fat FROM foods WHERE id = ?').get(Number(info.lastInsertRowid));
  res.status(201).json(food);
}));

// DELETE /api/nutrition/foods/:id — remove a food from the catalog.
// Blocked (409) if any log entry still references it, preserving integrity.
nutritionRouter.delete('/foods/:id', asyncHandler((req, res) => {
  const id = parseId(req.params.id);
  const food = db.prepare('SELECT id FROM foods WHERE id = ?').get(id);
  if (!food) throw new ApiError(404, `Food ${id} not found`);
  const inUse = db.prepare('SELECT COUNT(*) AS c FROM nutrition_entries WHERE food_id = ?').get(id).c;
  if (inUse > 0) throw new ApiError(409, `Cannot delete: this food is used by ${inUse} logged entr${inUse === 1 ? 'y' : 'ies'}`);
  db.prepare('DELETE FROM foods WHERE id = ?').run(id);
  res.status(204).end();
}));

// ---- Log entries ------------------------------------------------------------

// Entry joined with its food, exposing computed totals for the serving count.
const ENTRY_SELECT = `
  SELECT e.id, e.date, e.meal, e.servings, e.created_at,
         f.id AS food_id, f.name AS food_name,
         ROUND(f.calories * e.servings)      AS calories,
         ROUND(f.protein  * e.servings, 1)   AS protein,
         ROUND(f.carbs    * e.servings, 1)   AS carbs,
         ROUND(f.fat      * e.servings, 1)   AS fat
  FROM nutrition_entries e
  JOIN foods f ON f.id = e.food_id
`;

function getEntry(id) {
  const entry = db.prepare(`${ENTRY_SELECT} WHERE e.id = ?`).get(id);
  if (!entry) throw new ApiError(404, `Nutrition entry ${id} not found`);
  return entry;
}

function assertFoodExists(foodId) {
  const food = db.prepare('SELECT id FROM foods WHERE id = ?').get(foodId);
  if (!food) throw new ApiError(422, 'Validation failed', { food_id: 'references a food that does not exist' });
}

// GET /api/nutrition?date=YYYY-MM-DD — entries for a day (defaults to all).
nutritionRouter.get('/', asyncHandler((req, res) => {
  const { date } = req.query;
  const where = date ? 'WHERE e.date = ?' : '';
  const params = date ? [date] : [];
  const entries = db
    .prepare(`${ENTRY_SELECT} ${where} ORDER BY e.date DESC, e.id DESC`)
    .all(...params);
  res.json(entries);
}));

// GET /api/nutrition/:id
nutritionRouter.get('/:id', asyncHandler((req, res) => {
  res.json(getEntry(parseId(req.params.id)));
}));

// POST /api/nutrition — log a food serving.
nutritionRouter.post('/', asyncHandler((req, res) => {
  const data = validate(req.body, entryRules);
  assertFoodExists(data.food_id);
  const info = db
    .prepare('INSERT INTO nutrition_entries (food_id, date, meal, servings) VALUES (?, ?, ?, ?)')
    .run(data.food_id, data.date, data.meal, data.servings);
  res.status(201).json(getEntry(Number(info.lastInsertRowid)));
}));

// PUT /api/nutrition/:id
nutritionRouter.put('/:id', asyncHandler((req, res) => {
  const id = parseId(req.params.id);
  getEntry(id);
  const data = validate(req.body, entryRules);
  assertFoodExists(data.food_id);
  db.prepare('UPDATE nutrition_entries SET food_id = ?, date = ?, meal = ?, servings = ? WHERE id = ?')
    .run(data.food_id, data.date, data.meal, data.servings, id);
  res.json(getEntry(id));
}));

// DELETE /api/nutrition/:id
nutritionRouter.delete('/:id', asyncHandler((req, res) => {
  const id = parseId(req.params.id);
  getEntry(id);
  db.prepare('DELETE FROM nutrition_entries WHERE id = ?').run(id);
  res.status(204).end();
}));
