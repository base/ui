// llms-kit config. Everything not set here falls back to DEFAULTS in
// scripts/lib/config.mjs (arrays replace wholesale, so we only override exclude).
//
// Exclude any surface not shipped to this build target (deploy.config.mjs) from
// the generated llms.txt / llms-full.txt / AGENTS.md. For the committed public
// artifacts, generate with the default (external) target so internal-only
// sections like Internal Explorer don't appear.
import { disabledRouteGlobs } from './deploy.config.mjs';

export default {
  // Reflex is an easter egg reached from transaction popups, so keep it out of the indexes.
  exclude: [...disabledRouteGlobs(), '/vibenet/demos/reflex'],
};
