const pool = require('../db/pool');
const summary = require('../db/queries/summary');
const users = require('../db/queries/users');
const { badRequest, unauthorized } = require('../errors/AppError');
const { addDays, daysBetween } = require('../utils/dates');

const DEFAULT_TREND_DAYS = 30;
// A range cap keeps one request from asking Postgres for decades of daily rows.
const MAX_TREND_DAYS = 366;

// Every summary is computed relative to the user's own calendar, so both endpoints start
// by fetching the user's timezone and today's date there.
async function getClock(userId) {
  const clock = await users.findUserClock(pool, userId);
  if (!clock) throw unauthorized('Account no longer exists');
  return clock;
}

// GET /api/summary/daily: everything the dashboard shows for one day.
// The five queries don't depend on each other, so they run in parallel (each on its own
// pooled connection). The response time is the slowest query, not the sum of all five.
async function daily(req, res) {
  const userId = req.user.id;
  const { timezone, today } = await getClock(userId);
  const date = req.validated.query.date ?? today;

  const [workouts, upcomingEvents, [calorieDay], meals, streak] = await Promise.all([
    summary.dayWorkouts(pool, userId, date),
    summary.upcomingEvents(pool, userId, date, timezone),
    summary.dailyCalories(pool, userId, date, date),
    summary.mealBreakdown(pool, userId, date),
    summary.workoutStreak(pool, userId, date),
  ]);

  // Only shaping happens here: picking fields and summing four already-aggregated meal rows.
  // All per-row work (filtering, grouping, windowing) happened in SQL.
  const eaten = meals.reduce((total, m) => total + m.calories, 0);
  const goal = calorieDay.goal;

  res.json({
    date,
    timezone,
    workouts,
    upcomingEvents,
    calories: {
      eaten,
      goal,
      remaining: goal === null ? null : goal - eaten,
      percentOfGoal: goal === null ? null : Math.round((eaten / goal) * 100),
      byMeal: meals,
      macros: {
        proteinG: round1(meals.reduce((t, m) => t + m.proteinG, 0)),
        carbsG: round1(meals.reduce((t, m) => t + m.carbsG, 0)),
        fatG: round1(meals.reduce((t, m) => t + m.fatG, 0)),
      },
    },
    trends: {
      rollingAvg7: calorieDay.rollingAvg7,
      loggedDaysInWindow: calorieDay.loggedDaysInWindow,
      streak,
    },
  });
}

// Floating-point sums can produce values like 70.30000000000001.
function round1(value) {
  return Math.round(value * 10) / 10;
}

// GET /api/summary/trends: chart data over a date range.
async function trends(req, res) {
  const userId = req.user.id;
  const { today } = await getClock(userId);
  const to = req.validated.query.to ?? today;
  const from = req.validated.query.from ?? addDays(to, -(DEFAULT_TREND_DAYS - 1));

  if (daysBetween(from, to) < 0) {
    throw badRequest('Invalid query parameter', [
      { field: 'to', message: '"from" must not be after "to"' },
    ]);
  }
  if (daysBetween(from, to) + 1 > MAX_TREND_DAYS) {
    throw badRequest('Invalid query parameter', [
      { field: 'from', message: `The range can be at most ${MAX_TREND_DAYS} days` },
    ]);
  }

  const [dailyCalories, weeklyVolume, streak] = await Promise.all([
    summary.dailyCalories(pool, userId, from, to),
    summary.weeklyVolume(pool, userId, from, to),
    summary.workoutStreak(pool, userId, to),
  ]);

  res.json({ from, to, dailyCalories, weeklyVolume, streak });
}

module.exports = { daily, trends };
