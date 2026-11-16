// App-level behaviour: health check, unknown routes, body limits and headers.
// (Real Postgres constraint errors through the full stack are covered in auth.test.js,
// e.g. duplicate email -> 23505 -> 409.)
const request = require('supertest');
const app = require('../../src/app');
const { pool, resetDb, closeDb } = require('../helpers/db');

beforeAll(resetDb);
afterAll(closeDb);

describe('GET /api/health', () => {
  test('200 when the database is reachable', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up' });
  });

  test('503 when the database query fails', async () => {
    // Simulate the database being down for this single query.
    const spy = jest.spyOn(pool, 'query').mockRejectedValueOnce(new Error('connection refused'));

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'degraded', database: 'down' });
    spy.mockRestore();
  });
});

describe('unknown routes', () => {
  test('404 with the standard error shape', async () => {
    const res = await request(app).get('/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'No route for GET /api/does-not-exist', details: [] },
    });
  });

  test('a wrong method on a real path is also 404', async () => {
    const res = await request(app).delete('/api/auth/login');
    expect(res.status).toBe(404);
  });
});

describe('request body limits', () => {
  test('413 for a body over 100kb', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'x'.repeat(150 * 1024) });

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('the X-Powered-By header', () => {
  test('is not sent', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
