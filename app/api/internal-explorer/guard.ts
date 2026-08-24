import { EXPLORER_ENABLED } from '../../internal-explorer/flag';

// Returns a 404 Response when Internal Explorer is disabled (the public/Vercel
// build), else null. Call at the top of every Internal Explorer API route so
// the section is fully absent from the public deployment — not just hidden in
// the UI — and its existence isn't leaked via 500s from missing credentials.
export function explorerDisabledResponse(): Response | null {
  return EXPLORER_ENABLED ? null : Response.json({ error: 'Not found' }, { status: 404 });
}
