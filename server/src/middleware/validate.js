// validate({ body, query, params }) builds a middleware that checks the request against
// Zod schemas declared once per resource in src/schemas/.
//
// Status codes differ on purpose:
// - params/query wrong -> 400: the URL itself is malformed (e.g. ?limit=abc, /workouts/xyz)
// - body wrong         -> 422: the request was well-formed JSON, but the values break the rules
//
// Parsed values (with coercions applied: ?limit=10 becomes the number 10, and unknown keys
// are rejected) go on req.validated, so controllers only ever see checked data.
// They can't be written back to req.query, because in Express 5 req.query is a read-only getter.
const { badRequest, validationError } = require('../errors/AppError');

// Zod issue -> { field, message }. The path is joined with dots, so a nested field reads
// like "sets.2.reps", which the frontend can match to a form input.
function toDetails(issues) {
  return issues.map((issue) => ({
    field: issue.path.join('.') || (issue.keys ? issue.keys.join(', ') : ''),
    message: issue.message,
  }));
}

function validate(schemas) {
  return function validateRequest(req, res, next) {
    req.validated = {};

    for (const part of ['params', 'query']) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(req[part]);
      if (!result.success) {
        throw badRequest(
          `Invalid ${part === 'params' ? 'URL parameter' : 'query parameter'}`,
          toDetails(result.error.issues),
        );
      }
      req.validated[part] = result.data;
    }

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        throw validationError('Validation failed', toDetails(result.error.issues));
      }
      req.validated.body = result.data;
    }

    next();
  };
}

module.exports = validate;
