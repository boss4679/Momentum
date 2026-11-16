const request = require('supertest');
const app = require('../../src/app');
const { resetDb, closeDb } = require('../helpers/db');
const { registerUser } = require('../helpers/auth');
const { createGoal } = require('../helpers/factories');

beforeAll(resetDb);
afterAll(closeDb);

describe('POST /api/goals', () => {
  let auth;
  beforeAll(async () => {
    ({ auth } = await registerUser());
  });

  test('201: creates a goal', async () => {
    const res = await request(app)
      .post('/api/goals')
      .set(...auth)
      .send({ calorieGoal: 2200, effectiveFrom: '2026-03-01' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(Number),
      calorieGoal: 2200,
      effectiveFrom: '2026-03-01',
      createdAt: expect.any(String),
    });
  });

  test('409: a second goal starting on the same date', async () => {
    const res = await request(app)
      .post('/api/goals')
      .set(...auth)
      .send({ calorieGoal: 1800, effectiveFrom: '2026-03-01' });

    expect(res.status).toBe(409);
    expect(res.body.error.details[0].field).toBe('effectiveFrom');
  });

  test.each([
    ['too low', { calorieGoal: 499 }],
    ['too high', { calorieGoal: 10001 }],
    ['not an integer', { calorieGoal: 2000.5 }],
    ['missing date', { effectiveFrom: undefined }],
  ])('422: %s', async (_name, overrides) => {
    const res = await request(app)
      .post('/api/goals')
      .set(...auth)
      .send({ calorieGoal: 2000, effectiveFrom: '2026-04-01', ...overrides });

    expect(res.status).toBe(422);
  });
});

describe('GET /api/goals and /api/goals/current', () => {
  // Goal history: 2400 from Jan 1, 2200 from Feb 1, 2000 from Mar 1.
  let auth;
  beforeAll(async () => {
    ({ auth } = await registerUser());
    await createGoal(auth, { calorieGoal: 2200, effectiveFrom: '2026-02-01' });
    await createGoal(auth, { calorieGoal: 2400, effectiveFrom: '2026-01-01' });
    await createGoal(auth, { calorieGoal: 2000, effectiveFrom: '2026-03-01' });
  });

  test('list: newest effectiveFrom first', async () => {
    const res = await request(app)
      .get('/api/goals')
      .set(...auth);

    expect(res.status).toBe(200);
    expect(res.body.data.map((g) => g.calorieGoal)).toEqual([2000, 2200, 2400]);
    expect(res.body.pagination.total).toBe(3);
  });

  test.each([
    ['the first day of a goal', '2026-02-01', 2200],
    ['the day before the next goal starts', '2026-02-28', 2200],
    ['after the latest goal', '2026-12-31', 2000],
    ['the very first goal', '2026-01-15', 2400],
  ])('current: on %s', async (_name, date, expected) => {
    const res = await request(app)
      .get(`/api/goals/current?date=${date}`)
      .set(...auth);

    expect(res.status).toBe(200);
    expect(res.body.calorieGoal).toBe(expected);
  });

  test('current: 404 before any goal existed', async () => {
    const res = await request(app)
      .get('/api/goals/current?date=2025-12-31')
      .set(...auth);
    expect(res.status).toBe(404);
  });

  test.each(['', '?date=tomorrow', '?date=2026-03-01&extra=1'])(
    'current: 400 for query "%s"',
    async (query) => {
      const res = await request(app)
        .get(`/api/goals/current${query}`)
        .set(...auth);
      expect(res.status).toBe(400);
    },
  );
});

describe('GET / PUT / DELETE /api/goals/:id', () => {
  let auth;
  beforeAll(async () => {
    ({ auth } = await registerUser());
  });

  test('GET 200 and 404', async () => {
    const goal = await createGoal(auth, { effectiveFrom: '2026-05-01' });
    const found = await request(app)
      .get(`/api/goals/${goal.id}`)
      .set(...auth);
    const missing = await request(app)
      .get('/api/goals/999999')
      .set(...auth);

    expect(found.body).toEqual(goal);
    expect(missing.status).toBe(404);
  });

  test('PUT 200, 404, 409, 422', async () => {
    const goal = await createGoal(auth, { effectiveFrom: '2026-06-01' });
    await createGoal(auth, { effectiveFrom: '2026-07-01' });

    const ok = await request(app)
      .put(`/api/goals/${goal.id}`)
      .set(...auth)
      .send({ calorieGoal: 1900, effectiveFrom: '2026-06-15' });
    const missing = await request(app)
      .put('/api/goals/999999')
      .set(...auth)
      .send({ calorieGoal: 1900, effectiveFrom: '2026-06-15' });
    const clash = await request(app)
      .put(`/api/goals/${goal.id}`)
      .set(...auth)
      .send({ calorieGoal: 1900, effectiveFrom: '2026-07-01' });
    const invalid = await request(app)
      .put(`/api/goals/${goal.id}`)
      .set(...auth)
      .send({ calorieGoal: 50, effectiveFrom: '2026-06-15' });

    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ calorieGoal: 1900, effectiveFrom: '2026-06-15' });
    expect(missing.status).toBe(404);
    expect(clash.status).toBe(409);
    expect(invalid.status).toBe(422);
  });

  test('DELETE 204, then 404', async () => {
    const goal = await createGoal(auth, { effectiveFrom: '2026-08-01' });
    const first = await request(app)
      .delete(`/api/goals/${goal.id}`)
      .set(...auth);
    const second = await request(app)
      .delete(`/api/goals/${goal.id}`)
      .set(...auth);

    expect(first.status).toBe(204);
    expect(second.status).toBe(404);
  });
});
