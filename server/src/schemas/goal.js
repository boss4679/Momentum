const { z } = require('zod');
const { isoDate, pagination } = require('./common');

// Used for create (POST) and full replacement (PUT). The range mirrors the
// daily_goals_calorie_goal_range CHECK constraint.
const body = z
  .object({
    calorieGoal: z
      .number('Calorie goal is required')
      .int()
      .min(500, 'Must be at least 500')
      .max(10000, 'Must be at most 10000'),
    effectiveFrom: isoDate,
  })
  .strict();

const listQuery = z.object(pagination).strict();

// GET /api/goals/current?date=YYYY-MM-DD. The date is required, because "today" depends on
// the user's timezone and the client knows which day it's showing.
const currentQuery = z.object({ date: isoDate }).strict();

module.exports = { body, listQuery, currentQuery };
