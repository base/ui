#!/usr/bin/env node
// Validate a scaling scorecard snapshot file.
// Usage: npm run scaling:check -- /private/path/mainnet.json
import { readFileSync } from 'node:fs';

import { deriveBinding, parseSnapshot } from '../app/scaling/snapshot.mjs';

const file = process.argv[2];
if (!file) {
  console.error('usage: npm run scaling:check -- <snapshot.json>');
  process.exit(2);
}

const result = parseSnapshot(JSON.parse(readFileSync(file, 'utf8')));
if (!result.ok) {
  console.error(`${file}: invalid snapshot\n  ${result.errors.join('\n  ')}`);
  process.exit(1);
}

const { snapshot } = result;
const metrics = snapshot.sections.flatMap((s) => s.metrics);
const missing = metrics.filter((m) => m.value === null).length;
const binding = deriveBinding(snapshot.ceilings);
console.log(
  `${file}: valid — ${snapshot.network}, collected ${snapshot.collectedAt}, ` +
    `binding ceiling ${binding ? `${binding.area} ${binding.value} ${binding.unit}` : 'none'}, ` +
    `${snapshot.guardrails.length} guardrails, ${metrics.length} metrics (${missing} without a value), ${snapshot.work.length} work items`,
);
