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

const config = {
  nodeEnv,
  port: Number(process.env.PORT || 4000),
  // Tests get their own database so a test run can never wipe your dev data.
  databaseUrl: nodeEnv === 'test' ? required('TEST_DATABASE_URL') : required('DATABASE_URL'),
};

module.exports = config;
