import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Button } from '../../../components/ui/Button';
import { Text } from '../../../components/ui/Text';
import { CategoryBadge, KindBadge, StatusPill } from '../../components/Badges';
import { UpgradeIllustration } from '../../components/UpgradeIllustration';
import { changes } from '../../data/changes';
import { getUpgradeById } from '../../data/upgrades';
import { changeDisplayTitle, LIFECYCLE_LABELS, NETWORK_LABELS, UPGRADE_NETWORKS } from '../../library/display';
import { formatShortDate } from '../../library/format';
import { getLifecycleState } from '../../library/lifecycle';

// Time-based lifecycle states depend on Date.now(). Revalidate so the page
// regenerates instead of freezing build-time lifecycle state.
export const revalidate = 300;

type UpgradePageProps = {
  params: Promise<{ fork: string }>;
};

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

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-24 pb-4 text-black">
      <div className="animate-in">
        <div>
          <div className="mb-4 h-12 w-12">
            <UpgradeIllustration upgradeId={upgrade.id} />
          </div>
          <Text variant="title1">{upgrade.name}</Text>
          <Text variant="body" tone="muted" className="mt-4">
            {upgrade.summary}
          </Text>
        </div>
        <div className="mt-8 flex gap-10">
          {UPGRADE_NETWORKS.map((network) => {
            const state = getLifecycleState(upgrade.lifecycle[network], nowMs);
            return (
            <div key={network}>
              <Text variant="footnote" tone="muted">
                {NETWORK_LABELS[network]}
              </Text>
              <div className="mt-1.5 flex items-center gap-1.5">
                <StatusPill variant={state}>
                  {LIFECYCLE_LABELS[state]}
                </StatusPill>
                <span className="text-bds-gray-30">·</span>
                <Text variant="label">
                  {upgrade.lifecycle[network].timestamp
                    ? formatShortDate(upgrade.lifecycle[network].timestamp)
                    : 'Coming Soon'}
                </Text>
              </div>
            </div>
            );
          })}
        </div>
        {upgrade.specUrl ? (
          <div className="mt-6 flex">
            <Button href={upgrade.specUrl} target="_blank" rel="noopener noreferrer" variant="outline" size="sm">
              Documentation
              <svg
                aria-hidden="true"
                width="14"
                height="14"
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

      <div className="animate-in animate-in-delay-1">
        <section>
          <Text variant="title3" className="mb-5">Features</Text>
          <div className="divide-y divide-bds-gray-10 border-y border-bds-gray-10">
            {categories.map((group) =>
              group.changeIds.map((id) => {
                const change = changes.find((item) => item.id === id);
                if (!change) return null;
                return (
                  <a
                    key={change.id}
                    href={`/upgrades/changelog/${change.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-4 py-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Text variant="headline" className="min-w-0 transition-colors group-hover:text-base-blue">
                          {changeDisplayTitle(change)}
                        </Text>
                        <KindBadge kind={change.kind} />
                        <CategoryBadge category={change.category} />
                      </div>
                      <Text variant="label.regular" tone="muted" className="mt-1 line-clamp-2">
                        {change.summary}
                      </Text>
                    </div>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 20 20"
                      fill="none"
                      aria-hidden="true"
                      className="shrink-0 text-bds-gray-40 transition-[transform,color] duration-200 ease-out group-hover:translate-x-[3px] group-hover:text-base-blue"
                    >
                      <path d="M7.5 4L13.5 10L7.5 16" stroke="currentColor" strokeWidth="1.5" />
                      <path
                        d="M13.5 10H0"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeDasharray="13.5"
                        strokeDashoffset="13.5"
                        className="transition-[stroke-dashoffset] duration-200 ease-out group-hover:[stroke-dashoffset:0]"
                      />
                    </svg>
                  </a>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
