// Dashboard module — a single aggregated summary that unifies all three
// features for the front-page view (today's nutrition, upcoming events,
// recent workouts, and headline counts).
import { Router } from 'express';
import { db } from '../db.js';
import { asyncHandler } from '../validation.js';

export const dashboardRouter = Router();

// GET /api/dashboard?date=YYYY-MM-DD
dashboardRouter.get('/', asyncHandler((req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : todayISO();

  // Today's nutrition totals, computed in SQL across the joined catalog.
  const nutrition = db.prepare(`
    SELECT
      COALESCE(ROUND(SUM(f.calories * e.servings)), 0)    AS calories,
      COALESCE(ROUND(SUM(f.protein  * e.servings), 1), 0) AS protein,
      COALESCE(ROUND(SUM(f.carbs    * e.servings), 1), 0) AS carbs,
      COALESCE(ROUND(SUM(f.fat      * e.servings), 1), 0) AS fat,
      COUNT(*)                                            AS entries
    FROM nutrition_entries e
    JOIN foods f ON f.id = e.food_id
    WHERE e.date = ?
  `).get(date);

  // Next five upcoming events from now.
  const upcomingEvents = db.prepare(`
    SELECT id, title, category, start_time, end_time
    FROM calendar_events
    WHERE start_time >= ?
    ORDER BY start_time ASC
    LIMIT 5
  `).all(nowISO());

  // Three most recent workouts with an exercise count.
  const recentWorkouts = db.prepare(`
    SELECT w.id, w.name, w.date,
           (SELECT COUNT(*) FROM exercises x WHERE x.workout_id = w.id) AS exercise_count
    FROM workouts w
    ORDER BY w.date DESC, w.id DESC
    LIMIT 3
  `).all();

  const counts = {
    workouts: db.prepare('SELECT COUNT(*) AS c FROM workouts').get().c,
    events: db.prepare('SELECT COUNT(*) AS c FROM calendar_events').get().c,
    nutritionEntries: db.prepare('SELECT COUNT(*) AS c FROM nutrition_entries').get().c,
    foods: db.prepare('SELECT COUNT(*) AS c FROM foods').get().c,
  };

  res.json({ date, nutrition, upcomingEvents, recentWorkouts, counts });
}));

// Local-time helpers. Events are stored as naive local datetimes (as produced
// by the browser's <input type="datetime-local">), so "now" must also be a
// naive local string for the upcoming-events comparison to be correct in any
// timezone — a UTC timestamp would be offset and mis-filter events.
const pad = (n) => String(n).padStart(2, '0');
function nowISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function todayISO() {
  return nowISO().slice(0, 10);
}
