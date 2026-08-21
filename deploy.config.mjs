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
//   npm run build:internal   -> internal (separate internal deployment)
//
// Authored as .mjs so both the TypeScript app and the plain-node scripts
// (scripts/llms.mjs, llms.config.mjs) can import it.
//
// The target is fixed for a given build, so a disabled surface is unreachable in
// it: middleware 404s its routes, its API guard 404s, and it is dropped from the
// nav, sitemap, and generated llms artifacts. Note this is a reachability
// guarantee, not a bundling one — the surface's client chunks may still be
// emitted (this repo is public, so that is not a disclosure concern).

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
  // No apiPrefixes: the benchmark UI calls the report API straight from the
  // browser (NEXT_PUBLIC_BENCHMARK_API_BASE_URL) instead of proxying through a
  // route handler here, so this app serves no /api path for it.
  benchmark: {
    routePrefixes: ['/benchmark'],
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
