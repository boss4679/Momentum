// Summary and trends, tested against a small hand-built history where every expected number
// can be worked out on paper. The user's timezone is UTC, so "a day" is simply a UTC day
// (the timezone tests at the bottom use other zones).
//
// March 2026 (Mon Mar 2 starts a week; Mar 1 is a Sunday, in the week of Mon Feb 23):
//
//   day     food (kcal)            workouts (Bench 5 x 100 kg = 500 kg volume each)
//   Mar 1   1000                   1 workout              <- streak A starts
//   Mar 2   1400                   1 workout
//   Mar 3   -                      1 workout              <- streak A: 3 days
//   Mar 4   -                      -                      (gap)
//   Mar 5   1200 + 800 = 2000      1 workout              <- streak B starts
//   Mar 6   -                      1 workout, Running only (no volume)
//   Mar 7   -                      1 workout
//   Mar 8   600 + 800 + 1200       1 workout              <- streak B: 4 days
//   Mar 9   -                      -                      (gap)
//   Mar 10  1800                   2 workouts             <- streak C: 1 day
//
// Goals: 2000 kcal from Mar 1, 1800 kcal from Mar 10.
const request = require('supertest');
const app = require('../../src/app');
const { resetDb, closeDb } = require('../helpers/db');
const { registerUser } = require('../helpers/auth');
const f = require('../helpers/factories');

let auth;
beforeAll(async () => {
  await resetDb();
  ({ auth } = await registerUser({ timezone: 'UTC' }));
  const bench = await f.exerciseId(auth, 'Bench Press');
  const running = await f.exerciseId(auth, 'Running');
  const benchSet = [{ exerciseId: bench, setNumber: 1, reps: 5, weightKg: 100 }];

  for (const day of ['01', '02', '03', '05', '07', '08', '10', '10']) {
    await f.createWorkout(auth, { performedOn: `2026-03-${day}`, sets: benchSet });
  }
  await f.createWorkout(auth, {
    performedOn: '2026-03-06',
    sets: [{ exerciseId: running, setNumber: 1, durationSec: 1800 }],
  });

  const food = [
    ['2026-03-01', 'lunch', 1000],
    ['2026-03-02', 'lunch', 1400],
    ['2026-03-05', 'lunch', 1200],
    ['2026-03-05', 'dinner', 800],
    ['2026-03-08', 'breakfast', 600, 30],
    ['2026-03-08', 'lunch', 800, 40.5],
    ['2026-03-08', 'dinner', 1200, null],
    ['2026-03-10', 'lunch', 1800],
  ];
  for (const [eatenOn, meal, calories, proteinG] of food) {
    await f.createFoodEntry(auth, { eatenOn, meal, calories, proteinG: proteinG ?? null });
  }

  await f.createGoal(auth, { calorieGoal: 2000, effectiveFrom: '2026-03-01' });
  await f.createGoal(auth, { calorieGoal: 1800, effectiveFrom: '2026-03-10' });
});
afterAll(closeDb);

const getTrends = (query) =>
  request(app)
    .get(`/api/summary/trends?${query}`)
    .set(...auth);

const getDaily = (query) =>
  request(app)
    .get(`/api/summary/daily?${query}`)
    .set(...auth);

describe('GET /api/summary/trends: daily calories and the 7-day rolling average', () => {
  test('the first day of the range uses the 6 days BEFORE the range for its average', async () => {
    const res = await getTrends('from=2026-03-08&to=2026-03-10');

    expect(res.status).toBe(200);
    expect(res.body.dailyCalories).toEqual([
      // Window Mar 2-8: logged days 1400, 2000, 2600 -> 6000 / 3 = 2000.
      // (Mar 1's 1000 is just outside the window.)
      { date: '2026-03-08', calories: 2600, rollingAvg7: 2000, loggedDaysInWindow: 3, goal: 2000 },
      // Window Mar 3-9: 2000, 2600 -> 2300. Nothing logged on Mar 9 itself: calories is null,
      // but the day is still there with an average.
      { date: '2026-03-09', calories: null, rollingAvg7: 2300, loggedDaysInWindow: 2, goal: 2000 },
      // Window Mar 4-10: 2000, 2600, 1800 -> 6400 / 3 = 2133.3, rounded to 2133.
      // The new 1800 goal starts on Mar 10.
      { date: '2026-03-10', calories: 1800, rollingAvg7: 2133, loggedDaysInWindow: 3, goal: 1800 },
    ]);
  });

  test('unlogged days are skipped, not counted as 0 kcal', async () => {
    // Window for Mar 7 is Mar 1-7: 1000, 1400, 2000 over 3 logged days -> 1467.
    // Counting the 4 empty days as zeros would give 4400 / 7 = 629 instead.
    const res = await getTrends('from=2026-03-07&to=2026-03-07');
    expect(res.body.dailyCalories[0]).toMatchObject({ rollingAvg7: 1467, loggedDaysInWindow: 3 });
  });

  test('a window with nothing logged has a null average and no goal before the first goal', async () => {
    const res = await getTrends('from=2026-02-20&to=2026-02-21');

    expect(res.body.dailyCalories).toEqual([
      { date: '2026-02-20', calories: null, rollingAvg7: null, loggedDaysInWindow: 0, goal: null },
      { date: '2026-02-21', calories: null, rollingAvg7: null, loggedDaysInWindow: 0, goal: null },
    ]);
  });
});

