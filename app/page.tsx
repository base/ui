import { Button } from './components/ui/Button';
import { Card, LinkCard } from './components/ui/Card';
import { Text } from './components/ui/Text';
import { listedDemos } from './vibenet/demos/catalogue';
import { DemoCard } from './vibenet/demos/DemoCard';
import { SAMPLE_SNAPSHOTS, type Snapshot } from './snapshots/data';
import { getSnapshots } from './snapshots/r2';
import { SnapshotDownloadBox } from './snapshots/SnapshotDownloadBox';

// Prefetchable and revalidated like /snapshots, so the homepage paints complete
// content (including the live snapshot stats) instead of a per-request render.
export const revalidate = 300;

type Surface = {
  label: string;
  href: string;
  description: string;
  enabled: boolean;
};

const SURFACES: Surface[] = [
  {
    label: 'Vibenet',
    href: '/vibenet',
    description: 'An ephemeral Base developer network for testing in-flight features.',
    enabled: true,
  },
  {
    label: 'Snapshots',
    href: '/snapshots',
    description: 'Download and configure Reth v2 snapshots to sync a Base node faster.',
    enabled: true,
  },
];

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
    <div className="animate-in flex min-w-0 flex-1 flex-col gap-12 py-4 text-foreground">
      <header className="flex max-w-2xl flex-col gap-3">
        <Text variant="title2">Base&apos;s Building Ground</Text>
        <Text variant="body" tone="muted">
          Explore in-flight features on Vibenet and sync a node from the latest snapshot.
        </Text>
      </header>

      <section className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <Text variant="headline">Featured Demos</Text>
            <Text variant="label.regular" tone="muted">
              Interactive walkthroughs running on Vibenet right now.
            </Text>
          </div>
          <Button href="/vibenet" variant="outline" size="sm" arrow>
            All demos
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {recentDemos.map((demo) => (
            <DemoCard key={demo.href} demo={demo} />
          ))}
        </div>
      </section>

      {mainnetSnapshot ? (
        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <Text variant="headline">Sync a Node Faster</Text>
            <Text variant="label.regular" tone="muted">
              Grab the latest Base Mainnet archive snapshot, or customize your own.
            </Text>
          </div>
          <SnapshotDownloadBox snapshot={mainnetSnapshot} />
        </section>
      ) : null}

      <section className="flex flex-col gap-6">
        <Text variant="headline">Explore</Text>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {SURFACES.map((surface) => (
            <SurfaceCard key={surface.href} surface={surface} />
          ))}
        </div>
      </section>
    </div>
  );
}

function SurfaceCard({ surface }: { surface: Surface }) {
  if (!surface.enabled) {
    return (
      <Card className="bg-background p-5 opacity-60 dark:bg-white/5">
        <div className="flex items-center gap-2">
          <Text variant="headline">{surface.label}</Text>
          <span className="rounded-full border border-bds-gray-15 px-2.5 py-0.5 text-[13px] text-bds-gray-60">
            Soon
          </span>
        </div>
        <Text variant="label.regular" tone="muted" className="mt-1">
          {surface.description}
        </Text>
      </Card>
    );
  }

  return (
    <LinkCard
      href={surface.href}
      interactive={false}
      className="group bg-background p-5 transition-colors hover:bg-bds-gray-5 dark:bg-white/5 dark:hover:bg-white/[0.08]"
    >
      <Text variant="headline">{surface.label}</Text>
      <Text variant="label.regular" tone="muted" className="mt-1">
        {surface.description}
      </Text>
    </LinkCard>
  );
}
