# Learning notes

Updated at the end of each milestone: what was built, the concepts behind it, and questions
an interviewer might ask about it.

---

## Milestone 1: skeleton, Docker, migrations, schema, seed

### What was built

- `docker-compose.yml` with three services: `db` (Postgres 16), `api` (Express) and `client` (Vite). The API waits for the database's healthcheck, then runs migrations and starts.
- `db/init/01-create-test-db.sql` creates a separate `momentum_test` database the first time the Postgres volume is created.
- Two node-pg-migrate migrations written in plain SQL: `init-schema` (7 tables with keys and constraints) and `query-indexes` (the `(user_id, date)` indexes).
- `server/src/config.js` reads env vars in one place; `db/pool.js` creates the connection pool and its type parsers; `db/transaction.js` provides `withTransaction()`.
- `server/scripts/seed.js` builds a demo user with ~120 days of workouts, meals, goals and events using a seeded random generator, inserted with bulk `unnest()` queries inside one transaction.
- `docs/schema.md` has the ER diagram and the reasoning behind each table.

### Key concepts

- **Migrations:** versioned, ordered schema changes checked into git. node-pg-migrate records the ones it has applied in a `pgmigrations` table and runs each new one in its own transaction. Every migration has a `Down` section so it can be undone.
- **Normalization (3NF):** each fact is stored once. Sets get their own table (a repeating group); sets reference `exercise_id` instead of copying the name.
- **Constraints as the last line of defence:** `NOT NULL`, `CHECK`, `UNIQUE` and foreign keys hold even if the application has a bug or someone edits data in `psql`. Zod validation (milestone 2) gives friendly errors; constraints guarantee correctness.
- **ON DELETE behaviour and deferred constraints:** `CASCADE` for owned data. `workout_sets.exercise_id` blocks deleting an exercise that has history, but it's `DEFERRABLE INITIALLY DEFERRED` so that deleting a whole user still works (see question 2). I first got this wrong, and the seed script caught it.
- **Composite B-tree indexes:** the column filtered with `=` (user_id) goes first, and the range column (date) goes second.
- **`date` vs `timestamptz`:** a meal belongs to a calendar date; a meeting happens at an absolute instant. `AT TIME ZONE` converts between local wall-clock time and absolute time.
- **Connection pool:** reuses a few open connections instead of opening one per query. A transaction must run on one checked-out client, never through `pool.query`.
- **Parameterized queries:** values travel separately from the SQL text (`$1, $2`), so input can never change the query's structure (no SQL injection). `unnest($1::int[], ...)` keeps bulk inserts parameterized too.

### Interview questions

1. **Why did you put the indexes in a separate migration?**
   So I can measure their effect: migrate down one step, run `EXPLAIN ANALYZE`, migrate up, run it again. It also separates "what the data is" (constraints) from "how it's read fast" (performance indexes).

2. **Why is the `workout_sets.exercise_id` foreign key deferred?**
   Deleting a user cascades along two paths: users→exercises and users→workouts→workout_sets. Postgres runs each cascade as its own step, so with a normal (immediate) foreign key the check on `workout_sets.exercise_id` runs once the exercises are deleted, while the sets still exist, and the delete fails with 23503. I first assumed `NO ACTION` would be checked at the end of the whole statement; re-running the seed (which deletes the demo user) proved that wrong. `DEFERRABLE INITIALLY DEFERRED` postpones the check to COMMIT, when the sets are gone. Deleting a single exercise that has history still fails, so the API can still return 409. RESTRICT can never be deferred, which is why the key uses NO ACTION.

3. **Why `timestamptz` for events but `date` for workouts and meals?**
   An event is a moment in time: a 9am meeting in Los Angeles is 5pm in London, and `timestamptz` stores the absolute instant. A workout "on Monday" is a calendar date with no time, and converting it through timezones could shift it to Sunday. The pool is also configured to return DATE as a plain string for the same reason.

4. **How do you stop one user's set from referencing another user's exercise?**
   The foreign key only proves the exercise exists, so the API checks `exercises.user_id` inside the same transaction that inserts the sets. I could enforce it in the database with a composite foreign key, but that would mean storing `user_id` on `workout_sets`, which is a transitive dependency (`workout_id → user_id`) and breaks 3NF. I chose the application check and documented the trade-off.

5. **How does the seed insert hundreds of rows without building SQL strings?**
   Each column is passed as one array parameter, and `unnest()` turns the arrays back into rows, e.g. `INSERT ... SELECT * FROM unnest($1::int[], $2::date[])`. That's one round trip and still fully parameterized.
