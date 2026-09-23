import { NextResponse } from 'next/server';

import { surfaceEnabled } from '../../../../deploy.config.mjs';
import { PERFORMANCE_SOURCE_URL } from '../../../benchmark/performance/data';

export const revalidate = 300;

export async function GET() {
  if (!surfaceEnabled('benchmark')) {
    return new NextResponse(null, { status: 404 });
  }
  try {
    const response = await fetch(PERFORMANCE_SOURCE_URL, { next: { revalidate } });
    if (!response.ok) {
      return NextResponse.json({ error: `Benchmark result source returned ${response.status}.` }, { status: 502 });
    }
    return NextResponse.json(await response.json(), {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch {
    return NextResponse.json({ error: 'Benchmark result source is unavailable.' }, { status: 502 });
  }
}
