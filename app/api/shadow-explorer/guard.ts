import { SHADOW_EXPLORER_ENABLED } from '../../shadow-explorer/flag';

// Returns a 404 Response when Shadow Explorer is disabled (the public/Vercel
// build), else null. Call at the top of every Shadow Explorer API route so the
// section is fully absent from the public deployment — not just hidden in the
// UI — and its existence isn't leaked via 500s from missing configuration.
export function shadowExplorerDisabledResponse(): Response | null {
  return SHADOW_EXPLORER_ENABLED ? null : Response.json({ error: 'Not found' }, { status: 404 });
}