describe('GET /api/summary/trends: weekly volume', () => {
  test('one row per Monday-starting week, including weeks with no workouts', async () => {
    const res = await getTrends('from=2026-03-01&to=2026-03-22');

    expect(res.body.weeklyVolume).toEqual([
      // Mar 1 (Sunday) belongs to the week starting Mon Feb 23.
      { weekStart: '2026-02-23', workouts: 1, sets: 1, volumeKg: 500 },
      // Mar 2, 3, 5, 6, 7, 8: 6 workouts, but Mar 6 was Running (no weight) -> 5 x 500.
      { weekStart: '2026-03-02', workouts: 6, sets: 6, volumeKg: 2500 },
      // Mar 10: two workouts on the same day.
      { weekStart: '2026-03-09', workouts: 2, sets: 2, volumeKg: 1000 },
      { weekStart: '2026-03-16', workouts: 0, sets: 0, volumeKg: 0 },
    ]);
  });

  test('only workouts inside the range count, even in a partial week', async () => {
    // The week of Mar 2 is cut off at Mar 4: only Mar 2 and Mar 3 count.
    const res = await getTrends('from=2026-03-02&to=2026-03-04');
    expect(res.body.weeklyVolume).toEqual([
      { weekStart: '2026-03-02', workouts: 2, sets: 2, volumeKg: 1000 },
    ]);
  });
});

describe('GET /api/summary/trends: workout streak (gaps and islands)', () => {
  test.each([
    // [asOf (the `to` date), current, currentStartedOn, longest, why]
    ['2026-03-03', 3, '2026-03-01', 3, 'streak A, the first island'],
    ['2026-03-04', 3, '2026-03-01', 3, 'no workout yet today, but yesterday keeps it alive'],
    ['2026-03-08', 4, '2026-03-05', 4, 'streak B: Mar 5-8'],
    ['2026-03-09', 4, '2026-03-05', 4, 'Mar 9 missing, streak B still alive on Mar 9'],
    ['2026-03-10', 1, '2026-03-10', 4, 'the Mar 9 gap broke it; two workouts on Mar 10 count once'],
    ['2026-03-12', 0, null, 4, 'two days without a workout: no current streak'],
    ['2026-02-28', 0, null, 0, 'before any workouts'],
  ])('as of %s: current %i', async (asOf, current, currentStartedOn, longest) => {
    const res = await getTrends(`from=2026-02-01&to=${asOf}`);
    expect(res.body.streak).toEqual({ current, currentStartedOn, longest });
  });

  test('workouts after the as-of date are ignored', async () => {
    // As of Mar 3, the longer streak B (Mar 5-8) hasn't happened yet.
    const res = await getTrends('from=2026-03-01&to=2026-03-03');
    expect(res.body.streak.longest).toBe(3);
  });
});

describe('GET /api/summary/trends: query handling', () => {
  test('defaults to the 30 days ending today', async () => {
    const res = await getTrends('');

    expect(res.status).toBe(200);
    expect(res.body.dailyCalories).toHaveLength(30);
    expect(res.body.to).toBe(new Date().toISOString().slice(0, 10)); // the user is on UTC
  });

  test.each([
    ['from after to', 'from=2026-03-10&to=2026-03-01', 'to'],
    ['longer than 366 days', 'from=2025-01-01&to=2026-03-01', 'from'],
    ['bad date', 'from=2026-3-1', 'from'],
    ['unknown parameter', 'start=2026-03-01', 'start'],
  ])('400: %s', async (_name, query, field) => {
    const res = await getTrends(query);

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe(field);
  });
});

