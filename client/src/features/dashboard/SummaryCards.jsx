// The four cards built from GET /api/summary/daily. Each one handles its own empty state.
import { Link } from 'react-router';
import ProgressBar from '../../components/ProgressBar';
import { formatTime, formatDate, toISODate } from '../../utils/dates';

export function WorkoutsCard({ workouts }) {
  return (
    <section className="card card--workouts" aria-labelledby="card-workouts">
      <h2 id="card-workouts">Today's workouts</h2>
      {workouts.length === 0 ? (
        <p className="muted">
          No workout logged yet. <Link to="/workouts">Log one</Link>
        </p>
      ) : (
        <ul className="plain-list">
          {workouts.map((w) => (
            <li key={w.id}>
              <strong>{w.exercises.join(', ')}</strong>
              <span className="muted">
                {' '}
                · {w.setCount} sets
                {w.volumeKg > 0 && ` · ${w.volumeKg.toLocaleString()} kg`}
                {w.durationSec > 0 && ` · ${Math.round(w.durationSec / 60)} min`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function EventsCard({ events }) {
  return (
    <section className="card card--calendar" aria-labelledby="card-events">
      <h2 id="card-events">Next up</h2>
      {events.length === 0 ? (
        <p className="muted">
          Nothing scheduled. <Link to="/calendar">Open the calendar</Link>
        </p>
      ) : (
        <ul className="plain-list">
          {events.map((e) => (
            <li key={e.id}>
              <span className="time">
                {/* Events on another day show the date as well as the time. */}
                {toISODate(new Date(e.startsAt)) !== toISODate(new Date()) &&
                  `${formatDate(toISODate(new Date(e.startsAt)))}, `}
                {formatTime(e.startsAt)}
              </span>{' '}
              {e.title}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function CaloriesCard({ calories }) {
  return (
    <section className="card card--food" aria-labelledby="card-calories">
      <h2 id="card-calories">Calories</h2>
      {calories.goal === null ? (
        <p>
          <strong>{calories.eaten.toLocaleString()} kcal</strong>{' '}
          <span className="muted">
            eaten. <Link to="/food">Set a daily goal</Link> to track progress.
          </span>
        </p>
      ) : (
        <ProgressBar
          value={calories.eaten}
          max={calories.goal}
          label="Calories eaten against goal"
        />
      )}
      <ul className="meal-totals">
        {calories.byMeal.map((m) => (
          <li key={m.meal}>
            <span className="muted">{m.meal}</span> {m.calories.toLocaleString()}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TrendsCard({ trends }) {
  const { streak } = trends;
  return (
    <section className="card" aria-labelledby="card-trends">
      <h2 id="card-trends">Trends</h2>
      <dl className="stats">
        <div>
          <dt>Workout streak</dt>
          <dd>
            {streak.current} {streak.current === 1 ? 'day' : 'days'}
          </dd>
        </div>
        <div>
          <dt>Longest streak</dt>
          <dd>{streak.longest} days</dd>
        </div>
        <div>
          <dt>7-day avg intake</dt>
          <dd>
            {trends.rollingAvg7 === null ? '—' : `${trends.rollingAvg7.toLocaleString()} kcal`}
          </dd>
        </div>
      </dl>
    </section>
  );
}
