const bcrypt = require('bcrypt');
const config = require('../config');
const pool = require('../db/pool');
const { withTransaction } = require('../db/transaction');
const { signToken } = require('../auth/tokens');
const { unauthorized } = require('../errors/AppError');
const users = require('../db/queries/users');
const exercises = require('../db/queries/exercises');
const STARTER_EXERCISES = require('../db/starterExercises');

// A real bcrypt hash (of a random string, at the same cost) used when the email isn't
// registered, so a login with an unknown email takes as long as one with a wrong password.
// Without it, a fast response would reveal "this email has no account".
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', config.bcryptRounds);

async function register(req, res) {
  const { email, password, timezone } = req.validated.body;
  // Hash before opening the transaction: hashing is deliberately slow (~50-100ms), and there's
  // no reason to hold a database connection while it runs.
  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);

  // No "SELECT first to check the email is free": two simultaneous sign-ups could both pass
  // that check. The UNIQUE constraint is the real guard; its 23505 error becomes a 409 in
  // the error handler. The user and their starter exercises are created together or not at all.
  const user = await withTransaction(async (client) => {
    const created = await users.createUser(client, { email, passwordHash, timezone });
    await exercises.createExercises(client, created.id, STARTER_EXERCISES);
    return created;
  });

  res.status(201).json({ user, token: signToken(user.id) });
}

async function login(req, res) {
  const { email, password } = req.validated.body;
  const found = await users.findUserWithHashByEmail(pool, email);

  const passwordMatches = await bcrypt.compare(password, found ? found.passwordHash : DUMMY_HASH);

  // One message for "no such email" and "wrong password", so the API can't be used to find
  // out which emails have accounts.
  if (!found || !passwordMatches) {
    throw unauthorized('Invalid email or password');
  }

  // Take the hash out before responding; the rest is the public user.
  const { passwordHash, ...user } = found;
  res.json({ user, token: signToken(user.id) });
}

async function me(req, res) {
  const user = await users.findUserById(pool, req.user.id);
  // The token is valid, but the account behind it no longer exists.
  if (!user) {
    throw unauthorized('Account no longer exists');
  }
  res.json({ user });
}

module.exports = { register, login, me };
