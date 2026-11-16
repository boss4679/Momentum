# Indexes: before and after

The main access pattern in this app is **"this user's rows in this date range"**: a week of
calendar events, 30 days of food entries, the last month of workouts. Migration
`1794787200001_query-indexes.sql` adds one composite B-tree index per table for it:

```sql
CREATE INDEX workouts_user_performed_on_idx     ON workouts        (user_id, performed_on);
CREATE INDEX food_entries_user_eaten_on_idx     ON food_entries    (user_id, eaten_on);
CREATE INDEX calendar_events_user_starts_at_idx ON calendar_events (user_id, starts_at);
```

**Why this column order:** `user_id` is always compared with `=`, and the date with a
range. In a B-tree sorted by `(user_id, date)`, one user's rows sit next to each other,
already sorted by date. Postgres jumps to `(user, from)` and reads forward until `to`.
With `(date, user_id)` it would have to read every user's rows in that date range and
filter by user.

## How these numbers were produced

```bash
docker compose exec api npm run seed -- --extra-users=500   # demo user + 500 others, then ANALYZE
docker compose exec api npm run explain                     # with indexes
docker compose exec api npm run migrate -- down 1           # drop the indexes
docker compose exec api npm run explain                     # without
docker compose exec api npm run migrate -- up               # put them back
```

`scripts/explain.js` runs `EXPLAIN (ANALYZE, BUFFERS)` on **the exact SQL strings the API
uses** (imported from `src/db/queries/`), for the demo user, 5 times each, and reports the
median execution time.

**Dataset:** 501 users, about 4 months of history each.

| table             | rows    | size   |
| ----------------- | ------- | ------ |
| `food_entries`    | 260,164 | 33 MB  |
| `workout_sets`    | 245,034 | 27 MB  |
| `calendar_events` | 144,528 | 19 MB  |
| `workouts`        | 36,672  | 3.6 MB |

The demo user owns about 0.2% of each table, the situation an index is built for. With
only the demo user in the database, every row would match `user_id = $1`, and a sequential
scan would genuinely be the best plan.

**Environment:** Postgres 16 in Docker on WSL2, default settings. Everything fits in
memory (every buffer is a `shared hit`), so these numbers measure CPU work rather than
disk reads. With cold caches the gap would be wider. Absolute times will differ on your
machine; the ratios and the buffer counts are what to compare.

## Results

| query (API endpoint)                                       | without indexes | with indexes | speed-up | buffers read (8 kB pages) |
| ---------------------------------------------------------- | --------------- | ------------ | -------- | ------------------------- |
| Daily calories, 30 days (`GET /api/summary/trends`)        | 7.754 ms        | 0.174 ms     | ~45x     | 3,298 → 95                |
| One week of events (`GET /api/events?from=&to=`)           | 3.906 ms        | 0.043 ms     | ~90x     | 1,454 → 6                 |
| Workout list, last 30 days (`GET /api/workouts?from=&to=`) | 1.258 ms        | 0.523 ms     | ~2.4x    | 731 → 477                 |
| Workout streak (`GET /api/summary/daily`)                  | 0.830 ms        | 0.085 ms     | ~10x     | 257 → 4                   |

**Buffers** is the most reliable column: it counts 8 kB pages touched, which doesn't vary
from run to run the way milliseconds do. The food query went from reading 3,208 pages of
`food_entries` (the whole table) to reading 5.

## Reading the plans

Plans are trimmed to the nodes that changed; `scripts/explain.js` prints them in full.

### 1. Daily calories (food_entries): whole-table scan → index range scan

**Before:**

```
->  Parallel Seq Scan on food_entries  (actual time=1.990..3.856 rows=51 loops=3)
      Filter: ((eaten_on >= '2026-10-12') AND (eaten_on <= '2026-11-16') AND (user_id = 8))
      Rows Removed by Filter: 82390
      Buffers: shared hit=3134
Execution Time: 8.118 ms
```

With no usable index, Postgres reads every row and throws away the ones that don't match.
It even started two parallel workers to split the scan (`loops=3` = leader + 2 workers):
82,390 rows removed per process, about 247k in total, to keep 153.

**After:**

```
->  Index Scan using food_entries_user_eaten_on_idx on food_entries  (actual time=0.009..0.016 rows=153 loops=1)
      Index Cond: ((user_id = 8) AND (eaten_on >= '2026-10-12') AND (eaten_on <= '2026-11-16'))
      Buffers: shared hit=5
Execution Time: 0.158 ms
```

