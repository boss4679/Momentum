// ESLint flat config for the whole repo. The server is CommonJS on Node; the client
// (ES modules + JSX in the browser) gets its own block in milestone 5.
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', 'client/**'],
  },
  js.configs.recommended,
  {
    files: ['eslint.config.js', 'server/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      // Unused function args are common in Express (e.g. `next` in error handlers);
      // prefix them with _ to mark them as intentionally unused.
      //
      // ignoreRestSiblings: `const { passwordHash, ...user } = row` is the idiomatic way to
      // drop a field from an object, so the dropped name shouldn't count as unused.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
  {
    // Jest provides describe/test/expect/jest as globals inside test files.
    files: ['server/tests/**/*.js'],
    languageOptions: {
      globals: { ...globals.jest },
    },
  },
];
