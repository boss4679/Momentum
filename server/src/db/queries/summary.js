// The SQL behind the dashboard: GET /api/summary/daily and GET /api/summary/trends.
//
// Each query does its aggregation inside Postgres and returns only the finished numbers,
// rather than fetching raw rows and adding them up in JavaScript. The database reads the
// rows through the (user_id, date) indexes and sends back a handful of values.
//
// The SQL strings are exported so scripts/explain.js can run EXPLAIN ANALYZE on exactly
// the queries the API uses.

// ---------------------------------------------------------------------------------------
// Daily calories with a 7-day rolling average (window function)
// ---------------------------------------------------------------------------------------
// Returns one row per calendar day from $2 to $3: calories eaten (NULL if nothing was
// logged), the 7-day rolling average, how many days in that window were logged, and the
// calorie goal in force that day.
//
// How it works:
// 1. `days` lists EVERY calendar day, starting 6 days BEFORE `from`. Those extra days exist
//    only so the first days of the range have a full 7-day window behind them; the final
//    WHERE hides them. (A user asking for March 8-10 still gets March 8's average computed
//    over March 2-8.)
// 2. `totals` adds up each day's calories. Days with no entries have no row here.
// 3. `series` LEFT JOINs days to totals, so a day with nothing logged is still a row, with
//    calories = NULL. Then the window function:
//      avg(calories) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)
//    For each row, Postgres looks at that row plus the 6 rows before it (7 days, because
//    `days` has exactly one row per day) and averages them. Unlike GROUP BY, a window
//    function doesn't collapse rows: every day keeps its own row and gets its own average.
//    Two details matter:
//    - Without the full `days` list, "6 PRECEDING" would mean "6 previous *logged* days",
//      which could stretch over weeks. Filling the gaps is what makes it "7 calendar days".
//    - avg() ignores NULLs, so unlogged days are skipped rather than counted as 0 calories.
//      A forgotten log shouldn't drag the average down. count(calories) over the same
//      window says how many days the average is based on.
// 4. The LATERAL join runs its subquery once per day, finding the goal in force on that
//    day: the latest goal whose effective_from is on or before it.
const DAILY_CALORIES_SQL = `
  WITH days AS (
    SELECT d::date AS day
    FROM generate_series(($2::date - 6)::timestamp, $3::date::timestamp, interval '1 day') AS d
  ),
  totals AS (
    SELECT eaten_on AS day, sum(calories) AS calories
    FROM food_entries
    WHERE user_id = $1
      AND eaten_on BETWEEN $2::date - 6 AND $3::date
    GROUP BY eaten_on
  ),
  series AS (
    SELECT days.day,
           totals.calories,
           avg(totals.calories)   OVER last_7_days AS rolling_avg,
           count(totals.calories) OVER last_7_days AS logged_days
    FROM days
    LEFT JOIN totals ON totals.day = days.day
    WINDOW last_7_days AS (ORDER BY days.day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)
  )
  SELECT s.day                    AS "date",
         s.calories,
         round(s.rolling_avg)::int AS "rollingAvg7",
         s.logged_days            AS "loggedDaysInWindow",
         g.calorie_goal           AS "goal"
  FROM series s
  LEFT JOIN LATERAL (
    SELECT calorie_goal
    FROM daily_goals
    WHERE user_id = $1 AND effective_from <= s.day
    ORDER BY effective_from DESC
    LIMIT 1
  ) g ON true
  WHERE s.day >= $2::date
  ORDER BY s.day`;

async function dailyCalories(db, userId, from, to) {
  const { rows } = await db.query(DAILY_CALORIES_SQL, [userId, from, to]);
  return rows;
}

