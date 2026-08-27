'use client';

import { useEffect, useState } from 'react';

import { Card } from '../../../../components/ui/Card';
import { Text } from '../../../../components/ui/Text';
import { client } from '../lib/constants';
import { b20Abi, POLICY_SCOPES, scopeId } from '../lib/protocol';
import { sampleTokenForAddress } from '../lib/samples';
import type { RecentPolicy, TokenInfo } from '../lib/types';
import type { TokenAdminStatus } from './AttachPolicy';
import { PolicySelect } from './PolicySelect';

// Reads that race a just-confirmed transaction hit RPC replicas whose heads
// differ, so read at t=0 and again as state settles (pinned to a fresh block).
const READ_RETRY_MS = [0, 2_500, 6_000];

// Inline policy assignment: one row per token feature (scope), each with a
// dropdown of the account's named policies. Selecting one hands the choice up to
// the transaction popup flow (it does not assign in place); "+ Policy" opens the
// Create Policy dialog.
export function PolicyList({
  token,
  adminStatus,
  recentPolicies,
  usedPolicyIds,
  refreshKey,
  onAssign,
  onCreate,
  onDelete,
}: {
  token: TokenInfo;
  adminStatus: TokenAdminStatus;
  recentPolicies: RecentPolicy[];
  /** Policy ids currently assigned on some token — not safe to forget locally. */
  usedPolicyIds: Set<string>;
  /** Bumped by the parent after each transaction so assignments re-read. */
  refreshKey: number;
  onAssign: (scope: string, label: string, policyId: bigint) => void;
  onCreate: () => void;
  onDelete: (id: bigint) => void;
}) {
  const isSample = Boolean(sampleTokenForAddress(token.address));
  const [assignments, setAssignments] = useState<Record<string, bigint | null>>({});

  // Read the policy currently mapped to each scope. Re-reads on token change and
  // whenever the parent bumps refreshKey (e.g. after an assignment lands), with
  // retries so a lagging replica can't leave the list showing the old policy.
  useEffect(() => {
    if (isSample) {
      setAssignments({});
      return;
    }
    let cancelled = false;
    const read = () =>
      client
        .getBlockNumber({ cacheTime: 0 })
        .then((blockNumber) =>
          Promise.all(
            POLICY_SCOPES.map(([scope]) =>
              client
                .readContract({
                  address: token.address,
                  abi: b20Abi,
                  functionName: 'policyId',
                  args: [scopeId(scope)],
                  blockNumber,
                })
                .then((id) => [scope, id] as const)
                .catch(() => [scope, null] as const),
            ),
          ),
        )
        .then((entries) => {
          if (!cancelled) setAssignments((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
        })
        .catch(() => {});
    const timers = READ_RETRY_MS.map((delay) => window.setTimeout(() => void read(), delay));
    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [token.address, refreshKey, isSample]);

  const locked = adminStatus !== 'allowed' || isSample;

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col divide-y divide-bds-gray-10 bg-background p-0 dark:divide-white/10 dark:bg-white/5">
        {POLICY_SCOPES.map(([scope, label]) => (
          <div key={scope} className="flex items-center justify-between gap-3 px-4 py-3">
            <Text variant="label">{label}</Text>
            <PolicySelect
              value={assignments[scope] ?? null}
              policies={recentPolicies}
              usedPolicyIds={usedPolicyIds}
              onSelect={(id) => onAssign(scope, label, id)}
              onCreate={onCreate}
              onDelete={onDelete}
              disabled={locked}
              ariaLabel={`${label} policy`}
            />
          </div>
        ))}
      </Card>
      {locked ? (
        <Text variant="footnote" tone="muted">
          {isSample
            ? 'Assigning policies isn’t available on the sample token. Create your own token to map policies.'
            : adminStatus === 'checking'
              ? 'Checking whether your wallet is a token admin…'
              : 'Only the token’s admin wallet can assign policies.'}
        </Text>
      ) : null}
    </div>
  );
}
