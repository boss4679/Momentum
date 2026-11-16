-- Up Migration

-- These are the indexes behind the app's main access pattern: "this user's rows in this
-- date range". They live in their own migration so docs/indexes.md can measure the same
-- queries before and after (migrate down 1, EXPLAIN ANALYZE, migrate up, EXPLAIN ANALYZE).
--
-- Column order matters: user_id comes first because every query filters on it with "=",
-- and the date comes second because it's filtered by a range. A B-tree can then jump
-- straight to one user's slice and scan just the dates it needs.

CREATE INDEX workouts_user_performed_on_idx     ON workouts        (user_id, performed_on);
CREATE INDEX food_entries_user_eaten_on_idx     ON food_entries    (user_id, eaten_on);
CREATE INDEX calendar_events_user_starts_at_idx ON calendar_events (user_id, starts_at);

-- Down Migration

DROP INDEX workouts_user_performed_on_idx, food_entries_user_eaten_on_idx, calendar_events_user_starts_at_idx;
