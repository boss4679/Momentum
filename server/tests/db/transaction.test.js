const { withTransaction } = require('../../src/db/transaction');
const { pool, resetDb, closeDb } = require('../helpers/db');

beforeEach(resetDb);
afterAll(closeDb);

async function countUsers() {
  const { rows } = await pool.query('SELECT count(*) AS n FROM users');
  return rows[0].n;
}

async function insertUser(client, email) {
  await client.query('INSERT INTO users (email, password_hash) VALUES ($1, $2)', [email, 'x']);
}

describe('withTransaction', () => {
  test('commits every statement when the callback succeeds, and returns its result', async () => {
    const result = await withTransaction(async (client) => {
      await insertUser(client, 'a@example.com');
      await insertUser(client, 'b@example.com');
      return 'done';
    });

    expect(result).toBe('done');
    expect(await countUsers()).toBe(2);
  });

  test('rolls back everything if any statement fails', async () => {
    // The second insert breaks the UNIQUE constraint on email, so the first must be undone too.
    await expect(
      withTransaction(async (client) => {
        await insertUser(client, 'a@example.com');
        await insertUser(client, 'a@example.com');
      }),
    ).rejects.toMatchObject({ code: '23505' });

    expect(await countUsers()).toBe(0);
  });

  test('rolls back if the callback throws a non-database error', async () => {
    await expect(
      withTransaction(async (client) => {
        await insertUser(client, 'a@example.com');
        throw new Error('validation failed halfway');
      }),
    ).rejects.toThrow('validation failed halfway');

    expect(await countUsers()).toBe(0);
  });

  test('returns the connection to the pool even after an error', async () => {
    // pool.totalCount connections exist; idleCount of them are free. After the failed
    // transaction, nothing should still be checked out.
    await withTransaction(async () => {
      throw new Error('boom');
    }).catch(() => {});

    expect(pool.idleCount).toBe(pool.totalCount);
  });

  test('a deferred foreign key is checked at COMMIT: deleting a user cascades cleanly', async () => {
    // Regression test for the milestone 1 bug: workout_sets.exercise_id is DEFERRABLE
    // INITIALLY DEFERRED, so deleting a user with exercises *and* sets that use them works.
    const { rows: users } = await pool.query(
      `INSERT INTO users (email, password_hash) VALUES ('del@example.com', 'x') RETURNING id`,
    );
    const userId = users[0].id;
    const { rows: ex } = await pool.query(
      `INSERT INTO exercises (user_id, name, category) VALUES ($1, 'Squat', 'strength') RETURNING id`,
      [userId],
    );
    const { rows: w } = await pool.query(
      `INSERT INTO workouts (user_id, performed_on) VALUES ($1, '2026-01-01') RETURNING id`,
      [userId],
    );
    await pool.query(
      `INSERT INTO workout_sets (workout_id, exercise_id, set_number, reps) VALUES ($1, $2, 1, 5)`,
      [w[0].id, ex[0].id],
    );

    // Deleting just the exercise must still fail, because a set uses it...
    await expect(
      pool.query('DELETE FROM exercises WHERE id = $1', [ex[0].id]),
    ).rejects.toMatchObject({ code: '23503' });

    // ...but deleting the whole user succeeds and removes everything.
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    const { rows } = await pool.query('SELECT count(*) AS n FROM workout_sets');
    expect(rows[0].n).toBe(0);
  });
});
