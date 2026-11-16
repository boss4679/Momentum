import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import EventForm from './EventForm';
import { ApiError } from '../../api/client';

const NEW_EVENT = {
  startsAt: new Date('2026-03-02T09:00').toISOString(),
  endsAt: new Date('2026-03-02T10:00').toISOString(),
};

function overlapError() {
  return new ApiError(409, 'EVENT_OVERLAP', 'Event overlaps an existing event', [
    {
      field: 'startsAt',
      message: 'Overlaps "Standup"',
      eventId: 7,
      startsAt: new Date('2026-03-02T09:30').toISOString(),
      endsAt: new Date('2026-03-02T09:45').toISOString(),
    },
  ]);
}

function renderForm(onSave) {
  render(<EventForm event={NEW_EVENT} onSave={onSave} onCancel={() => {}} />);
}

describe('EventForm', () => {
  test('sends local times as UTC instants', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderForm(onSave);

    await user.type(screen.getByLabelText('Title'), 'Dentist');
    await user.selectOptions(screen.getByLabelText('Category (optional)'), 'personal');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // Tests run in New York (UTC-5 in early March), so 09:00 local is 14:00Z.
    expect(onSave).toHaveBeenCalledWith(
      {
        title: 'Dentist',
        startsAt: '2026-03-02T14:00:00.000Z',
        endsAt: '2026-03-02T15:00:00.000Z',
        category: 'personal',
        notes: null,
      },
      { allowOverlap: false },
    );
  });

  test('on an overlap, lists the clash and lets the user save anyway', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValueOnce(overlapError()).mockResolvedValueOnce(undefined);
    renderForm(onSave);

    await user.type(screen.getByLabelText('Title'), 'Planning');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('This time clashes with another event.');
    expect(banner).toHaveTextContent('Overlaps "Standup"');
    // The clash is explained in the banner, not as a red error on the Starts field.
    expect(screen.getByLabelText('Starts')).not.toHaveAttribute('aria-invalid');

    await user.click(screen.getByRole('button', { name: 'Save anyway' }));

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave.mock.calls[1][1]).toEqual({ allowOverlap: true });
    expect(onSave.mock.calls[1][0]).toEqual(onSave.mock.calls[0][0]);
  });

  test('shows an end-before-start error on the Ends field', async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn()
      .mockRejectedValue(
        new ApiError(422, 'VALIDATION_ERROR', 'Invalid request body', [
          { field: 'endsAt', message: 'endsAt must be after startsAt' },
        ]),
      );
    renderForm(onSave);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('endsAt must be after startsAt')).toBeInTheDocument();
    expect(screen.getByLabelText('Ends')).toHaveAttribute('aria-invalid', 'true');
  });
});
