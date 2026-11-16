const { z } = require('zod');
const { isoDate } = require('./common');

// GET /api/summary/daily?date=YYYY-MM-DD. Without a date, the controller uses "today" in the
// user's own timezone.
const dailyQuery = z.object({ date: isoDate.optional() }).strict();

// GET /api/summary/trends?from=&to=. Both are optional (defaults: the 30 days ending today).
// The order and size of the range are checked in the controller, after the defaults are
// filled in.
const trendsQuery = z.object({ from: isoDate.optional(), to: isoDate.optional() }).strict();

module.exports = { dailyQuery, trendsQuery };
