const request = require('supertest');
const app = require('../../src/app');
const { resetDb, closeDb } = require('../helpers/db');
const { registerUser } = require('../helpers/auth');
const { createEvent } = require('../helpers/factories');

beforeAll(resetDb);
afterAll(closeDb);

// Most tests use their own user, so events from other tests can't cause surprise overlaps.
async function freshUser() {
  return (await registerUser()).auth;
}

const event = (overrides = {}) => ({
  title: 'Dentist',
  startsAt: '2026-03-02T15:00:00Z',
  endsAt: '2026-03-02T16:00:00Z',
  ...overrides,
});

describe('POST /api/events', () => {
  test('201: creates an event, with optional fields defaulting to null', async () => {
    const auth = await freshUser();
    const res = await request(app)
      .post('/api/events')
      .set(...auth)
      .send(event());

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(Number),
      title: 'Dentist',
      startsAt: '2026-03-02T15:00:00.000Z',
      endsAt: '2026-03-02T16:00:00.000Z',
      category: null,
      notes: null,
      createdAt: expect.any(String),
    });
  });

  test('timezone offsets are converted: the instant is stored, returned in UTC', async () => {
    const auth = await freshUser();
    const created = await createEvent(auth, {
      startsAt: '2026-03-02T09:00:00-08:00',
      endsAt: '2026-03-02T10:00:00-08:00',
    });

    expect(created.startsAt).toBe('2026-03-02T17:00:00.000Z');
  });

  test.each([
    ['ends before it starts', { endsAt: '2026-03-02T14:00:00Z' }, 'endsAt'],
    ['zero length', { endsAt: '2026-03-02T15:00:00Z' }, 'endsAt'],
    ['no timezone offset', { startsAt: '2026-03-02T15:00:00' }, 'startsAt'],
    ['blank title', { title: '  ' }, 'title'],
    ['unknown category', { category: 'party' }, 'category'],
  ])('422: %s', async (_name, overrides, field) => {
    const auth = await freshUser();
    const res = await request(app)
      .post('/api/events')
      .set(...auth)
      .send(event(overrides));

    expect(res.status).toBe(422);
    expect(res.body.error.details.map((d) => d.field)).toContain(field);
  });

  describe('overlap detection', () => {
    let auth;
    let existing;
    beforeAll(async () => {
      auth = await freshUser();
      // 15:00-16:00
      existing = await createEvent(auth, event({ title: 'Existing' }));
    });

    // Each case is a new event checked against the existing 15:00-16:00 one.
    test.each([
      ['starts during it', '15:30', '16:30'],
      ['ends during it', '14:30', '15:30'],
      ['inside it', '15:15', '15:45'],
      ['covers it entirely', '14:00', '17:00'],
      ['exactly the same times', '15:00', '16:00'],
    ])('409: %s', async (_name, start, end) => {
      const res = await request(app)
        .post('/api/events')
        .set(...auth)
        .send(event({ startsAt: `2026-03-02T${start}:00Z`, endsAt: `2026-03-02T${end}:00Z` }));

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EVENT_OVERLAP');
      expect(res.body.error.details).toEqual([
        {
          field: 'startsAt',
          message: 'Overlaps "Existing"',
          eventId: existing.id,
          startsAt: existing.startsAt,
          endsAt: existing.endsAt,
        },
      ]);
    });

    test.each([
      ['ends exactly when it starts', '14:00', '15:00'],
      ['starts exactly when it ends', '16:00', '17:00'],
    ])('201: back-to-back is not an overlap (%s)', async (_name, start, end) => {
      const res = await request(app)
        .post('/api/events')
        .set(...auth)
        .send(event({ startsAt: `2026-03-02T${start}:00Z`, endsAt: `2026-03-02T${end}:00Z` }));

      expect(res.status).toBe(201);
    });

    test('201: ?allowOverlap=true saves it anyway', async () => {
      const res = await request(app)
        .post('/api/events?allowOverlap=true')
        .set(...auth)
        .send(event({ title: 'Double-booked' }));

      expect(res.status).toBe(201);
    });

    test('409: ?allowOverlap=false behaves like the default', async () => {
      const res = await request(app)
        .post('/api/events?allowOverlap=false')
        .set(...auth)
        .send(event());

      expect(res.status).toBe(409);
    });

    test('400: ?allowOverlap must be exactly true or false', async () => {
      const res = await request(app)
        .post('/api/events?allowOverlap=yes')
        .set(...auth)
        .send(event());

      expect(res.status).toBe(400);
      expect(res.body.error.details[0].field).toBe('allowOverlap');
    });

    test("another user's events never count as overlaps", async () => {
      const other = await freshUser();
      const res = await request(app)
        .post('/api/events')
        .set(...other)
        .send(event());

      expect(res.status).toBe(201);
    });
  });
  // The race between overlap check and insert is tested deterministically in
  // tests/db/eventLock.test.js. Firing simultaneous HTTP requests here doesn't reliably
  // overlap them: each Supertest request starts its own server, which staggers them.
});

