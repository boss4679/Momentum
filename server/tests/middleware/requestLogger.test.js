const express = require('express');
const request = require('supertest');
const requestLogger = require('../../src/middleware/requestLogger');

describe('requestLogger', () => {
  test('logs method, URL, final status and duration once the response finishes', async () => {
    const app = express();
    app.use(requestLogger);
    app.get('/thing', (req, res) => res.status(201).end());

    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await request(app).get('/thing?x=1');

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatch(/^GET \/thing\?x=1 201 \d+\.\dms$/);
    spy.mockRestore();
  });
});
