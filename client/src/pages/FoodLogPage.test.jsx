// The food log against a faked API: grouping by meal, the goal progress bar, and the
// "no goal yet" (404) and error states.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, test } from 'vitest';
import FoodLogPage from './FoodLogPage';
import { groupByMeal } from '../features/food/groupByMeal';
import { apiError, mockFetch } from '../test/mockFetch';

const DAY = '2026-03-02';
const entry = (id, meal, name, calories) => ({ id, eatenOn: DAY, meal, name, calories });
const ENTRIES = [
  entry(1, 'breakfast', 'Oatmeal', 350),
  entry(2, 'lunch', 'Chicken salad', 600),
  entry(3, 'breakfast', 'Coffee', 50),
];
const list = (data) => ({ data, pagination: { limit: 100, offset: 0, total: data.length } });

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/food?date=${DAY}`]}>
      <FoodLogPage />
    </MemoryRouter>,
  );
}

describe('groupByMeal', () => {
  test('returns all four meals in order with subtotals', () => {
    expect(groupByMeal(ENTRIES).map((g) => [g.meal, g.entries.length, g.calories])).toEqual([
      ['breakfast', 2, 400],
      ['lunch', 1, 600],
      ['dinner', 0, 0],
      ['snack', 0, 0],
    ]);
  });
});

describe('FoodLogPage', () => {
  test('groups entries by meal and shows progress against the goal', async () => {
    mockFetch([
      { path: '/api/food-entries', body: list(ENTRIES) },
      { path: '/api/goals/current', body: { id: 1, calorieGoal: 2000, effectiveFrom: DAY } },
    ]);
    renderPage();

    const breakfast = await screen.findByRole('region', { name: 'breakfast' });
    expect(within(breakfast).getByText('400 kcal')).toBeInTheDocument();
    expect(within(breakfast).getByText(/Oatmeal/)).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'dinner' })).getByText('Nothing logged.'),
    ).toBeInTheDocument();

    const bar = await screen.findByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '1000');
    expect(bar).toHaveAttribute('aria-valuetext', '1000 of 2000 (50%)');
  });

  test('a 404 from /goals/current means "no goal yet", not an error', async () => {
    mockFetch([
      { path: '/api/food-entries', body: list([]) },
      { path: '/api/goals/current', status: 404, body: apiError('NOT_FOUND', 'Goal not found') },
    ]);
    renderPage();

    expect(await screen.findByText(/No goal set for this day/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set a goal' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('shows a server error with a retry button that loads again', async () => {
    const fetchMock = mockFetch([
      { path: '/api/food-entries', status: 500, body: apiError('INTERNAL', 'Server exploded') },
      { path: '/api/food-entries', body: list(ENTRIES) },
      { path: '/api/goals/current', body: { id: 1, calorieGoal: 2000, effectiveFrom: DAY } },
    ]);
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Server exploded');
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('region', { name: 'lunch' })).toBeInTheDocument();
    expect(fetchMock.calls.filter((c) => c.path === '/api/food-entries')).toHaveLength(2);
    expect(fetchMock.calls[0].query).toMatchObject({ from: DAY, to: DAY });
  });

  test('shows the server error next to the calories field when adding food', async () => {
    mockFetch([
      { path: '/api/food-entries', body: list([]) },
      { path: '/api/goals/current', status: 404, body: apiError('NOT_FOUND', 'Goal not found') },
      {
        method: 'POST',
        path: '/api/food-entries',
        status: 422,
        body: apiError('VALIDATION_ERROR', 'Invalid request body', [
          { field: 'calories', message: 'Calories are required' },
        ]),
      },
    ]);
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText('Food'), 'Apple');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText('Calories are required')).toBeInTheDocument();
    expect(screen.getByLabelText('Calories')).toHaveAttribute('aria-invalid', 'true');
  });
});
