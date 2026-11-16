// SQL for calendar events.

// Events that intersect the window [from, to). Either bound may be missing.
// An event "intersects" the window when it starts before the window ends AND ends after the
// window starts. That includes events that began before the window and run into it, which
// "starts_at BETWEEN from AND to" would miss.
const LIST_EVENTS_SQL = `
  SELECT id, title, starts_at AS "startsAt", ends_at AS "endsAt", category, notes,
         created_at AS "createdAt"
  FROM calendar_events
  WHERE user_id = $1
    AND ($2::timestamptz IS NULL OR ends_at > $2)
    AND ($3::timestamptz IS NULL OR starts_at < $3)
  ORDER BY starts_at, id
  LIMIT $4 OFFSET $5`;

async function listEvents(db, userId, { from, to, limit, offset }) {
  const { rows } = await db.query(LIST_EVENTS_SQL, [
    userId,
    from ?? null,
    to ?? null,
    limit,
    offset,
  ]);
  return rows;
}

async function countEvents(db, userId, { from, to }) {
  const { rows } = await db.query(
    `SELECT count(*) AS total
     FROM calendar_events
     WHERE user_id = $1
       AND ($2::timestamptz IS NULL OR ends_at > $2)
       AND ($3::timestamptz IS NULL OR starts_at < $3)`,
    [userId, from ?? null, to ?? null],
  );
  return rows[0].total;
}

async function findEvent(db, userId, id) {
  const { rows } = await db.query(
    `SELECT id, title, starts_at AS "startsAt", ends_at AS "endsAt", category, notes,
            created_at AS "createdAt"
     FROM calendar_events
     WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return rows[0] ?? null;
}

// Serializes calendar writes per user, for the rest of the transaction.
//
// Why: "check for overlaps, then insert" is two statements. Without a lock, two requests
// could both run the check, both see a free slot, and both insert, creating an overlap.
// A row lock (FOR UPDATE) can't help, because the conflicting row doesn't exist yet. An
// advisory lock is a lock on an arbitrary number that we choose: here the pair
// (1 = "calendar", userId). A second request for the same user waits at this line until
// the first transaction commits; other users aren't affected. The _xact_ variant releases
// the lock automatically at COMMIT or ROLLBACK.
const CALENDAR_LOCK_NAMESPACE = 1;
async function lockUserCalendar(db, userId) {
  await db.query('SELECT pg_advisory_xact_lock($1, $2)', [CALENDAR_LOCK_NAMESPACE, userId]);
}

// The user's events that overlap [startsAt, endsAt), excluding `excludeId` (the event being
// edited, which shouldn't count as overlapping itself).
//
// Two ranges overlap when each one starts before the other ends:
//   existing.starts_at < new.ends_at AND existing.ends_at > new.starts_at
// Strict < and > mean back-to-back events (one ends at 10:00, the next starts at 10:00) are
// not an overlap.
async function findOverlappingEvents(db, userId, { startsAt, endsAt, excludeId }) {
  const { rows } = await db.query(
    `SELECT id, title, starts_at AS "startsAt", ends_at AS "endsAt"
     FROM calendar_events
     WHERE user_id = $1
       AND starts_at < $3
       AND ends_at > $2
       AND ($4::int IS NULL OR id <> $4)
     ORDER BY starts_at
     LIMIT 5`,
    [userId, startsAt, endsAt, excludeId ?? null],
  );
  return rows;
}

async function createEvent(db, userId, { title, startsAt, endsAt, category, notes }) {
  const { rows } = await db.query(
    `INSERT INTO calendar_events (user_id, title, starts_at, ends_at, category, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, title, starts_at AS "startsAt", ends_at AS "endsAt", category, notes,
               created_at AS "createdAt"`,
    [userId, title, startsAt, endsAt, category ?? null, notes],
  );
  return rows[0];
}

async function updateEvent(db, userId, id, { title, startsAt, endsAt, category, notes }) {
  const { rows } = await db.query(
    `UPDATE calendar_events
     SET title = $3, starts_at = $4, ends_at = $5, category = $6, notes = $7
     WHERE id = $1 AND user_id = $2
     RETURNING id, title, starts_at AS "startsAt", ends_at AS "endsAt", category, notes,
               created_at AS "createdAt"`,
    [id, userId, title, startsAt, endsAt, category ?? null, notes],
  );
  return rows[0] ?? null;
}

async function deleteEvent(db, userId, id) {
  const { rowCount } = await db.query(
    'DELETE FROM calendar_events WHERE id = $1 AND user_id = $2',
    [id, userId],
  );
  return rowCount > 0;
}

module.exports = {
  listEvents,
  countEvents,
  findEvent,
  lockUserCalendar,
  findOverlappingEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  SQL: { LIST_EVENTS_SQL },
};
