import { NextResponse } from 'next/server';

import { surfaceEnabled } from '../../../../../deploy.config.mjs';

const RUN_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const RUN_SOURCE_BASE_URL = 'https://benchmark-results.base.org/runs';

export const revalidate = 300;

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  if (!surfaceEnabled('benchmark')) return new NextResponse(null, { status: 404 });
  const { runId } = await params;
  if (!RUN_ID.test(runId)) return NextResponse.json({ error: 'Invalid benchmark run ID.' }, { status: 400 });

  const artifact = new URL(request.url).searchParams.get('artifact') === 'metrics-validator' ? 'metrics-validator.json' : 'load-test-result.json';
  try {
    const response = await fetch(`${RUN_SOURCE_BASE_URL}/${encodeURIComponent(runId)}/${artifact}`, {
      next: { revalidate },
    });
    if (!response.ok) return NextResponse.json({ error: `Benchmark run source returned ${response.status}.` }, { status: 502 });
    return NextResponse.json(await response.json(), {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch {
    return NextResponse.json({ error: 'Benchmark run source is unavailable.' }, { status: 502 });
  }
}
