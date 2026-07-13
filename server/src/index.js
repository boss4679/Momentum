// Momentum API server — Express app wiring the module routers together with
// shared JSON parsing, CORS, and centralized error handling.
import express from 'express';
import cors from 'cors';

import { workoutsRouter } from './routes/workouts.js';
import { eventsRouter } from './routes/events.js';
import { nutritionRouter } from './routes/nutrition.js';
import { dashboardRouter } from './routes/dashboard.js';
import { ApiError } from './validation.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Reject malformed JSON bodies before they reach a route.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON in request body' });
  }
  next(err);
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'momentum-api' }));

app.use('/api/workouts', workoutsRouter);
app.use('/api/events', eventsRouter);
app.use('/api/nutrition', nutritionRouter);
app.use('/api/dashboard', dashboardRouter);

// 404 for unknown API routes.
app.use('/api', (req, res) => {
  res.status(404).json({ error: `No such endpoint: ${req.method} ${req.originalUrl}` });
});

// ---- Centralized error handler ----------------------------------------------
// Every route throws ApiError (or lets an unexpected error bubble); responses
// share one JSON shape: { error, details? }.
app.use((err, req, res, _next) => {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
  }
  // SQLite constraint violations → 409 rather than a generic 500.
  if (err && typeof err.message === 'string' && err.message.includes('SQLITE_CONSTRAINT')) {
    return res.status(409).json({ error: 'Database constraint violation', details: err.message });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Momentum API listening on http://localhost:${PORT}`);
});
