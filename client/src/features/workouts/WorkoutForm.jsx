// Create or edit a workout: a date, optional notes, and any number of set rows.
//
// The API reports errors on set fields with paths like "sets.1.reps". Rows are sent in
// the order they're shown, so index 1 in the error is the second row on screen.
import { useState } from 'react';
import { Field, FormError } from '../../components/Field';
import { useFormSubmit } from '../../hooks/useFormSubmit';
import { emptyRow, toRequestBody } from './workoutFormModel';

export default function WorkoutForm({ initialForm, exercises, onSave, onCancel, submitLabel }) {
  const [form, setForm] = useState(initialForm);
  const { submit, submitting, fieldErrors, formError } = useFormSubmit(onSave);

  const updateRow = (key, changes) =>
    setForm((f) => ({
      ...f,
      rows: f.rows.map((row) => (row.key === key ? { ...row, ...changes } : row)),
    }));

  // A new row starts on the same exercise as the last one: usually the next set of it.
  const addRow = () =>
    setForm((f) => ({ ...f, rows: [...f.rows, emptyRow(f.rows.at(-1)?.exerciseId ?? '')] }));

  const removeRow = (key) => setForm((f) => ({ ...f, rows: f.rows.filter((r) => r.key !== key) }));

  function handleSubmit(event) {
    event.preventDefault();
    submit(toRequestBody(form));
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="stack">
      <FormError error={formError} />
      <div className="form-row">
        <Field label="Date" id="performedOn" error={fieldErrors.performedOn}>
          <input
            id="performedOn"
            type="date"
            value={form.performedOn}
            onChange={(e) => setForm({ ...form, performedOn: e.target.value })}
          />
        </Field>
        <Field label="Notes (optional)" id="notes" error={fieldErrors.notes}>
          <input
            id="notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>
      </div>

      <fieldset className="sets">
        <legend>Sets</legend>
        {/* An error on the list itself, e.g. "A workout needs at least one set". */}
        {fieldErrors.sets && <p className="field__error">{fieldErrors.sets}</p>}
        {form.rows.map((row, index) => {
          const err = (field) => fieldErrors[`sets.${index}.${field}`];
          const id = (field) => `${row.key}-${field}`;
          return (
            <div className="set-row" key={row.key} data-testid="set-row">
              <span className="set-row__number">{index + 1}</span>
              <Field label="Exercise" id={id('exercise')} error={err('exerciseId')}>
                <select
                  id={id('exercise')}
                  value={row.exerciseId}
                  onChange={(e) => updateRow(row.key, { exerciseId: e.target.value })}
                >
                  <option value="">Choose…</option>
                  {exercises.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Reps" id={id('reps')} error={err('reps') ?? err('setNumber')}>
                <input
                  id={id('reps')}
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={row.reps}
                  onChange={(e) => updateRow(row.key, { reps: e.target.value })}
                />
              </Field>
              <Field label="Weight (kg)" id={id('weight')} error={err('weightKg')}>
                <input
                  id={id('weight')}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.5"
                  value={row.weightKg}
                  onChange={(e) => updateRow(row.key, { weightKg: e.target.value })}
                />
              </Field>
              <Field label="Minutes" id={id('duration')} error={err('durationSec')}>
                <input
                  id={id('duration')}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={row.durationSec}
                  onChange={(e) => updateRow(row.key, { durationSec: e.target.value })}
                />
              </Field>
              <button
                type="button"
                className="btn btn--ghost set-row__remove"
                onClick={() => removeRow(row.key)}
                disabled={form.rows.length === 1}
                aria-label={`Remove set ${index + 1}`}
              >
                ✕
              </button>
            </div>
          );
        })}
        <button type="button" className="btn" onClick={addRow}>
          + Add set
        </button>
      </fieldset>

      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
