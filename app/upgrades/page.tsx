import { Button } from '../components/ui/Button';
import { Card, LinkCard } from '../components/ui/Card';
import { SectionHeading } from '../components/ui/SectionHeading';
import { Text } from '../components/ui/Text';

import { LifecycleBadge, StatusPill } from './components/Badges';
import { Carousel } from './components/Carousel';
import { FeaturedVibenetCarousel } from './components/FeaturedVibenetCarousel';
import { changes } from './data/changes';
import { getUpgradesReversed, upgrades } from './data/upgrades';
import { getFeaturedVibenetChanges } from './data/vibenet';
import {
  LIFECYCLE_LABELS,
  NETWORK_LABELS,
  UPGRADE_NETWORKS,
  UPGRADE_STATUS_METADATA,
} from './library/display';
import { formatShortDate } from './library/format';
import { getLifecycleState, getUpgradeStatus } from './library/lifecycle';

// Time-based lifecycle states depend on Date.now(). Revalidate so the page
// regenerates instead of freezing build-time "current/upcoming" state.
export const revalidate = 300;

function getStatusSnapshot(nowMs: number) {
  const current = upgrades
    .filter(
      (upgrade) =>
        upgrade.lifecycle.mainnet.timestamp &&
        Date.parse(upgrade.lifecycle.mainnet.timestamp) <= nowMs,
    )
    .sort(
      (a, b) =>
        Date.parse(b.lifecycle.mainnet.timestamp ?? '') -
        Date.parse(a.lifecycle.mainnet.timestamp ?? ''),
    )[0];

  const next = upgrades
    .filter((upgrade) => {
      if (upgrade === current) return false;
      // "Upcoming" must not yet be live on mainnet: either unscheduled
      // or scheduled for a future date. This excludes upgrades that
      // already activated before the current one (e.g. Azul before Beryl).
      const mainnetTimestamp = upgrade.lifecycle.mainnet.timestamp;
      return !mainnetTimestamp || Date.parse(mainnetTimestamp) > nowMs;
    })
    .sort((a, b) => {
      const aTime = a.lifecycle.mainnet.timestamp
        ? Date.parse(a.lifecycle.mainnet.timestamp)
        : Number.POSITIVE_INFINITY;
      const bTime = b.lifecycle.mainnet.timestamp
        ? Date.parse(b.lifecycle.mainnet.timestamp)
        : Number.POSITIVE_INFINITY;
      return aTime - bTime;
    })[0];

  return { current, next };
}

