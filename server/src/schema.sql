-- Momentum — normalized SQL schema (single-user, local install)
-- Foreign keys enforce referential integrity across interconnected features.
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Workout module
--   A workout is a session; its exercises are normalized into a child table
--   (1 workout : N exercises) so exercise rows are never duplicated inline.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workouts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  date       TEXT    NOT NULL,                       -- YYYY-MM-DD
  notes      TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_workouts_date ON workouts(date);

CREATE TABLE IF NOT EXISTS exercises (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  sets       INTEGER NOT NULL DEFAULT 0,
  reps       INTEGER NOT NULL DEFAULT 0,
  weight     REAL    NOT NULL DEFAULT 0,             -- lbs
  position   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_exercises_workout ON exercises(workout_id);

-- ---------------------------------------------------------------------------
-- Calendar module
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS calendar_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  description TEXT,
  category    TEXT    NOT NULL DEFAULT 'general',    -- general/work/fitness/personal
  start_time  TEXT    NOT NULL,                      -- ISO 8601 datetime
  end_time    TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_start ON calendar_events(start_time);

-- ---------------------------------------------------------------------------
-- Nutrition module
--   A reusable food catalog (calorie + macro data stored once) referenced by
--   many daily log entries — a normalized N:1 relationship that avoids
--   repeating nutrition facts on every logged serving.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS foods (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  name     TEXT    NOT NULL UNIQUE,
  calories INTEGER NOT NULL,                         -- per serving
  protein  REAL    NOT NULL DEFAULT 0,               -- grams
  carbs    REAL    NOT NULL DEFAULT 0,               -- grams
  fat      REAL    NOT NULL DEFAULT 0                -- grams
);

CREATE TABLE IF NOT EXISTS nutrition_entries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  food_id    INTEGER NOT NULL REFERENCES foods(id) ON DELETE RESTRICT,
  date       TEXT    NOT NULL,                       -- YYYY-MM-DD
  meal       TEXT    NOT NULL DEFAULT 'breakfast',   -- breakfast/lunch/dinner/snack
  servings   REAL    NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_nutrition_date ON nutrition_entries(date);
