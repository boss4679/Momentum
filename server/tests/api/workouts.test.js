const request = require('supertest');
const app = require('../../src/app');
const workoutQueries = require('../../src/db/queries/workouts');
const { pool, resetDb, closeDb } = require('../helpers/db');
const { registerUser } = require('../helpers/auth');
const { createWorkout, exerciseId } = require('../helpers/factories');

async function countRows(table) {
  // The table name comes from this test file, never from user input. Identifiers can't be
  // $n parameters, so the query string is picked from a fixed list instead.
  const sql = {
    workouts: 'SELECT count(*) AS n FROM workouts',
    workout_sets: 'SELECT count(*) AS n FROM workout_sets',
  }[table];
  const { rows } = await pool.query(sql);
  return rows[0].n;
}

let auth;
let bench;
let squat;
let running;
beforeAll(async () => {
  await resetDb();
  ({ auth } = await registerUser());
  bench = await exerciseId(auth, 'Bench Press');
  squat = await exerciseId(auth, 'Back Squat');
  running = await exerciseId(auth, 'Running');
});
afterAll(closeDb);

describe('POST /api/workouts', () => {
  test('201: creates a workout with its sets nested in the response', async () => {
    const res = await request(app)
      .post('/api/workouts')
      .set(...auth)
      .send({
        performedOn: '2026-03-02',
        notes: '  Felt strong  ',
        sets: [
          { exerciseId: bench, setNumber: 1, reps: 5, weightKg: 60 },
          { exerciseId: bench, setNumber: 2, reps: 5, weightKg: 62.5 },
          { exerciseId: running, setNumber: 1, durationSec: 1200 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(Number),
      performedOn: '2026-03-02',
      notes: 'Felt strong',
      createdAt: expect.any(String),
      sets: [
        {
          id: expect.any(Number),
          exerciseId: bench,
          exerciseName: 'Bench Press',
          category: 'strength',
          setNumber: 1,
          reps: 5,
          weightKg: 60,
          durationSec: null,
        },
        expect.objectContaining({ setNumber: 2, weightKg: 62.5 }),
        expect.objectContaining({ exerciseName: 'Running', reps: null, durationSec: 1200 }),
      ],
    });
  });

  test('blank notes are stored as null', async () => {
    const workout = await createWorkout(auth, { notes: '   ' });
    expect(workout.notes).toBeNull();
  });

  test.each([
    ['no sets', { sets: [] }, 'sets'],
    ['impossible date', { performedOn: '2026-02-30' }, 'performedOn'],
    [
      'set with neither reps nor duration',
      { sets: [{ exerciseId: 1, setNumber: 1 }] },
      'sets.0.reps',
    ],
    [
      'weight without reps',
      { sets: [{ exerciseId: 1, setNumber: 1, durationSec: 30, weightKg: 10 }] },
      'sets.0.weightKg',
    ],
    ['zero reps', { sets: [{ exerciseId: 1, setNumber: 1, reps: 0 }] }, 'sets.0.reps'],
    [
      'negative weight',
      { sets: [{ exerciseId: 1, setNumber: 1, reps: 5, weightKg: -5 }] },
      'sets.0.weightKg',
    ],
  ])('422: %s', async (_name, overrides, field) => {
    const res = await request(app)
      .post('/api/workouts')
      .set(...auth)
      .send({
        performedOn: '2026-03-02',
        sets: [{ exerciseId: bench, setNumber: 1, reps: 5 }],
        ...overrides,
      });

    expect(res.status).toBe(422);
    expect(res.body.error.details.map((d) => d.field)).toContain(field);
  });

  test('422: the same set number twice for one exercise points at the duplicate', async () => {
    const res = await request(app)
      .post('/api/workouts')
      .set(...auth)
      .send({
        performedOn: '2026-03-02',
        sets: [
          { exerciseId: bench, setNumber: 1, reps: 5 },
          { exerciseId: squat, setNumber: 1, reps: 5 }, // fine: a different exercise
          { exerciseId: bench, setNumber: 1, reps: 3 }, // duplicate of the first
        ],
      });

    expect(res.status).toBe(422);
    expect(res.body.error.details).toEqual([
      { field: 'sets.2.setNumber', message: 'Duplicate set number for this exercise' },
    ]);
  });

  test('422: an exercise that does not exist, and nothing is saved', async () => {
    const before = await countRows('workouts');

    const res = await request(app)
      .post('/api/workouts')
      .set(...auth)
      .send({
        performedOn: '2026-03-02',
        sets: [
          { exerciseId: bench, setNumber: 1, reps: 5 },
          { exerciseId: 999999, setNumber: 1, reps: 5 },
        ],
      });

    expect(res.status).toBe(422);
    expect(res.body.error.details).toEqual([
      { field: 'sets.1.exerciseId', message: 'Exercise not found' },
    ]);
    expect(await countRows('workouts')).toBe(before);
  });

  test('transaction: if inserting the sets fails, the workout row is rolled back too', async () => {
    const workoutsBefore = await countRows('workouts');
    const setsBefore = await countRows('workout_sets');
    // Make the second statement of the transaction fail, after the workout row was inserted.
    const spy = jest.spyOn(workoutQueries, 'insertSets').mockRejectedValueOnce(new Error('boom'));
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app)
      .post('/api/workouts')
      .set(...auth)
      .send({ performedOn: '2026-03-02', sets: [{ exerciseId: bench, setNumber: 1, reps: 5 }] });

    expect(res.status).toBe(500);
    expect(await countRows('workouts')).toBe(workoutsBefore);
    expect(await countRows('workout_sets')).toBe(setsBefore);
    spy.mockRestore();
    quiet.mockRestore();
  });

  test('400: malformed JSON', async () => {
    const res = await request(app)
      .post('/api/workouts')
      .set(...auth)
      .set('Content-Type', 'application/json')
      .send('{"sets": [');

    expect(res.status).toBe(400);
  });
});

describe('GET /api/workouts', () => {
  let listAuth;
  beforeAll(async () => {
    // A separate user, so earlier tests' workouts don't affect the counts here.
    ({ auth: listAuth } = await registerUser());
    const benchId = await exerciseId(listAuth, 'Bench Press');
    for (const day of ['2026-03-01', '2026-03-03', '2026-03-05', '2026-03-07']) {
      await createWorkout(listAuth, {
        performedOn: day,
        // Several sets each, to prove LIMIT counts workouts, not set rows.
        sets: [1, 2, 3].map((n) => ({ exerciseId: benchId, setNumber: n, reps: 5 })),
      });
    }
  });

  test('200: newest first, with sets and pagination', async () => {
    const res = await request(app)
      .get('/api/workouts?limit=2')
      .set(...listAuth);

    expect(res.status).toBe(200);
    expect(res.body.data.map((w) => w.performedOn)).toEqual(['2026-03-07', '2026-03-05']);
    expect(res.body.data[0].sets).toHaveLength(3);
    expect(res.body.pagination).toEqual({ limit: 2, offset: 0, total: 4 });
  });

  test('from/to filter is inclusive on both ends', async () => {
    const res = await request(app)
      .get('/api/workouts?from=2026-03-03&to=2026-03-05')
      .set(...listAuth);

    expect(res.body.data.map((w) => w.performedOn)).toEqual(['2026-03-05', '2026-03-03']);
    expect(res.body.pagination.total).toBe(2);
  });

  test('an empty range returns an empty list, not an error', async () => {
    const res = await request(app)
      .get('/api/workouts?from=2027-01-01')
      .set(...listAuth);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [], pagination: { limit: 20, offset: 0, total: 0 } });
  });

  test.each([
    ['from after to', 'from=2026-03-05&to=2026-03-01', 'to'],
    ['bad date', 'from=03/01/2026', 'from'],
  ])('400: %s', async (_name, query, field) => {
    const res = await request(app)
      .get(`/api/workouts?${query}`)
      .set(...listAuth);

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe(field);
  });
});

