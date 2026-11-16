const request = require('supertest');
const app = require('../../src/app');

let counter = 0;

// Registers a fresh user through the real API and returns { user, token, auth }.
// `auth` is the header pair to spread into Supertest: .set(...auth).
// Each call gets a unique email, so tests can create as many users as they need.
async function registerUser(overrides = {}) {
  counter += 1;
  const body = {
    email: `user${counter}@example.com`,
    password: 'correct-horse-battery',
    ...overrides,
  };
  const res = await request(app).post('/api/auth/register').send(body);
  if (res.status !== 201) {
    throw new Error(`registerUser failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return {
    user: res.body.user,
    token: res.body.token,
    password: body.password,
    auth: ['Authorization', `Bearer ${res.body.token}`],
  };
}

module.exports = { registerUser };