export default function UpgradesPage() {
  const nowMs = Date.now();
  const { current, next } = getStatusSnapshot(nowMs);
  const featuredOnVibenet = getFeaturedVibenetChanges().reverse();

  return (
    <div className="flex flex-col gap-16 pb-4 text-black">
      <header className="flex flex-col gap-8 border-b border-bds-gray-10 pb-12">
        <div className="max-w-3xl">
          <Text variant="caption" className="mb-4 text-base-blue">
            Base Upgrades
          </Text>
          <Text variant="display" className="text-balance">
            Track Base Upgrades
          </Text>
          <Text variant="body" tone="muted" className="mt-5 max-w-2xl">
            See what features are shipping before they land.
          </Text>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button href="/upgrades/upgrade/beryl" arrow>
            Beryl Upgrade
          </Button>
          <Button href="/upgrades/changelog" variant="secondary">
            Changelog
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="bg-bds-gray-0 p-5">
          <SectionHeading
            eyebrow="Network Upgrade Status"
            title="Current and upcoming"
            description="Activation state by network. Scheduled dates subject to change."
            className="mb-6"
          />
          <div className="grid gap-3 md:grid-cols-2">
            {UPGRADE_NETWORKS.map((network) => {
              const currentEntry = current?.lifecycle[network];
              const nextEntry = next?.lifecycle[network];
              const currentState = currentEntry
                ? getLifecycleState(currentEntry, nowMs)
                : 'planning';
              const nextState = nextEntry ? getLifecycleState(nextEntry, nowMs) : 'planning';
              return (
                <Card key={network} className="bg-white p-4">
                  <Text variant="caption" tone="muted">
                    {NETWORK_LABELS[network]}
                  </Text>
                  <div className="mt-4 space-y-4">
                    {current ? (
                      <div>
                        <Text variant="label" tone="muted">
                          Current
                        </Text>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <StatusPill variant={currentState}>
                            {current.name} - {LIFECYCLE_LABELS[currentState]}
                          </StatusPill>
                          <Text variant="footnote" tone="muted" className="font-mono">
                            {formatShortDate(currentEntry?.timestamp)}
                          </Text>
                        </div>
                      </div>
                    ) : null}
                    {next ? (
                      <div>
                        <Text variant="label" tone="muted">
                          Upcoming
                        </Text>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <StatusPill variant={nextState}>
                            {next.name} - {LIFECYCLE_LABELS[nextState]}
                          </StatusPill>
                          <Text variant="footnote" tone="muted" className="font-mono">
                            {formatShortDate(nextEntry?.timestamp)}
                          </Text>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </Card>
              );
            })}
          </div>
        </Card>

        <Card className="bg-white p-5">
          <SectionHeading
            eyebrow="Planning Tools"
            title="Upgrade overview"
            description="Review the full changelog and see the upcoming release schedule."
            className="mb-5"
          />
          <div className="grid gap-3">
            {[
              ['Changelog', '/upgrades/changelog', 'Search protocol changes and release notes.'],
              ['Schedule', '/upgrades/schedule', 'View activation dates by month and network.'],
              ['Vibenet', '/vibenet', 'Test new features on our ephemeral testing network.'],
            ].map(([title, href, body]) => (
              <LinkCard key={href} href={href} className="group bg-bds-gray-0 p-4">
                <Text variant="headline" className="transition-colors group-hover:text-base-blue">{title}</Text>
                <Text variant="label.regular" tone="muted" className="mt-1">
                  {body}
                </Text>
              </LinkCard>
            ))}
          </div>
        </Card>
      </div>

      <section>
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <SectionHeading
            eyebrow="Upgrades"
            title="Review upgrade feature sets"
            description="Each upgrade groups the Base-specific and EIP changes that move through Sepolia and Mainnet."
          />
        </div>
        <Carousel perView={2}>
          {getUpgradesReversed().map((upgrade) => {
            const status = getUpgradeStatus(upgrade.lifecycle, nowMs);
            const statusMetadata = UPGRADE_STATUS_METADATA[status];
            const count = changes.filter((change) => change.upgrade === upgrade.id).length;
            return (
              <LinkCard
                key={upgrade.id}
                href={`/upgrades/upgrade/${upgrade.id}`}
                className="group flex h-full min-h-[280px] w-full flex-col bg-white p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Text variant="caption" tone="muted">
                      Upgrade
                    </Text>
                    <Text
                      variant="title1"
                      className="mt-2 transition-colors group-hover:text-base-blue"
                    >
                      {upgrade.name}
                    </Text>
                  </div>
                  <LifecycleBadge lifecycle={upgrade.lifecycle} nowMs={nowMs} />
                </div>
                <Text variant="body" tone="muted" className="mt-4 line-clamp-3">
                  {upgrade.summary}
                </Text>
                <div className="mt-5 flex flex-wrap gap-2">
                  <StatusPill variant={statusMetadata.variant}>{statusMetadata.label}</StatusPill>
                </div>
                <div className="mt-auto flex items-center justify-between border-t border-bds-gray-10 pt-4">
                  <Text variant="footnote" tone="muted" className="font-mono">
                    {count} changes
                  </Text>
                  <Text variant="footnote" tone="muted" className="font-mono">
                    Mainnet -{' '}
                    {upgrade.lifecycle.mainnet.timestamp
                      ? formatShortDate(upgrade.lifecycle.mainnet.timestamp)
                      : 'TBD'}
                  </Text>
                </div>
              </LinkCard>
            );
          })}
        </Carousel>
      </section>

      <section>
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <SectionHeading
            eyebrow="Vibenet"
            title="Test new features now"
            description="Selected experiments currently curated for Base Vibenet."
          />
          <Button href="/vibenet" variant="outline" size="sm">
            Open Vibenet
          </Button>
        </div>
        <FeaturedVibenetCarousel changes={featuredOnVibenet} />
      </section>
    </div>
  );
}
