import { Button } from './components/ui/Button';
import { Text } from './components/ui/Text';
import { listedDemos } from './vibenet/demos/catalogue';
import { DemoCard } from './vibenet/demos/DemoCard';
import { SAMPLE_SNAPSHOTS, type Snapshot } from './snapshots/data';
import { getSnapshots } from './snapshots/r2';
import { SnapshotDownloadBox } from './snapshots/SnapshotDownloadBox';

// Prefetchable and revalidated like /snapshots, so the homepage paints complete
// content (including the live snapshot stats) instead of a per-request render.
export const revalidate = 300;

// Latest Mainnet archive snapshot for the homepage download box. Mirrors the
// loadSnapshots fallback on /snapshots: sample data in dev when R2 is
// unconfigured, and null (box hidden) if R2 is down in production.
async function loadMainnetSnapshot(): Promise<Snapshot | null> {
  let snapshots: Snapshot[];
  try {
    snapshots = await getSnapshots();
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[home] failed to load snapshots from R2:', error);
      return null;
    }
    console.warn(
      '[home] R2 unavailable, using sample data:',
      error instanceof Error ? error.message : error,
    );
    snapshots = SAMPLE_SNAPSHOTS;
  }
  return snapshots.find((snapshot) => snapshot.network === 'mainnet') ?? null;
}

export default async function Home() {
  // The two most recently added demos, newest first (catalogue order is
  // chronological); the full set lives on /vibenet.
  const recentDemos = listedDemos().slice(-2).reverse();
  const mainnetSnapshot = await loadMainnetSnapshot();

  return (
    <div className="animate-in mx-auto flex w-full min-w-0 max-w-5xl flex-1 flex-col gap-16 pt-8 pb-4 text-foreground">
      <header className="flex max-w-2xl flex-col gap-3">
        <Text variant="title2">Base Developer Console</Text>
        <Text variant="body" tone="muted">
          Explore in-flight features on Vibenet and sync a node from the latest snapshot.
        </Text>
      </header>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Text variant="headline">Featured Demos</Text>
            <span className="inline-flex items-center gap-2 rounded-lg bg-[color-mix(in_srgb,var(--base-blue-p3)_10%,transparent)] px-2 py-0.5 text-[13px] font-[450] text-base-blue">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-base-blue opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-base-blue" />
              </span>
              Live on Vibenet
            </span>
          </div>
          <Button href="/vibenet" variant="outline" size="sm" arrow>
            All Demos
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {recentDemos.map((demo) => (
            <DemoCard key={demo.href} demo={demo} />
          ))}
        </div>
      </section>

      {mainnetSnapshot ? (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <Text variant="headline">Snapshots</Text>
              <Text variant="label.regular" tone="muted">
                Sync a node from the latest Base Mainnet archive snapshot, or customize your own.
              </Text>
            </div>
            <Button href="/snapshots" variant="outline" size="sm" arrow>
              Customize
            </Button>
          </div>
          <SnapshotDownloadBox snapshot={mainnetSnapshot} />
        </section>
      ) : null}

    </div>
  );
}
