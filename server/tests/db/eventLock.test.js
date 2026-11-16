// The overlap check is "SELECT for clashes, then INSERT" inside a transaction. Without a
// lock, two transactions can interleave like this:
//
//   A: check -> no clash          B: check -> no clash (A's row isn't committed yet)
//   A: insert, COMMIT             B: insert, COMMIT     -> two overlapping events
//
// This test replays that exact interleaving with two real connections, so it doesn't depend
// on timing luck. With lockUserCalendar in place, B blocks at the lock until A commits, and
// then B's check sees A's event.
const pool = require('../../src/db/pool');
const events = require('../../src/db/queries/events');
const { resetDb, closeDb } = require('../helpers/db');

let userId;
let otherUserId;
beforeAll(async () => {
  await resetDb();
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash) VALUES ('a@example.com', 'x'), ('b@example.com', 'x')
     RETURNING id`,
  );
  [userId, otherUserId] = rows.map((r) => r.id);
});
afterAll(closeDb);

const slot = { startsAt: '2026-03-02T09:00:00Z', endsAt: '2026-03-02T10:00:00Z' };

// Resolves to 'done' if the promise settles within `ms`, otherwise 'still waiting'.
function settlesWithin(promise, ms) {
  return Promise.race([
    promise.then(() => 'done'),
    new Promise((resolve) => setTimeout(() => resolve('still waiting'), ms)),
  ]);
}

test('a second transaction waits for the first, then sees its event', async () => {
  const a = await pool.connect();
  const b = await pool.connect();
  try {
    // A: lock, find no clash, insert, but don't commit yet.
    await a.query('BEGIN');
    await events.lockUserCalendar(a, userId);
    expect(await events.findOverlappingEvents(a, userId, slot)).toEqual([]);
    await events.createEvent(a, userId, { title: 'First', ...slot, notes: null });

    // B: tries to take the same user's lock and must block.
    await b.query('BEGIN');
    const bLock = events.lockUserCalendar(b, userId);
    expect(await settlesWithin(bLock, 200)).toBe('still waiting');

    // A commits, which releases the lock; now B gets it.
    await a.query('COMMIT');
    await bLock;

    // B's check now sees A's committed event, so B would answer 409 instead of inserting.
    const clashes = await events.findOverlappingEvents(b, userId, slot);
    expect(clashes.map((e) => e.title)).toEqual(['First']);
    await b.query('ROLLBACK');
  } finally {
    a.release();
    b.release();
  }
});

test("the lock is per user: another user's transaction doesn't wait", async () => {
  const a = await pool.connect();
  const b = await pool.connect();
  try {
    await a.query('BEGIN');
    await events.lockUserCalendar(a, userId);

    await b.query('BEGIN');
    const otherUsersLock = events.lockUserCalendar(b, otherUserId);
    expect(await settlesWithin(otherUsersLock, 200)).toBe('done');
  } finally {
    await a.query('ROLLBACK');
    await b.query('ROLLBACK');
    a.release();
    b.release();
  }
});
