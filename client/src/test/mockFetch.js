// Replaces global fetch with a fake that answers from a list of routes, so component tests
// exercise the real API client (headers, error parsing, 401 handling) without a server.
//
//   const fetchMock = mockFetch([
//     { method: 'POST', path: '/api/auth/login', status: 401, body: { error: {...} } },
//   ]);
//   ...
//   expect(fetchMock.calls[0].body).toEqual({ email: 'a@b.co', password: 'x' });
//
// A route matches on method + path (the query string is ignored). If several routes
// match, the first unused one wins, so the same endpoint can answer differently on a
// second call. A request with no matching route fails the test loudly.
import { vi } from 'vitest';

export function mockFetch(routes) {
  const used = new Set();
  const calls = [];

  const fake = vi.fn(async (url, options = {}) => {
    const method = options.method ?? 'GET';
    const [path, query = ''] = url.split('?');
    const call = {
      method,
      path,
      query: Object.fromEntries(new URLSearchParams(query)),
      headers: options.headers ?? {},
      body: options.body ? JSON.parse(options.body) : undefined,
    };
    calls.push(call);

    const candidates = routes.filter((r) => (r.method ?? 'GET') === method && r.path === path);
    const route = candidates.find((r) => !used.has(r)) ?? candidates.at(-1);
    if (!route) throw new Error(`mockFetch: no route for ${method} ${path}`);
    used.add(route);

    const status = route.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(route.body ?? {}), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  vi.stubGlobal('fetch', fake);
  return { calls };
}

// Builds the API's error body: { error: { code, message, details } }.
export function apiError(code, message, details = []) {
  return { error: { code, message, details } };
}