describe('GET /api/workouts/:id', () => {
  test('200: returns the workout with its sets', async () => {
    const created = await createWorkout(auth);
    const res = await request(app)
      .get(`/api/workouts/${created.id}`)
      .set(...auth);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(created);
  });

  test('404: no such workout', async () => {
    const res = await request(app)
      .get('/api/workouts/999999')
      .set(...auth);
    expect(res.status).toBe(404);
  });

  test('400: invalid id', async () => {
    const res = await request(app)
      .get('/api/workouts/abc')
      .set(...auth);
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/workouts/:id', () => {
  test('200: replaces the date, notes and the whole list of sets', async () => {
    const created = await createWorkout(auth);
    const res = await request(app)
      .put(`/api/workouts/${created.id}`)
      .set(...auth)
      .send({
        performedOn: '2026-03-09',
        notes: null,
        sets: [
          { exerciseId: squat, setNumber: 1, reps: 3, weightKg: 100 },
          { exerciseId: squat, setNumber: 2, reps: 3, weightKg: 100 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.performedOn).toBe('2026-03-09');
    expect(res.body.notes).toBeNull();
    expect(res.body.sets.map((s) => [s.exerciseName, s.setNumber])).toEqual([
      ['Back Squat', 1],
      ['Back Squat', 2],
    ]);
    // The old set row is gone, not left behind next to the new ones.
    const { rows } = await pool.query('SELECT 1 FROM workout_sets WHERE id = $1', [
      created.sets[0].id,
    ]);
    expect(rows).toHaveLength(0);
  });

  test('404: no such workout', async () => {
    const res = await request(app)
      .put('/api/workouts/999999')
      .set(...auth)
      .send({ performedOn: '2026-03-09', sets: [{ exerciseId: bench, setNumber: 1, reps: 1 }] });
    expect(res.status).toBe(404);
  });

  test('422: invalid body', async () => {
    const created = await createWorkout(auth);
    const res = await request(app)
      .put(`/api/workouts/${created.id}`)
      .set(...auth)
      .send({ performedOn: '2026-03-09', sets: [] });
    expect(res.status).toBe(422);
  });

  test('422: unknown exercise, and the existing sets are left untouched', async () => {
    const created = await createWorkout(auth);
    const res = await request(app)
      .put(`/api/workouts/${created.id}`)
      .set(...auth)
      .send({ performedOn: '2026-03-09', sets: [{ exerciseId: 999999, setNumber: 1, reps: 1 }] });

    expect(res.status).toBe(422);
    const after = await request(app)
      .get(`/api/workouts/${created.id}`)
      .set(...auth);
    expect(after.body).toEqual(created);
  });
});

describe('DELETE /api/workouts/:id', () => {
  test('204: deletes the workout and, through the cascade, its sets', async () => {
    const created = await createWorkout(auth);
    const res = await request(app)
      .delete(`/api/workouts/${created.id}`)
      .set(...auth);

    expect(res.status).toBe(204);
    const { rows } = await pool.query('SELECT 1 FROM workout_sets WHERE workout_id = $1', [
      created.id,
    ]);
    expect(rows).toHaveLength(0);
  });

  test('404: no such workout', async () => {
    const res = await request(app)
      .delete('/api/workouts/999999')
      .set(...auth);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/workouts/personal-bests', () => {
  // Hand-built history, so every expected number can be checked by eye:
  //   Bench: 60x5 (Mar 1), 62.5x3 (Mar 3), 62.5x5 (Mar 5), 62.5x5 (Mar 7)
  //     -> heaviest is 62.5 kg. Tied on weight, 5 reps beats 3. Tied again (Mar 5 vs Mar 7),
  //        the earliest date wins, because that's when the record was first set.
  //   Pull-up: bodyweight, 8 and 12 reps -> no max weight, maxReps 12
  //   Running: 20 min and 35 min -> maxDurationSec 2100, no weight
  //   Deadlift: never logged -> not in the list at all
  let pbAuth;
  beforeAll(async () => {
    ({ auth: pbAuth } = await registerUser());
    const b = await exerciseId(pbAuth, 'Bench Press');
    const p = await exerciseId(pbAuth, 'Pull-up');
    const r = await exerciseId(pbAuth, 'Running');
    const log = (performedOn, sets) => createWorkout(pbAuth, { performedOn, sets });

    await log('2026-03-01', [
      { exerciseId: b, setNumber: 1, reps: 5, weightKg: 60 },
      { exerciseId: p, setNumber: 1, reps: 8 },
    ]);
    await log('2026-03-03', [
      { exerciseId: b, setNumber: 1, reps: 3, weightKg: 62.5 },
      { exerciseId: r, setNumber: 1, durationSec: 1200 },
    ]);
    await log('2026-03-05', [
      { exerciseId: b, setNumber: 1, reps: 5, weightKg: 62.5 },
      { exerciseId: p, setNumber: 1, reps: 12 },
    ]);
    await log('2026-03-07', [
      { exerciseId: b, setNumber: 1, reps: 5, weightKg: 62.5 },
      { exerciseId: r, setNumber: 1, durationSec: 2100 },
    ]);
  });

  test('200: one row per logged exercise with its records', async () => {
    const res = await request(app)
      .get('/api/workouts/personal-bests')
      .set(...pbAuth);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      {
        exerciseId: expect.any(Number),
        exerciseName: 'Bench Press',
        category: 'strength',
        maxWeightKg: 62.5,
        repsAtMaxWeight: 5,
        maxWeightOn: '2026-03-05',
        maxReps: 5,
        maxDurationSec: null,
        setCount: 4,
        lastPerformedOn: '2026-03-07',
      },
      expect.objectContaining({
        exerciseName: 'Pull-up',
        maxWeightKg: null,
        repsAtMaxWeight: null,
        maxReps: 12,
        setCount: 2,
      }),
      expect.objectContaining({
        exerciseName: 'Running',
        maxWeightKg: null,
        maxReps: null,
        maxDurationSec: 2100,
        lastPerformedOn: '2026-03-07',
      }),
    ]);
  });

  test('a user with no workouts gets an empty list', async () => {
    const { auth: fresh } = await registerUser();
    const res = await request(app)
      .get('/api/workouts/personal-bests')
      .set(...fresh);
    expect(res.body).toEqual({ data: [] });
  });
});
