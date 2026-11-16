import { afterEach, describe, expect, test, vi } from 'vitest';
import { ApiError, onUnauthorized, request } from './client';
import { tokenStore } from '../auth/tokenStore';
import { apiError, mockFetch } from '../test/mockFetch';

afterEach(() => {
  tokenStore.clear();
  onUnauthorized(() => {});
});

describe('request', () => {
  test('sends JSON with the bearer token and returns the parsed body', async () => {
    tokenStore.set('abc.def.ghi');
    const fetchMock = mockFetch([{ method: 'POST', path: '/api/things', body: { id: 1 } }]);

    const result = await request('/things', { method: 'POST', body: { name: 'x' } });

    expect(result).toEqual({ id: 1 });
    expect(fetchMock.calls[0].headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer abc.def.ghi',
    });
    expect(fetchMock.calls[0].body).toEqual({ name: 'x' });
  });

  test('leaves empty query values out of the URL', async () => {
    const fetchMock = mockFetch([{ path: '/api/things', body: {} }]);
    await request('/things', { query: { from: '2026-03-01', meal: undefined, to: '' } });
    expect(fetchMock.calls[0].query).toEqual({ from: '2026-03-01' });
  });

  test('returns null for 204 No Content', async () => {
    mockFetch([{ method: 'DELETE', path: '/api/things/1', status: 204 }]);
    await expect(request('/things/1', { method: 'DELETE' })).resolves.toBeNull();
  });

  test('turns the API error shape into an ApiError with per-field messages', async () => {
    mockFetch([
      {
        method: 'POST',
        path: '/api/things',
        status: 422,
        body: apiError('VALIDATION_ERROR', 'Invalid request body', [
          { field: 'sets.1.reps', message: 'Must be at least 1' },
          { field: 'sets.1.reps', message: 'A second problem with the same field' },
          { field: 'name', message: 'Name is required' },
        ]),
      },
    ]);

    const error = await request('/things', { method: 'POST', body: {} }).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });
    expect(error.fieldErrors()).toEqual({
      'sets.1.reps': 'Must be at least 1',
      name: 'Name is required',
    });
  });

  test('a 401 on a request that carried a token ends the session', async () => {
    tokenStore.set('expired-token');
    const handler = vi.fn();
    onUnauthorized(handler);
    mockFetch([{ path: '/api/things', status: 401, body: apiError('UNAUTHORIZED', 'Expired') }]);

    await expect(request('/things')).rejects.toMatchObject({ status: 401 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('a 401 without a token (wrong password) is just an error for the form', async () => {
    const handler = vi.fn();
    onUnauthorized(handler);
    mockFetch([
      {
        method: 'POST',
        path: '/api/auth/login',
        status: 401,
        body: apiError('INVALID_CREDENTIALS', 'Invalid email or password'),
      },
    ]);

    await expect(request('/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({
      message: 'Invalid email or password',
    });
    expect(handler).not.toHaveBeenCalled();
  });

  test('reports a network failure as a readable ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(request('/things')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      status: 0,
    });
  });
});
