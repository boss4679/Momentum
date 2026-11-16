// The workout form's state, and conversion to and from the API's shape. No React here, so
// it's easy to test.
//
// The form holds one flat list of set rows, every value as a string (that's what inputs
// give us). The API wants numbers or null, plus a setNumber that counts 1, 2, 3... per
// exercise. The user never types set numbers; they're derived from row order.

let nextKey = 1;
// React needs a stable key per row so that removing row 2 doesn't make row 3 reuse row 2's
// inputs. Array indexes change on removal; this counter doesn't.
function newKey() {
  nextKey += 1;
  return `row-${nextKey}`;
}

export function emptyRow(exerciseId = '') {
  return { key: newKey(), exerciseId: String(exerciseId), reps: '', weightKg: '', durationSec: '' };
}

export function emptyForm(date) {
  return { performedOn: date, notes: '', rows: [emptyRow()] };
}

// An existing workout from the API -> form state, for editing.
export function formFromWorkout(workout) {
  return {
    performedOn: workout.performedOn,
    notes: workout.notes ?? '',
    rows: workout.sets.map((set) => ({
      key: newKey(),
      exerciseId: String(set.exerciseId),
      reps: set.reps == null ? '' : String(set.reps),
      weightKg: set.weightKg == null ? '' : String(set.weightKg),
      // The form asks for minutes, which is how people think about cardio.
      durationSec: set.durationSec == null ? '' : String(set.durationSec / 60),
    })),
  };
}

// '' -> null, '12' -> 12. A value that isn't a number is passed through as-is, so the
// server's validation reports it rather than the form silently dropping it.
function toNumber(value) {
  if (value.trim() === '') return null;
  const number = Number(value);
  return Number.isNaN(number) ? value : number;
}

// Form state -> request body for POST/PUT /api/workouts.
export function toRequestBody(form) {
  const countPerExercise = {};
  const sets = form.rows.map((row) => {
    const exerciseId = row.exerciseId === '' ? null : Number(row.exerciseId);
    countPerExercise[exerciseId] = (countPerExercise[exerciseId] ?? 0) + 1;
    const minutes = toNumber(row.durationSec);
    return {
      exerciseId,
      setNumber: countPerExercise[exerciseId],
      reps: toNumber(row.reps),
      weightKg: toNumber(row.weightKg),
      durationSec: typeof minutes === 'number' ? Math.round(minutes * 60) : minutes,
    };
  });
  return {
    performedOn: form.performedOn,
    notes: form.notes.trim() === '' ? null : form.notes,
    sets,
  };
}
