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

---

## Milestone 3: CRUD for every module

### What was built

- **Endpoints:** full CRUD (`GET` list, `GET /:id`, `POST`, `PUT /:id`, `DELETE /:id`) for `/api/exercises`, `/api/workouts`, `/api/events`, `/api/food-entries` and `/api/goals`, plus:
  - `GET /api/workouts/personal-bests`: heaviest set, best reps and longest duration per exercise.
  - `GET /api/goals/current?date=`: the goal in force on a given day.
- **Lists:** `{ data, pagination: { limit, offset, total } }` with `?limit=&offset=`, date-range filters (`from`/`to`), and per-resource filters (`category`, `meal`).
- **Workouts:** sets are nested in the request and the response. Create and update run in a transaction that checks every `exerciseId` belongs to the user, writes the workout, and replaces its sets.
- **Events:** overlap detection returns 409 `EVENT_OVERLAP`, listing the clashing events. `?allowOverlap=true` skips the check. A per-user advisory lock closes the race between the check and the insert.
- **Registration** now also creates a 10-exercise starter catalog, in the same transaction as the user.
- **Queries take `db` as their first argument** (the pool, or a transaction's client), so the caller decides whether statements share a transaction.
- **Tests:** 259 in total.
  - Every endpoint's happy path and its 400/401/404/409/422 cases.
  - `ownership.test.js`: for every resource, another user's GET, PUT and DELETE all return 404, and the data is unchanged afterwards.
  - `protected.test.js`: every protected route returns 401 without a valid token.
  - A transaction rollback test.
  - A personal-bests test with hand-checkable numbers.
  - A two-connection test proving the overlap lock works.

### Key concepts

- **Ownership in the WHERE clause:** every query includes `user_id = $n`, so another user's row looks exactly like a missing one, giving 404 rather than 403. A 403 would confirm the id exists.
- **Optional filters:** `($2::date IS NULL OR performed_on >= $2)` lets one fixed SQL string handle "filter given" and "not given". The `::date` cast tells Postgres the parameter's type. node-pg sends unnamed statements, which Postgres plans with the actual values, so a NULL filter costs nothing.
- **CTE + json_agg instead of N+1:** the workout list paginates workouts in a CTE, then joins sets and folds them into a JSON array per workout with `json_agg(... ORDER BY ...)`. That's one round trip instead of one per workout.
- **DISTINCT ON:** keeps the first row per group in `ORDER BY` order. It's Postgres's tool for "the whole row of the best set per exercise", which `max()` can't do because it only returns the value.
- **Interval overlap:** two ranges overlap when `a.start < b.end AND a.end > b.start`. Strict comparisons let back-to-back events (10:00 end, 10:00 start) through.
- **Race conditions and advisory locks:** "check, then insert" isn't atomic. `pg_advisory_xact_lock(1, userId)` makes a second transaction for the same user wait until the first commits. Under READ COMMITTED it then sees the committed row. `FOR UPDATE` can't do this, because the clashing row doesn't exist yet.
- **`SELECT ... FOR UPDATE`:** locks an existing row (the workout being edited) so two simultaneous edits run one after the other.
- **PUT as full replacement:** the client sends the whole object, validated by the same schema as create. That's simpler than PATCH, which would need to tell "field omitted" apart from "set to null".
- **Zod gotcha:** `z.coerce.boolean()` turns the string `"false"` into `true` (JavaScript truthiness), so query booleans are parsed as exactly `"true"`/`"false"`.

### Interview questions

1. **Why does accessing another user's workout return 404 and not 403?**
   A 403 says "this exists, but it isn't yours", which lets anyone enumerate ids and learn how much data other accounts have. Every query filters on `user_id`, so someone else's row is indistinguishable from a missing one. `ownership.test.js` checks that the response bodies are identical, not just the status codes.

2. **How do you prevent two overlapping events from being created at the same time?**
   The overlap check and the insert run in one transaction, after `pg_advisory_xact_lock(1, userId)`. A second request for the same user blocks at the lock until the first commits, then its check sees the new event and returns 409. My first test fired 5 parallel HTTP requests, but it still passed with the lock removed, because the requests never truly overlapped. I replaced it with a test that drives two connections by hand through the exact interleaving, and confirmed it fails without the lock. The alternative is an exclusion constraint (`EXCLUDE USING gist (user_id WITH =, tstzrange(starts_at, ends_at) WITH &&)`), but that can't support `allowOverlap=true`.

3. **Walk me through the query that lists workouts with their sets.**
   The `page` CTE selects this user's workouts with the filters, newest first, with LIMIT/OFFSET. Paginating before the join means LIMIT counts workouts, not set rows. Then I LEFT JOIN sets and exercise names, GROUP BY the workout, and `json_agg(json_build_object(...) ORDER BY s.id)` builds each workout's sets array. `FILTER (WHERE s.id IS NOT NULL)` with `COALESCE(..., '[]')` turns "no sets" into `[]` instead of `[null]`.

4. **Why check exercise ownership in code when there's a foreign key?**
   The foreign key only proves the exercise exists. Without the check, Bob could log a set against Alice's exercise id and then see its name in his own workout. The check runs inside the same transaction as the insert and reports 422 at the exact field (`sets.1.exerciseId`). The database-level alternative would need `user_id` on `workout_sets`, which breaks 3NF.

5. **How do you know your transaction actually rolls back?**
   A test makes the second statement fail by mocking `insertSets` to throw after the workout row was inserted. It then checks that both table counts are unchanged. When I replaced `withTransaction` with plain pool queries, that test failed, so it catches a missing transaction.

6. **How does personal bests pick the record set when weights tie?**
   `DISTINCT ON (exercise_id) ... ORDER BY exercise_id, weight_kg DESC, reps DESC, performed_on ASC`: heaviest first, then more reps, then the earliest date, since that's when the record was first set. The test uses a tiny history where 62.5 kg × 5 happened on Mar 5 and again on Mar 7, and expects Mar 5.

---

## Milestone 4: summary and trends (the SQL-heavy part)

### What was built

- **`GET /api/summary/daily?date=`**: one call for the dashboard. It returns that day's workouts (exercises, sets, volume), the next 5 events, calories against the goal (per meal, with macros), the 7-day rolling average and the workout streak.
  - The date defaults to today in the user's timezone.
  - Five independent queries run in parallel with `Promise.all`.
- **`GET /api/summary/trends?from=&to=`**: daily calories with the rolling average and that day's goal, weekly workout volume, and current/longest streak.
  - The range defaults to the last 30 days and is capped at 366 days.
- **All of the SQL is in `src/db/queries/summary.js`,** with a step-by-step comment above each query.
- **Seed and measurement:** `npm run seed -- --extra-users=500` adds 500 load-test users (about 900k rows in total), and `npm run explain` runs EXPLAIN ANALYZE on the API's real SQL.
- **`docs/indexes.md`:** before/after plans and timings, including the index's limitation for event-overlap queries.
- **Tests:** 297 in total. `summary.test.js` uses a hand-built March where every expected number can be worked out on paper: rolling averages at the start of the range, a streak broken by a missing day, two workouts on one day counting once, a week with no workouts, the goal changing mid-range, and timezone day boundaries.

### Key concepts

- **Window functions:** `avg(x) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)` computes a value from a "window" of neighbouring rows without collapsing them, unlike GROUP BY. `WINDOW last_7_days AS (...)` names a window so two functions can share it.
- **Gap-filling with `generate_series`:** `ROWS 6 PRECEDING` means 6 rows, not 6 days. Generating every calendar day and LEFT JOINing the data makes rows equal days. The same pattern gives charts a row for weeks with zero workouts.
- **Range lookback:** the series starts 6 days before `from`, so the first day in the range gets a full window. The extra days are filtered out at the end.
- **NULL handling in aggregates:** `avg()` and `count(col)` ignore NULLs, so unlogged days don't count as 0 kcal. `sum()` of all NULLs is NULL, hence `COALESCE(..., 0)`.
- **Gaps and islands:** `day - row_number()` stays constant across a run of consecutive dates. GROUP BY that value gives each streak's start, end and length.
- **LATERAL joins:** a subquery that runs once per row of the left side, used for "the goal in force on each day". With the right index (`daily_goals (user_id, effective_from)`), each run is a single index lookup.
- **`DISTINCT ON`, `array_agg(DISTINCT ... ORDER BY ...)` and `unnest(...) WITH ORDINALITY`:** Postgres tools for "best row per group", "list of names per workout" and "fixed list of meals in order".
- **LEFT JOIN conditions belong in ON, not WHERE:** a WHERE condition on the right-hand table removes its NULL rows and silently turns the LEFT JOIN into an inner join.
- **Timezones:** `('2026-01-15'::date)::timestamp AT TIME ZONE 'America/Los_Angeles'` is the instant that day starts in LA (08:00 UTC). "Today" is `(now() AT TIME ZONE tz)::date`.
- **Reading EXPLAIN ANALYZE:**
  - `Seq Scan` + `Rows Removed by Filter` means the whole table was read. `Index Cond` vs `Filter` shows which conditions the index handles.
  - `Buffers` counts 8 kB pages touched, which is more stable than milliseconds.
  - `Index Only Scan` answers from the index alone. `Backward` and `Incremental Sort` mean the index also supplied the ordering.
- **Composite index column order:** the equality column (user_id) goes first and the range column (date) second, so one user's rows are contiguous and already sorted by date.

### Interview questions

1. **Walk me through your 7-day rolling average query.**
   I generate one row per calendar day, starting 6 days before the requested range, and LEFT JOIN each day's calorie total. Days with nothing logged become NULL instead of disappearing. Then `avg(calories) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)` averages each day with the 6 rows before it. Because there's exactly one row per day, that's 7 calendar days. `avg` skips NULLs, so a forgotten log doesn't count as 0 kcal, and `count(calories)` over the same window reports how many days the average is based on. Finally I filter out the 6 lookback days. A test checks that the first day of the range uses data from before the range.

2. **How do you calculate the workout streak?**
   It's a gaps-and-islands problem. I take distinct workout dates, number them with `row_number()`, and compute `day - row_number`. For consecutive days, both go up by one, so the difference is constant; any gap changes it. Grouping by that difference gives each streak's start, end and length. The current streak is the island that ends today or yesterday; yesterday counts because today's workout may not be logged yet. Longest is `max(length)`.

3. **Why not just fetch the rows and compute this in JavaScript?**
   The database already has the data and the indexes. Computing in SQL means reading about 150 rows through an index and sending back 30 small rows, instead of sending every food entry over the network and looping in Node. It also keeps the logic in one declarative query that I can EXPLAIN. The JavaScript in the controller only reshapes results, like summing four per-meal rows.

4. **How did you decide which indexes to add, and how do you know they work?**
   From the queries: nearly every read is "this user's rows in this date range", so each table got `(user_id, date)`. Equality first, range second, so one user's rows are contiguous and date-ordered. I measured with 500 extra seeded users (about 260k food entries), using EXPLAIN (ANALYZE, BUFFERS) on the exact SQL strings the API runs, with the index migration rolled back and then re-applied. For example, the 30-day calorie query went from a parallel sequential scan of 3,208 pages to an index range scan of 5 pages (7.8 ms → 0.17 ms). I also documented where the index isn't enough: the calendar query can only use the index for `starts_at < to`, not `ends_at > from`.

5. **Why did you need 500 extra users to test an index?**
   With only one user, `user_id = 1` matches every row. Reading the whole table is then genuinely the cheapest plan, and EXPLAIN would show the planner (correctly) ignoring the index. Indexes pay off when the query is selective, here 0.2% of rows. The seed refreshes the planner's statistics with `ANALYZE` afterwards so its estimates match the new data.

6. **What does the timezone do in the daily summary?**
   A day starts at a different instant in each zone. The upcoming-events query turns the requested date into the moment it starts in the user's zone with `date::timestamp AT TIME ZONE tz`. A test shows the same 07:30 UTC event counts as Jan 15 for a UTC user, but Jan 14 (23:30) for a Los Angeles user. When the date is today, it looks ahead from `now()`, so events that already finished aren't "upcoming".

7. **How did you make sure the tests would catch a wrong query?**
   I broke the SQL on purpose in five ways and checked each one made a test fail: a 6-day window instead of 7, no lookback before the range, unlogged days counted as zero, a streak that isn't kept alive by yesterday, and a window over logged days only (no gap filling). They all failed. One "passed" at first, but only because my script had edited the explanatory comment instead of the SQL; re-run against the real line, it failed as it should.

---

## Milestone 5: React frontend

### What was built

- **Stack:** React 19, React Router 7, Recharts 3, plain CSS. React Router 8 came out but needs Node 22, and the project targets Node 20, so it's pinned to v7. React went from 18 to 19 because current Router and Recharts expect it.
- **`src/api/client.js`:** the only code that calls `fetch`. It adds `/api` and the Bearer token, parses JSON, turns `{error:{code,message,details}}` into an `ApiError` with `fieldErrors()`, and reports a 401 on a request that carried a token. `src/api/index.js` has one function per endpoint.
- **Auth:**
  - `src/auth/tokenStore.js` keeps the token in memory, with localStorage as a reload backup.
  - `AuthContext.jsx` tracks `checking | authenticated | anonymous` and checks a stored token with `GET /auth/me` on load.
  - `RequireAuth.jsx` guards every page except login and register.
- **Hooks:**
  - `useApiData(load, deps)` gives every view `{status, data, error, reload}` and ignores responses to outdated requests.
  - `useFormSubmit(fn)` maps an `ApiError` to per-field messages plus a form-level banner.
- **Shared components:** `StatusViews` (loading, error with retry, empty), `Field` (label, input, and an error linked with `aria-describedby`), `FormError`, `Modal`, `ProgressBar`, `Layout`.
- **Pages:**
  - Dashboard: four cards from `/summary/daily`, plus two charts from `/summary/trends` (calories with a 7-day average and goal; weekly volume as a separate chart).
  - Workouts: a multi-set form, paged history with edit/delete, and personal bests.
  - Calendar: a hand-built week grid. Click a slot to create an event, click an event to edit it. A 409 overlap answers with "Save anyway".
  - Food log: grouped by meal, with a goal progress bar and a goal form.
- **Pure, testable modules:** `utils/calendarLayout.js` (events → per-day pieces with lanes), `features/workouts/workoutFormModel.js` (form rows ↔ API body), `features/food/groupByMeal.js`.
- **Tests:** 35 Vitest + React Testing Library tests, run in a non-UTC, DST-observing timezone (America/New_York). `test/mockFetch.js` fakes the network so the real API client runs in component tests.

### Key concepts

- **Server state vs UI state:** Data from the API (workouts, events) is loaded with `useApiData` and reloaded after a change. It's never copied into local state and edited by hand, so the screen can't drift from the database. Local state holds only UI things: which modal is open, what's typed in a form.
- **Derived loading state:** `useApiData` doesn't store `status: 'loading'`. Each result remembers which request (key) it answers, and "loading" means the latest result is for an older key. This avoids calling `setState` inside the effect, which the React hooks lint rule flags because it causes an extra render. It also makes the out-of-order response problem easy to handle.
- **Race conditions in the browser:** If the user clicks "next week" twice quickly, two requests are in flight, and the first can arrive last. The effect cleanup sets `ignore = true` for the old request, so its late answer is dropped.
- **One source of navigation:** A 401 only changes auth state, and `RequireAuth` is the only thing that redirects to login. An earlier version also navigated from the 401 handler. Because React Router 7 runs navigations as transitions, the two redirects raced and the "session expired" notice was lost. A test caught it.
- **Calendar dates vs instants on the client:**
  - Workout and meal dates are strings like `'2026-03-02'`. They're compared and shifted as text via UTC, never through local midnight, so DST can't move them.
  - Event times are instants. `<input type="datetime-local">` is local wall-clock time, so the form converts with `new Date(local).toISOString()` in one direction and reads local hours and minutes in the other.
  - The week grid positions events by clock reading (hours × 60 + minutes), not by "milliseconds since midnight", which is off by an hour on DST days. A test covers 2026-03-08.
- **Lane layout:** Sort a day's pieces by start time and put each into the first lane whose last event has already ended. Then left = lane / laneCount and width = 1 / laneCount. This is the greedy interval-partitioning algorithm.
- **Accessible forms:** Server errors appear under the matching input. The input gets `aria-invalid` and `aria-describedby` pointing at the message, so a screen reader reads the error with the field. The tests query by label and role (what the user sees), not by CSS class.
- **Chart choices:**
  - Calories, average and goal share a unit (kcal), so they share one chart and one y-axis. Weekly volume is in kg, so it gets its own chart instead of a second axis.
  - Two colors from a palette checked for colour-blind separation. The goal is also dashed, there's a legend, and a "Show table" toggle shows the same numbers without hovering.

### Interview questions

1. **How does your frontend handle authentication?**
   After login, the JWT is kept in a module variable and copied to localStorage so a reload doesn't log the user out. The API client adds it as a Bearer header. On page load, a stored token is checked with `GET /auth/me` before any protected page renders (the "checking" state). If any request comes back 401 while a token was sent, the client calls a handler that clears the token and marks the session anonymous. The route guard then redirects to /login, saving the page the user was on so login can send them back. A 401 from the login form itself (wrong password) is just shown as an error. The trade-off of localStorage is XSS exposure. An httpOnly cookie would avoid that but needs CSRF protection, and the token's 1-hour lifetime limits the damage.

2. **How do API validation errors end up next to the right input?**
   The API's errors have a `details` array of `{field, message}`, where `field` is a path like `sets.1.reps`. `ApiError.fieldErrors()` turns that into an object keyed by path. Each input looks up its own key, and the workout form builds keys from the row index because rows are sent in display order. So "sets.1.reps" lands on the second row. Errors with no field, like a wrong password or an overlap, go in a banner at the top. A test checks that the second row is marked invalid and the first isn't.

3. **How does the calendar handle overlapping events?**
   Two layers. The server refuses an overlapping event with 409 `EVENT_OVERLAP` and lists the clashing events, using an advisory lock so two requests can't both slip through. In the UI that's treated as a question, not a failure: the form lists the clashes and offers "Save anyway", which resends the same body with `?allowOverlap=true`. If overlaps are saved, the week grid's lane algorithm draws them side by side instead of on top of each other.

4. **What happens if a response arrives after the user has moved on?**
   Each `useApiData` effect has a cleanup that marks its request as outdated. When the user changes day or week, React runs the cleanup before starting the new request, so the old response is ignored when it arrives. The test resolves the newer request first and the older one second, and checks the newer data is kept. Removing the `ignore` check makes that test fail.

5. **How did you test the frontend without a backend?**
   Pure logic (calendar layout, form-to-request conversion, meal grouping) has plain unit tests. Components are tested with React Testing Library, finding elements by label and role and clicking with user-event. For pages, `mockFetch` replaces the global `fetch` with a list of canned responses, so the real API client, error parsing and 401 handling all run. Tests run in New York time to catch UTC assumptions. As on the backend, I broke the code on purpose eight ways to check the tests notice: wrong set numbering, lanes off by one, DST-unsafe positioning, "Save anyway" not sending `allowOverlap`, an error not linked to its input, and others. All eight are caught.

6. **Why build the week grid yourself instead of using a calendar library?**
   The spec asked for it, and it's a small problem once split in two. `layoutWeek()` is pure: it splits events crossing midnight into per-day pieces, computes start and end minutes, and assigns lanes, all testable with plain objects. The component then just positions buttons absolutely inside a day column: top = minutes × pixels per minute. The hour lines are a repeating CSS gradient, not 24 extra elements.
