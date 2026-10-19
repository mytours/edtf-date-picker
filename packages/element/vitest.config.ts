import { fileURLToPath } from 'node:url'
import { playwright } from '@vitest/browser-playwright'
import { defineProject } from 'vitest/config'

// Runs in real Chromium: happy-dom and jsdom have no ElementInternals
export default defineProject({
  resolve: {
    // Test against core's source, not its last build
    alias: { 'edtf-input-core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)) },
  },
  optimizeDeps: {
    // edtf.js names node types after its classes, and pre-bundling renames
    // `class Date` (it shadows the global) to Date$1, which breaks
    // edtf-humanize. Keep the names.
    rolldownOptions: { output: { keepNames: true } },
  },
  test: {
    name: 'element',
    include: ['test/**/*.test.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
  },
})
