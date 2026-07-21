import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { SectionHeading } from '../../../components/ui/SectionHeading';
import { Text } from '../../../components/ui/Text';
import { CategoryBadge, KindBadge, LifecycleBadge, StatusPill } from '../../components/Badges';
import { Breadcrumb } from '../../components/Breadcrumb';
import { changes } from '../../data/changes';
import { getLifecycleForChange, getUpgradeById } from '../../data/upgrades';
import {
  changeRefs,
  LIFECYCLE_LABELS,
  NETWORK_LABELS,
  UPGRADE_NETWORKS,
} from '../../library/display';
import { formatDate, toPlainText } from '../../library/format';
import { getLifecycleState } from '../../library/lifecycle';

// Time-based lifecycle states depend on Date.now(). Revalidate so the page
// regenerates instead of freezing build-time lifecycle state.
export const revalidate = 300;

type UpgradePageProps = {
  params: Promise<{ fork: string }>;
};

function buildBreadcrumbItems(upgradeName: string) {
  return [{ href: '/upgrades', label: 'Upgrades' }, { label: upgradeName }];
}

export async function generateMetadata(props: UpgradePageProps): Promise<Metadata> {
  const { fork } = await props.params;
  const upgrade = getUpgradeById(fork);
  if (!upgrade) return {};

  return {
    title: `${upgrade.name} | Base Upgrades`,
    description: upgrade.summary,
    alternates: {
      canonical: `/upgrades/upgrade/${upgrade.id}`,
    },
    openGraph: {
      title: `${upgrade.name} | Base Upgrades`,
      description: upgrade.summary,
      url: `/upgrades/upgrade/${upgrade.id}`,
    },
  };
}

export default async function UpgradeDetailPage(props: UpgradePageProps) {
  const { fork } = await props.params;
  const upgrade = getUpgradeById(fork);
  if (!upgrade) notFound();

  const nowMs = Date.now();
  const categories = upgrade.categories.filter((group) => group.changeIds.length > 0);

  const breadcrumbItems = buildBreadcrumbItems(upgrade.name);

  return (
    <div className="flex flex-col gap-12 pb-4 text-black">
      <div>
        <Breadcrumb items={breadcrumbItems} />
        <div className="flex flex-col justify-between gap-8 md:flex-row md:items-start">
          <div className="max-w-3xl">
            <Text variant="caption" className="mb-3 text-base-blue">
              Upgrade
            </Text>
            <Text variant="display">{upgrade.name}</Text>
            <Text variant="body" tone="muted" className="mt-5 max-w-2xl">
              {upgrade.summary}
            </Text>
            {upgrade.specUrl ? (
              <div className="mt-6 flex flex-wrap gap-3">
                <Button href={upgrade.specUrl} target="_blank" rel="noopener noreferrer">
                  View docs
                  <svg
                    aria-hidden="true"
                    width="20"
                    height="20"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 11L11 5M11 5H6M11 5V10" />
                  </svg>
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr]">
        <section>
          <SectionHeading eyebrow="Lifecycle" title="Activation schedule" className="mb-5" />
          <div className="grid gap-3">
            {UPGRADE_NETWORKS.map((network) => {
              const entry = upgrade.lifecycle[network];
              const state = getLifecycleState(entry, nowMs);
              return (
                <Card key={network} className="bg-bds-gray-0 p-5">
                  <div className="flex items-center justify-between gap-4">
                    <Text variant="headline">{NETWORK_LABELS[network]}</Text>
                    <StatusPill variant={state}>{LIFECYCLE_LABELS[state]}</StatusPill>
                  </div>
                  <Text variant="title2" className="mt-4">
                    {entry.timestamp ? formatDate(entry.timestamp).split(',')[0] : 'TBD'}
                  </Text>
                  <Text variant="label.regular" tone="muted" className="mt-1 font-mono">
                    {entry.timestamp ? formatDate(entry.timestamp) : 'No date set'}
                  </Text>
                </Card>
              );
            })}
          </div>
        </section>

        <section>
          <SectionHeading eyebrow="Changes" title="Upgrade feature set" className="mb-5" />
          <div className="space-y-6">
            {categories.map((group) => (
              <div key={group.category}>
                <div className="mb-3 flex items-center gap-3">
                  <CategoryBadge category={group.category} />
                  <Text variant="footnote" tone="muted" className="font-mono">
                    {group.changeIds.length} changes
                  </Text>
                </div>
                <Card className="overflow-hidden bg-white">
                  {group.changeIds.map((id) => {
                    const change = changes.find((item) => item.id === id);
                    if (!change) return null;
                    const changeLifecycle = getLifecycleForChange(change);
                    const activatesAfterUpgrade = UPGRADE_NETWORKS.some((network) => {
                      const changeTs = changeLifecycle?.[network].timestamp;
                      const upgradeTs = upgrade.lifecycle[network].timestamp;
                      return (
                        !!changeTs && !!upgradeTs && Date.parse(changeTs) > Date.parse(upgradeTs)
                      );
                    });
                    return (
                      <Link
                        key={change.id}
                        href={`/upgrades/changelog/${change.slug}`}
                        className="grid gap-3 border-b border-bds-gray-10 p-4 transition-colors last:border-b-0 hover:bg-bds-gray-5 md:grid-cols-[1fr_auto]"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Text variant="headline" className="min-w-0">
                              {change.title}
                            </Text>
                            <KindBadge kind={change.kind} />
                          </div>
                          <Text variant="label.regular" tone="muted" className="mt-1 line-clamp-2">
                            {toPlainText(change.summary)}
                          </Text>
                          {changeRefs(change).length > 0 ? (
                            <Text variant="footnote" tone="muted" className="mt-2 font-mono">
                              {changeRefs(change).join(' / ')}
                            </Text>
                          ) : null}
                          {activatesAfterUpgrade ? (
                            <Text variant="footnote" tone="muted" className="mt-2">
                              Activates after upgrade
                            </Text>
                          ) : null}
                        </div>
                        <div className="flex items-start md:justify-end">
                          {changeLifecycle ? (
                            <LifecycleBadge lifecycle={changeLifecycle} nowMs={nowMs} size="sm" />
                          ) : null}
                        </div>
                      </Link>
                    );
                  })}
                </Card>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
