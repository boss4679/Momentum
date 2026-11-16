const { z } = require('zod');
const { pagination, requiredText } = require('./common');

// Mirrors the exercises_category_valid CHECK constraint.
const CATEGORIES = ['strength', 'cardio', 'mobility'];
const category = z.enum(CATEGORIES, `Must be one of: ${CATEGORIES.join(', ')}`);

// Used for both create (POST) and full replacement (PUT).
const body = z
  .object({
    name: requiredText(100, 'Name'),
    category,
  })
  .strict();

const listQuery = z.object({ ...pagination, category: category.optional() }).strict();

module.exports = { body, listQuery, CATEGORIES };
