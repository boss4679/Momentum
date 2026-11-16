// Unit tests: mapPgError is a pure function, so plain objects shaped like pg's errors are
// enough. (tests/api/auth.test.js checks a real one end to end: duplicate email -> 409.)
const { mapPgError } = require('../../src/errors/pgErrors');

describe('mapPgError', () => {
  test('unique violation on a known constraint -> 409 with a field-level message', () => {
    const err = mapPgError({
      code: '23505',
      constraint: 'users_email_key',
      message: 'duplicate key',
    });

    expect(err.status).toBe(409);
    expect(err.code).toBe('CONFLICT');
    expect(err.details).toEqual([
      { field: 'email', message: 'An account with this email already exists' },
    ]);
  });

  test('unique violation on an unknown constraint -> 409 with a generic message', () => {
    const err = mapPgError({ code: '23505', constraint: 'something_new_key', message: 'dup' });

    expect(err.status).toBe(409);
    expect(err.message).toBe('This record already exists');
    expect(err.details).toEqual([]);
  });

  test('foreign key violation when deleting a referenced row -> 409 (still in use)', () => {
    const err = mapPgError({
      code: '23503',
      constraint: 'workout_sets_exercise_id_fkey',
      message: 'update or delete on table "exercises" violates foreign key constraint',
    });

    expect(err.status).toBe(409);
    expect(err.code).toBe('CONFLICT');
  });

  test('foreign key violation when inserting a missing reference -> 422', () => {
    const err = mapPgError({
      code: '23503',
      constraint: 'workouts_user_id_fkey',
      message: 'insert or update on table "workouts" violates foreign key constraint',
    });

    expect(err.status).toBe(422);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toBe('A referenced record does not exist');
  });

  test('check violation -> 422', () => {
    const err = mapPgError({
      code: '23514',
      constraint: 'calendar_events_ends_after_starts',
      message: 'violates check constraint',
    });

    expect(err.status).toBe(422);
    expect(err.details).toEqual([{ field: 'endsAt', message: 'endsAt must be after startsAt' }]);
  });

  test('not-null violation -> 422', () => {
    expect(mapPgError({ code: '23502', message: 'null value' }).status).toBe(422);
  });

  test('anything else is not mapped (the error handler turns it into a 500)', () => {
    expect(mapPgError({ code: '42P01', message: 'relation does not exist' })).toBeNull();
    expect(mapPgError(new Error('plain JS error'))).toBeNull();
  });
});
