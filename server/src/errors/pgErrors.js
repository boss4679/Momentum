// Turns Postgres constraint errors into API errors, all in one place.
//
// Constraints are the last line of defence: Zod validation catches most bad input first,
// but some rules can only be checked by the database (uniqueness needs to see the other
// rows, and two requests could race). When a constraint fires, pg throws an error whose
// `code` is the SQLSTATE and whose `constraint` is the constraint's name, which is why
// every constraint in the migration has an explicit name.
const { AppError } = require('./AppError');

const PG = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  CHECK_VIOLATION: '23514',
  NOT_NULL_VIOLATION: '23502',
};

// Constraint name -> which request field it concerns and what to tell the user.
// A constraint missing from this map still gets the right status, just a generic message.
const CONSTRAINT_MESSAGES = {
  users_email_key: { field: 'email', message: 'An account with this email already exists' },
  exercises_user_name_key: {
    field: 'name',
    message: 'You already have an exercise with this name',
  },
  workout_sets_workout_exercise_set_key: {
    field: 'sets',
    message: 'Each exercise can only have one set with a given set number',
  },
  daily_goals_user_effective_from_key: {
    field: 'effectiveFrom',
    message: 'You already have a goal starting on this date',
  },
  workout_sets_exercise_id_fkey: {
    field: 'exerciseId',
    message: 'This exercise is used in logged workouts and cannot be deleted',
  },
  calendar_events_ends_after_starts: { field: 'endsAt', message: 'endsAt must be after startsAt' },
};

function describe(constraint, fallbackMessage) {
  const known = CONSTRAINT_MESSAGES[constraint];
  if (known) {
    return { message: known.message, details: [{ field: known.field, message: known.message }] };
  }
  return { message: fallbackMessage, details: [] };
}

// Returns an AppError for a recognised Postgres error, or null for anything else (the
// caller then treats it as an unexpected 500).
function mapPgError(err) {
  switch (err.code) {
    case PG.UNIQUE_VIOLATION: {
      // The row would duplicate one that already exists: a conflict with current state.
      const { message, details } = describe(err.constraint, 'This record already exists');
      return new AppError(409, 'CONFLICT', message, details);
    }
    case PG.FOREIGN_KEY_VIOLATION: {
      // Two different situations share this code:
      // - deleting a row that others still reference -> 409, it's in use
      // - inserting a row that points at a missing parent -> 422, the reference is invalid.
      //   (The API checks ownership before writing, so this means the input was bad.)
      // pg's message starts with "update or delete" for the first case.
      const isDelete = err.message.startsWith('update or delete');
      const { message, details } = describe(
        err.constraint,
        isDelete ? 'This record is still in use' : 'A referenced record does not exist',
      );
      return isDelete
        ? new AppError(409, 'CONFLICT', message, details)
        : new AppError(422, 'VALIDATION_ERROR', message, details);
    }
    case PG.CHECK_VIOLATION:
    case PG.NOT_NULL_VIOLATION: {
      // Well-formed input that breaks a data rule, the same category as a Zod failure.
      const { message, details } = describe(err.constraint, 'The data breaks a validation rule');
      return new AppError(422, 'VALIDATION_ERROR', message, details);
    }
    default:
      return null;
  }
}

module.exports = { mapPgError, PG };
