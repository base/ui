import {
  getSnapshots,
  NETWORK_IDS,
  SNAPSHOT_CACHE_SECONDS,
  SnapshotLoadError,
} from '../../snapshots/r2';

export const runtime = 'nodejs';

const CACHE_CONTROL = `public, s-maxage=${SNAPSHOT_CACHE_SECONDS}, stale-while-revalidate=${SNAPSHOT_CACHE_SECONDS * 2}`;

export async function GET(request: Request) {
  const network = new URL(request.url).searchParams.get('network');

  if (network && !NETWORK_IDS.includes(network)) {
    return Response.json({ error: `Unknown network: ${network}` }, { status: 400 });
  }

  try {
    return Response.json(await getSnapshots(network ?? undefined), {
      status: 200,
      headers: { 'Cache-Control': CACHE_CONTROL },
    });
  } catch (error) {
    if (error instanceof SnapshotLoadError) {
      return Response.json(
        { error: 'Failed to load snapshots from R2', details: error.failures },
        { status: 502 },
      );
    }
    throw error;
  }
}
