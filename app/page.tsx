import { Card, LinkCard } from './components/ui/Card';
import { Text } from './components/ui/Text';

type Surface = {
  label: string;
  href: string;
  description: string;
  enabled: boolean;
};

type SurfaceCardProps = {
  surface: Surface;
};

const SURFACES: Surface[] = [
  {
    label: 'Vibenet',
    href: '/vibenet',
    description: 'An ephemeral Base developer network for testing in-flight features.',
    enabled: true,
  },
  {
    label: 'Upgrades',
    href: '/upgrades',
    description: 'Track Base network upgrades and the features shipping in each fork.',
    enabled: true,
  },
  {
    label: 'Snapshots',
    href: '/snapshots',
    description: 'Download and configure Reth v2 snapshots to sync a Base node faster.',
    enabled: true,
  },
];

function SurfaceCard({ surface }: SurfaceCardProps) {
  if (!surface.enabled) {
    return (
      <Card className="bg-white p-5 opacity-60 dark:bg-white/5">
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
    <LinkCard href={surface.href} interactive={false} className="group bg-white p-5 transition-colors hover:bg-bds-gray-5 dark:bg-white/5 dark:hover:bg-white/[0.08]">
      <Text variant="headline">
        {surface.label}
      </Text>
      <Text variant="label.regular" tone="muted" className="mt-1">
        {surface.description}
      </Text>
    </LinkCard>
  );
}

export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="animate-in flex w-full max-w-xl flex-col gap-4 px-6 py-12 text-black dark:text-white">
        <Text variant="title2" className="mb-4">Monitor and test Base, all in one place.</Text>
        <Text variant="label.medium" tone="muted">Jump to...</Text>
        {SURFACES.map((surface) => (
          <SurfaceCard key={surface.href} surface={surface} />
        ))}
      </div>
    </div>
  );
}
