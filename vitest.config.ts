import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Mirror the `@aa` path alias from tsconfig.json (vendored EIP-8130 viem build).
    alias: { '@aa': path.resolve(__dirname, 'vendor/aa/index.js') },
  },
  test: {
    globals: true,
    environment: 'node',
  },
});
