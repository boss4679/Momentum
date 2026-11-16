const request = require('supertest');
const app = require('../../src/app');
const { resetDb, closeDb } = require('../helpers/db');
const { registerUser } = require('../helpers/auth');
const { createFoodEntry } = require('../helpers/factories');

let auth;
beforeAll(async () => {
  await resetDb();
  ({ auth } = await registerUser());
});
afterAll(closeDb);

describe('POST /api/food-entries', () => {
  test('201: creates an entry; macros are optional and default to null', async () => {
    const res = await request(app)
      .post('/api/food-entries')
      .set(...auth)
      .send({
        eatenOn: '2026-03-02',
        meal: 'breakfast',
        name: 'Oatmeal',
        calories: 350,
        carbsG: 60.5,
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(Number),
      eatenOn: '2026-03-02',
      meal: 'breakfast',
      name: 'Oatmeal',
      calories: 350,
      proteinG: null,
      carbsG: 60.5,
      fatG: null,
      createdAt: expect.any(String),
    });
  });

  test('201: zero calories is allowed (black coffee)', async () => {
    const entry = await createFoodEntry(auth, { name: 'Black coffee', calories: 0 });
    expect(entry.calories).toBe(0);
  });

  test.each([
    ['negative calories', { calories: -10 }, 'calories'],
    ['fractional calories', { calories: 10.5 }, 'calories'],
    ['calories as a string', { calories: '500' }, 'calories'],
    ['unknown meal', { meal: 'brunch' }, 'meal'],
    ['negative protein', { proteinG: -1 }, 'proteinG'],
    ['missing name', { name: undefined }, 'name'],
    ['bad date', { eatenOn: '2026-13-01' }, 'eatenOn'],
  ])('422: %s', async (_name, overrides, field) => {
    const res = await request(app)
      .post('/api/food-entries')
      .set(...auth)
      .send({ eatenOn: '2026-03-02', meal: 'lunch', name: 'Soup', calories: 300, ...overrides });

    expect(res.status).toBe(422);
    expect(res.body.error.details.map((d) => d.field)).toContain(field);
  });

  test('400: malformed JSON', async () => {
    const res = await request(app)
      .post('/api/food-entries')
      .set(...auth)
      .set('Content-Type', 'application/json')
      .send('{calories: 5}');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/food-entries', () => {
  let listAuth;
  beforeAll(async () => {
    ({ auth: listAuth } = await registerUser());
    // Created out of order on purpose, to check the sort.
    await createFoodEntry(listAuth, { eatenOn: '2026-03-02', meal: 'snack', name: 'Apple' });
    await createFoodEntry(listAuth, { eatenOn: '2026-03-02', meal: 'dinner', name: 'Pasta' });
    await createFoodEntry(listAuth, { eatenOn: '2026-03-02', meal: 'breakfast', name: 'Eggs' });
    await createFoodEntry(listAuth, { eatenOn: '2026-03-01', meal: 'lunch', name: 'Wrap' });
  });

  test('200: newest day first, and within a day in meal order (not alphabetical)', async () => {
    const res = await request(app)
      .get('/api/food-entries')
      .set(...listAuth);

    expect(res.status).toBe(200);
    expect(res.body.data.map((e) => `${e.eatenOn} ${e.meal}`)).toEqual([
      '2026-03-02 breakfast',
      '2026-03-02 dinner',
      '2026-03-02 snack',
      '2026-03-01 lunch',
    ]);
  });

  test('filters by date range and meal', async () => {
    const byDay = await request(app)
      .get('/api/food-entries?from=2026-03-02&to=2026-03-02')
      .set(...listAuth);
    const byMeal = await request(app)
      .get('/api/food-entries?meal=lunch')
      .set(...listAuth);

    expect(byDay.body.pagination.total).toBe(3);
    expect(byMeal.body.data.map((e) => e.name)).toEqual(['Wrap']);
  });

  test.each(['meal=brunch', 'from=yesterday', 'offset=-5'])('400: ?%s', async (query) => {
    const res = await request(app)
      .get(`/api/food-entries?${query}`)
      .set(...listAuth);
    expect(res.status).toBe(400);
  });
});

describe('GET / PUT / DELETE /api/food-entries/:id', () => {
  test('GET 200 and 404', async () => {
    const created = await createFoodEntry(auth);
    const found = await request(app)
      .get(`/api/food-entries/${created.id}`)
      .set(...auth);
    const missing = await request(app)
      .get('/api/food-entries/999999')
      .set(...auth);

    expect(found.body).toEqual(created);
    expect(missing.status).toBe(404);
    expect(missing.body.error.message).toBe('Food entry not found');
  });

  test('PUT 200 replaces every field, including clearing macros', async () => {
    const created = await createFoodEntry(auth, { proteinG: 40, fatG: 10 });
    const res = await request(app)
      .put(`/api/food-entries/${created.id}`)
      .set(...auth)
      .send({ eatenOn: '2026-03-03', meal: 'dinner', name: 'Salmon', calories: 620 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: created.id,
      meal: 'dinner',
      name: 'Salmon',
      calories: 620,
      proteinG: null,
      fatG: null,
    });
  });

  test('PUT 404 and 422', async () => {
    const created = await createFoodEntry(auth);
    const missing = await request(app)
      .put('/api/food-entries/999999')
      .set(...auth)
      .send({ eatenOn: '2026-03-03', meal: 'dinner', name: 'X', calories: 1 });
    const invalid = await request(app)
      .put(`/api/food-entries/${created.id}`)
      .set(...auth)
      .send({ eatenOn: '2026-03-03', meal: 'dinner', name: 'X', calories: -1 });

    expect(missing.status).toBe(404);
    expect(invalid.status).toBe(422);
  });

  test('DELETE 204, then 404', async () => {
    const created = await createFoodEntry(auth);
    const first = await request(app)
      .delete(`/api/food-entries/${created.id}`)
      .set(...auth);
    const second = await request(app)
      .delete(`/api/food-entries/${created.id}`)
      .set(...auth);

    expect(first.status).toBe(204);
    expect(second.status).toBe(404);
  });
});