describe('GET /api/summary/daily', () => {
  test('200: workouts, calories against the goal, per-meal totals and trends for one day', async () => {
    const res = await getDaily('date=2026-03-08');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      date: '2026-03-08',
      timezone: 'UTC',
      workouts: [
        {
          id: expect.any(Number),
          notes: 'Test workout',
          exercises: ['Bench Press'],
          setCount: 1,
          volumeKg: 500,
          durationSec: 0,
        },
      ],
      calories: {
        eaten: 2600, // 600 + 800 + 1200
        goal: 2000,
        remaining: -600, // over the goal
        percentOfGoal: 130,
        byMeal: [
          { meal: 'breakfast', entries: 1, calories: 600, proteinG: 30, carbsG: 0, fatG: 0 },
          { meal: 'lunch', entries: 1, calories: 800, proteinG: 40.5, carbsG: 0, fatG: 0 },
          { meal: 'dinner', entries: 1, calories: 1200, proteinG: 0, carbsG: 0, fatG: 0 },
          // No snack logged: still listed, with zeros.
          { meal: 'snack', entries: 0, calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
        ],
        macros: { proteinG: 70.5, carbsG: 0, fatG: 0 },
      },
      trends: {
        rollingAvg7: 2000,
        loggedDaysInWindow: 3,
        streak: { current: 4, currentStartedOn: '2026-03-05', longest: 4 },
      },
    });
  });

  test('a day with nothing logged', async () => {
    const res = await getDaily('date=2026-03-09');

    expect(res.body.workouts).toEqual([]);
    expect(res.body.calories).toMatchObject({
      eaten: 0,
      goal: 2000,
      remaining: 2000,
      percentOfGoal: 0,
    });
  });

  test('a day before any goal: goal-based numbers are null', async () => {
    const res = await getDaily('date=2026-02-01');
    expect(res.body.calories).toMatchObject({ goal: null, remaining: null, percentOfGoal: null });
  });

  test('defaults to today in the user timezone', async () => {
    const res = await getDaily('');
    expect(res.body.date).toBe(new Date().toISOString().slice(0, 10));
  });

  test.each(['date=yesterday', 'date=2026-02-30', 'when=2026-03-01'])('400: ?%s', async (query) => {
    const res = await getDaily(query);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/summary/daily: upcoming events', () => {
  let eventsAuth;
  beforeAll(async () => {
    ({ auth: eventsAuth } = await registerUser({ timezone: 'UTC' }));
    const at = (title, startsAt, endsAt) => f.createEvent(eventsAuth, { title, startsAt, endsAt });
    await at('Finished yesterday', '2026-04-01T10:00:00Z', '2026-04-01T11:00:00Z');
    await at(
      'Overnight, still running at midnight',
      '2026-04-01T23:00:00Z',
      '2026-04-02T01:00:00Z',
    );
    await at('Morning', '2026-04-02T09:00:00Z', '2026-04-02T10:00:00Z');
    await at('Afternoon', '2026-04-02T15:00:00Z', '2026-04-02T16:00:00Z');
    await at('Next day 1', '2026-04-03T09:00:00Z', '2026-04-03T10:00:00Z');
    await at('Next day 2', '2026-04-03T11:00:00Z', '2026-04-03T12:00:00Z');
    await at('Next day 3', '2026-04-03T13:00:00Z', '2026-04-03T14:00:00Z');
  });

  test('a past or future date: the next 5 events from the start of that day, in-progress included', async () => {
    const res = await request(app)
      .get('/api/summary/daily?date=2026-04-02')
      .set(...eventsAuth);

    expect(res.body.upcomingEvents.map((e) => e.title)).toEqual([
      'Overnight, still running at midnight',
      'Morning',
      'Afternoon',
      'Next day 1',
      'Next day 2',
    ]);
  });

  test("today: events that already ended today don't count", async () => {
    const { auth: todayAuth } = await registerUser({ timezone: 'UTC' });
    const now = Date.now();
    const iso = (offsetMinutes) => new Date(now + offsetMinutes * 60_000).toISOString();
    // One event that ended 2 minutes ago, one starting in 2 minutes. Near midnight UTC the
    // first could fall on yesterday's date, which would still exclude it.
    await f.createEvent(todayAuth, { title: 'Just ended', startsAt: iso(-3), endsAt: iso(-2) });
    await f.createEvent(todayAuth, { title: 'Starting soon', startsAt: iso(2), endsAt: iso(3) });

    const res = await request(app)
      .get('/api/summary/daily')
      .set(...todayAuth);

    expect(res.body.upcomingEvents.map((e) => e.title)).toEqual(['Starting soon']);
  });
});

describe('timezones decide where a day starts', () => {
  test('the same event is on Jan 15 in UTC but on Jan 14 in Los Angeles', async () => {
    // 07:30-07:45 UTC on Jan 15 is 23:30-23:45 on Jan 14 in Los Angeles (UTC-8 in January).
    const event = {
      title: 'Late call',
      startsAt: '2026-01-15T07:30:00Z',
      endsAt: '2026-01-15T07:45:00Z',
    };
    const { auth: utc } = await registerUser({ timezone: 'UTC' });
    const { auth: la } = await registerUser({ timezone: 'America/Los_Angeles' });
    await f.createEvent(utc, event);
    await f.createEvent(la, event);

    const forUtc = await request(app)
      .get('/api/summary/daily?date=2026-01-15')
      .set(...utc);
    const forLa = await request(app)
      .get('/api/summary/daily?date=2026-01-15')
      .set(...la);

    // UTC's Jan 15 starts at 00:00Z, before the event ends: still upcoming.
    expect(forUtc.body.upcomingEvents.map((e) => e.title)).toEqual(['Late call']);
    // LA's Jan 15 starts at 08:00Z, after the event already ended (on LA's Jan 14).
    expect(forLa.body.upcomingEvents).toEqual([]);
    expect(forLa.body.timezone).toBe('America/Los_Angeles');
  });
});

describe('summary endpoints require a token', () => {
  test.each(['/api/summary/daily', '/api/summary/trends'])('401: %s', async (path) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(401);
  });
});
