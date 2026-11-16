// Past workouts, newest first, one page at a time. Each workout's sets are grouped by
// exercise so "Bench press: 3 × 8 @ 60 kg" reads on one line.
import { formatDate } from '../../utils/dates';

function describeSet(set) {
  if (set.reps != null && set.weightKg != null) return `${set.reps} × ${set.weightKg} kg`;
  if (set.reps != null) return `${set.reps} reps`;
  return `${Math.round(set.durationSec / 60)} min`;
}

function groupByExercise(sets) {
  const groups = new Map();
  for (const set of sets) {
    if (!groups.has(set.exerciseId))
      groups.set(set.exerciseId, { name: set.exerciseName, sets: [] });
    groups.get(set.exerciseId).sets.push(set);
  }
  return [...groups.values()];
}

export default function WorkoutHistory({ workouts, onEdit, onDelete }) {
  return (
    <ul className="history">
      {workouts.map((workout) => (
        <li key={workout.id} className="history__item">
          <div className="history__header">
            <strong>{formatDate(workout.performedOn)}</strong>
            <div className="history__actions">
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => onEdit(workout)}
              >
                Edit
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--small text-danger"
                onClick={() => onDelete(workout)}
              >
                Delete
              </button>
            </div>
          </div>
          {workout.notes && <p className="muted">{workout.notes}</p>}
          <ul className="plain-list">
            {groupByExercise(workout.sets).map((group) => (
              <li key={group.name}>
                <span className="exercise-name">{group.name}</span>{' '}
                <span className="muted">{group.sets.map(describeSet).join(', ')}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
