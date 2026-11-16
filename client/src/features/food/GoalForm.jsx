// Set a new daily calorie goal starting on the day being viewed. Goals are history, not a
// single setting: the server keeps every goal with its effectiveFrom date, so changing
// the goal today doesn't rewrite how last month is judged.
import { useState } from 'react';
import { Field, FormError } from '../../components/Field';
import { useFormSubmit } from '../../hooks/useFormSubmit';

export default function GoalForm({ currentGoal, effectiveFrom, onSave, onCancel }) {
  const [value, setValue] = useState(currentGoal == null ? '' : String(currentGoal));
  const { submit, submitting, fieldErrors, formError } = useFormSubmit(onSave);

  function handleSubmit(e) {
    e.preventDefault();
    submit({ calorieGoal: value.trim() === '' ? null : Number(value), effectiveFrom });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="goal-form">
      <FormError error={fieldErrors.calorieGoal ? null : formError} />
      <Field
        label="Daily goal (kcal)"
        id="calorieGoal"
        error={fieldErrors.calorieGoal ?? fieldErrors.effectiveFrom}
      >
        <input
          id="calorieGoal"
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </Field>
      <button type="submit" className="btn btn--primary" disabled={submitting}>
        {submitting ? 'Saving…' : 'Save goal'}
      </button>
      <button type="button" className="btn btn--ghost" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}
