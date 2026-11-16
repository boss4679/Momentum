import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { useApiData } from './useApiData';

// A promise we resolve by hand, to control the order responses arrive in.
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('useApiData', () => {
  test('goes loading -> success, and reload() fetches again', async () => {
    const load = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');
    const { result } = renderHook(() => useApiData(load, []));

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toBe('first');

    act(() => result.current.reload());
    // While reloading, the previous data stays available so the page doesn't flash.
    expect(result.current).toMatchObject({ status: 'loading', data: 'first' });
    await waitFor(() => expect(result.current.data).toBe('second'));
  });

  test('reports errors', async () => {
    const error = new Error('boom');
    const { result } = renderHook(() => useApiData(() => Promise.reject(error), []));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe(error);
  });

  test('ignores a slow response for an outdated request', async () => {
    const responses = { A: deferred(), B: deferred() };
    const { result, rerender } = renderHook(
      ({ day }) => useApiData(() => responses[day].promise, [day]),
      {
        initialProps: { day: 'A' },
      },
    );

    rerender({ day: 'B' }); // the user moves to day B before day A has loaded
    await act(async () => responses.B.resolve('data for B'));
    await act(async () => responses.A.resolve('data for A')); // A's answer arrives late

    expect(result.current).toMatchObject({ status: 'success', data: 'data for B' });
  });
});
