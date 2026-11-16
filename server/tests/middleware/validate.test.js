// Tests validate() on a tiny throwaway app, so these tests depend only on the middleware
// and the error handler, not on any real route.
const express = require('express');
const request = require('supertest');
const { z } = require('zod');
const validate = require('../../src/middleware/validate');
const errorHandler = require('../../src/middleware/errorHandler');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.post(
    '/items/:id',
    validate({
      params: z.object({ id: z.coerce.number().int().positive() }),
      query: z.object({ limit: z.coerce.number().int().max(100).default(20) }),
      body: z
        .object({
          name: z.string().min(1, 'Name is required'),
          sets: z.array(z.object({ reps: z.number().int().positive('Reps must be positive') })),
        })
        .strict(),
    }),
    // Echo back what the controller would receive.
    (req, res) => res.json(req.validated),
  );
  app.use(errorHandler);
  return app;
}

const app = buildApp();
const goodBody = { name: 'Squat', sets: [{ reps: 5 }] };

describe('validate middleware', () => {
  test('valid request passes, with parsed and coerced values on req.validated', async () => {
    const res = await request(app).post('/items/7?limit=50').send(goodBody);

    expect(res.status).toBe(200);
    // "7" and "50" arrived as strings in the URL and are now numbers.
    expect(res.body).toEqual({ params: { id: 7 }, query: { limit: 50 }, body: goodBody });
  });

  test('applies schema defaults for missing query params', async () => {
    const res = await request(app).post('/items/7').send(goodBody);
    expect(res.body.query).toEqual({ limit: 20 });
  });

  test('bad URL param -> 400', async () => {
    const res = await request(app).post('/items/abc').send(goodBody);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(res.body.error.details[0].field).toBe('id');
  });

  test('bad query param -> 400', async () => {
    const res = await request(app).post('/items/7?limit=500').send(goodBody);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Invalid query parameter');
    expect(res.body.error.details[0].field).toBe('limit');
  });

  test('invalid body -> 422 with one detail per failing field', async () => {
    const res = await request(app)
      .post('/items/7')
      .send({ name: '', sets: [{ reps: 5 }, { reps: -1 }] });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual([
      { field: 'name', message: 'Name is required' },
      // Nested paths are joined with dots so the frontend can find the right input.
      { field: 'sets.1.reps', message: 'Reps must be positive' },
    ]);
  });

  test('unknown body keys are rejected (strict schema) -> 422', async () => {
    const res = await request(app)
      .post('/items/7')
      .send({ ...goodBody, admin: true });

    expect(res.status).toBe(422);
    expect(res.body.error.details[0].field).toBe('admin');
  });

  test('missing body -> 422', async () => {
    const res = await request(app).post('/items/7');
    expect(res.status).toBe(422);
  });
});
