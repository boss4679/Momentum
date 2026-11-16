// Tests run against a real Postgres database (momentum_test), not mocks. Constraints,
// transactions and SQL behaviour are what's being tested, and a mock can't check those.
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  // Brings the test database's schema up to date once, before any test file runs.
  globalSetup: '<rootDir>/tests/globalSetup.js',
  collectCoverageFrom: ['src/**/*.js', '!src/server.js'],
  coverageReporters: ['text', 'html', 'lcov'],
};
