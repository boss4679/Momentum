// The single place where errors become HTTP responses. Every route passes errors here
// (Express 5 forwards errors thrown in async handlers automatically), so every error
// response has the same shape:
//   { "error": { "code": "...", "message": "...", "details": [...] } }
const { AppError } = require('../errors/AppError');
const { mapPgError } = require('../errors/pgErrors');

function toAppError(err) {
  if (err instanceof AppError) return err;

  // express.json() could not parse the body. The request itself is malformed (400),
  // unlike well-formed JSON with invalid values (422).
  if (err.type === 'entity.parse.failed') {
    return new AppError(400, 'MALFORMED_JSON', 'Request body is not valid JSON');
  }
  if (err.type === 'entity.too.large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  }

  return mapPgError(err);
}

// Express recognises error-handling middleware by its four arguments, so `_next` has to
// stay even though it's unused (the leading _ tells ESLint that's intentional).
function errorHandler(err, req, res, _next) {
  const appError = toAppError(err);

  if (!appError) {
    // An unexpected error is a bug. Log the full detail on the server, but send the client a
    // generic message: stack traces and SQL errors can leak internals.
    console.error(err);
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', details: [] },
    });
  }

  return res.status(appError.status).json({
    error: { code: appError.code, message: appError.message, details: appError.details },
  });
}

module.exports = errorHandler;
