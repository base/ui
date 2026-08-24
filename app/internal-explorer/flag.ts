// Whether Internal Explorer is included in this build. Derived from the
// deployment matrix (deploy.config.mjs) — it ships to the internal target
// only. Consumers import this named constant; the matrix is the source of truth.
//
// The target is fixed for a given build, so when the section is disabled it is
// unreachable in that build: the nav entry is dropped, middleware 404s the
// routes below, and the API routes 404 via app/api/internal-explorer/guard.ts.
import { surfaceEnabled } from '../../deploy.config.mjs';

export const TIPS_ENABLED: boolean = surfaceEnabled('tips');

/** User-facing name. */
export const TIPS_LABEL = 'Internal Explorer';

/** User-facing UI path. */
export const TIPS_PATH = '/internal-explorer';

/** User-facing API path. */
export const TIPS_API_PATH = '/api/internal-explorer';
