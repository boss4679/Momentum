// The OpenAPI 3.1 document served at /api/docs. Request parameters and bodies come from
// the same Zod schemas the routes validate with; responses are in ./schemas.js.
const { queryParameters, pathParameters, requestBody } = require('./fromZod');
const { schemas, ref } = require('./schemas');
const { idParams } = require('../schemas/common');
const auth = require('../schemas/auth');
const exercise = require('../schemas/exercise');
const workout = require('../schemas/workout');
const event = require('../schemas/event');
const foodEntry = require('../schemas/foodEntry');
const goal = require('../schemas/goal');
const summary = require('../schemas/summary');

const json = (schemaName, description) => ({
  description,
  content: { 'application/json': { schema: ref(schemaName) } },
});

// Error responses, shared by every operation that can return them.
const errors = {
  400: json('Error', 'Bad path or query parameter (BAD_REQUEST), or malformed JSON'),
  401: json('Error', 'Missing, invalid or expired token (UNAUTHORIZED)'),
  404: json('Error', "Not found, or it belongs to another user (the API doesn't reveal which)"),
  409: json('Error', 'Conflicts with existing data (CONFLICT)'),
  422: json('Error', 'Request body failed validation (VALIDATION_ERROR); see details'),
};

// One operation. Protected operations get the bearer-token requirement and a 401.
function operation({
  tag,
  summary: title,
  description,
  isPublic = false,
  params,
  query,
  body,
  ok,
  okStatus = 200,
  errorCodes = [],
}) {
  const parameters = [
    ...(params ? pathParameters(params) : []),
    ...(query ? queryParameters(query) : []),
  ];
  const responses = { [okStatus]: ok };
  const codes = isPublic ? errorCodes : [401, ...errorCodes];
  for (const code of codes) responses[code] = errors[code];
  return {
    tags: [tag],
    summary: title,
    ...(description && { description }),
    ...(isPublic && { security: [] }), // overrides the document-wide bearer requirement
    ...(parameters.length && { parameters }),
    ...(body && { requestBody: requestBody(body) }),
    responses,
  };
}

const noContent = { description: 'Deleted' };

// GET list, POST, GET/PUT/DELETE by id: the shape every CRUD resource shares.
function crud({ tag, name, listSchema, listQuery, body, notes = {} }) {
  return {
    collection: {
      get: operation({
        tag,
        summary: `List ${tag.toLowerCase()}`,
        description: notes.list,
        query: listQuery,
        ok: json(listSchema, 'A page of results'),
        errorCodes: [400],
      }),
      post: operation({
        tag,
        summary: `Create ${name.toLowerCase()}`,
        description: notes.write,
        body,
        ok: json(name, 'Created'),
        okStatus: 201,
        errorCodes: [400, 409, 422],
      }),
    },
    item: {
      get: operation({
        tag,
        summary: `Get one ${name.toLowerCase()}`,
        params: idParams,
        ok: json(name, 'Found'),
        errorCodes: [400, 404],
      }),
      put: operation({
        tag,
        summary: `Replace ${name.toLowerCase()}`,
        description: notes.write,
        params: idParams,
        body,
        ok: json(name, 'Updated'),
        errorCodes: [400, 404, 409, 422],
      }),
      delete: operation({
        tag,
        summary: `Delete ${name.toLowerCase()}`,
        description: notes.remove,
        params: idParams,
        ok: noContent,
        okStatus: 204,
        errorCodes: [400, 404, 409],
      }),
    },
  };
}

const exercises = crud({
  tag: 'Exercises',
  name: 'Exercise',
  listSchema: 'ExerciseList',
  listQuery: exercise.listQuery,
  body: exercise.body,
  notes: {
    write: 'Names are unique per user, ignoring case: a duplicate returns 409.',
    remove: 'Returns 409 if any workout set still uses the exercise.',
  },
});

const workouts = crud({
  tag: 'Workouts',
  name: 'Workout',
  listSchema: 'WorkoutList',
  listQuery: workout.listQuery,
  body: workout.body,
  notes: {
    list: 'Newest first, each workout with its sets. `from`/`to` filter on performedOn.',
    write:
      'Every set needs `reps` or `durationSec`; `weightKg` needs `reps`; setNumber must be ' +
      'unique per exercise within the workout; every exerciseId must be one of your exercises. ' +
      'PUT replaces the whole workout, sets included, in one transaction.',
  },
});

const events = crud({
  tag: 'Events',
  name: 'Event',
  listSchema: 'EventList',
  listQuery: event.listQuery,
  body: event.body,
  notes: {
    list: 'Events that overlap the [from, to) window, ordered by start time.',
    write:
      '`endsAt` must be after `startsAt`. If the event overlaps another of your events the ' +
      'API answers 409 EVENT_OVERLAP and lists the clashes in `details`; repeat the request ' +
      'with `?allowOverlap=true` to save it anyway.',
  },
});
// The write operations also take ?allowOverlap.
for (const op of [events.collection.post, events.item.put]) {
  op.parameters = [...(op.parameters ?? []), ...queryParameters(event.writeQuery)];
}

