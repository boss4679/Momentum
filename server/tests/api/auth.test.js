const request = require('supertest');
const app = require('../../src/app');
const { pool, resetDb, closeDb } = require('../helpers/db');
const { registerUser } = require('../helpers/auth');

beforeAll(resetDb);
afterAll(closeDb);

const newUser = { email: 'Ada@Example.com', password: 'correct-horse-battery' };

describe('POST /api/auth/register', () => {
  test('201: creates the user and returns it with a token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...newUser, timezone: 'Europe/London' });

    expect(res.status).toBe(201);
    expect(res.body.user).toEqual({
      id: expect.any(Number),
      email: 'ada@example.com', // trimmed and lower-cased
      timezone: 'Europe/London',
      createdAt: expect.any(String),
    });
    expect(res.body.token).toEqual(expect.any(String));
  });

  test('never returns or stores the plain password', async () => {
    const { user, password } = await registerUser();
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [user.id]);

    expect(user).not.toHaveProperty('passwordHash');
    expect(rows[0].password_hash).not.toBe(password);
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$/); // bcrypt hash format
  });

  test('timezone defaults to UTC', async () => {
    const { user } = await registerUser();
    expect(user.timezone).toBe('UTC');
  });

  test('409: duplicate email, compared case-insensitively', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...newUser, email: '  ADA@example.COM ' });

    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      code: 'CONFLICT',
      message: 'An account with this email already exists',
      details: [{ field: 'email', message: 'An account with this email already exists' }],
    });
  });

  test('422: invalid fields, each reported against its field', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'short', timezone: 'Mars/Olympus_Mons' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const fields = res.body.error.details.map((d) => d.field);
    expect(fields).toEqual(['email', 'password', 'timezone']);
  });

  test('422: missing fields', async () => {
    const res = await request(app).post('/api/auth/register').send({});

    expect(res.status).toBe(422);
    expect(res.body.error.details).toEqual([
      { field: 'email', message: 'Email is required' },
      { field: 'password', message: 'Password is required' },
    ]);
  });

  test("422: password over bcrypt's 72-byte limit", async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'long@example.com', password: 'a'.repeat(73) });

    expect(res.status).toBe(422);
    expect(res.body.error.details[0].field).toBe('password');
  });

  test('400: malformed JSON', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send('{"email": "a@b.com",');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MALFORMED_JSON');
  });
});

describe('POST /api/auth/login', () => {
  let registered;
  beforeAll(async () => {
    registered = await registerUser({ email: 'login@example.com' });
  });

  test('200: correct credentials return the user and a token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'LOGIN@example.com', password: registered.password });

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual(registered.user);
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body.token).toEqual(expect.any(String));
  });

  test('401: wrong password and unknown email give the same response', async () => {
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'wrong-password' });
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong-password' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    // Identical bodies: the response must not reveal which emails are registered.
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.error.message).toBe('Invalid email or password');
  });

  test('422: missing password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'login@example.com' });

    expect(res.status).toBe(422);
    expect(res.body.error.details[0].field).toBe('password');
  });

  test('400: malformed JSON', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('not json');

    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/me', () => {
  test('200: returns the user the token belongs to', async () => {
    const { user, auth } = await registerUser();
    const res = await request(app)
      .get('/api/auth/me')
      .set(...auth);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user });
  });

  test('a token from login works the same as one from register', async () => {
    const { user, password } = await registerUser();
    const login = await request(app).post('/api/auth/login').send({ email: user.email, password });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`);

    expect(res.body.user.id).toBe(user.id);
  });

  test('401: no token', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('401: valid token for an account that has been deleted', async () => {
    const { user, auth } = await registerUser();
    await pool.query('DELETE FROM users WHERE id = $1', [user.id]);

    const res = await request(app)
      .get('/api/auth/me')
      .set(...auth);

    expect(res.status).toBe(401);
  });
});
