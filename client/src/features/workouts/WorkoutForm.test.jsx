import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import WorkoutForm from './WorkoutForm';
import { emptyForm, formFromWorkout, toRequestBody } from './workoutFormModel';
import { ApiError } from '../../api/client';

const EXERCISES = [
  { id: 1, name: 'Bench press' },
  { id: 2, name: 'Squat' },
  { id: 3, name: 'Running' },
];

function renderForm(onSave = vi.fn().mockResolvedValue(undefined)) {
  render(
    <WorkoutForm
      initialForm={emptyForm('2026-03-02')}
      exercises={EXERCISES}
      onSave={onSave}
      submitLabel="Save workout"
    />,
  );
  return onSave;
}

const rows = () => screen.getAllByTestId('set-row');

describe('toRequestBody', () => {
  test('numbers sets per exercise and converts strings to numbers or null', () => {
    const form = {
      performedOn: '2026-03-02',
      notes: '  ',
      rows: [
        { exerciseId: '1', reps: '8', weightKg: '60', durationSec: '' },
        { exerciseId: '2', reps: '5', weightKg: '100', durationSec: '' },
        { exerciseId: '1', reps: '6', weightKg: '62.5', durationSec: '' },
        { exerciseId: '3', reps: '', weightKg: '', durationSec: '1.5' },
      ],
    };
    expect(toRequestBody(form)).toEqual({
      performedOn: '2026-03-02',
      notes: null,
      sets: [
        { exerciseId: 1, setNumber: 1, reps: 8, weightKg: 60, durationSec: null },
        { exerciseId: 2, setNumber: 1, reps: 5, weightKg: 100, durationSec: null },
        { exerciseId: 1, setNumber: 2, reps: 6, weightKg: 62.5, durationSec: null },
        { exerciseId: 3, setNumber: 1, reps: null, weightKg: null, durationSec: 90 },
      ],
    });
  });

  test('round-trips an API workout through the form', () => {
    const workout = {
      performedOn: '2026-03-02',
      notes: 'Felt strong',
      sets: [
        { exerciseId: 1, setNumber: 1, reps: 8, weightKg: 60, durationSec: null },
        { exerciseId: 3, setNumber: 1, reps: null, weightKg: null, durationSec: 1800 },
      ],
    };
    expect(toRequestBody(formFromWorkout(workout))).toEqual(workout);
  });
});

describe('WorkoutForm', () => {
  test('logs a workout with several sets', async () => {
    const user = userEvent.setup();
    const onSave = renderForm();

    await user.selectOptions(within(rows()[0]).getByLabelText('Exercise'), 'Bench press');
    await user.type(within(rows()[0]).getByLabelText('Reps'), '8');
    await user.type(within(rows()[0]).getByLabelText('Weight (kg)'), '60');
    await user.click(screen.getByRole('button', { name: '+ Add set' }));
    // The new row starts on the same exercise, since it's usually the next set of it.
    expect(within(rows()[1]).getByLabelText('Exercise')).toHaveDisplayValue('Bench press');
    await user.type(within(rows()[1]).getByLabelText('Reps'), '6');
    await user.type(within(rows()[1]).getByLabelText('Weight (kg)'), '62.5');
    await user.click(screen.getByRole('button', { name: 'Save workout' }));

    expect(onSave).toHaveBeenCalledWith({
      performedOn: '2026-03-02',
      notes: null,
      sets: [
        { exerciseId: 1, setNumber: 1, reps: 8, weightKg: 60, durationSec: null },
        { exerciseId: 1, setNumber: 2, reps: 6, weightKg: 62.5, durationSec: null },
      ],
    });
  });

  test('removing a row keeps the other rows intact', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(within(rows()[0]).getByLabelText('Reps'), '10');
    await user.click(screen.getByRole('button', { name: '+ Add set' }));
    await user.type(within(rows()[1]).getByLabelText('Reps'), '20');

    await user.click(screen.getByRole('button', { name: 'Remove set 1' }));

    expect(rows()).toHaveLength(1);
    expect(within(rows()[0]).getByLabelText('Reps')).toHaveValue(20);
    // The last row can't be removed: a workout needs at least one set.
    expect(screen.getByRole('button', { name: 'Remove set 1' })).toBeDisabled();
  });

  test('shows an error on sets.1.reps beside the second row, not the first', async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn()
      .mockRejectedValue(
        new ApiError(422, 'VALIDATION_ERROR', 'Invalid request body', [
          { field: 'sets.1.reps', message: 'A set needs reps or durationSec' },
        ]),
      );
    renderForm(onSave);
    await user.click(screen.getByRole('button', { name: '+ Add set' }));
    await user.click(screen.getByRole('button', { name: 'Save workout' }));

    expect(await screen.findByText('A set needs reps or durationSec')).toBeInTheDocument();
    expect(within(rows()[1]).getByLabelText('Reps')).toHaveAttribute('aria-invalid', 'true');
    expect(within(rows()[0]).getByLabelText('Reps')).not.toHaveAttribute('aria-invalid');
  });
});
