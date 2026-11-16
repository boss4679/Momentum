// Every endpoint except health, register and login requires a valid token. This lists each
// route explicitly, so a new route can't quietly ship without `authenticate`: add it here.
const request = require('supertest');
const app = require('../../src/app');
const { closeDb } = require('../helpers/db');

afterAll(closeDb);

const PROTECTED_ROUTES = [
  ['get', '/api/auth/me'],
  ['get', '/api/exercises'],
  ['post', '/api/exercises'],
  ['get', '/api/exercises/1'],
  ['put', '/api/exercises/1'],
  ['delete', '/api/exercises/1'],
  ['get', '/api/workouts'],
  ['post', '/api/workouts'],
  ['get', '/api/workouts/personal-bests'],
  ['get', '/api/workouts/1'],
  ['put', '/api/workouts/1'],
  ['delete', '/api/workouts/1'],
  ['get', '/api/events'],
  ['post', '/api/events'],
  ['get', '/api/events/1'],
  ['put', '/api/events/1'],
  ['delete', '/api/events/1'],
  ['get', '/api/food-entries'],
  ['post', '/api/food-entries'],
  ['get', '/api/food-entries/1'],
  ['put', '/api/food-entries/1'],
  ['delete', '/api/food-entries/1'],
  ['get', '/api/goals'],
  ['post', '/api/goals'],
  ['get', '/api/goals/current'],
  ['get', '/api/goals/1'],
  ['put', '/api/goals/1'],
  ['delete', '/api/goals/1'],
];

describe.each(PROTECTED_ROUTES)('%s %s', (method, path) => {
  test('401 without a token', async () => {
    const res = await request(app)[method](path).send({});

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('401 with an invalid token', async () => {
    const req = request(app)[method](path);
    const res = await req.set('Authorization', 'Bearer not-a-real-token').send({});

    expect(res.status).toBe(401);
  });
});
