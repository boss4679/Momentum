const { AppError } = require('../errors/AppError');

// Mounted after every route: a request that reaches it matched nothing. Throwing (rather
// than responding here) sends it through the error handler, so even unknown URLs get the
// standard error shape.
function notFound(req) {
  throw new AppError(404, 'NOT_FOUND', `No route for ${req.method} ${req.path}`);
}

module.exports = notFound;
