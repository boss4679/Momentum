import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server proxies /api to the Express backend, so the frontend always calls
// same-origin relative URLs and the API needs no CORS setup. Docker Compose points
// the proxy at the `api` service; running locally it defaults to localhost:4000.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': process.env.API_PROXY_TARGET || 'http://localhost:4000',
    },
  },
  // Vitest reads its settings from here too, so tests use the same plugins as the app.
  test: {
    // jsdom is a browser DOM implemented in Node, so components can render without a browser.
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    // Undo vi.spyOn()/vi.fn() mocks after each test, so one test's mocks can't leak into the next.
    restoreMocks: true,
    unstubGlobals: true, // undo vi.stubGlobal('fetch', ...) after each test
    // Run tests in a timezone that isn't UTC and has daylight saving, so date code that
    // accidentally assumes UTC fails here instead of only for real users.
    env: { TZ: 'America/New_York' },
  },
});
