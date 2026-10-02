// Builds the self-contained AA vendor bundle from the sibling viem checkout.
//
// Prereqs:
//   - ../viem checked out on branch feat/aa-tx-split
//   - its dependencies installed: (cd ../viem && pnpm install) — the entry
//     bundles the TypeScript sources directly, so no viem build is needed
//
// Run:  bun run vendor/aa/build.mjs
//
// Output: vendor/aa/index.js  (ESM, no external deps — ox/@noble inlined)

import { fileURLToPath } from 'node:url'

const dir = fileURLToPath(new URL('.', import.meta.url))

const result = await Bun.build({
  entrypoints: [`${dir}entry.mjs`],
  outdir: dir,
  naming: 'index.js',
  format: 'esm',
  target: 'browser',
  minify: false,
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

console.log('[aa] bundled ->', `${dir}index.js`)
for (const out of result.outputs)
  console.log('[aa]   ', out.path, `${(out.size / 1024) | 0} KB`)