const foodEntries = crud({
  tag: 'Food entries',
  name: 'FoodEntry',
  listSchema: 'FoodEntryList',
  listQuery: foodEntry.listQuery,
  body: foodEntry.body,
  notes: { list: 'Newest day first; within a day in meal order. `from`/`to` filter on eatenOn.' },
});

const goals = crud({
  tag: 'Goals',
  name: 'Goal',
  listSchema: 'GoalList',
  listQuery: goal.listQuery,
  body: goal.body,
  notes: {
    write:
      'A goal applies from `effectiveFrom` until the next goal starts, so changing your goal ' +
      "doesn't rewrite history. Two goals can't share a start date (409).",
  },
});

const document = {
  openapi: '3.1.0',
  info: {
    title: 'Momentum API',
    version: '1.0.0',
    description:
      'Workouts, a calendar and calorie logging, plus a daily summary built with SQL ' +
      'aggregation. Log in (or register), copy the token, and click **Authorize** to try ' +
      'the protected endpoints.\n\n' +
      'Errors always look like `{ "error": { "code", "message", "details" } }`. ' +
      "Another user's resource returns 404, not 403, so ids can't be probed.",
  },
  servers: [{ url: '/api' }],
  // Every operation needs a token unless it says otherwise (security: []).
  security: [{ bearerAuth: [] }],
  tags: [
    'Health',
    'Auth',
    'Summary',
    'Workouts',
    'Exercises',
    'Events',
    'Food entries',
    'Goals',
  ].map((name) => ({ name })),
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas,
  },
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Is the API up, and can it reach the database?',
        security: [],
        responses: {
          200: json('Health', 'Healthy'),
          503: json('Health', 'The database is unreachable'),
        },
      },
    },

    '/auth/register': {
      post: operation({
        tag: 'Auth',
        summary: 'Create an account',
        description:
          'Returns a token straight away. `timezone` (IANA name) decides what "today" means ' +
          'for summaries; it defaults to UTC. The account starts with a small exercise catalog.',
        isPublic: true,
        body: auth.register,
        ok: json('AuthResponse', 'Account created'),
        okStatus: 201,
        errorCodes: [409, 422],
      }),
    },
    '/auth/login': {
      post: operation({
        tag: 'Auth',
        summary: 'Log in',
        description: 'A wrong email and a wrong password give the same 401.',
        isPublic: true,
        body: auth.login,
        ok: json('AuthResponse', 'Logged in'),
        errorCodes: [401, 422],
      }),
    },
    '/auth/me': {
      get: operation({
        tag: 'Auth',
        summary: 'The logged-in user',
        ok: json('MeResponse', 'The user'),
      }),
    },

    '/summary/daily': {
      get: operation({
        tag: 'Summary',
        summary: "One day's dashboard",
        description:
          'Workouts, upcoming events, calories against the goal in force that day, and trends. ' +
          "`date` defaults to today in the user's timezone.",
        query: summary.dailyQuery,
        ok: json('DailySummary', 'The summary'),
        errorCodes: [400],
      }),
    },
    '/summary/trends': {
      get: operation({
        tag: 'Summary',
        summary: 'Calorie and training trends over a date range',
        description:
          'Daily calories with a 7-day rolling average (window functions over a generated ' +
          'calendar), weekly volume, and the workout streak. Defaults to the last 30 days.',
        query: summary.trendsQuery,
        ok: json('Trends', 'The trends'),
        errorCodes: [400],
      }),
    },

    '/exercises': exercises.collection,
    '/exercises/{id}': exercises.item,
    '/workouts': workouts.collection,
    '/workouts/personal-bests': {
      get: operation({
        tag: 'Workouts',
        summary: 'Personal bests per exercise',
        description: 'Heaviest set (and its reps and date), most reps and longest duration.',
        ok: json('PersonalBestList', 'One row per exercise you have done'),
      }),
    },
    '/workouts/{id}': workouts.item,
    '/events': events.collection,
    '/events/{id}': events.item,
    '/food-entries': foodEntries.collection,
    '/food-entries/{id}': foodEntries.item,
    '/goals': goals.collection,
    '/goals/current': {
      get: operation({
        tag: 'Goals',
        summary: 'The goal in force on a date',
        query: goal.currentQuery,
        ok: json('Goal', 'The goal'),
        errorCodes: [400, 404],
      }),
    },
    '/goals/{id}': goals.item,
  },
};

module.exports = document;
