// Whether the TIPS section is included in this build. Derived from the
// deployment matrix (deploy.config.mjs) — TIPS ships to the internal target
// only. Consumers import this named constant; the matrix is the source of truth.
//
// NEXT_PUBLIC_DEPLOY_TARGET is inlined at `next build`, so this is a compile-time
// constant: when TIPS is disabled its code paths are dead-code-eliminated and
// cannot be reached in the built artifact.
import { surfaceEnabled } from '../../deploy.config.mjs';

export const TIPS_ENABLED: boolean = surfaceEnabled('tips');
