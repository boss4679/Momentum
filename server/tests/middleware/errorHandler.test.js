const express = require('express');
const request = require('supertest');
const { AppError, notFound } = require('../../src/errors/AppError');
const errorHandler = require('../../src/middleware/errorHandler');

// One route per kind of error, so each test triggers exactly one path through the handler.
function buildApp() {
  const app = express();
  app.get('/app-error', () => {
    throw notFound('Workout');
  });
  app.get('/app-error-details', () => {
    throw new AppError(409, 'CONFLICT', 'Overlaps', [{ field: 'startsAt', message: 'x' }]);
  });
  app.get('/pg-error', () => {
    // Shaped like the error pg throws for a unique violation.
    throw Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'users_email_key',
    });
  });
  app.get('/async-error', async () => {
    // Express 5 catches rejected promises from async handlers; no try/catch needed.
    await Promise.resolve();
    throw notFound('Event');
  });
  app.get('/bug', () => {
    throw new Error('secret internal detail: SELECT * FROM users');
  });
  app.use(errorHandler);
  return app;
}

const app = buildApp();

describe('errorHandler', () => {
  test('AppError -> its own status, with the standard error shape', async () => {
    const res = await request(app).get('/app-error');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Workout not found', details: [] },
    });
  });

  test('details are passed through', async () => {
    const res = await request(app).get('/app-error-details');
    expect(res.status).toBe(409);
    expect(res.body.error.details).toEqual([{ field: 'startsAt', message: 'x' }]);
  });

  test('Postgres constraint errors are mapped', async () => {
    const res = await request(app).get('/pg-error');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  test('errors thrown in async handlers reach the handler', async () => {
    const res = await request(app).get('/async-error');
    expect(res.status).toBe(404);
  });

  test('unexpected errors -> 500 without leaking internals', async () => {
    // The handler logs the real error; silence it so the test output stays clean.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app).get('/bug');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', details: [] },
    });
    expect(JSON.stringify(res.body)).not.toContain('SELECT');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
