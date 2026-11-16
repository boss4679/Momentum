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

---

## Milestone 2: Express structure, errors, validation, auth

### What was built

- **App structure:** `app.js` builds the app (no `listen`, so Supertest can drive it in memory) and `server.js` starts it. Each layer has one job:
  - `routes/` maps URL + method to middleware and a controller.
  - `controllers/` handle HTTP: read `req.validated`, call queries, and pick the status code.
  - `db/queries/` holds the SQL and nothing else.
  - `schemas/` holds the Zod schemas.
  - `middleware/` holds cross-cutting concerns.
- **Errors:**
  - `AppError` with small factories (`notFound()`, `conflict()`, ...).
  - `pgErrors.js` maps Postgres SQLSTATEs to HTTP: 23505 → 409, 23503 → 409 on delete or 422 on insert, 23514/23502 → 422. Named constraints give field-level messages.
  - One `errorHandler` produces `{ error: { code, message, details } }` for every error, including malformed JSON (400), oversized bodies (413), unknown routes (404) and unexpected bugs (500, without leaking internals).
- **Validation:** `validate({ params, query, body })`. Bad params or query return 400, a bad body returns 422, and each issue becomes `{ field: "sets.1.reps", message }`. The parsed and coerced data goes on `req.validated`.
- **Auth:**
  - `POST /api/auth/register` hashes the password with bcrypt and returns 201 with `{ user, token }`.
  - `POST /api/auth/login` uses one message for an unknown email and a wrong password, and compares against a dummy hash so both take the same time.
  - `GET /api/auth/me` returns the current user.
  - The `authenticate` middleware checks a `Bearer` JWT, signed HS256 with a 1h expiry, and sets `req.user.id`.
- **Request logging and health:** `requestLogger` logs `POST /api/auth/login 200 65.7ms`; `/api/health` returns 503 if the database is unreachable.
- **Tests:** 55 Jest/Supertest tests against the real `momentum_test` database.
  - Middleware is tested on tiny throwaway apps; the auth endpoints are tested through the real app.
  - `withTransaction` has commit/rollback tests, plus a regression test for the milestone 1 deferred foreign key bug.
  - Line coverage is 99%.

### Key concepts

- **Middleware pipeline:** Express runs middleware in the order it's registered. The error handler is last and has four arguments `(err, req, res, next)`, which is how Express recognises it. Express 5 forwards errors from `async` handlers automatically.
- **400 vs 422:** 400 means the request itself is broken (unparseable JSON, a bad URL param). 422 means the request was understood but the values break the rules.
- **Validation in two layers:** Zod gives fast, friendly, per-field errors. Database constraints guarantee correctness even if a bug or a race slips past.
- **Rely on the constraint, not a pre-check:** "SELECT to see if the email is free, then INSERT" has a race: two requests can both pass the check. A UNIQUE constraint is atomic, so register just inserts and turns 23505 into 409.
- **Password hashing (bcrypt):** slow on purpose, with a built-in salt so the same password hashes differently each time. The cost factor doubles the work per +1. It only reads the first 72 bytes, hence the length limit.
- **JWT:** `header.payload.signature`. The payload is readable by anyone; the signature proves the server issued it. It's stateless, so there's no session table, but a token can't be revoked before it expires. That's why it expires after 1h, and why `verify` only accepts HS256.
- **User enumeration:** login and register shouldn't reveal which emails exist. Login uses the same message for both cases and the same timing (the dummy hash). Register's 409 does reveal it; that's the usual trade-off for a usable sign-up form.
- **Test isolation:** a separate database, `TRUNCATE ... RESTART IDENTITY` at the start of each file, and `--runInBand`. All files share one database, so running them in parallel would let one file's TRUNCATE wipe another's data mid-test.

### Interview questions

1. **Why does register just INSERT instead of first checking whether the email exists?**
   Check-then-insert is a race: two sign-ups with the same email can both see "free" and both insert. The UNIQUE constraint is enforced atomically by Postgres, so the insert is both the check and the write. The 23505 error is mapped to 409 in one place (`pgErrors.js`).

2. **Why do you validate with Zod if the database has constraints anyway?**
   They serve different purposes. Zod runs before any SQL and can report every bad field at once with readable messages, which the frontend shows next to each input. Constraints are the guarantee: they hold for every write path (seed script, `psql`, future code), and some rules, like uniqueness, need to see other rows. If both agree, the user sees the Zod message; the constraint is the safety net.

3. **How does your JWT auth work, and what are its weaknesses?**
   Login verifies the password with bcrypt and signs `{ userId }` with a server secret (HS256, 1h expiry). The client sends it as `Authorization: Bearer ...`. `authenticate` verifies the signature and expiry with no database lookup and sets `req.user`. Weakness: a stolen token works until it expires, and there's no server-side logout. Fixes would be short-lived access tokens plus refresh tokens stored server-side, or a revocation list.

4. **Why does login return the same error for "no such user" and "wrong password"?**
   Different messages would let anyone probe which emails have accounts. I also run `bcrypt.compare` against a dummy hash when the user doesn't exist. Otherwise the unknown-email response would come back measurably faster than a wrong password, leaking the same information through timing.

5. **How do you keep tests independent of each other?**
   They run against a separate `momentum_test` database, so they can't touch dev data. Migrations run once in Jest's `globalSetup`, so the schema is always current. Each file truncates every table first, so no test depends on another file's leftovers. Files run one at a time (`--runInBand`), because they share one database. I also checked that the tests catch bugs by breaking the code on purpose: making login reveal unknown emails, or turning malformed JSON into a 500, makes them fail.

6. **What happens when your code throws an unexpected error?**
   It reaches the central error handler, which doesn't recognise it as an `AppError` or a mapped Postgres error. It logs the full error and stack on the server, but returns a generic 500 `INTERNAL_ERROR`, so SQL, stack traces and internal details never reach the client. A test checks that SQL text from the thrown error doesn't appear in the response.
