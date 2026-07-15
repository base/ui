'use client';

import { useCallback, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';

import { Button } from '../../../components/ui/Button';
import { Card, LinkCard } from '../../../components/ui/Card';
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
        className="mb-6 flex gap-1 border-b border-bds-gray-10 dark:border-white/10"
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
                ? 'border-base-blue text-black dark:text-white'
                : 'border-transparent text-bds-gray-50 hover:text-black dark:hover:text-white',
            )}
          >
            {item}
            {item !== 'overview' ? (
              <span className="ml-2 rounded-full bg-bds-gray-5 px-2 py-1 font-mono text-[10px] uppercase text-bds-gray-50 dark:bg-white/10 dark:text-bds-gray-30">
                Soon
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className="space-y-8">
            <div>
              <Text variant="caption" tone="muted" className="mb-2">
                Summary
              </Text>
              <Text as="div" variant="body" dangerouslySetInnerHTML={summaryHtml} />
            </div>
            {change.migrationNotes ? (
              <div>
                <Text variant="caption" tone="muted" className="mb-2">
                  Migration Notes
                </Text>
                <Text as="div" variant="body" dangerouslySetInnerHTML={migrationNotesHtml} />
              </div>
            ) : null}
            {change.relatedRepos && change.relatedRepos.length > 0 ? (
              <div>
                <Text variant="caption" tone="muted" className="mb-2">
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
                    );
                  })}
                </div>
              </div>
            ) : null}
            {relatedEips.length > 0 ? (
              <div>
                <Text variant="caption" tone="muted" className="mb-3">
                  Related EIPs
                </Text>
                <div className="flex flex-wrap gap-2">
                  {relatedEips.map((ref) => (
                    <span
                      key={ref}
                      className="rounded-md border border-bds-gray-10 bg-bds-gray-0 px-3 py-2 font-mono text-[12px] text-bds-gray-70 dark:border-white/10 dark:bg-white/10 dark:text-bds-gray-20"
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
              <Card className="bg-bds-gray-0 p-5 dark:bg-white/5">
                <Text variant="caption" tone="muted" className="mb-3">
                  Lifecycle
                </Text>
                <div className="space-y-3">
                  {UPGRADE_NETWORKS.map((network) => {
                    const state = getLifecycleState(lifecycle[network]);
                    return (
                      <div
                        key={network}
                        className="flex items-start justify-between gap-4 border-b border-bds-gray-10 pb-3 last:border-b-0 last:pb-0 dark:border-white/10"
                      >
                        <Text variant="label">{NETWORK_LABELS[network]}</Text>
                        <div className="text-right">
                          <StatusPill variant={state}>{LIFECYCLE_LABELS[state]}</StatusPill>
                          {lifecycle[network].timestamp ? (
                            <Text variant="footnote" tone="muted" className="mt-2 font-mono">
                              {formatDate(lifecycle[network].timestamp)}
                            </Text>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ) : null}

            {vibenetChange ? (
              <Card className="bg-bds-gray-0 p-5 dark:bg-white/5">
                <Text variant="caption" tone="muted" className="mb-3">
                  Vibenet
                </Text>
                <div className="flex items-center justify-between gap-3">
                  <StatusPill variant={vibenetChange.vibenet.status}>
                    {LIFECYCLE_LABELS[vibenetChange.vibenet.status]}
                  </StatusPill>
                  <Text variant="footnote" tone="muted" className="font-mono">
                    {formatShortDate(vibenetChange.vibenet.timestamp)}
                  </Text>
                </div>
                <Text variant="label.regular" tone="muted" className="mt-3">
                  Available on Vibenet testing. This does not mean it is scheduled for Sepolia or
                  Mainnet.
                </Text>
              </Card>
            ) : null}

            {upgrade ? (
              <LinkCard
                href={`/upgrades/upgrade/${upgrade.id}`}
                className="block bg-bds-gray-0 p-5 dark:bg-white/5"
              >
                <Text variant="caption" tone="muted" className="mb-2">
                  Part Of
                </Text>
                <Text variant="headline">{upgrade.name}</Text>
                <Text variant="label.regular" tone="muted" className="mt-2 line-clamp-3">
                  {upgrade.summary}
                </Text>
              </LinkCard>
            ) : (
              <Card className="bg-bds-gray-0 p-5 dark:bg-white/5">
                <Text variant="caption" tone="muted" className="mb-2">
                  Scheduling
                </Text>
                <Text variant="headline">Not Scheduled</Text>
                <Text variant="label.regular" tone="muted" className="mt-2">
                  This change is not assigned to a Base upgrade yet.
                </Text>
              </Card>
            )}
          </aside>
        </div>
      ) : null}

      {tab === 'activity' ? (
        <EmptyState
          title="Activity Feed Is Coming Soon"
          description="This is where you will be able to track Github issues and PRs for this change."
          className="bg-bds-gray-0 p-8 text-center dark:bg-white/5"
        />
      ) : null}
    </section>
  );
}
