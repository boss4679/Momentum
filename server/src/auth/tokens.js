// Creates and checks JWT access tokens. A JWT is base64 JSON (header.payload.signature):
// anyone can read the payload, but only the holder of JWT_SECRET can produce a valid
// signature. So the payload holds only the user id, nothing secret.
const jwt = require('jsonwebtoken');
const config = require('../config');

function signToken(userId) {
  return jwt.sign({ userId }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
    algorithm: 'HS256',
  });
}

// Throws if the token is expired, malformed or has a bad signature.
// The token's header names its own algorithm, and attackers can set it (e.g. "none" for an
// unsigned token). Listing the one algorithm we issue means anything else is rejected.
// jsonwebtoken v9 already refuses "none" by default; the explicit list keeps that true
// regardless of library defaults.
function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
}

module.exports = { signToken, verifyToken };
