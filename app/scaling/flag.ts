// Whether the Scaling scorecard is included in this build. Derived from the
// deployment matrix (deploy.config.mjs) — it ships to the internal target only.
// When disabled, middleware 404s /scaling, the layout notFound()s, and the nav
// entry is dropped. There is no API to guard: the page reads its snapshot
// server-side.
import { surfaceEnabled } from '../../deploy.config.mjs';

export const SCALING_ENABLED: boolean = surfaceEnabled('scaling');
