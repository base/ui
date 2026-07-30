// Build-time flag gating the TIPS section.
//
// TIPS is internal-only. The public (Vercel) build leaves NEXT_PUBLIC_ENABLE_TIPS
// unset, so TIPS is absent: no sidebar entry, the /tips route and its API 404,
// and it's kept out of the sitemap and the generated llms/agents artifacts. The
// internal Coinbase build (cb/ui Dockerfile.ui) sets NEXT_PUBLIC_ENABLE_TIPS=1
// at `next build` time to include it.
//
// NEXT_PUBLIC_* is inlined at build, so this is a compile-time constant, not a
// runtime toggle — when it is off, the TIPS code paths are dead-code-eliminated
// and cannot be reached in the built artifact.
export const TIPS_ENABLED = process.env.NEXT_PUBLIC_ENABLE_TIPS === '1';
