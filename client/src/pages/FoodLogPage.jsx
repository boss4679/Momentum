// One day of food: progress against the goal, entries grouped by meal, add/edit/delete.
// The day is in the URL (?date=2026-03-02) so it survives reloads.
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '../api';
import { ApiError } from '../api/client';
import { useApiData } from '../hooks/useApiData';
import Modal from '../components/Modal';
import ProgressBar from '../components/ProgressBar';
import { ErrorState, LoadingState } from '../components/StatusViews';
import FoodEntryForm from '../features/food/FoodEntryForm';
import GoalForm from '../features/food/GoalForm';
import { groupByMeal } from '../features/food/groupByMeal';
import { addDays, formatDate, today } from '../utils/dates';

// "No goal set yet" is a normal state, not an error, so a 404 becomes null.
async function loadGoal(date) {
  try {
    return await api.goals.current(date);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export default function FoodLogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const date = searchParams.get('date') ?? today();
  const goTo = (d) => setSearchParams({ date: d });

  const [formKey, setFormKey] = useState(0); // remount the add form to clear it after saving
  const [editing, setEditing] = useState(null);
  const [editingGoal, setEditingGoal] = useState(false);
  const [actionError, setActionError] = useState(null);

  const entries = useApiData(
    () => api.foodEntries.list({ from: date, to: date, limit: 100 }),
    [date],
  );
  const goal = useApiData(() => loadGoal(date), [date]);

  async function create(body) {
    await api.foodEntries.create(body);
    setFormKey((k) => k + 1);
    entries.reload();
  }

  async function update(body) {
    await api.foodEntries.update(editing.id, body);
    setEditing(null);
    entries.reload();
  }

  async function remove(entry) {
    if (!window.confirm(`Delete "${entry.name}"?`)) return;
    setActionError(null);
    try {
      await api.foodEntries.remove(entry.id);
      entries.reload();
    } catch (error) {
      setActionError(error);
    }
  }

  // A goal already starting on this day is edited; otherwise a new goal starts today and
  // the older one stays in force for earlier days. (Two goals can't share a start date.)
  async function saveGoal(body) {
    if (goal.data?.effectiveFrom === date) await api.goals.update(goal.data.id, body);
    else await api.goals.create(body);
    setEditingGoal(false);
    goal.reload();
  }

  const groups = entries.data ? groupByMeal(entries.data.data) : [];
  const eaten = groups.reduce((sum, g) => sum + g.calories, 0);

  return (
    <div className="page">
      <div className="page__toolbar">
        <h1 className="page__title">
          {formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' })}
        </h1>
        <div className="button-group">
          <button type="button" className="btn" onClick={() => goTo(addDays(date, -1))}>
            ← Previous day
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => goTo(today())}
            disabled={date === today()}
          >
            Today
          </button>
          <button type="button" className="btn" onClick={() => goTo(addDays(date, 1))}>
            Next day →
          </button>
        </div>
      </div>

      <section className="card card--food" aria-labelledby="goal-heading">
        <h2 id="goal-heading">Daily goal</h2>
        {goal.status === 'loading' && !goal.data && <LoadingState label="Loading goal" />}
        {goal.status === 'error' && <ErrorState error={goal.error} onRetry={goal.reload} />}
        {goal.status === 'success' && editingGoal && (
          <GoalForm
            currentGoal={goal.data?.calorieGoal}
            effectiveFrom={date}
            onSave={saveGoal}
            onCancel={() => setEditingGoal(false)}
          />
        )}
        {goal.status === 'success' && !editingGoal && (
          <>
            {goal.data ? (
              <ProgressBar
                value={eaten}
                max={goal.data.calorieGoal}
                label="Calories eaten against goal"
              />
            ) : (
              <p className="muted">
                No goal set for this day. {eaten.toLocaleString()} kcal eaten so far.
              </p>
            )}
            <button type="button" className="btn btn--small" onClick={() => setEditingGoal(true)}>
              {goal.data ? 'Change goal' : 'Set a goal'}
            </button>
          </>
        )}
      </section>

      <section className="card" aria-labelledby="add-heading">
        <h2 id="add-heading">Add food</h2>
        <FoodEntryForm
          key={`${date}-${formKey}`}
          eatenOn={date}
          onSave={create}
          submitLabel="Add"
        />
      </section>

      {actionError && <ErrorState error={actionError} />}
      {entries.status === 'loading' && !entries.data && <LoadingState label="Loading food log" />}
      {entries.status === 'error' && <ErrorState error={entries.error} onRetry={entries.reload} />}
      {entries.data && (
        <div className="meals">
          {groups.map((group) => (
            <section key={group.meal} className="card meal" aria-labelledby={`meal-${group.meal}`}>
              <header className="meal__header">
                <h2 id={`meal-${group.meal}`}>{group.meal}</h2>
                <span className="muted">{group.calories.toLocaleString()} kcal</span>
              </header>
              {group.entries.length === 0 ? (
                <p className="muted">Nothing logged.</p>
              ) : (
                <ul className="plain-list food-list">
                  {group.entries.map((entry) => (
                    <li key={entry.id}>
                      <span>
                        {entry.name} <span className="muted">· {entry.calories} kcal</span>
                      </span>
                      <span className="history__actions">
                        <button
                          type="button"
                          className="btn btn--ghost btn--small"
                          onClick={() => setEditing(entry)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--small text-danger"
                          onClick={() => remove(entry)}
                        >
                          Delete
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      {editing && (
        <Modal title="Edit food entry" onClose={() => setEditing(null)}>
          <FoodEntryForm
            entry={editing}
            eatenOn={editing.eatenOn}
            onSave={update}
            onCancel={() => setEditing(null)}
            submitLabel="Save changes"
          />
        </Modal>
      )}
    </div>
  );
}
