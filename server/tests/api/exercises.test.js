const request = require('supertest');
const app = require('../../src/app');
const { resetDb, closeDb } = require('../helpers/db');
const { registerUser } = require('../helpers/auth');
const { createExercise, createWorkout, exerciseId } = require('../helpers/factories');

let auth;
beforeAll(async () => {
  await resetDb();
  ({ auth } = await registerUser());
});
afterAll(closeDb);

describe('GET /api/exercises', () => {
  test('200: a new user starts with the 10-exercise starter catalog, sorted by name', async () => {
    const res = await request(app)
      .get('/api/exercises')
      .set(...auth);

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({ limit: 20, offset: 0, total: 10 });
    const names = res.body.data.map((e) => e.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(res.body.data[0]).toEqual({
      id: expect.any(Number),
      name: 'Back Squat',
      category: 'strength',
      createdAt: expect.any(String),
    });
  });

  test('pagination: limit and offset pick a slice, total stays the full count', async () => {
    const all = await request(app)
      .get('/api/exercises')
      .set(...auth);
    const page = await request(app)
      .get('/api/exercises?limit=3&offset=3')
      .set(...auth);

    expect(page.body.data).toEqual(all.body.data.slice(3, 6));
    expect(page.body.pagination).toEqual({ limit: 3, offset: 3, total: 10 });
  });

  test('filters by category', async () => {
    const res = await request(app)
      .get('/api/exercises?category=cardio')
      .set(...auth);

    expect(res.body.data.map((e) => e.name)).toEqual(['Cycling', 'Rowing', 'Running']);
    expect(res.body.pagination.total).toBe(3);
  });

  test.each([
    ['limit=0', 'limit'],
    ['limit=101', 'limit'],
    ['limit=abc', 'limit'],
    ['offset=-1', 'offset'],
    ['category=swimming', 'category'],
    ['colour=red', 'colour'],
  ])('400: bad query ?%s', async (query, field) => {
    const res = await request(app)
      .get(`/api/exercises?${query}`)
      .set(...auth);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(res.body.error.details[0].field).toBe(field);
  });
});

describe('GET /api/exercises/:id', () => {
  test('200: returns the exercise', async () => {
    const created = await createExercise(auth, { name: 'Face Pull' });
    const res = await request(app)
      .get(`/api/exercises/${created.id}`)
      .set(...auth);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(created);
  });

  test('404: no such exercise', async () => {
    const res = await request(app)
      .get('/api/exercises/999999')
      .set(...auth);

    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({
      code: 'NOT_FOUND',
      message: 'Exercise not found',
      details: [],
    });
  });

  test.each(['abc', '0', '-3', '1.5', '99999999999'])('400: invalid id "%s"', async (id) => {
    const res = await request(app)
      .get(`/api/exercises/${id}`)
      .set(...auth);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/exercises', () => {
  test('201: creates an exercise, trimming the name', async () => {
    const res = await request(app)
      .post('/api/exercises')
      .set(...auth)
      .send({ name: '  Lat Pulldown ', category: 'strength' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Lat Pulldown', category: 'strength' });
  });

  test('409: a name that differs only in case is a duplicate', async () => {
    const res = await request(app)
      .post('/api/exercises')
      .set(...auth)
      .send({ name: 'bench PRESS', category: 'strength' });

    expect(res.status).toBe(409);
    expect(res.body.error.details).toEqual([
      { field: 'name', message: 'You already have an exercise with this name' },
    ]);
  });

  test('422: blank name and unknown category', async () => {
    const res = await request(app)
      .post('/api/exercises')
      .set(...auth)
      .send({ name: '   ', category: 'swimming' });

    expect(res.status).toBe(422);
    expect(res.body.error.details.map((d) => d.field)).toEqual(['name', 'category']);
  });

  test('422: unknown field', async () => {
    const res = await request(app)
      .post('/api/exercises')
      .set(...auth)
      .send({ name: 'Dips', category: 'strength', userId: 1 });

    expect(res.status).toBe(422);
    expect(res.body.error.details[0].field).toBe('userId');
  });

  test('400: malformed JSON', async () => {
    const res = await request(app)
      .post('/api/exercises')
      .set(...auth)
      .set('Content-Type', 'application/json')
      .send('{"name": ');

    expect(res.status).toBe(400);
  });
});

describe('PUT /api/exercises/:id', () => {
  test('200: replaces name and category', async () => {
    const created = await createExercise(auth, { name: 'Stretching' });
    const res = await request(app)
      .put(`/api/exercises/${created.id}`)
      .set(...auth)
      .send({ name: 'Yoga Flow', category: 'mobility' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: created.id, name: 'Yoga Flow', category: 'mobility' });
  });

  test('409: renaming onto an existing name', async () => {
    const created = await createExercise(auth, { name: 'Shrug' });
    const res = await request(app)
      .put(`/api/exercises/${created.id}`)
      .set(...auth)
      .send({ name: 'Deadlift', category: 'strength' });

    expect(res.status).toBe(409);
  });

  test('404: no such exercise', async () => {
    const res = await request(app)
      .put('/api/exercises/999999')
      .set(...auth)
      .send({ name: 'X', category: 'strength' });

    expect(res.status).toBe(404);
  });

  test('422: missing category', async () => {
    const created = await createExercise(auth, { name: 'Calf Raise' });
    const res = await request(app)
      .put(`/api/exercises/${created.id}`)
      .set(...auth)
      .send({ name: 'Calf Raise' });

    expect(res.status).toBe(422);
  });
});

describe('DELETE /api/exercises/:id', () => {
  test('204: deletes an unused exercise', async () => {
    const created = await createExercise(auth, { name: 'Burpee', category: 'cardio' });

    const res = await request(app)
      .delete(`/api/exercises/${created.id}`)
      .set(...auth);
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});

    const after = await request(app)
      .get(`/api/exercises/${created.id}`)
      .set(...auth);
    expect(after.status).toBe(404);
  });

  test('404: deleting twice', async () => {
    const created = await createExercise(auth, { name: 'Jumping Jack', category: 'cardio' });
    await request(app)
      .delete(`/api/exercises/${created.id}`)
      .set(...auth);

    const res = await request(app)
      .delete(`/api/exercises/${created.id}`)
      .set(...auth);
    expect(res.status).toBe(404);
  });

  test('409: an exercise used in a logged workout cannot be deleted', async () => {
    await createWorkout(auth);
    const benchId = await exerciseId(auth, 'Bench Press');

    const res = await request(app)
      .delete(`/api/exercises/${benchId}`)
      .set(...auth);

    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe(
      'This exercise is used in logged workouts and cannot be deleted',
    );
  });
});
