const { z } = require('zod');
const { isoDateTime, optionalText, requiredText, queryBoolean, listQuery } = require('./common');

// Mirrors the calendar_events_category_valid CHECK constraint.
const CATEGORIES = ['work', 'personal', 'fitness', 'social', 'other'];

// Used for create (POST) and full replacement (PUT).
const body = z
  .object({
    title: requiredText(200, 'Title'),
    startsAt: isoDateTime,
    endsAt: isoDateTime,
    category: z.enum(CATEGORIES, `Must be one of: ${CATEGORIES.join(', ')}`).nullish(),
    notes: optionalText(2000),
  })
  .strict()
  // Mirrors the calendar_events_ends_after_starts CHECK. Date.parse compares the actual
  // instants, so 10:00+01:00 and 09:30Z are ordered correctly despite different offsets.
  .refine((e) => Date.parse(e.endsAt) > Date.parse(e.startsAt), {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  });

// POST/PUT ?allowOverlap=true skips the overlap check (e.g. "save anyway" in the UI).
const writeQuery = z.object({ allowOverlap: queryBoolean }).strict();

module.exports = { body, writeQuery, listQuery: listQuery(isoDateTime), CATEGORIES };
