const pool = require('../db/pool');
const { withTransaction } = require('../db/transaction');
const events = require('../db/queries/events');
const { AppError, notFound } = require('../errors/AppError');
const { paginated } = require('./pagination');

// 409 listing which events clash, so the UI can say "overlaps Team standup" and offer to
// save anyway. EVENT_OVERLAP is a more specific code than CONFLICT, so the client can tell
// this case apart from others and resend with ?allowOverlap=true.
function overlapError(overlaps) {
  return new AppError(
    409,
    'EVENT_OVERLAP',
    'This event overlaps an existing event. Resend with ?allowOverlap=true to save it anyway.',
    overlaps.map((e) => ({
      field: 'startsAt',
      message: `Overlaps "${e.title}"`,
      eventId: e.id,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
    })),
  );
}

// Lock the user's calendar, then look for clashes. Must run inside the same transaction as
// the write it guards; see lockUserCalendar for why the lock is needed.
async function assertNoOverlap(client, userId, event, excludeId) {
  await events.lockUserCalendar(client, userId);
  const overlaps = await events.findOverlappingEvents(client, userId, { ...event, excludeId });
  if (overlaps.length > 0) {
    throw overlapError(overlaps);
  }
}

async function list(req, res) {
  const query = req.validated.query;
  const [rows, total] = await Promise.all([
    events.listEvents(pool, req.user.id, query),
    events.countEvents(pool, req.user.id, query),
  ]);
  res.json(paginated(rows, total, query));
}

async function get(req, res) {
  const event = await events.findEvent(pool, req.user.id, req.validated.params.id);
  if (!event) throw notFound('Event');
  res.json(event);
}

async function create(req, res) {
  const userId = req.user.id;
  const body = req.validated.body;
  const { allowOverlap } = req.validated.query;

  const event = await withTransaction(async (client) => {
    if (!allowOverlap) await assertNoOverlap(client, userId, body);
    return events.createEvent(client, userId, body);
  });

  res.status(201).json(event);
}

async function update(req, res) {
  const userId = req.user.id;
  const { id } = req.validated.params;
  const body = req.validated.body;
  const { allowOverlap } = req.validated.query;

  const event = await withTransaction(async (client) => {
    // 404 is checked before overlap, so an id that isn't yours is always "not found",
    // whatever the body says.
    if (!(await events.findEvent(client, userId, id))) throw notFound('Event');
    // The event being edited is excluded, so moving it by 15 minutes doesn't "overlap itself".
    if (!allowOverlap) await assertNoOverlap(client, userId, body, id);
    return events.updateEvent(client, userId, id, body);
  });

  res.json(event);
}

async function remove(req, res) {
  const deleted = await events.deleteEvent(pool, req.user.id, req.validated.params.id);
  if (!deleted) throw notFound('Event');
  res.status(204).end();
}

module.exports = { list, get, create, update, remove };
