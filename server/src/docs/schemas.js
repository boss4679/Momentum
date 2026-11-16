// Response shapes for the OpenAPI document. Requests are documented from the Zod schemas
// (see fromZod.js); responses are written here by hand, because they come from SQL column
// lists rather than from a schema object. The API tests check the real responses.

const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });
const date = { type: 'string', format: 'date', examples: ['2026-03-02'] };
const dateTime = { type: 'string', format: 'date-time', examples: ['2026-03-02T17:00:00.000Z'] };
const id = { type: 'integer', minimum: 1 };

// Builds an object schema where every listed property is required (present in the
// response, possibly null).
const object = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
});

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });

// GET list endpoints return { data: [...], pagination: { limit, offset, total } }.
const listOf = (name) =>
  object({ data: { type: 'array', items: ref(name) }, pagination: ref('Pagination') });

const meal = { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] };

const schemas = {
  Error: object({
    error: object({
      code: {
        type: 'string',
        examples: ['VALIDATION_ERROR'],
        description:
          'BAD_REQUEST, MALFORMED_JSON, UNAUTHORIZED, NOT_FOUND, CONFLICT, EVENT_OVERLAP, ' +
          'VALIDATION_ERROR, PAYLOAD_TOO_LARGE or INTERNAL_ERROR',
      },
      message: { type: 'string' },
      details: {
        type: 'array',
        description: 'One entry per problem. `field` is a path into the request, e.g. sets.1.reps',
        items: {
          type: 'object',
          properties: { field: { type: 'string' }, message: { type: 'string' } },
          required: ['field', 'message'],
        },
      },
    }),
  }),

  Pagination: object({
    limit: { type: 'integer' },
    offset: { type: 'integer' },
    total: { type: 'integer', description: 'Rows matching the filters, ignoring limit/offset' },
  }),

  Health: object({
    status: { type: 'string', enum: ['ok', 'degraded'] },
    database: { type: 'string', enum: ['up', 'down'] },
  }),

  User: object({
    id,
    email: { type: 'string', format: 'email' },
    timezone: { type: 'string', examples: ['America/Los_Angeles'] },
    createdAt: dateTime,
  }),
  AuthResponse: object({
    user: ref('User'),
    token: { type: 'string', description: 'JWT, 1 hour' },
  }),
  MeResponse: object({ user: ref('User') }),

  Exercise: object({
    id,
    name: { type: 'string' },
    category: { type: 'string', enum: ['strength', 'cardio', 'mobility'] },
    createdAt: dateTime,
  }),
  ExerciseList: listOf('Exercise'),

  WorkoutSet: object({
    id,
    exerciseId: id,
    exerciseName: { type: 'string' },
    category: { type: 'string' },
    setNumber: { type: 'integer' },
    reps: nullable({ type: 'integer' }),
    weightKg: nullable({ type: 'number' }),
    durationSec: nullable({ type: 'integer' }),
  }),
  Workout: object({
    id,
    performedOn: date,
    notes: nullable({ type: 'string' }),
    createdAt: dateTime,
    sets: { type: 'array', items: ref('WorkoutSet') },
  }),
  WorkoutList: listOf('Workout'),
  PersonalBest: object({
    exerciseId: id,
    exerciseName: { type: 'string' },
    category: { type: 'string' },
    maxWeightKg: nullable({ type: 'number' }),
    repsAtMaxWeight: nullable({ type: 'integer' }),
    maxWeightOn: nullable(date),
    maxReps: nullable({ type: 'integer' }),
    maxDurationSec: nullable({ type: 'integer' }),
    setCount: { type: 'integer' },
    lastPerformedOn: date,
  }),
  PersonalBestList: object({ data: { type: 'array', items: ref('PersonalBest') } }),

  Event: object({
    id,
    title: { type: 'string' },
    startsAt: dateTime,
    endsAt: dateTime,
    category: nullable({
      type: 'string',
      enum: ['work', 'personal', 'fitness', 'social', 'other'],
    }),
    notes: nullable({ type: 'string' }),
    createdAt: dateTime,
  }),
  EventList: listOf('Event'),

  FoodEntry: object({
    id,
    eatenOn: date,
    meal,
    name: { type: 'string' },
    calories: { type: 'integer' },
    proteinG: nullable({ type: 'number' }),
    carbsG: nullable({ type: 'number' }),
    fatG: nullable({ type: 'number' }),
    createdAt: dateTime,
  }),
  FoodEntryList: listOf('FoodEntry'),

  Goal: object({
    id,
    calorieGoal: { type: 'integer' },
    effectiveFrom: date,
    createdAt: dateTime,
  }),
  GoalList: listOf('Goal'),

  Streak: object({
    current: { type: 'integer', description: 'Consecutive workout days ending today or yesterday' },
    currentStartedOn: nullable(date),
    longest: { type: 'integer' },
  }),

  DailySummary: object({
    date,
    timezone: { type: 'string' },
    workouts: {
      type: 'array',
      items: object({
        id,
        notes: nullable({ type: 'string' }),
        exercises: { type: 'array', items: { type: 'string' } },
        setCount: { type: 'integer' },
        volumeKg: { type: 'number', description: 'Sum of reps × weight' },
        durationSec: { type: 'integer' },
      }),
    },
    upcomingEvents: {
      type: 'array',
      items: object({
        id,
        title: { type: 'string' },
        startsAt: dateTime,
        endsAt: dateTime,
        category: nullable({ type: 'string' }),
      }),
    },
    calories: object({
      eaten: { type: 'integer' },
      goal: nullable({ type: 'integer' }),
      remaining: nullable({ type: 'integer' }),
      percentOfGoal: nullable({ type: 'number' }),
      byMeal: {
        type: 'array',
        items: object({
          meal,
          entries: { type: 'integer' },
          calories: { type: 'integer' },
          proteinG: { type: 'number' },
          carbsG: { type: 'number' },
          fatG: { type: 'number' },
        }),
      },
      macros: object({
        proteinG: { type: 'number' },
        carbsG: { type: 'number' },
        fatG: { type: 'number' },
      }),
    }),
    trends: object({
      rollingAvg7: nullable({
        type: 'integer',
        description: 'Average over logged days in the last 7',
      }),
      loggedDaysInWindow: { type: 'integer' },
      streak: ref('Streak'),
    }),
  }),

  Trends: object({
    from: date,
    to: date,
    dailyCalories: {
      type: 'array',
      description: 'One row per day in the range, including days with nothing logged',
      items: object({
        date,
        calories: nullable({ type: 'integer' }),
        rollingAvg7: nullable({ type: 'integer' }),
        loggedDaysInWindow: { type: 'integer' },
        goal: nullable({ type: 'integer' }),
      }),
    },
    weeklyVolume: {
      type: 'array',
      items: object({
        weekStart: date,
        workouts: { type: 'integer' },
        sets: { type: 'integer' },
        volumeKg: { type: 'number' },
      }),
    },
    streak: ref('Streak'),
  }),
};

module.exports = { schemas, ref };
