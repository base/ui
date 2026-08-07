'use client';

import { useCallback, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import { Button } from '../../../components/ui/Button';
import { cn } from '../../../components/ui/cn';
import { ExternalLinkIcon } from '../../../components/ui/icons';
import { LabeledCard } from '../../../components/ui/LabeledCard';
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
import { formatShortDate } from '../../library/format';
import { getLifecycleState } from '../../library/lifecycle';
import type { Change } from '../../library/types';

type Tab = 'overview' | 'activity';

type ChangeDetailClientProps = {
  change: Change;
};

export function ChangeDetailClient({ change }: ChangeDetailClientProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const reducedMotion = useReducedMotion();
  const upgrade = getUpgradeForChange(change);
  const lifecycle = getLifecycleForChange(change);
  const vibenetChange = getVibenetChangeById(change.id);
  const vibenetDemo =
    vibenetChange && vibenetChange.vibenet.status === 'live' ? vibenetChange.vibenet.demo : undefined;
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
        className="relative mb-6 flex gap-3 border-b border-bds-gray-10"
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
              'relative -mb-px px-1.5 py-2 text-[14px] capitalize transition-colors',
              tab === item
                ? 'text-black'
                : 'text-bds-gray-50 hover:text-black',
            )}
          >
            {item}
            {item !== 'overview' ? (
              <span className="ml-2 rounded-full border border-bds-gray-10 px-1.5 py-0.5 text-[11px] text-bds-gray-50">
                Soon
              </span>
            ) : null}
            {tab === item ? (
              <motion.div
                layoutId="tab-underline"
                className="absolute right-0 bottom-0 left-0 h-0.5 bg-black"
                transition={reducedMotion ? { duration: 0 } : { type: 'spring', bounce: 0, duration: 0.3 }}
              />
            ) : null}
          </button>
        ))}
      </div>

      {/* `initial={false}`: the crossfade is for switching, not first paint. */}
      <AnimatePresence mode="wait" initial={false}>
      {tab === 'overview' ? (
        <motion.div
          key="overview"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
          className="grid gap-8 lg:grid-cols-[1fr_260px]"
        >
          <div className="space-y-8">
            <div>
              <Text variant="label.medium" tone="muted" className="mb-2">
                Summary
              </Text>
              <Text as="div" variant="body" dangerouslySetInnerHTML={summaryHtml} />
            </div>
            {change.migrationNotes ? (
              <div>
                <Text variant="label.medium" tone="muted" className="mb-2">
                  Migration Notes
                </Text>
                <Text as="div" variant="body" dangerouslySetInnerHTML={migrationNotesHtml} />
              </div>
            ) : null}
            {change.relatedRepos && change.relatedRepos.length > 0 ? (
              <div>
                <Text variant="label.medium" tone="muted" className="mb-2">
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
                        <ExternalLinkIcon />
                      </Button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {relatedEips.length > 0 ? (
              <div>
                <Text variant="label.medium" tone="muted" className="mb-2">
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
            {vibenetDemo ? (
              <LabeledCard label="Vibenet">
                <Text variant="headline">Available for testing on Vibenet now.</Text>
                <Button
                  href={vibenetDemo}
                  variant="secondary"
                  size="sm"
                  className="mt-4"
                >
                  Test Now
                </Button>
              </LabeledCard>
            ) : null}

            <LabeledCard label="Lifecycle" labelSpacing={lifecycle ? 'mb-5' : 'mb-3'}>
              {lifecycle ? (
                <div className="space-y-3">
                  {UPGRADE_NETWORKS.map((network) => {
                    const state = getLifecycleState(lifecycle[network]);
                    const ts = lifecycle[network].timestamp;
                    return (
                      <div
                        key={network}
                        className="flex items-center justify-between gap-4 border-b border-bds-gray-10 pb-3 last:border-b-0 last:pb-0"
                      >
                        <Text variant="label">{NETWORK_LABELS[network]}</Text>
                        <div className="flex items-center gap-1.5">
                          {state === 'live' ? (
                            <StatusPill variant="live">{LIFECYCLE_LABELS[state]}</StatusPill>
                          ) : (
                            <Text variant="label.regular" tone="muted">{LIFECYCLE_LABELS[state]}</Text>
                          )}
                          {ts ? (
                            <Text variant="label.regular" tone="muted">· {formatShortDate(ts)}</Text>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : vibenetChange ? (
                <>
                  <Text variant="label">Only available on Vibenet.</Text>
                  <Text variant="label.regular" tone="muted" className="mt-1">
                    Coming soon to Sepolia and Mainnet.
                  </Text>
                </>
              ) : (
                <Text variant="label.regular" tone="muted">Not scheduled.</Text>
              )}
            </LabeledCard>

            {upgrade ? (
              <LabeledCard label="Upgrade">
                <Text variant="headline">{upgrade.name}</Text>
                <Text variant="label.regular" tone="muted" className="mt-2">
                  {upgrade.summary}
                </Text>
                <Button
                  href={`/upgrades/upgrade/${upgrade.id}`}
                  variant="secondary"
                  size="sm"
                  className="mt-4"
                >
                  Learn More
                </Button>
              </LabeledCard>
            ) : null}
          </aside>
        </motion.div>
      ) : null}

      {tab === 'activity' ? (
        <motion.div
          key="activity"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="p-8 text-center">
            <Text variant="label.medium">Activity Feed Is Coming Soon</Text>
            <Text variant="label.regular" tone="muted" className="mt-2">
              This is where you will be able to track Github issues and PRs for this change.
            </Text>
          </div>
        </motion.div>
      ) : null}
      </AnimatePresence>
    </section>
  );
}
