import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

// React component/hook behavioural tests run under Vitest + jsdom.
// Pure-logic suites (`tests/**/*.test.js`) keep running on `node:test`
// via `npm run test:logic`, so nothing existing is rewritten.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.jsx'],
    setupFiles: ['tests/support/setup.js'],
    restoreMocks: true,
  },
})