// ---------------------------------------------------------------------------------------
// Workout streaks (gaps and islands)
// ---------------------------------------------------------------------------------------
// The current streak (consecutive days with a workout, up to `asOf`) and the longest ever.
//
// How it works, using workout days Mar 1, 2, 3, 5, 6 as an example:
// 1. `workout_days`: each distinct day with at least one workout, up to `asOf`. Two workouts
//    on one day count as one day.
// 2. `islands`: number the days in order with row_number(), then subtract that number from
//    the date:
//        day      row_number   day - row_number
//        Mar 1        1            Feb 28
//        Mar 2        2            Feb 28
//        Mar 3        3            Feb 28
//        Mar 5        4            Mar 1
//        Mar 6        5            Mar 1
//    Within a run of consecutive days, the date and the row number both go up by 1, so
//    their difference stays the same. A gap in the dates moves the difference to a new
//    value. Rows sharing the same difference are one "island" of consecutive days, which
//    is why this is called the gaps-and-islands technique.
// 3. `streaks`: GROUP BY that island id gives each streak's first day, last day and length.
// 4. The current streak is the one whose last day is `asOf` or the day before. A streak that
//    ended yesterday is still "alive" today, since today's workout may simply not have been
//    logged yet. At most one island can qualify, because islands are separated by at least
//    one missing day.
const STREAK_SQL = `
  WITH workout_days AS (
    SELECT DISTINCT performed_on AS day
    FROM workouts
    WHERE user_id = $1 AND performed_on <= $2::date
  ),
  islands AS (
    SELECT day,
           day - (row_number() OVER (ORDER BY day))::int AS island_id
    FROM workout_days
  ),
  streaks AS (
    SELECT min(day) AS started_on, max(day) AS ended_on, count(*) AS length
    FROM islands
    GROUP BY island_id
  )
  SELECT COALESCE((SELECT length FROM streaks WHERE ended_on >= $2::date - 1), 0) AS "current",
         (SELECT started_on FROM streaks WHERE ended_on >= $2::date - 1)        AS "currentStartedOn",
         COALESCE((SELECT max(length) FROM streaks), 0)                         AS "longest"`;

async function workoutStreak(db, userId, asOf) {
  const { rows } = await db.query(STREAK_SQL, [userId, asOf]);
  return rows[0];
}

// ---------------------------------------------------------------------------------------
// Weekly workout volume
// ---------------------------------------------------------------------------------------
// One row per week (Monday start) that overlaps [from, to]: workouts, sets, and volume
// (sum of reps x weight, the usual measure of how much was lifted), counting only workouts
// inside the range. Weeks with no workouts still appear, with zeros, so a chart doesn't
// silently skip them. That's the same "generate the full series, then LEFT JOIN" idea as
// the daily calories query.
//
// date_trunc('week', ...) rounds a date down to the Monday of its week.
// count(DISTINCT w.id) counts workouts, not set rows, because the join repeats each workout
// once per set. Only sets with both reps and weight add volume; reps * NULL is NULL, and
// sum() skips NULLs.
const WEEKLY_VOLUME_SQL = `
  WITH weeks AS (
    SELECT w::date AS week_start
    FROM generate_series(
      date_trunc('week', $2::date::timestamp),
      date_trunc('week', $3::date::timestamp),
      interval '1 week'
    ) AS w
  ),
  stats AS (
    SELECT date_trunc('week', w.performed_on::timestamp)::date AS week_start,
           count(DISTINCT w.id)          AS workouts,
           count(s.id)                   AS sets,
           sum(s.reps * s.weight_kg)     AS volume_kg
    FROM workouts w
    JOIN workout_sets s ON s.workout_id = w.id
    WHERE w.user_id = $1
      AND w.performed_on BETWEEN $2::date AND $3::date
    GROUP BY 1
  )
  SELECT weeks.week_start              AS "weekStart",
         COALESCE(stats.workouts, 0)   AS "workouts",
         COALESCE(stats.sets, 0)       AS "sets",
         COALESCE(stats.volume_kg, 0)  AS "volumeKg"
  FROM weeks
  LEFT JOIN stats ON stats.week_start = weeks.week_start
  ORDER BY weeks.week_start`;

async function weeklyVolume(db, userId, from, to) {
  const { rows } = await db.query(WEEKLY_VOLUME_SQL, [userId, from, to]);
  return rows;
}

// ---------------------------------------------------------------------------------------
// One day's workouts, compacted for the dashboard card
// ---------------------------------------------------------------------------------------
// One row per workout on `date`: exercise names, set count, volume and total timed
// duration. GROUP BY w.id alone is enough to also select w.notes: id is the primary key,
// so Postgres knows each id has exactly one notes value (a "functional dependency").
const DAY_WORKOUTS_SQL = `
  SELECT w.id,
         w.notes,
         array_agg(DISTINCT e.name ORDER BY e.name) AS exercises,
         count(s.id)                                AS "setCount",
         COALESCE(sum(s.reps * s.weight_kg), 0)     AS "volumeKg",
         COALESCE(sum(s.duration_sec), 0)           AS "durationSec"
  FROM workouts w
  JOIN workout_sets s ON s.workout_id = w.id
  JOIN exercises e    ON e.id = s.exercise_id
  WHERE w.user_id = $1 AND w.performed_on = $2::date
  GROUP BY w.id
  ORDER BY w.id`;

