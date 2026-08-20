// Whether the Shadow Explorer section is included in this build. Derived from
// the deployment matrix (deploy.config.mjs) — Shadow Explorer ships to the
// internal target only. Consumers import this named constant; the matrix is the
// source of truth.
//
// The target is fixed for a given build, so when disabled the section is
// unreachable: the nav entry is dropped, middleware 404s /shadow-explorer and
// its subtree, and the API routes 404 via app/api/shadow-explorer/guard.ts.
import { surfaceEnabled } from '../../deploy.config.mjs';

export const SHADOW_EXPLORER_ENABLED: boolean = surfaceEnabled('shadow-explorer');
