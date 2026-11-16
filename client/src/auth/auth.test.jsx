// The login flow end to end inside the browser: route guard, login form, error display,
// redirect back, and the "session expired" path.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, test } from 'vitest';
import { AuthProvider } from './AuthContext';
import RequireAuth from './RequireAuth';
import { tokenStore } from './tokenStore';
import LoginPage from '../pages/LoginPage';
import { apiError, mockFetch } from '../test/mockFetch';

const USER = { id: 1, email: 'demo@momentum.dev', timezone: 'UTC', createdAt: '2026-01-01' };

function renderApp(startAt) {
  return render(
    <MemoryRouter initialEntries={[startAt]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/workouts" element={<h1>Workouts page</h1>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

afterEach(() => tokenStore.clear());

describe('authentication', () => {
  test('an anonymous visitor is sent to login, then back to the page they wanted', async () => {
    const fetchMock = mockFetch([
      { method: 'POST', path: '/api/auth/login', body: { user: USER, token: 'new-token' } },
    ]);
    const user = userEvent.setup();
    renderApp('/workouts');

    expect(screen.getByRole('heading', { name: 'Log in to Momentum' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Email'), 'demo@momentum.dev');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('heading', { name: 'Workouts page' })).toBeInTheDocument();
    expect(fetchMock.calls[0].body).toEqual({
      email: 'demo@momentum.dev',
      password: 'password123',
    });
    expect(tokenStore.get()).toBe('new-token');
  });

  test('shows validation errors from the API next to the matching field', async () => {
    mockFetch([
      {
        method: 'POST',
        path: '/api/auth/login',
        status: 422,
        body: apiError('VALIDATION_ERROR', 'Invalid request body', [
          { field: 'email', message: 'Must be a valid email address' },
        ]),
      },
    ]);
    const user = userEvent.setup();
    renderApp('/login');

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    const email = screen.getByLabelText('Email');
    expect(await screen.findByText('Must be a valid email address')).toBeInTheDocument();
    // The message is linked to the input, so screen readers announce it with the field.
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('Must be a valid email address');
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('aria-invalid');
  });

  test('shows a wrong-password error as a banner, not on a field', async () => {
    mockFetch([
      {
        method: 'POST',
        path: '/api/auth/login',
        status: 401,
        body: apiError('INVALID_CREDENTIALS', 'Invalid email or password'),
      },
    ]);
    const user = userEvent.setup();
    renderApp('/login');

    await user.type(screen.getByLabelText('Email'), 'demo@momentum.dev');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(screen.getByRole('heading', { name: 'Log in to Momentum' })).toBeInTheDocument();
  });

  test('a stored token that the server rejects sends the user to login with a notice', async () => {
    tokenStore.set('expired-token');
    mockFetch([
      { path: '/api/auth/me', status: 401, body: apiError('UNAUTHORIZED', 'Token expired') },
    ]);
    renderApp('/workouts');

    expect(screen.getByRole('status')).toHaveTextContent('Checking your session');
    expect(
      await screen.findByText('Your session has expired. Please log in again.'),
    ).toBeInTheDocument();
    expect(tokenStore.get()).toBeNull();
  });

  test('a valid stored token goes straight to the page', async () => {
    tokenStore.set('good-token');
    mockFetch([{ path: '/api/auth/me', body: { user: USER } }]);
    renderApp('/workouts');
    expect(await screen.findByRole('heading', { name: 'Workouts page' })).toBeInTheDocument();
  });
});