Both conditions moved from `Filter` (check every row) to `Index Cond` (navigate straight to
the matching range). Notice the scan starts at **Oct 12**, 6 days before the requested Oct
18: that's the lookback the 7-day rolling average needs.

The goal lookup was fast in both runs (`Index Scan Backward using
daily_goals_user_effective_from_key`, 1 row, 30 loops: once per day through the LATERAL
join). It uses the index behind the `UNIQUE (user_id, effective_from)` constraint, so the
"which goal applied on this day" query got an index for free.

### 2. One week of events (calendar_events): the biggest win, plus a known limitation

**Before:**

```
->  Seq Scan on calendar_events  (actual time=0.010..3.407 rows=13 loops=1)
      Filter: ((ends_at > '2026-11-16 00:00:00+00') AND (starts_at < '2026-11-23 00:00:00+00') AND (user_id = 8))
      Rows Removed by Filter: 137407
      Buffers: shared hit=1454
```

**After:**

```
->  Incremental Sort
      Presorted Key: starts_at
      ->  Index Scan using calendar_events_user_starts_at_idx on calendar_events  (actual time=0.019..0.021 rows=13 loops=1)
            Index Cond: ((user_id = 8) AND (starts_at < '2026-11-23 00:00:00+00'))
            Filter: (ends_at > '2026-11-16 00:00:00+00')
            Rows Removed by Filter: 239
            Buffers: shared hit=6
```

Two things to notice:

- **The index also provides the order.** Rows come out of the index already sorted by
  `starts_at`, so the full sort became an `Incremental Sort` that only orders ties on `id`.
- **The limitation:** only `starts_at < to` can use the index. `ends_at > from` is still a
  `Filter`, so Postgres walks this user's events from the very first one up to `to`,
  discarding 239 that ended before the week began. With 4 months of history that's cheap
  (6 pages). After 5 years it would be about 3,600 rows per request. Two possible fixes,
  neither needed yet:
  1. Cap event length (say 7 days) and add `starts_at > from - interval '7 days'`, so
     both ends of the scan are bounded.
  2. Store a `tstzrange` column with a GiST index, which handles "overlaps this range"
     natively (`&&`).

### 3. Workout list: a smaller win, and why

**Before:** `Seq Scan on workouts ... Rows Removed by Filter: 34808, Buffers: shared hit=257`
**After:** `Index Scan Backward using workouts_user_performed_on_idx ... Buffers: shared hit=3`

Finding the 20 workouts went from 257 pages to 3, and `Backward` means Postgres read the
index in reverse to get `performed_on DESC` without a sort. But the query's total only
dropped from 731 to 477 buffers. The rest is the nested-loop join that fetches each
workout's sets and exercise names (474 buffers in both plans), which was already using
indexes: `workout_sets_workout_exercise_set_key` and `exercises_pkey`. The new index fixes
the part it can. The join was already efficient, just repeated 20 times (once per
workout).

### 4. Workout streak: an index-only scan

**Before:** `Seq Scan on workouts ... Rows Removed by Filter: 34764, Buffers: shared hit=257`
**After:**

```
->  Index Only Scan using workouts_user_performed_on_idx on workouts  (actual time=0.011..0.016 rows=68 loops=1)
      Index Cond: ((user_id = 8) AND (performed_on <= '2026-11-16'))
      Heap Fetches: 68
      Buffers: shared hit=4
```

The streak query needs only `performed_on`, and that column is in the index itself, so
Postgres can answer from the index without reading the table ("index-only"). The
`DISTINCT` became a cheap `Unique` because the rows already arrive in date order.

`Heap Fetches: 68` means it still checked the table for each row. Right after a bulk load,
Postgres's visibility map doesn't yet record which pages are safe to skip.
`VACUUM workouts` (or autovacuum, eventually) updates it, after which heap fetches drop to 0.

## Indexes I didn't add, and why

- **`workout_sets (workout_id)`:** already covered. It's the leading column of the
  `UNIQUE (workout_id, exercise_id, set_number)` index, and a B-tree can be used for any
  leading prefix of its columns.
- **`exercises (user_id)`:** covered by the unique index on `(user_id, lower(name))`.
- **`daily_goals (user_id, effective_from)`:** covered by its UNIQUE constraint.
- **`workout_sets (exercise_id)`:** added in the first migration rather than here. It's
  needed so deleting an exercise doesn't scan every set to check the foreign key, and for
  personal bests.
- **Anything else:** every index slows down every INSERT/UPDATE on its table and takes
  disk space. An index is worth adding when a real query needs it and EXPLAIN shows it
  being used, which is what this page records.
