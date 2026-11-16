-- Up Migration

-- Every table uses integer identity keys instead of bigint, because node-pg returns
-- bigint columns as JS strings. Constraints are named explicitly so the error-mapping
-- middleware (milestone 2) can turn a constraint name into a readable message.

CREATE TABLE users (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         text        NOT NULL,
  password_hash text        NOT NULL,
  -- "Today" is a user-local idea; the summary endpoints need this to find day boundaries.
  timezone      text        NOT NULL DEFAULT 'UTC',
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- The app lower-cases emails, so a plain UNIQUE is enough to stop Foo@x / foo@x duplicates.
  CONSTRAINT users_email_lowercase CHECK (email = lower(email)),
  CONSTRAINT users_email_key       UNIQUE (email)
);

-- One catalog per user, so the ownership rule ("only your own rows") is the same on every table.
CREATE TABLE exercises (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    integer     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name       text        NOT NULL,
  category   text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exercises_name_not_blank CHECK (btrim(name) <> ''),
  -- A CHECK ... IN list instead of a Postgres ENUM: easier to change in a later
  -- migration, and every violation surfaces as the same error code (23514).
  CONSTRAINT exercises_category_valid CHECK (category IN ('strength', 'cardio', 'mobility'))
);
-- An expression index, so "Bench Press" and "bench press" count as the same name.
-- (A table-level UNIQUE constraint can't take an expression like lower(name); a unique index can.)
CREATE UNIQUE INDEX exercises_user_name_key ON exercises (user_id, lower(name));

CREATE TABLE workouts (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      integer     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  performed_on date        NOT NULL,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workout_sets (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Sets only exist as part of a workout, so they go when the workout goes.
  workout_id   integer      NOT NULL REFERENCES workouts (id) ON DELETE CASCADE,
  -- Deleting an exercise that has history must fail (23503 -> 409), but deleting a *user*
  -- must still work. A plain NO ACTION/RESTRICT key breaks the second case: when a user is
  -- deleted, Postgres runs each cascade (users->exercises, users->workouts->sets) as its own
  -- step and checks this key as soon as the exercises are gone, before the sets have been
  -- removed. DEFERRABLE INITIALLY DEFERRED moves the check to COMMIT, after every cascade
  -- has finished. A lone DELETE of an exercise still fails, just at commit time.
  exercise_id  integer      NOT NULL REFERENCES exercises (id) ON DELETE NO ACTION
                            DEFERRABLE INITIALLY DEFERRED,
  set_number   integer      NOT NULL,
  reps         integer,
  weight_kg    numeric(6,2),
  duration_sec integer,
  -- A CHECK passes when its value is NULL, so the optional columns still allow NULL.
  CONSTRAINT workout_sets_set_number_positive CHECK (set_number > 0),
  CONSTRAINT workout_sets_reps_positive       CHECK (reps > 0),
  CONSTRAINT workout_sets_weight_non_negative CHECK (weight_kg >= 0),
  CONSTRAINT workout_sets_duration_positive   CHECK (duration_sec > 0),
  -- A set has to record something: reps (strength) or a duration (cardio, planks).
  CONSTRAINT workout_sets_has_measurement     CHECK (reps IS NOT NULL OR duration_sec IS NOT NULL),
  -- A weight only makes sense attached to a rep count.
  CONSTRAINT workout_sets_weight_needs_reps   CHECK (weight_kg IS NULL OR reps IS NOT NULL),
  CONSTRAINT workout_sets_workout_exercise_set_key UNIQUE (workout_id, exercise_id, set_number)
);
-- Postgres doesn't index FK columns automatically. This one serves personal-best lookups
-- and the FK check when an exercise is deleted. (workout_id is already covered: it's the
-- leading column of the UNIQUE constraint's index.)
CREATE INDEX workout_sets_exercise_id_idx ON workout_sets (exercise_id);

CREATE TABLE calendar_events (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    integer     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title      text        NOT NULL,
  -- timestamptz stores an absolute instant (in UTC) and converts on the way out.
  -- An event happens at a real moment, unlike a workout or a meal, which belong to a calendar date.
  starts_at  timestamptz NOT NULL,
  ends_at    timestamptz NOT NULL,
  category   text,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_events_title_not_blank   CHECK (btrim(title) <> ''),
  CONSTRAINT calendar_events_ends_after_starts CHECK (ends_at > starts_at),
  CONSTRAINT calendar_events_category_valid    CHECK (category IN ('work', 'personal', 'fitness', 'social', 'other'))
);
-- Overlap is NOT a constraint here: the API allows it with allowOverlap=true, so the
-- check lives in the handler (milestone 3).

CREATE TABLE food_entries (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    integer      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  eaten_on   date         NOT NULL,
  meal       text         NOT NULL,
  name       text         NOT NULL,
  calories   integer      NOT NULL,
  protein_g  numeric(6,1),
  carbs_g    numeric(6,1),
  fat_g      numeric(6,1),
  created_at timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT food_entries_meal_valid       CHECK (meal IN ('breakfast', 'lunch', 'dinner', 'snack')),
  CONSTRAINT food_entries_name_not_blank   CHECK (btrim(name) <> ''),
  CONSTRAINT food_entries_calories_non_neg CHECK (calories >= 0),
  CONSTRAINT food_entries_macros_non_neg   CHECK (protein_g >= 0 AND carbs_g >= 0 AND fat_g >= 0)
);

-- A goal holds from effective_from until the next row for that user (a history, not one
-- value), so past days keep the goal that applied to them.
CREATE TABLE daily_goals (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        integer     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  calorie_goal   integer     NOT NULL,
  effective_from date        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_goals_calorie_goal_range CHECK (calorie_goal BETWEEN 500 AND 10000),
  -- This also serves as the index for "latest goal where effective_from <= :date".
  CONSTRAINT daily_goals_user_effective_from_key UNIQUE (user_id, effective_from)
);

-- Down Migration

-- Children before parents; listing them in one DROP lets Postgres resolve the order anyway.
DROP TABLE daily_goals, food_entries, calendar_events, workout_sets, workouts, exercises, users;
