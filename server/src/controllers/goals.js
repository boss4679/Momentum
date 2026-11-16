const pool = require('../db/pool');
const goals = require('../db/queries/goals');
const { notFound } = require('../errors/AppError');
const { paginated } = require('./pagination');

async function list(req, res) {
  const query = req.validated.query;
  const [rows, total] = await Promise.all([
    goals.listGoals(pool, req.user.id, query),
    goals.countGoals(pool, req.user.id),
  ]);
  res.json(paginated(rows, total, query));
}

// GET /api/goals/current?date=YYYY-MM-DD: the goal in force on that date.
async function current(req, res) {
  const goal = await goals.findGoalForDate(pool, req.user.id, req.validated.query.date);
  if (!goal) throw notFound('Goal');
  res.json(goal);
}

async function get(req, res) {
  const goal = await goals.findGoal(pool, req.user.id, req.validated.params.id);
  if (!goal) throw notFound('Goal');
  res.json(goal);
}

// Two goals on the same effectiveFrom date hit the unique constraint -> 409.
async function create(req, res) {
  const goal = await goals.createGoal(pool, req.user.id, req.validated.body);
  res.status(201).json(goal);
}

async function update(req, res) {
  const goal = await goals.updateGoal(
    pool,
    req.user.id,
    req.validated.params.id,
    req.validated.body,
  );
  if (!goal) throw notFound('Goal');
  res.json(goal);
}

async function remove(req, res) {
  const deleted = await goals.deleteGoal(pool, req.user.id, req.validated.params.id);
  if (!deleted) throw notFound('Goal');
  res.status(204).end();
}

module.exports = { list, current, get, create, update, remove };
