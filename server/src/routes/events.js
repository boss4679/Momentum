// Calendar module — RESTful CRUD for scheduled events.
import { Router } from 'express';
import { db } from '../db.js';
import { ApiError, validate, parseId, asyncHandler } from '../validation.js';

export const eventsRouter = Router();

const CATEGORIES = ['general', 'work', 'fitness', 'personal'];

const eventRules = {
  title: { type: 'string', required: true, min: 1, max: 160 },
  description: { type: 'string', max: 2000, default: null },
  category: { type: 'enum', values: CATEGORIES, default: 'general' },
  start_time: { type: 'datetime', required: true },
  end_time: { type: 'datetime', default: null },
};

const COLUMNS = 'id, title, description, category, start_time, end_time, created_at';

function getEvent(id) {
  const event = db.prepare(`SELECT ${COLUMNS} FROM calendar_events WHERE id = ?`).get(id);
  if (!event) throw new ApiError(404, `Event ${id} not found`);
  return event;
}

// Reject events whose end precedes their start.
function assertChronological(data) {
  if (data.end_time && Date.parse(data.end_time) < Date.parse(data.start_time)) {
    throw new ApiError(422, 'Validation failed', { end_time: 'must be after start_time' });
  }
}

// GET /api/events — optional ?from=YYYY-MM-DD&to=YYYY-MM-DD range filter.
eventsRouter.get('/', asyncHandler((req, res) => {
  const { from, to } = req.query;
  const clauses = [];
  const params = [];
  if (from) { clauses.push('start_time >= ?'); params.push(from); }
  if (to) { clauses.push('start_time <= ?'); params.push(`${to}T23:59:59`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const events = db
    .prepare(`SELECT ${COLUMNS} FROM calendar_events ${where} ORDER BY start_time ASC`)
    .all(...params);
  res.json(events);
}));

// GET /api/events/:id
eventsRouter.get('/:id', asyncHandler((req, res) => {
  res.json(getEvent(parseId(req.params.id)));
}));

// POST /api/events
eventsRouter.post('/', asyncHandler((req, res) => {
  const data = validate(req.body, eventRules);
  assertChronological(data);
  const info = db
    .prepare('INSERT INTO calendar_events (title, description, category, start_time, end_time) VALUES (?, ?, ?, ?, ?)')
    .run(data.title, data.description, data.category, data.start_time, data.end_time);
  res.status(201).json(getEvent(Number(info.lastInsertRowid)));
}));

// PUT /api/events/:id
eventsRouter.put('/:id', asyncHandler((req, res) => {
  const id = parseId(req.params.id);
  getEvent(id);
  const data = validate(req.body, eventRules);
  assertChronological(data);
  db.prepare('UPDATE calendar_events SET title = ?, description = ?, category = ?, start_time = ?, end_time = ? WHERE id = ?')
    .run(data.title, data.description, data.category, data.start_time, data.end_time, id);
  res.json(getEvent(id));
}));

// DELETE /api/events/:id
eventsRouter.delete('/:id', asyncHandler((req, res) => {
  const id = parseId(req.params.id);
  getEvent(id);
  db.prepare('DELETE FROM calendar_events WHERE id = ?').run(id);
  res.status(204).end();
}));
