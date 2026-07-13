// Lightweight validation toolkit used by every route.
//
// An `ApiError` carries an HTTP status + optional field-level details; the
// central error handler (index.js) turns it into a consistent JSON response.
// The `validate(body, rules)` helper coerces and checks a payload against a
// declarative rule set and throws a 422 ApiError listing every problem.

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// --- individual field checkers ------------------------------------------------
const checkers = {
  string({ value, min = 0, max = Infinity }) {
    if (typeof value !== 'string') return 'must be a string';
    const v = value.trim();
    if (v.length < min) return `must be at least ${min} character(s)`;
    if (v.length > max) return `must be at most ${max} character(s)`;
    return null;
  },
  number({ value, min = -Infinity, max = Infinity, integer = false }) {
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    if (typeof n !== 'number' || Number.isNaN(n)) return 'must be a number';
    if (integer && !Number.isInteger(n)) return 'must be an integer';
    if (n < min) return `must be >= ${min}`;
    if (n > max) return `must be <= ${max}`;
    return null;
  },
  date({ value }) {
    // Expect YYYY-MM-DD.
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'must be a date (YYYY-MM-DD)';
    if (Number.isNaN(Date.parse(value))) return 'is not a valid date';
    return null;
  },
  datetime({ value }) {
    // Accept ISO 8601 (with or without seconds/zone), as produced by <input type="datetime-local">.
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return 'must be a valid datetime';
    return null;
  },
  enum({ value, values }) {
    if (!values.includes(value)) return `must be one of: ${values.join(', ')}`;
    return null;
  },
};

// Coerce a raw value to the type the rule expects, so downstream code and SQL
// bindings receive proper JS numbers rather than numeric strings.
function coerce(type, value) {
  if (type === 'number' && typeof value === 'string' && value.trim() !== '') return Number(value);
  if (type === 'string' && typeof value === 'string') return value.trim();
  return value;
}

/**
 * Validate `body` against `rules` and return a cleaned object containing only
 * the declared keys. Throws ApiError(422) with per-field details on failure.
 *
 * Rule shape: { field: { type, required?, min?, max?, integer?, values?, default? } }
 */
export function validate(body, rules) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'Request body must be a JSON object');
  }

  const details = {};
  const clean = {};

  for (const [field, rule] of Object.entries(rules)) {
    const present = body[field] !== undefined && body[field] !== null && body[field] !== '';

    if (!present) {
      if (rule.required) {
        details[field] = 'is required';
      } else if ('default' in rule) {
        clean[field] = rule.default;
      }
      continue;
    }

    const error = checkers[rule.type]({ value: body[field], ...rule });
    if (error) {
      details[field] = error;
    } else {
      clean[field] = coerce(rule.type, body[field]);
    }
  }

  if (Object.keys(details).length > 0) {
    throw new ApiError(422, 'Validation failed', details);
  }
  return clean;
}

// Parse and validate a numeric :id route param.
export function parseId(raw, label = 'id') {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, `Invalid ${label}: must be a positive integer`);
  }
  return id;
}

// Wrap an async/sync route handler so thrown errors reach the error middleware.
export const asyncHandler = (fn) => (req, res, next) => {
  try {
    Promise.resolve(fn(req, res, next)).catch(next);
  } catch (err) {
    next(err);
  }
};
