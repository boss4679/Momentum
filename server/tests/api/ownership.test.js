// Users can only see and change their own rows. For another user's row, every endpoint
// answers exactly as if the row didn't exist (404). A 403 would confirm that the id exists,
// which leaks information about other accounts.
const request = require('supertest');
const app = require('../../src/app');
const { resetDb, closeDb } = require('../helpers/db');
const { registerUser } = require('../helpers/auth');
const f = require('../helpers/factories');

let alice;
let bob;
// One of each of Alice's resources, plus a valid PUT body for each, so a 404 can only come
// from ownership, never from validation.
const resources = {};

beforeAll(async () => {
  await resetDb();
  alice = (await registerUser()).auth;
  bob = (await registerUser()).auth;

  const exercise = await f.createExercise(alice, { name: "Alice's Special" });
  resources.exercises = { row: exercise, body: { name: 'Hijacked', category: 'cardio' } };

  const workout = await f.createWorkout(alice);
  resources.workouts = {
    row: workout,
    // Bob's PUT uses one of Bob's own exercises, so the body is valid for Bob.
    body: {
      performedOn: '2026-03-09',
      sets: [{ exerciseId: await f.exerciseId(bob, 'Deadlift'), setNumber: 1, reps: 1 }],
    },
  };

  const event = await f.createEvent(alice);
  resources.events = {
    row: event,
    body: { title: 'Hijacked', startsAt: '2027-01-01T09:00:00Z', endsAt: '2027-01-01T10:00:00Z' },
  };

  const food = await f.createFoodEntry(alice);
  resources['food-entries'] = {
    row: food,
    body: { eatenOn: '2026-03-02', meal: 'snack', name: 'Hijacked', calories: 1 },
  };

  const goal = await f.createGoal(alice);
  resources.goals = { row: goal, body: { calorieGoal: 9999, effectiveFrom: '2027-01-01' } };
});
afterAll(closeDb);

const RESOURCE_NAMES = ['exercises', 'workouts', 'events', 'food-entries', 'goals'];

describe.each(RESOURCE_NAMES)("Bob and Alice's %s", (name) => {
  const path = (id) => `/api/${name}/${id}`;

  test('GET by id -> 404, the same response as for an id that does not exist', async () => {
    const { row } = resources[name];
    const theirs = await request(app)
      .get(path(row.id))
      .set(...bob);
    const nonexistent = await request(app)
      .get(path(999999))
      .set(...bob);

    expect(theirs.status).toBe(404);
    expect(theirs.body).toEqual(nonexistent.body);
  });

  test("list -> never includes Alice's row", async () => {
    const res = await request(app)
      .get(`/api/${name}?limit=100`)
      .set(...bob);

    expect(res.status).toBe(200);
    expect(res.body.data.map((r) => r.id)).not.toContain(resources[name].row.id);
  });

  test('PUT -> 404, and the row is unchanged', async () => {
    const { row, body } = resources[name];
    const res = await request(app)
      .put(path(row.id))
      .set(...bob)
      .send(body);

    expect(res.status).toBe(404);
    const stillAlices = await request(app)
      .get(path(row.id))
      .set(...alice);
    expect(stillAlices.body).toEqual(row);
  });

  test('DELETE -> 404, and the row still exists', async () => {
    const { row } = resources[name];
    const res = await request(app)
      .delete(path(row.id))
      .set(...bob);

    expect(res.status).toBe(404);
    const stillThere = await request(app)
      .get(path(row.id))
      .set(...alice);
    expect(stillThere.status).toBe(200);
  });
});

describe('cross-user references', () => {
  test("Bob cannot log a set against Alice's exercise (422, as if it didn't exist)", async () => {
    const res = await request(app)
      .post('/api/workouts')
      .set(...bob)
      .send({
        performedOn: '2026-03-02',
        sets: [{ exerciseId: resources.exercises.row.id, setNumber: 1, reps: 5 }],
      });

    expect(res.status).toBe(422);
    expect(res.body.error.details).toEqual([
      { field: 'sets.0.exerciseId', message: 'Exercise not found' },
    ]);
  });

  test("Alice's data doesn't leak into Bob's personal bests or current goal", async () => {
    const bests = await request(app)
      .get('/api/workouts/personal-bests')
      .set(...bob);
    const goal = await request(app)
      .get('/api/goals/current?date=2026-12-31')
      .set(...bob);

    expect(bests.body.data).toEqual([]);
    expect(goal.status).toBe(404);
  });

  test('two users can each have an exercise with the same name', async () => {
    const res = await request(app)
      .post('/api/exercises')
      .set(...bob)
      .send({ name: "Alice's Special", category: 'strength' });

    expect(res.status).toBe(201);
  });
});
