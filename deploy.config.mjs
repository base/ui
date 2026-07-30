// Deployment matrix: which surfaces (sections) ship to which build target.
//
// The same public repo builds two deployables. A single build-time selector,
// NEXT_PUBLIC_DEPLOY_TARGET, says which one this build is; this file declares,
// per surface, which targets include it. Consumers (nav, middleware, the llms
// generator, per-section guards) all read this one table instead of their own
// flags.
//
// Selected via the build script, not hand-set env:
//   npm run build            -> external (default; public Vercel site)
//   npm run build:internal   -> internal (Coinbase EKS via cb/ui)
//
// Authored as .mjs so both the TypeScript app and the plain-node scripts
// (scripts/llms.mjs, llms.config.mjs) can import it. NEXT_PUBLIC_DEPLOY_TARGET
// is inlined at `next build`, so surfaceEnabled() is a compile-time constant in
// bundled code — a disabled surface's code is dead-code-eliminated, not just
// hidden.

/** @typedef {'external' | 'internal'} DeployTarget */

/** @type {DeployTarget} */
export const TARGET = process.env.NEXT_PUBLIC_DEPLOY_TARGET === 'internal' ? 'internal' : 'external';

// Surfaces that are NOT available everywhere. A section absent from this map
// ships to every target. `routePrefixes` are UI paths; `apiPrefixes` are the
// section's API paths (documented here and enforced by the section's API guard).
export const SURFACES = {
  tips: {
    routePrefixes: ['/tips'],
    apiPrefixes: ['/api/tips'],
    targets: ['internal'],
  },
};

/** Is a surface included in the current build target? Unknown key => yes. */
export function surfaceEnabled(key) {
  const surface = SURFACES[key];
  return !surface || surface.targets.includes(TARGET);
}

function disabledSurfaces() {
  return Object.values(SURFACES).filter((s) => !s.targets.includes(TARGET));
}

/** UI path prefixes to 404 in this build (consumed by middleware). */
export function disabledRoutePrefixes() {
  return disabledSurfaces().flatMap((s) => s.routePrefixes ?? []);
}

/** API path prefixes disabled in this build (documented; per-route guards enforce). */
export function disabledApiPrefixes() {
  return disabledSurfaces().flatMap((s) => s.apiPrefixes ?? []);
}

/** Glob patterns for the llms/agents generator's `exclude` (path + subtree). */
export function disabledRouteGlobs() {
  return disabledRoutePrefixes().flatMap((p) => [p, `${p}/**`]);
}
