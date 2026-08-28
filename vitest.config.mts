import path from 'node:path';

import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Mirror the `@aa` path alias from tsconfig.json (vendored EIP-8130 viem build).
    alias: { '@aa': path.resolve(__dirname, 'vendor/aa/index.js') },
  },
  test: {
    globals: true,
    environment: 'node',
    // Playwright owns e2e/*.spec.ts; vitest's default glob would otherwise
    // pick them up and fail on the Playwright-only `test()` fixture API.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
