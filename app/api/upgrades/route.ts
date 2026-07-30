import { buildUpgradesPayload } from '../../upgrades/library/publicApi';

// Public JSON view of the upgrades + changes data set. The source of truth
// stays app/upgrades/data/*.ts; publicApi.ts owns the external shape.
//
// Statically generated and revalidated hourly: the payload's only time
// dependence is the lifecycle `state` fields, and every activation is a
// day-scale timestamp, so an hour of staleness is never user-visible.

export const runtime = 'nodejs';
export const revalidate = 3600;

const CACHE_CONTROL = `public, s-maxage=${revalidate}, stale-while-revalidate=${revalidate * 24}`;

export function GET() {
  return Response.json(buildUpgradesPayload(), {
    headers: { 'Cache-Control': CACHE_CONTROL },
  });
}
