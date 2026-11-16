// An error the API raises on purpose, carrying everything the error handler needs to build
// the response: { error: { code, message, details } }. Any other error that reaches the
// handler is treated as an unexpected bug (500).
class AppError extends Error {
  constructor(status, code, message, details = []) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Factories for the statuses the API uses, so call sites read as intent:
// `throw notFound('Workout')` instead of `throw new AppError(404, 'NOT_FOUND', ...)`.
const badRequest = (message, details) => new AppError(400, 'BAD_REQUEST', message, details);
const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'UNAUTHORIZED', message);
const notFound = (resource = 'Resource') => new AppError(404, 'NOT_FOUND', `${resource} not found`);
const conflict = (message, details) => new AppError(409, 'CONFLICT', message, details);
const validationError = (message, details) =>
  new AppError(422, 'VALIDATION_ERROR', message, details);

module.exports = { AppError, badRequest, unauthorized, notFound, conflict, validationError };
