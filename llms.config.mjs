// llms-kit config. Everything not set here falls back to DEFAULTS in
// scripts/lib/config.mjs (arrays replace wholesale, so we only override exclude).
//
// TIPS is an internal-only section (see app/tips/flag.ts). The public build
// leaves NEXT_PUBLIC_ENABLE_TIPS unset, so /tips must not appear in the
// generated llms.txt / llms-full.txt / AGENTS.md. Regenerate these with the
// flag set the way the target deployment builds: unset for the committed public
// artifacts, =1 in the internal build if it regenerates its own.
export default {
  exclude: process.env.NEXT_PUBLIC_ENABLE_TIPS === '1' ? [] : ['/tips', '/tips/**'],
};
