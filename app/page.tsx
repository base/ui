import { Card, LinkCard } from './components/ui/Card';
import { SectionHeading } from './components/ui/SectionHeading';
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
    label: 'Snapshots',
    href: '/snapshots',
    description: 'Download and configure Reth v2 snapshots to sync a Base node faster.',
    enabled: true,
  },
  {
    label: 'Upgrades',
    href: '/upgrades',
    description: 'Track Base network upgrades and the features shipping in each fork.',
    enabled: true,
  },
  {
    label: 'Vibenet',
    href: '/vibenet',
    description: 'Ephemeral Base devnet explorer and faucet for trying out in-flight features.',
    enabled: true,
  },
  {
    label: 'TIPS',
    href: '/tips',
    description: 'Transaction inclusion pool bundle metrics and audit history.',
    enabled: false,
  },
];

function SurfaceCard({ surface }: SurfaceCardProps) {
  // Disabled surfaces render as a static Card (no link) with a "Soon" pill;
  // enabled ones use the interactive LinkCard with the shared hover treatment.
  if (!surface.enabled) {
    return (
      <Card className="bg-white p-5 opacity-60">
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
    <LinkCard href={surface.href} className="group bg-white p-5">
      <Text variant="headline" className="transition-colors group-hover:text-base-blue">
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
    <div className="flex flex-col gap-12 text-black">
      <header className="flex flex-col gap-8 border-b border-bds-gray-10 pb-12">
        <div className="max-w-3xl">
          <Text variant="caption" className="mb-4 text-base-blue">
            Base Labs
          </Text>
          <Text variant="display" className="text-balance">
            Dashboards and stats for the Base network, in one place.
          </Text>
        </div>
      </header>

      <section>
        <SectionHeading
          eyebrow="Explore"
          title="Surfaces"
          description="Jump into the Base network dashboards and tools."
          className="mb-8"
        />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
          {SURFACES.map((surface) => (
            <SurfaceCard key={surface.href} surface={surface} />
          ))}
        </div>
      </section>
    </div>
  );
}