describe('GET /api/events', () => {
  let auth;
  beforeAll(async () => {
    auth = await freshUser();
    // Mar 1 23:00 -> Mar 2 01:00: starts before the window below and runs into it.
    await createEvent(auth, {
      title: 'Overnight',
      startsAt: '2026-03-01T23:00:00Z',
      endsAt: '2026-03-02T01:00:00Z',
    });
    await createEvent(auth, {
      title: 'Morning',
      startsAt: '2026-03-02T09:00:00Z',
      endsAt: '2026-03-02T10:00:00Z',
    });
    await createEvent(auth, {
      title: 'Next day',
      startsAt: '2026-03-03T09:00:00Z',
      endsAt: '2026-03-03T10:00:00Z',
    });
  });

  test('200: all events, ordered by start time', async () => {
    const res = await request(app)
      .get('/api/events')
      .set(...auth);

    expect(res.status).toBe(200);
    expect(res.body.data.map((e) => e.title)).toEqual(['Overnight', 'Morning', 'Next day']);
    expect(res.body.pagination.total).toBe(3);
  });

  test('from/to returns events that intersect the window, including ones that started before it', async () => {
    const res = await request(app)
      .get('/api/events?from=2026-03-02T00:00:00Z&to=2026-03-03T00:00:00Z')
      .set(...auth);

    expect(res.body.data.map((e) => e.title)).toEqual(['Overnight', 'Morning']);
    expect(res.body.pagination.total).toBe(2);
  });

  test.each([
    ['from after to', 'from=2026-03-03T00:00:00Z&to=2026-03-02T00:00:00Z'],
    ['date instead of date-time', 'from=2026-03-02'],
    ['limit too large', 'limit=1000'],
  ])('400: %s', async (_name, query) => {
    const res = await request(app)
      .get(`/api/events?${query}`)
      .set(...auth);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/events/:id', () => {
  test('200 and 404', async () => {
    const auth = await freshUser();
    const created = await createEvent(auth);

    const found = await request(app)
      .get(`/api/events/${created.id}`)
      .set(...auth);
    const missing = await request(app)
      .get('/api/events/999999')
      .set(...auth);

    expect(found.status).toBe(200);
    expect(found.body).toEqual(created);
    expect(missing.status).toBe(404);
  });
});

describe('PUT /api/events/:id', () => {
  let auth;
  let morning;
  let lunch;
  beforeAll(async () => {
    auth = await freshUser();
    morning = await createEvent(auth, {
      title: 'Morning',
      startsAt: '2026-03-02T09:00:00Z',
      endsAt: '2026-03-02T10:00:00Z',
    });
    lunch = await createEvent(auth, {
      title: 'Lunch',
      startsAt: '2026-03-02T12:00:00Z',
      endsAt: '2026-03-02T13:00:00Z',
    });
  });

  test('200: an event can move within its own time without "overlapping itself"', async () => {
    const res = await request(app)
      .put(`/api/events/${morning.id}`)
      .set(...auth)
      .send(
        event({
          title: 'Morning (moved)',
          startsAt: '2026-03-02T09:30:00Z',
          endsAt: '2026-03-02T10:30:00Z',
          notes: 'Pushed back',
        }),
      );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: 'Morning (moved)', notes: 'Pushed back' });
  });

  test('409: moving onto another event', async () => {
    const res = await request(app)
      .put(`/api/events/${morning.id}`)
      .set(...auth)
      .send(event({ startsAt: '2026-03-02T12:30:00Z', endsAt: '2026-03-02T13:30:00Z' }));

    expect(res.status).toBe(409);
    expect(res.body.error.details[0].eventId).toBe(lunch.id);
  });

  test('200: moving onto another event with ?allowOverlap=true', async () => {
    const res = await request(app)
      .put(`/api/events/${morning.id}?allowOverlap=true`)
      .set(...auth)
      .send(event({ startsAt: '2026-03-02T12:30:00Z', endsAt: '2026-03-02T13:30:00Z' }));

    expect(res.status).toBe(200);
  });

  test('404: no such event (checked before overlap)', async () => {
    const res = await request(app)
      .put('/api/events/999999')
      .set(...auth)
      .send(event({ startsAt: lunch.startsAt, endsAt: lunch.endsAt }));

    expect(res.status).toBe(404);
  });

  test('422: invalid body', async () => {
    const res = await request(app)
      .put(`/api/events/${lunch.id}`)
      .set(...auth)
      .send({ title: 'No times' });

    expect(res.status).toBe(422);
  });
});

describe('DELETE /api/events/:id', () => {
  test('204, then 404', async () => {
    const auth = await freshUser();
    const created = await createEvent(auth);

    const first = await request(app)
      .delete(`/api/events/${created.id}`)
      .set(...auth);
    const second = await request(app)
      .delete(`/api/events/${created.id}`)
      .set(...auth);

    expect(first.status).toBe(204);
    expect(second.status).toBe(404);
  });
});
