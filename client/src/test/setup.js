// Runs before every test file.
import '@testing-library/jest-dom/vitest'; // adds matchers like toBeInTheDocument()
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Unmount whatever the previous test rendered, so tests can't see each other's DOM.
afterEach(() => {
  cleanup();
  localStorage.clear();
});
