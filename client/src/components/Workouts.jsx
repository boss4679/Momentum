// Workouts module — list of workout sessions with a nested exercise editor.
import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../api.js';
import { Modal, Field, EmptyState, useToast, fmtDate, todayISO } from './ui.jsx';

const blankExercise = () => ({ name: '', sets: '', reps: '', weight: '' });
const blankWorkout = () => ({ name: '', date: todayISO(), notes: '', exercises: [blankExercise()] });

export default function Workouts() {
  const [workouts, setWorkouts] = useState(null);
  const [editing, setEditing] = useState(null); // workout object or null
  const toast = useToast();

  const load = () => api.listWorkouts().then(setWorkouts).catch((e) => toast(e.message, 'error'));
  useEffect(() => { load(); }, []);

  const remove = async (w) => {
    if (!confirm(`Delete "${w.name}"?`)) return;
    try {
      await api.deleteWorkout(w.id);
      toast('Workout deleted');
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <section>
      <div className="section-head">
        <div>
          <h2>Workouts</h2>
          <p>Log training sessions and track every set, rep, and pound.</p>
        </div>
        <button className="btn primary" onClick={() => setEditing(blankWorkout())}>+ New workout</button>
      </div>

      {workouts === null ? (
        <div className="loading">Loading…</div>
      ) : workouts.length === 0 ? (
        <EmptyState icon="🏋️" title="No workouts yet" hint="Log your first session to start building momentum." />
      ) : (
        <div className="grid cols-2">
          {workouts.map((w) => (
            <div key={w.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                  <h2>{w.name}</h2>
                  <p className="sub">{fmtDate(w.date)} · {w.exercises.length} exercise{w.exercises.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="row-actions">
                  <button className="btn ghost sm" onClick={() => setEditing(toEditable(w))}>Edit</button>
                  <button className="btn ghost sm danger" onClick={() => remove(w)}>Delete</button>
                </div>
              </div>
              {w.exercises.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  {w.exercises.map((ex) => (
                    <div key={ex.id} className="row" style={{ padding: '9px 12px' }}>
                      <div className="grow">
                        <div className="title" style={{ fontSize: 14 }}>{ex.name}</div>
                      </div>
                      <div className="muted" style={{ fontSize: 13 }}>
                        {ex.sets}×{ex.reps}{ex.weight > 0 ? ` · ${ex.weight} lb` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {w.notes && <p className="muted" style={{ fontSize: 13, marginTop: 12, marginBottom: 0 }}>📝 {w.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <WorkoutForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </section>
  );
}

// Convert a server workout into editable form state (string inputs).
function toEditable(w) {
  return {
    id: w.id, name: w.name, date: w.date, notes: w.notes || '',
    exercises: w.exercises.length
      ? w.exercises.map((e) => ({ name: e.name, sets: String(e.sets), reps: String(e.reps), weight: String(e.weight) }))
      : [blankExercise()],
  };
}

function WorkoutForm({ initial, onClose, onSaved }) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const isEdit = Boolean(initial.id);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setEx = (i, k, v) =>
    setForm((f) => ({ ...f, exercises: f.exercises.map((e, idx) => (idx === i ? { ...e, [k]: v } : e)) }));
  const addEx = () => setForm((f) => ({ ...f, exercises: [...f.exercises, blankExercise()] }));
  const removeEx = (i) => setForm((f) => ({ ...f, exercises: f.exercises.filter((_, idx) => idx !== i) }));

  const submit = async () => {
    setSaving(true);
    setErrors({});
    // Drop fully-empty exercise rows; coerce numeric fields.
    const exercises = form.exercises
      .filter((e) => e.name.trim() !== '')
      .map((e) => ({
        name: e.name.trim(),
        sets: Number(e.sets) || 0,
        reps: Number(e.reps) || 0,
        weight: Number(e.weight) || 0,
      }));
    const body = { name: form.name, date: form.date, notes: form.notes || null, exercises };
    try {
      if (isEdit) await api.updateWorkout(initial.id, body);
      else await api.createWorkout(body);
      toast(isEdit ? 'Workout updated' : 'Workout created');
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.details) {
        // Flatten nested exercise errors to top-level for a simple display.
        setErrors(e.details);
        toast('Please fix the highlighted fields', 'error');
      } else {
        toast(e.message, 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={isEdit ? 'Edit workout' : 'New workout'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save workout'}</button>
        </>
      }
    >
      <div className="field-row">
        <Field label="Name" name="name" errors={errors}>
          <input id="name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Push Day" />
        </Field>
        <Field label="Date" name="date" errors={errors}>
          <input id="date" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
        </Field>
      </div>

      <label className="ex-head" style={{ display: 'block', marginBottom: 8 }}>Exercises</label>
      <div className="ex-row ex-head">
        <div>Exercise</div><div>Sets</div><div>Reps</div><div>Weight</div><div />
      </div>
      {form.exercises.map((ex, i) => (
        <div className="ex-row" key={i}>
          <input value={ex.name} onChange={(e) => setEx(i, 'name', e.target.value)} placeholder="Bench Press" />
          <input value={ex.sets} onChange={(e) => setEx(i, 'sets', e.target.value)} placeholder="3" inputMode="numeric" />
          <input value={ex.reps} onChange={(e) => setEx(i, 'reps', e.target.value)} placeholder="10" inputMode="numeric" />
          <input value={ex.weight} onChange={(e) => setEx(i, 'weight', e.target.value)} placeholder="135" inputMode="decimal" />
          <button className="btn ghost sm" onClick={() => removeEx(i)} aria-label="Remove exercise">✕</button>
        </div>
      ))}
      <button className="btn sm" onClick={addEx} style={{ marginTop: 4 }}>+ Add exercise</button>

      <div style={{ marginTop: 16 }}>
        <Field label="Notes" name="notes" errors={errors}>
          <textarea id="notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="How did it feel?" />
        </Field>
      </div>
    </Modal>
  );
}
