// The one place the frontend talks HTTP. Every API call goes through request(), which:
// - prefixes /api (the Vite dev server proxies it to Express)
// - sends and parses JSON
// - attaches the Bearer token when there is one
// - turns the API's error shape { error: { code, message, details } } into an ApiError
// - on a 401 for a request that carried a token, tells the app the session is over
import { tokenStore } from '../auth/tokenStore';

export class ApiError extends Error {
  constructor(status, code, message, details = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  // { "sets.1.reps": "Must be at least 1", ... }: forms look up their inputs by name.
  // If a field has several problems, the first one is shown.
  fieldErrors() {
    const errors = {};
    for (const detail of this.details) {
      if (detail.field && !(detail.field in errors)) {
        errors[detail.field] = detail.message;
      }
    }
    return errors;
  }
}

// The auth layer registers what to do when the server rejects our token. It's a callback,
// rather than the client importing the router, to keep this module free of React.
let handleUnauthorized = () => {};
export function onUnauthorized(handler) {
  handleUnauthorized = handler;
}

// { from: '2026-03-01', limit: 20, meal: undefined } -> '?from=2026-03-01&limit=20'.
// Missing values are left out instead of being sent as "undefined".
function toQueryString(query = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

export async function request(path, { method = 'GET', body, query } = {}) {
  const token = tokenStore.get();
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`/api${path}${toQueryString(query)}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // fetch only rejects when no response arrived at all (server down, offline).
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Is it running?');
  }

  if (response.status === 204) return null;

  // An error page from a proxy may not be JSON, so parsing can fail.
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = data?.error ?? {
      code: 'HTTP_ERROR',
      message: `Request failed with status ${response.status}`,
      details: [],
    };
    // Only a request that SENT a token means "your session ended". A 401 from the login
    // form (wrong password) is an ordinary error for that form to show.
    if (response.status === 401 && token) {
      handleUnauthorized();
    }
    throw new ApiError(response.status, error.code, error.message, error.details ?? []);
  }

  return data;
}
