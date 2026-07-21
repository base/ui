'use client';

import { useCallback, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';

import { Button } from '../../../components/ui/Button';
import { LinkCard } from '../../../components/ui/Card';
import { cn } from '../../../components/ui/cn';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Text } from '../../../components/ui/Text';
import { StatusPill } from '../../components/Badges';
import { getLifecycleForChange, getUpgradeForChange } from '../../data/upgrades';
import { getVibenetChangeById } from '../../data/vibenet';
import {
  changeRefs,
  LIFECYCLE_LABELS,
  NETWORK_LABELS,
  UPGRADE_NETWORKS,
} from '../../library/display';
import { formatDate, formatShortDate } from '../../library/format';
import { getLifecycleState } from '../../library/lifecycle';
import type { Change } from '../../library/types';

type Tab = 'overview' | 'activity';

type ChangeDetailClientProps = {
  change: Change;
};

export function ChangeDetailClient({ change }: ChangeDetailClientProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const upgrade = getUpgradeForChange(change);
  const lifecycle = getLifecycleForChange(change);
  const vibenetChange = getVibenetChangeById(change.id);
  const relatedEips = changeRefs(change);

  const handleTabClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    setTab(event.currentTarget.dataset.tab as Tab);
  }, []);

  const summaryHtml = useMemo(() => ({ __html: change.summary }), [change.summary]);
  const migrationNotesHtml = useMemo(
    () => ({ __html: change.migrationNotes ?? '' }),
    [change.migrationNotes],
  );

  return (
    <section>
      <div
        role="tablist"
        aria-label="Change detail sections"
        className="mb-6 flex gap-1 border-b border-bds-gray-10"
      >
        {(['overview', 'activity'] as const).map((item) => (
          <button
            key={item}
            role="tab"
            type="button"
            data-tab={item}
            aria-selected={tab === item}
            onClick={handleTabClick}
            className={cn(
              '-mb-px border-b-2 px-4 py-3 text-[14px] capitalize transition-colors',
              tab === item
                ? 'border-black text-black'
                : 'border-transparent text-bds-gray-50 hover:text-black',
            )}
          >
            {item}
            {item !== 'overview' ? (
              <span className="ml-2 rounded-full bg-bds-gray-5 px-2 py-0.5 text-[10px] text-bds-gray-50">
                Soon
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
          <div className="space-y-8">
            <div>
              <Text variant="label.medium" tone="muted" className="mb-2 text-[13px]">
                Summary
              </Text>
              <Text as="div" variant="body" dangerouslySetInnerHTML={summaryHtml} />
            </div>
            {change.migrationNotes ? (
              <div>
                <Text variant="label.medium" tone="muted" className="mb-2 text-[13px]">
                  Migration Notes
                </Text>
                <Text as="div" variant="body" dangerouslySetInnerHTML={migrationNotesHtml} />
              </div>
            ) : null}
            {change.relatedRepos && change.relatedRepos.length > 0 ? (
              <div>
                <Text variant="label.medium" tone="muted" className="mb-2 text-[13px]">
                  Related Repos
                </Text>
                <div className="flex flex-wrap gap-2">
                  {change.relatedRepos.map((repoUrl) => {
                    const match = repoUrl.match(/github\.com\/([^/]+\/[^/]+)/);
                    const label = match ? match[1] : repoUrl;
                    return (
                      <Button
                        key={repoUrl}
                        href={repoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="outline"
                        size="sm"
                      >
                        {label}
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
                    );
                  })}
                </div>
              </div>
            ) : null}
            {relatedEips.length > 0 ? (
              <div>
                <Text variant="label.medium" tone="muted" className="mb-2 text-[13px]">
                  Related EIPs
                </Text>
                <div className="flex flex-wrap gap-2">
                  {relatedEips.map((ref) => (
                    <span
                      key={ref}
                      className="rounded-md bg-bds-gray-5 px-2.5 py-1.5 text-[12px] text-bds-gray-60"
                    >
                      {ref}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <aside className="space-y-4">
            {lifecycle ? (
              <div className="rounded-xl border border-bds-gray-10 p-5">
                <Text variant="label.medium" tone="muted" className="mb-3 text-[13px]">
                  Lifecycle
                </Text>
                <div className="space-y-3">
                  {UPGRADE_NETWORKS.map((network) => {
                    const state = getLifecycleState(lifecycle[network]);
                    return (
                      <div
                        key={network}
                        className="flex items-start justify-between gap-4 border-b border-bds-gray-10 pb-3 last:border-b-0 last:pb-0"
                      >
                        <Text variant="label">{NETWORK_LABELS[network]}</Text>
                        <div className="text-right">
                          <StatusPill variant={state}>{LIFECYCLE_LABELS[state]}</StatusPill>
                          {lifecycle[network].timestamp ? (
                            <Text variant="footnote" tone="muted" className="mt-2">
                              {formatDate(lifecycle[network].timestamp)}
                            </Text>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {vibenetChange ? (
              <div className="rounded-xl border border-bds-gray-10 p-5">
                <Text variant="label.medium" tone="muted" className="mb-3 text-[13px]">
                  Vibenet
                </Text>
                <div className="flex items-center justify-between gap-3">
                  <StatusPill variant={vibenetChange.vibenet.status}>
                    {LIFECYCLE_LABELS[vibenetChange.vibenet.status]}
                  </StatusPill>
                  <Text variant="footnote" tone="muted">
                    {formatShortDate(vibenetChange.vibenet.timestamp)}
                  </Text>
                </div>
                <Text variant="label.regular" tone="muted" className="mt-3">
                  Available on Vibenet testing. This does not mean it is scheduled for Sepolia or
                  Mainnet.
                </Text>
              </div>
            ) : null}

            {upgrade ? (
              <LinkCard
                href={`/upgrades/upgrade/${upgrade.id}`}
                className="block rounded-xl p-5"
              >
                <Text variant="label.medium" tone="muted" className="mb-2 text-[13px]">
                  Part Of
                </Text>
                <Text variant="headline">{upgrade.name}</Text>
                <Text variant="label.regular" tone="muted" className="mt-2 line-clamp-3">
                  {upgrade.summary}
                </Text>
              </LinkCard>
            ) : (
              <div className="rounded-xl border border-bds-gray-10 p-5">
                <Text variant="label.medium" tone="muted" className="mb-2 text-[13px]">
                  Scheduling
                </Text>
                <Text variant="headline">Not Scheduled</Text>
                <Text variant="label.regular" tone="muted" className="mt-2">
                  This change is not assigned to a Base upgrade yet.
                </Text>
              </div>
            )}
          </aside>
        </div>
      ) : null}

      {tab === 'activity' ? (
        <EmptyState
          title="Activity Feed Is Coming Soon"
          description="This is where you will be able to track Github issues and PRs for this change."
          className="p-8 text-center"
        />
      ) : null}
    </section>
  );
}
