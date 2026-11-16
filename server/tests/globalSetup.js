// Runs once before the whole test run: applies any pending migrations to the TEST database,
// so the tests always run against the current schema. (`npm test` sets NODE_ENV=test,
// which makes config.js pick TEST_DATABASE_URL.)
const { migrate } = require('../scripts/migrate');

module.exports = async function globalSetup() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Refusing to run tests: NODE_ENV must be "test" (use `npm test`).');
  }
  await migrate('up', Infinity);
};