async function dayWorkouts(db, userId, date) {
  const { rows } = await db.query(DAY_WORKOUTS_SQL, [userId, date]);
  return rows;
}

// ---------------------------------------------------------------------------------------
// Upcoming events
// ---------------------------------------------------------------------------------------
// The next 5 events that haven't ended yet, seen from `date` in the user's timezone.
//
// How it works:
// - `bounds` turns the calendar date into the absolute instants where that day starts and
//   ends *in the user's timezone*: midnight in Los Angeles is 08:00 UTC in winter.
//   ($2::date)::timestamp is midnight with no zone; AT TIME ZONE $3 interprets it in the
//   user's zone and gives back a timestamptz.
// - `reference` is the moment we're looking ahead from. When `date` is today, that's now(),
//   so the meeting that finished an hour ago isn't "upcoming". For any other day it's the
//   start of that day, so looking at a past or future date shows that day's agenda.
// - "Haven't ended yet" (ends_at > reference) rather than "haven't started" means an event
//   that's in progress still shows up.
const UPCOMING_EVENTS_SQL = `
  WITH bounds AS (
    SELECT ($2::date)::timestamp     AT TIME ZONE $3 AS day_start,
           ($2::date + 1)::timestamp AT TIME ZONE $3 AS day_end
  ),
  reference AS (
    SELECT CASE WHEN now() >= day_start AND now() < day_end THEN now() ELSE day_start END
             AS look_from
    FROM bounds
  )
  SELECT e.id, e.title, e.starts_at AS "startsAt", e.ends_at AS "endsAt", e.category
  FROM calendar_events e
  CROSS JOIN reference r
  WHERE e.user_id = $1
    AND e.ends_at > r.look_from
  ORDER BY e.starts_at, e.id
  LIMIT 5`;

async function upcomingEvents(db, userId, date, timezone) {
  const { rows } = await db.query(UPCOMING_EVENTS_SQL, [userId, date, timezone]);
  return rows;
}

// ---------------------------------------------------------------------------------------
// One day's food, per meal
// ---------------------------------------------------------------------------------------
// Always four rows, one per meal in eating order, even for meals with no entries.
// unnest(ARRAY[...]) WITH ORDINALITY turns the list of meals into rows plus their position
// (1-4), which drives the ORDER BY. The LEFT JOIN keeps meals with no entries, as 0s.
// The user and date conditions go in the ON clause, not in WHERE: in WHERE they would
// remove the unmatched (NULL) rows and turn the LEFT JOIN back into an inner join.
const MEAL_BREAKDOWN_SQL = `
  SELECT m.meal,
         count(f.id)                  AS entries,
         COALESCE(sum(f.calories), 0)  AS calories,
         COALESCE(sum(f.protein_g), 0) AS "proteinG",
         COALESCE(sum(f.carbs_g), 0)   AS "carbsG",
         COALESCE(sum(f.fat_g), 0)     AS "fatG"
  FROM unnest(ARRAY['breakfast', 'lunch', 'dinner', 'snack']) WITH ORDINALITY AS m(meal, position)
  LEFT JOIN food_entries f
         ON f.meal = m.meal
        AND f.user_id = $1
        AND f.eaten_on = $2::date
  GROUP BY m.meal, m.position
  ORDER BY m.position`;

async function mealBreakdown(db, userId, date) {
  const { rows } = await db.query(MEAL_BREAKDOWN_SQL, [userId, date]);
  return rows;
}

module.exports = {
  dailyCalories,
  workoutStreak,
  weeklyVolume,
  dayWorkouts,
  upcomingEvents,
  mealBreakdown,
  SQL: {
    DAILY_CALORIES_SQL,
    STREAK_SQL,
    WEEKLY_VOLUME_SQL,
    DAY_WORKOUTS_SQL,
    UPCOMING_EVENTS_SQL,
    MEAL_BREAKDOWN_SQL,
  },
};
