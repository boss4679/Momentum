const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const config = require('../../src/config');
const authenticate = require('../../src/middleware/authenticate');
const errorHandler = require('../../src/middleware/errorHandler');
const { signToken } = require('../../src/auth/tokens');

const app = express();
app.get('/protected', authenticate, (req, res) => res.json({ user: req.user }));
app.use(errorHandler);

describe('authenticate middleware', () => {
  test('valid token -> passes through with req.user set', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${signToken(42)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: { id: 42 } });
  });

  // Each of these must be a 401 with the standard error shape.
  const cases = [
    ['no Authorization header', undefined],
    ['wrong scheme', `Token ${signToken(42)}`],
    ['Bearer with no token', 'Bearer'],
    ['garbage token', 'Bearer not.a.jwt'],
    ['token signed with a different secret', `Bearer ${jwt.sign({ userId: 42 }, 'other-secret')}`],
    [
      'expired token',
      // exp is in seconds since the epoch; one minute ago means already expired.
      `Bearer ${jwt.sign({ userId: 42, exp: Math.floor(Date.now() / 1000) - 60 }, config.jwtSecret)}`,
    ],
    [
      // The classic JWT attack: claim alg "none" and send no signature.
      'unsigned token (alg: none)',
      `Bearer ${jwt.sign({ userId: 42 }, null, { algorithm: 'none' })}`,
    ],
  ];

  test.each(cases)('%s -> 401', async (_name, header) => {
    const req = request(app).get('/protected');
    if (header) req.set('Authorization', header);
    const res = await req;

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});
