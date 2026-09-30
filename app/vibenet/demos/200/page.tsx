import { Button } from '../../../components/ui/Button';
import { Text } from '../../../components/ui/Text';
import { FeatureCard } from '../../components/FeatureCard';
import type { VibenetFeature } from '../../library/types';
import { FeatureGridCard } from '../_shared/FeatureGridCard';
import { demoForPath } from '../catalogue';

const BLOCKS_PATH = '/vibenet/demos/200';

const BLOCKS_FEATURE: VibenetFeature = {
  id: '200ms-blocks',
  title: '200ms Native Blocks',
  summary:
    'Denim replaces two-second blocks and incremental Flashblocks with five complete canonical blocks every second. Each 200 ms block has its own number, hash, state root, receipts, and lifecycle.',
  status: 'live',
  availability: 'Coming soon in ',
  availabilityLabel: 'Base Denim',
  availabilityHref: {
    label: 'Denim 200ms blocks',
    href: 'https://docs.base.org/upgrades/denim/200ms-blocks',
    external: true,
  },
  highlights: [
    { title: 'Five Blocks Per Second', detail: 'A complete canonical block is produced every 200 milliseconds.' },
    { title: 'Not A Preconfirmation', detail: 'Every update is a block with its own hash, state root, and receipts.' },
    { title: 'Standard RPC', detail: 'Use canonical block responses and newHeads subscriptions instead of Flashblocks streams.' },
    { title: 'Live On Vibenet', detail: 'Build against the native cadence today before Denim reaches production networks.' },
  ],
};

function DemoIcon({ reflex }: { reflex: boolean }) {
  return reflex ? (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="10" cy="10" r="2.5" fill="currentColor" />
      <path d="M10 1V4M10 16V19M1 10H4M16 10H19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 8H13M7 12H11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export default function Blocks200Page() {
  const group = demoForPath(BLOCKS_PATH);
  if (!group) return null;

  return (
    <div className="animate-in flex min-w-0 flex-1 flex-col gap-10 pb-16 text-foreground">
      <FeatureCard feature={BLOCKS_FEATURE} />

      <Text variant="headline" className="mt-5 -mb-5">Demos</Text>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {group.children?.filter((demo) => demo.listed !== false).map((demo) => (
          <FeatureGridCard
            key={demo.href}
            icon={<DemoIcon reflex={demo.href.endsWith('/reflex')} />}
            title={demo.title}
            description={demo.summary}
          >
            <Button size="sm" href={demo.href}>Open Demo</Button>
          </FeatureGridCard>
        ))}
      </div>
    </div>
  );
}
