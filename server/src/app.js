// Builds the Express app without starting it. Keeping this separate from server.js lets
// the tests (milestone 2) import the app and drive it with Supertest, no open port needed.
// Milestone 1 only has the health check; routes and middleware come in milestone 2.
const express = require('express');
const pool = require('./db/pool');

const app = express();

app.get('/api/health', async (req, res) => {
  try {
    // "Process is up" isn't enough; a running API that can't reach the database is still broken.
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'up' });
  } catch {
    res.status(503).json({ status: 'degraded', database: 'down' });
  }
});

module.exports = app;
