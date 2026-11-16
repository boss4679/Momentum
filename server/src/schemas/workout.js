const { z } = require('zod');
const { id, isoDate, optionalText, listQuery } = require('./common');

// One set. The two refinements mirror the CHECK constraints in workout_sets, so the user
// gets a field-level message instead of a generic database error.
const set = z
  .object({
    exerciseId: id,
    setNumber: z.number().int().min(1, 'Must be at least 1').max(100),
    reps: z.number().int().min(1, 'Must be at least 1').max(1000).nullish(),
    // numeric(6,2): at most 9999.99
    weightKg: z.number().min(0, 'Cannot be negative').max(9999.99).nullish(),
    durationSec: z.number().int().min(1, 'Must be at least 1').max(86400).nullish(),
  })
  .strict()
  .refine((s) => s.reps != null || s.durationSec != null, {
    message: 'A set needs reps or durationSec',
    path: ['reps'],
  })
  .refine((s) => s.weightKg == null || s.reps != null, {
    message: 'weightKg can only be given together with reps',
    path: ['weightKg'],
  });

// A workout with all of its sets. Used for create (POST) and full replacement (PUT).
const body = z
  .object({
    performedOn: isoDate,
    notes: optionalText(2000),
    sets: z.array(set).min(1, 'A workout needs at least one set').max(200),
  })
  .strict()
  // The same (exerciseId, setNumber) twice in one request would break the UNIQUE constraint.
  // Catching it here means a 422 that points at the exact set, rather than a 409 from the
  // database. A conflict *within the request* is invalid input, not a clash with saved data.
  .superRefine((workout, ctx) => {
    const seen = new Set();
    workout.sets.forEach((s, index) => {
      const key = `${s.exerciseId}:${s.setNumber}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['sets', index, 'setNumber'],
          message: 'Duplicate set number for this exercise',
        });
      }
      seen.add(key);
    });
  });

module.exports = { body, listQuery: listQuery(isoDate) };
