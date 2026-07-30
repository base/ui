import { TIPS_ENABLED } from '../../tips/flag';

// Returns a 404 Response when TIPS is disabled (the public/Vercel build), else
// null. Call at the top of every TIPS API route so the section is fully absent
// from the public deployment — not just hidden in the UI — and its existence
// isn't leaked via 500s from missing credentials.
export function tipsDisabledResponse(): Response | null {
  return TIPS_ENABLED ? null : Response.json({ error: 'Not found' }, { status: 404 });
}
