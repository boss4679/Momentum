const pool = require('../db/pool');
const foodEntries = require('../db/queries/foodEntries');
const { notFound } = require('../errors/AppError');
const { paginated } = require('./pagination');

async function list(req, res) {
  const query = req.validated.query;
  const [rows, total] = await Promise.all([
    foodEntries.listFoodEntries(pool, req.user.id, query),
    foodEntries.countFoodEntries(pool, req.user.id, query),
  ]);
  res.json(paginated(rows, total, query));
}

async function get(req, res) {
  const entry = await foodEntries.findFoodEntry(pool, req.user.id, req.validated.params.id);
  if (!entry) throw notFound('Food entry');
  res.json(entry);
}

async function create(req, res) {
  const entry = await foodEntries.createFoodEntry(pool, req.user.id, req.validated.body);
  res.status(201).json(entry);
}

async function update(req, res) {
  const entry = await foodEntries.updateFoodEntry(
    pool,
    req.user.id,
    req.validated.params.id,
    req.validated.body,
  );
  if (!entry) throw notFound('Food entry');
  res.json(entry);
}

async function remove(req, res) {
  const deleted = await foodEntries.deleteFoodEntry(pool, req.user.id, req.validated.params.id);
  if (!deleted) throw notFound('Food entry');
  res.status(204).end();
}

module.exports = { list, get, create, update, remove };
