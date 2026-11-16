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

// Route parameter `:id`. URL params are always strings, so coerce first: "/workouts/12" -> 12.
const idParams = z.object({
  id: z.coerce.number().int().positive('Must be a positive integer'),
});

module.exports = { timezone, idParams };
