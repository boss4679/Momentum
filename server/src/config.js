// Reads environment variables in one place so the rest of the code never touches
// process.env directly, and a missing variable fails at startup instead of mid-request.
const fs = require('node:fs');
const path = require('node:path');

// Locally, settings come from server/.env. In Docker and CI they come from real
// environment variables, and loadEnvFile never overrides variables that are already set.
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isTest = nodeEnv === 'test';

const config = {
  nodeEnv,
  isTest,
  port: Number(process.env.PORT || 4000),
  // Tests get their own database so a test run can never wipe your dev data.
  databaseUrl: isTest ? required('TEST_DATABASE_URL') : required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  // bcrypt's cost factor: each +1 doubles the time to hash. 10 takes ~50-100 ms, slow enough
  // to make brute-forcing stolen hashes expensive. Tests use the minimum (4) to stay fast;
  // they check behaviour, not hash strength.
  bcryptRounds: isTest ? 4 : Number(process.env.BCRYPT_ROUNDS || 10),
  // Per-request log lines are noise in test output.
  logRequests: !isTest,
};

module.exports = config;
