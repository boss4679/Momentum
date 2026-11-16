const { z } = require('zod');
const { isoDate, requiredText, listQuery } = require('./common');

// Mirrors the food_entries_meal_valid CHECK constraint.
const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];
const meal = z.enum(MEALS, `Must be one of: ${MEALS.join(', ')}`);

// Optional macro in grams; the column is numeric(6,1), so at most 99999.9.
const grams = z.number().min(0, 'Cannot be negative').max(99999.9).nullish();

// Used for create (POST) and full replacement (PUT).
const body = z
  .object({
    eatenOn: isoDate,
    meal,
    name: requiredText(200, 'Name'),
    calories: z.number('Calories are required').int().min(0, 'Cannot be negative').max(20000),
    proteinG: grams,
    carbsG: grams,
    fatG: grams,
  })
  .strict();

module.exports = { body, listQuery: listQuery(isoDate, { meal: meal.optional() }), MEALS };
