// Building blocks shared by the per-resource schemas.
const { z } = require('zod');

// An IANA timezone name such as "America/Los_Angeles". Intl.DateTimeFormat throws a
// RangeError for names it doesn't know, which is a simple validity check. (Postgres reads
// the same IANA database, so a name Node accepts also works with AT TIME ZONE.)
const timezone = z
  .string()
  .trim()
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'Must be a valid IANA timezone, e.g. "Europe/London"');

// A calendar date with no time, matching a Postgres DATE. Zod also rejects impossible
// dates such as 2026-02-30.
const isoDate = z.iso.date('Must be a date in YYYY-MM-DD format');

// An absolute moment, matching a Postgres TIMESTAMPTZ. A timezone offset (Z or +01:00) is
// required: "09:00" with no zone is ambiguous, so the API refuses to guess.
const isoDateTime = z.iso.datetime({
  offset: true,
  error: 'Must be an ISO 8601 date-time with a timezone, e.g. 2026-11-16T09:00:00Z',
});

// Optional free text: trimmed, with blank strings stored as NULL, so "no notes" has only one
// representation in the database instead of two ('' and NULL).
const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .nullish()
    .transform((value) => (value ? value : null));

// Required text: trimmed, and not allowed to be blank.
const requiredText = (max, label) =>
  z
    .string(`${label} is required`)
    .trim()
    .min(1, `${label} is required`)
    .max(max, `Must be at most ${max} characters`);

// Route parameter `:id`. URL params are always strings, so coerce first: "/workouts/12" -> 12.
// The upper bound is Postgres's integer max: a larger id can't exist, and sending it to the
// database would cause an "out of range" error instead of a clean 400.
const id = z.coerce
  .number()
  .int('Must be a positive integer')
  .positive('Must be a positive integer')
  .max(2147483647, 'Must be a positive integer');
const idParams = z.object({ id });

// Query-string booleans. z.coerce.boolean() is a trap here: it uses JavaScript truthiness,
// so the string "false" becomes true. Only the exact strings "true" and "false" are accepted.
const queryBoolean = z
  .enum(['true', 'false'], 'Must be true or false')
  .default('false')
  .transform((value) => value === 'true');

// ?limit=&offset= for every list endpoint. The max limit stops a client from asking for
// a million rows in one request.
const pagination = {
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
};

// Builds a list-endpoint query schema: pagination, an optional from/to range (using
// `boundary`, a date or date-time schema) and any resource-specific filters.
// .strict() turns a typo such as ?form= into a 400 instead of silently ignoring it.
function listQuery(boundary, extra = {}) {
  return z
    .object({ ...pagination, from: boundary.optional(), to: boundary.optional(), ...extra })
    .strict()
    .refine((q) => !q.from || !q.to || Date.parse(q.from) <= Date.parse(q.to), {
      message: '"from" must not be after "to"',
      path: ['to'],
    });
}

module.exports = {
  timezone,
  isoDate,
  isoDateTime,
  optionalText,
  requiredText,
  id,
  idParams,
  queryBoolean,
  pagination,
  listQuery,
};
