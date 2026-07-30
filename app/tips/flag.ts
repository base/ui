// Whether the TIPS section is included in this build. Derived from the
// deployment matrix (deploy.config.mjs) — TIPS ships to the internal target
// only. Consumers import this named constant; the matrix is the source of truth.
//
// The target is fixed for a given build, so when TIPS is disabled it is
// unreachable in that build: the nav entry is dropped, middleware 404s /tips and
// its subtree, and the API routes 404 via app/api/tips/guard.ts.
import { surfaceEnabled } from '../../deploy.config.mjs';

export const TIPS_ENABLED: boolean = surfaceEnabled('tips');
