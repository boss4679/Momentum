// Add or edit one food entry. The date comes from the page (the day being viewed).
import { useState } from 'react';
import { Field, FormError } from '../../components/Field';
import { useFormSubmit } from '../../hooks/useFormSubmit';
import { MEALS } from './groupByMeal';

const str = (value) => (value == null ? '' : String(value));
// '' -> null for optional numbers; a non-number is sent as-is so the server explains it.
const num = (value) =>
  value.trim() === '' ? null : Number.isNaN(Number(value)) ? value : Number(value);

export default function FoodEntryForm({ entry, eatenOn, onSave, onCancel, submitLabel }) {
  const [form, setForm] = useState({
    meal: entry?.meal ?? 'breakfast',
    name: entry?.name ?? '',
    calories: str(entry?.calories),
    proteinG: str(entry?.proteinG),
    carbsG: str(entry?.carbsG),
    fatG: str(entry?.fatG),
  });
  const { submit, submitting, fieldErrors, formError } = useFormSubmit(onSave);
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  function handleSubmit(e) {
    e.preventDefault();
    submit({
      eatenOn,
      meal: form.meal,
      name: form.name,
      // calories is required; an empty box is sent as null so the server says so.
      calories: num(form.calories),
      proteinG: num(form.proteinG),
      carbsG: num(form.carbsG),
      fatG: num(form.fatG),
    });
  }

  // A short helper so the four number inputs read as a list, not 40 lines of repetition.
  const numberField = (field, label) => (
    <Field label={label} id={`food-${field}`} error={fieldErrors[field]}>
      <input
        id={`food-${field}`}
        type="number"
        inputMode="decimal"
        min="0"
        value={form[field]}
        onChange={set(field)}
      />
    </Field>
  );

  return (
    <form onSubmit={handleSubmit} noValidate className="stack">
      <FormError error={formError} />
      <div className="form-row">
        <Field label="Meal" id="food-meal" error={fieldErrors.meal}>
          <select id="food-meal" value={form.meal} onChange={set('meal')}>
            {MEALS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Food" id="food-name" error={fieldErrors.name}>
          <input id="food-name" value={form.name} onChange={set('name')} />
        </Field>
        {numberField('calories', 'Calories')}
      </div>
      <div className="form-row">
        {numberField('proteinG', 'Protein (g)')}
        {numberField('carbsG', 'Carbs (g)')}
        {numberField('fatG', 'Fat (g)')}
      </div>
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
