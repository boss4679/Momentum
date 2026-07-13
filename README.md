# Momentum — All-in-One Productivity App

A full-stack productivity application that unifies **workout tracking**, a
**scheduling calendar**, and **calorie logging** into a single dashboard,
backed by a scalable RESTful API that handles all backend logic and data
persistence.

Runs entirely on your machine — a single-user local app with no accounts,
no cloud, and no setup beyond `npm install`. Your data lives in a local
SQLite file.

![Modules](https://img.shields.io/badge/modules-workouts%20%7C%20calendar%20%7C%20nutrition-6d8bff)

## Highlights

- **Unified dashboard** — one glanceable view aggregating today's calories &
  macros, upcoming events, and recent workouts, served by a single aggregation
  endpoint (`GET /api/dashboard`).
- **RESTful API** — a Node.js + Express backend exposing full CRUD endpoints
  across three modules (workouts, calendar events, nutrition), cleanly
  separating the React frontend from the database.
- **Normalized SQL schema** — interconnected tables (`workouts`→`exercises`,
  `foods`←`nutrition_entries`) that store each fact once and are indexed for
  efficient querying of routines, scheduled events, and daily intake.
- **Validation & error handling everywhere** — a declarative validation layer
  guards every endpoint, and a centralized error handler returns one consistent
  JSON shape (`{ error, details }`) for 400/404/409/422/500 cases.

## Tech stack

| Layer      | Technology                                             |
|------------|--------------------------------------------------------|
| Frontend   | React 18 + Vite                                        |
| Backend    | Node.js + Express (RESTful API)                        |
| Database   | SQLite via the built-in `node:sqlite` module (no native build) |
| Data model | Normalized relational schema with foreign keys & indexes |

## Getting started

Requires **Node.js 22.5+** (for the built-in `node:sqlite` module; developed on Node 24).

```bash
# 1. Install all dependencies (root, server, client)
npm run install:all

# 2. Run the backend + frontend together
npm run dev
```

Then open **http://localhost:5173**. The app starts empty — add your own
workouts, events, foods, and meals. The Vite dev server proxies `/api/*` to the
Express backend on port `4000`, so everything works from a single origin.

The SQLite database is created automatically at `server/data/momentum.db` on
first run. Delete that file any time to start over.

## Architecture

```
momentum/
├── server/                  # Express RESTful API
│   └── src/
│       ├── index.js         # App wiring + centralized error handler
│       ├── db.js            # node:sqlite connection + schema bootstrap
│       ├── schema.sql       # Normalized schema (workouts, exercises,
│       │                    #   calendar_events, foods, nutrition_entries)
│       ├── validation.js    # Declarative validators + ApiError + asyncHandler
│       └── routes/
│           ├── workouts.js  # CRUD + nested exercises
│           ├── events.js    # CRUD + date-range filtering
│           ├── nutrition.js # Food catalog + dated calorie log
│           └── dashboard.js # Cross-module aggregation
└── client/                  # React + Vite single-page app
    └── src/
        ├── api.js           # Typed fetch wrapper (surfaces field errors)
        └── components/      # Dashboard, Workouts, Calendar, Nutrition, ui
```

## Data model (normalized)

```
workouts ──< exercises
calendar_events
nutrition_entries >── foods
```

- **`exercises`** is normalized out of `workouts` (1:N) — set/rep/weight rows are
  never duplicated inline on a workout.
- **`foods`** is a reusable catalog referenced by many `nutrition_entries` (N:1),
  so calorie & macro facts live in exactly one row; logged calories are computed
  as `food.calories × servings` at query time.
- Foreign keys (`ON DELETE CASCADE` / `RESTRICT`) enforce referential integrity;
  indexes back the common `date` lookups.

## API reference

All endpoints are prefixed with `/api`. Requests and responses are JSON.

### Workouts
| Method | Path             | Description                          |
|--------|------------------|--------------------------------------|
| GET    | `/workouts`      | List workouts (with nested exercises)|
| GET    | `/workouts/:id`  | Get one workout                      |
| POST   | `/workouts`      | Create a workout + exercises         |
| PUT    | `/workouts/:id`  | Update a workout (replaces exercises)|
| DELETE | `/workouts/:id`  | Delete a workout (cascades)          |

### Calendar events
| Method | Path           | Description                               |
|--------|----------------|-------------------------------------------|
| GET    | `/events`      | List events (`?from=&to=` range filter)   |
| GET    | `/events/:id`  | Get one event                             |
| POST   | `/events`      | Create an event                           |
| PUT    | `/events/:id`  | Update an event                           |
| DELETE | `/events/:id`  | Delete an event                           |

### Nutrition
| Method | Path                   | Description                            |
|--------|------------------------|----------------------------------------|
| GET    | `/nutrition/foods`     | List the food catalog                  |
| POST   | `/nutrition/foods`     | Add a food to the catalog              |
| DELETE | `/nutrition/foods/:id` | Remove a food (blocked if in use)      |
| GET    | `/nutrition?date=`     | List log entries (joined w/ food)      |
| GET    | `/nutrition/:id`       | Get one entry                          |
| POST   | `/nutrition`           | Log a food serving                     |
| PUT    | `/nutrition/:id`       | Update an entry                        |
| DELETE | `/nutrition/:id`       | Delete an entry                        |

### Dashboard
| Method | Path          | Description                                  |
|--------|---------------|----------------------------------------------|
| GET    | `/dashboard`  | Aggregated summary across all three modules  |

### Error shape

Every failure returns a consistent body:

```json
{ "error": "Validation failed", "details": { "name": "is required", "date": "must be a date (YYYY-MM-DD)" } }
```

| Status | Meaning                                  |
|--------|------------------------------------------|
| 400    | Bad request / malformed JSON / bad id    |
| 404    | Resource not found                       |
| 409    | Constraint violation (e.g. duplicate food, food in use) |
| 422    | Validation failed (see `details`)        |
| 500    | Unexpected server error                  |

## Scripts

| Command                | What it does                              |
|------------------------|-------------------------------------------|
| `npm run install:all`  | Install root, server, and client deps     |
| `npm run dev`          | Run API + frontend together               |
| `npm run build`        | Production build of the React client      |
| `npm start`            | Start the API server only                 |

## License

Released under the [MIT License](LICENSE) — © 2026 Brandon Hsu.
