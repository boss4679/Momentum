// ESLint flat config for the whole repo. The server is CommonJS on Node; the client is
// ES modules + JSX in the browser. Each gets its own block below.
const js = require('@eslint/js');
const globals = require('globals');
const reactHooks = require('eslint-plugin-react-hooks');

module.exports = [
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
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
  {
    files: ['client/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
  // The rules of hooks (only call hooks at the top level of a component) and
  // exhaustive-deps (effects list everything they use), which catch real React bugs.
  { files: ['client/**/*.{js,jsx}'], ...reactHooks.configs.flat.recommended },
  {
    // vite.config.js runs in Node, not the browser.
    files: ['client/vite.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['client/src/**/*.test.{js,jsx}', 'client/src/test/**'],
    languageOptions: { globals: { ...globals.node } },
  },
];
