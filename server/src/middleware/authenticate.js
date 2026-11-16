// Protects a route: the request must carry `Authorization: Bearer <JWT>`. On success,
// req.user = { id } and every query downstream filters by req.user.id.
//
// It's stateless: the token's signature proves the server issued it, so there's no database
// lookup per request. The trade-off is that a token stays valid until it expires (1h by
// default) even if the account changes, which is why the expiry is kept short.
const { unauthorized } = require('../errors/AppError');
const { verifyToken } = require('../auth/tokens');

function authenticate(req, res, next) {
  const header = req.get('Authorization') || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw unauthorized('Missing or malformed Authorization header');
  }

  try {
    req.user = { id: verifyToken(token).userId };
  } catch {
    // Expired, tampered with, or signed with another secret. The client's fix is the same in
    // every case (log in again), so they all return the same 401.
    throw unauthorized('Invalid or expired token');
  }

  next();
}

module.exports = authenticate;
