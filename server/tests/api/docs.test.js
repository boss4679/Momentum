// Keeps the OpenAPI document honest:
// 1. every route Express has is documented, and every documented route exists
// 2. real responses have exactly the shape the docs describe
// 3. /api/docs serves Swagger UI and the raw document
const request = require('supertest');
const app = require('../../src/app');
const apiRouter = require('../../src/routes');
const document = require('../../src/docs/openapi');
const { resetDb, closeDb } = require('../helpers/db');
const { registerUser } = require('../helpers/auth');
const f = require('../helpers/factories');
const { schemaProblems } = require('../helpers/schemaShape');

beforeAll(resetDb);
afterAll(closeDb);

// 'GET /workouts/{id}' for every operation in the document.
function documentedOperations() {
  return Object.entries(document.paths).flatMap(([path, methods]) =>
    Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`),
  );
}

// The same list, read from Express's router. Express 5 doesn't keep the path a router was
// mounted at, so each mounted router is identified by asking its matcher which of the
// documented prefixes (/auth, /workouts, ...) it answers to.
function registeredOperations() {
  const prefixes = [...new Set(Object.keys(document.paths).map((p) => `/${p.split('/')[1]}`))];
  const toOpenApi = (path) => path.replace(/:(\w+)/g, '{$1}');
  const operations = [];
  const addRoutes = (prefix, router) => {
    for (const layer of router.stack) {
      if (!layer.route) continue; // middleware such as authenticate
      const path = layer.route.path === '/' ? prefix : prefix + layer.route.path;
      for (const method of Object.keys(layer.route.methods)) {
        operations.push(`${method.toUpperCase()} ${toOpenApi(path)}`);
      }
    }
  };

  addRoutes('', apiRouter); // routes declared directly on the /api router, e.g. /health
  for (const layer of apiRouter.stack) {
    if (layer.route) continue;
    const prefix = prefixes.find((p) => layer.matchers[0](p));
    if (!prefix) throw new Error('A router is mounted at a prefix that has no documented paths');
    addRoutes(prefix, layer.handle);
  }
  return operations;
}

describe('OpenAPI document', () => {
  test('documents every route, and only routes that exist', () => {
    expect(documentedOperations().sort()).toEqual(registeredOperations().sort());
  });

  test('is served as JSON, and Swagger UI is served at /api/docs/', async () => {
    const raw = await request(app).get('/api/docs/openapi.json');
    expect(raw.status).toBe(200);
    expect(raw.body.openapi).toBe('3.1.0');

    const ui = await request(app).get('/api/docs/');
    expect(ui.status).toBe(200);
    expect(ui.text).toContain('swagger-ui');
  });

  test('needs no token', async () => {
    expect((await request(app).get('/api/docs/openapi.json')).status).toBe(200);
  });
});

describe('responses match the documented schemas', () => {
  let auth;
  const ids = {};

  beforeAll(async () => {
    ({ auth } = await registerUser({ timezone: 'UTC' }));
    ids.exercise = (await f.createExercise(auth)).id;
    ids.workout = (await f.createWorkout(auth)).id;
    ids.event = (await f.createEvent(auth)).id;
    ids.food = (await f.createFoodEntry(auth)).id;
    ids.goal = (await f.createGoal(auth)).id;
    // Exercise the nullable branches too: a cardio set (no reps or weight), an event with no
    // category or notes, a food entry with no macros.
    await f.createWorkout(auth, {
      performedOn: '2026-03-03',
      notes: null,
      sets: [{ exerciseId: await f.exerciseId(auth, 'Running'), setNumber: 1, durationSec: 1200 }],
    });
    await f.createEvent(auth, {
      title: 'Lunch',
      startsAt: '2026-03-02T12:00:00Z',
      endsAt: '2026-03-02T13:00:00Z',
      category: null,
    });
    await f.createFoodEntry(auth, { name: 'Apple', calories: 95, proteinG: null });
  });

  // [path to call, documented path, status]
  const cases = [
    ['/api/health', '/health', 200],
    ['/api/auth/me', '/auth/me', 200],
    ['/api/exercises', '/exercises', 200],
    ['/api/exercises/:exercise', '/exercises/{id}', 200],
    ['/api/workouts', '/workouts', 200],
    ['/api/workouts/:workout', '/workouts/{id}', 200],
    ['/api/workouts/personal-bests', '/workouts/personal-bests', 200],
    ['/api/events?from=2026-03-01T00:00:00Z&to=2026-03-08T00:00:00Z', '/events', 200],
    ['/api/events/:event', '/events/{id}', 200],
    ['/api/food-entries', '/food-entries', 200],
    ['/api/food-entries/:food', '/food-entries/{id}', 200],
    ['/api/goals', '/goals', 200],
    ['/api/goals/current?date=2026-03-02', '/goals/current', 200],
    ['/api/goals/:goal', '/goals/{id}', 200],
    ['/api/summary/daily?date=2026-03-02', '/summary/daily', 200],
    ['/api/summary/trends?from=2026-02-25&to=2026-03-04', '/summary/trends', 200],
    ['/api/workouts/999999', '/workouts/{id}', 404],
    ['/api/workouts/not-a-number', '/workouts/{id}', 400],
  ];

  test.each(cases)('GET %s', async (url, documentedPath, status) => {
    const path = url.replace(/:([a-z]+)/, (_, name) => ids[name]);
    const res = await request(app)
      .get(path)
      .set(...auth);

    expect(res.status).toBe(status);
    const schema =
      document.paths[documentedPath].get.responses[status].content['application/json'].schema;
    expect(schemaProblems(schema, res.body, document)).toEqual([]);
  });

  test('POST /auth/login and a 422 validation error', async () => {
    const { user, password } = await registerUser();
    const login = await request(app).post('/api/auth/login').send({ email: user.email, password });
    const loginSchema =
      document.paths['/auth/login'].post.responses[200].content['application/json'].schema;
    expect(schemaProblems(loginSchema, login.body, document)).toEqual([]);

    const invalid = await request(app)
      .post('/api/workouts')
      .set(...auth)
      .send({ sets: [] });
    expect(invalid.status).toBe(422);
    const errorSchema =
      document.paths['/workouts'].post.responses[422].content['application/json'].schema;
    expect(schemaProblems(errorSchema, invalid.body, document)).toEqual([]);
  });

  test('the checker itself spots undocumented, missing and wrongly typed fields', () => {
    const schema = { $ref: '#/components/schemas/Goal' };
    const goal = { id: 1, calorieGoal: '2000', effectiveFrom: '2026-03-01', extra: true };
    expect(schemaProblems(schema, goal, document)).toEqual([
      'response.createdAt: documented but missing',
      'response.calorieGoal: expected integer, got "2000"',
      'response.extra: returned but not documented',
    ]);
  });
});
