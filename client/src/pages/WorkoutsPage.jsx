// Log a workout, browse history, see personal bests.
import { useState } from 'react';
import { api } from '../api';
import { useApiData } from '../hooks/useApiData';
import Modal from '../components/Modal';
import { EmptyState, ErrorState, LoadingState } from '../components/StatusViews';
import WorkoutForm from '../features/workouts/WorkoutForm';
import WorkoutHistory from '../features/workouts/WorkoutHistory';
import PersonalBests from '../features/workouts/PersonalBests';
import { emptyForm, formFromWorkout } from '../features/workouts/workoutFormModel';
import { today } from '../utils/dates';

const PAGE_SIZE = 10;

export default function WorkoutsPage() {
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState(null); // the workout being edited, or null
  // Changing this key remounts the "log" form, which resets it to empty after a save.
  const [formKey, setFormKey] = useState(0);
  const [actionError, setActionError] = useState(null);

  // The server caps a page at 100; 100 exercises is plenty for a dropdown.
  const exercises = useApiData(() => api.exercises.list({ limit: 100 }), []);
  const history = useApiData(() => api.workouts.list({ limit: PAGE_SIZE, offset }), [offset]);
  const bests = useApiData(() => api.workouts.personalBests(), []);

  function refresh() {
    history.reload();
    bests.reload();
  }

  async function create(body) {
    await api.workouts.create(body);
    setFormKey((k) => k + 1);
    setOffset(0); // jump to the first page, where the new workout is
    refresh();
  }

  async function update(body) {
    await api.workouts.update(editing.id, body);
    setEditing(null);
    refresh();
  }

  async function remove(workout) {
    if (!window.confirm('Delete this workout and all its sets?')) return;
    setActionError(null);
    try {
      await api.workouts.remove(workout.id);
      refresh();
    } catch (error) {
      setActionError(error);
    }
  }

  return (
    <div className="page">
      <h1 className="page__title">Workouts</h1>

      <section className="card" aria-labelledby="log-heading">
        <h2 id="log-heading">Log a workout</h2>
        {exercises.status === 'loading' && <LoadingState label="Loading exercises" />}
        {exercises.status === 'error' && (
          <ErrorState error={exercises.error} onRetry={exercises.reload} />
        )}
        {exercises.status === 'success' && (
          <WorkoutForm
            key={formKey}
            initialForm={emptyForm(today())}
            exercises={exercises.data.data}
            onSave={create}
            submitLabel="Save workout"
          />
        )}
      </section>

      <div className="two-column">
        <section className="card" aria-labelledby="history-heading">
          <h2 id="history-heading">History</h2>
          {actionError && <ErrorState error={actionError} />}
          {history.status === 'loading' && !history.data && (
            <LoadingState label="Loading workouts" />
          )}
          {history.status === 'error' && (
            <ErrorState error={history.error} onRetry={history.reload} />
          )}
          {history.data &&
            (history.data.pagination.total === 0 ? (
              <EmptyState title="No workouts yet" hint="Log your first one above." />
            ) : (
              <>
                <WorkoutHistory
                  workouts={history.data.data}
                  onEdit={setEditing}
                  onDelete={remove}
                />
                <Pager pagination={history.data.pagination} onChange={setOffset} />
              </>
            ))}
        </section>

        <section className="card" aria-labelledby="bests-heading">
          <h2 id="bests-heading">Personal bests</h2>
          {bests.status === 'loading' && !bests.data && (
            <LoadingState label="Loading personal bests" />
          )}
          {bests.status === 'error' && <ErrorState error={bests.error} onRetry={bests.reload} />}
          {bests.data &&
            (bests.data.data.length === 0 ? (
              <EmptyState
                title="No personal bests yet"
                hint="They appear after your first workout."
              />
            ) : (
              <PersonalBests bests={bests.data.data} />
            ))}
        </section>
      </div>

      {editing && exercises.status === 'success' && (
        <Modal title="Edit workout" onClose={() => setEditing(null)}>
          <WorkoutForm
            initialForm={formFromWorkout(editing)}
            exercises={exercises.data.data}
            onSave={update}
            onCancel={() => setEditing(null)}
            submitLabel="Save changes"
          />
        </Modal>
      )}
    </div>
  );
}

// Previous / next buttons driven by the API's { limit, offset, total }.
function Pager({ pagination, onChange }) {
  const { limit, offset, total } = pagination;
  if (total <= limit) return null;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.ceil(total / limit);
  return (
    <nav className="pager" aria-label="Workout history pages">
      <button
        type="button"
        className="btn"
        disabled={offset === 0}
        onClick={() => onChange(offset - limit)}
      >
        Newer
      </button>
      <span className="muted">
        Page {page} of {pages}
      </span>
      <button
        type="button"
        className="btn"
        disabled={offset + limit >= total}
        onClick={() => onChange(offset + limit)}
      >
        Older
      </button>
    </nav>
  );
}
