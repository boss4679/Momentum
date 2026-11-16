// Create test data through the real API rather than raw SQL inserts, so every test goes
// through the same validation and ownership rules a real client does. Each factory takes
// the `auth` header pair from registerUser() and asserts that the create succeeded.
const request = require('supertest');
const app = require('../../src/app');

async function post(auth, path, body, query = '') {
  const res = await request(app)
    .post(path + query)
    .set(...auth)
    .send(body);
  if (res.status !== 201) {
    throw new Error(`POST ${path} failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

// Every new user has the starter catalog, so tests can look exercises up by name.
async function exerciseId(auth, name) {
  const res = await request(app)
    .get('/api/exercises?limit=100')
    .set(...auth);
  const exercise = res.body.data.find((e) => e.name === name);
  if (!exercise) throw new Error(`No exercise named ${name}`);
  return exercise.id;
}

const createExercise = (auth, overrides = {}) =>
  post(auth, '/api/exercises', { name: 'Hip Thrust', category: 'strength', ...overrides });

const createWorkout = async (auth, overrides = {}) =>
  post(auth, '/api/workouts', {
    performedOn: '2026-03-02',
    notes: 'Test workout',
    sets: [
      { exerciseId: await exerciseId(auth, 'Bench Press'), setNumber: 1, reps: 5, weightKg: 60 },
    ],
    ...overrides,
  });

const createEvent = (auth, overrides = {}, query = '') =>
  post(
    auth,
    '/api/events',
    {
      title: 'Team standup',
      startsAt: '2026-03-02T09:00:00Z',
      endsAt: '2026-03-02T09:30:00Z',
      category: 'work',
      ...overrides,
    },
    query,
  );

const createFoodEntry = (auth, overrides = {}) =>
  post(auth, '/api/food-entries', {
    eatenOn: '2026-03-02',
    meal: 'lunch',
    name: 'Chicken salad',
    calories: 550,
    proteinG: 40,
    ...overrides,
  });

const createGoal = (auth, overrides = {}) =>
  post(auth, '/api/goals', { calorieGoal: 2200, effectiveFrom: '2026-03-01', ...overrides });

module.exports = {
  exerciseId,
  createExercise,
  createWorkout,
  createEvent,
  createFoodEntry,
  createGoal,
};
