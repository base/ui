'use client';

import { useEffect, useState } from 'react';
import type { Address } from 'viem';

import { cn } from '../../../../components/ui/cn';
import { client } from '../lib/constants';
import {
  normalizePolicyId,
  POLICY_REGISTRY,
  policyKindFromId,
  policyKindLabel,
  policyRegistryAbi,
  shortAddress,
} from '../lib/protocol';
import type { PolicyKind, RecentPolicy } from '../lib/types';

type Resolution =
  | { state: 'loading' }
  | { state: 'missing' }
  | { state: 'unavailable' }
  | { state: 'found'; id: bigint; kind: PolicyKind; admin: Address; localLabel?: string }
  | { state: 'invalid'; message: string };

function policyMeaning(kind: PolicyKind): string {
  return kind === 'allowlist'
    ? 'Only wallets in this policy pass.'
    : kind === 'blocklist'
      ? 'Wallets in this policy are denied.'
      : kind === 'union'
        ? 'A wallet passes when any child policy allows it.'
        : 'A wallet passes only when every child policy allows it.';
}

export function PolicyIdSummary({
  value,
  recentPolicies,
  allowZero = false,
}: {
  value: string;
  recentPolicies: RecentPolicy[];
  allowZero?: boolean;
}) {
  const [resolution, setResolution] = useState<Resolution | null>(null);

  useEffect(() => {
    const candidate = value.trim();
    if (!candidate) {
      setResolution(null);
      return;
    }
    let id: bigint;
    try {
      id = normalizePolicyId(candidate, { allowZero });
    } catch (error) {
      setResolution({ state: 'invalid', message: error instanceof Error ? error.message : String(error) });
      return;
    }
    let cancelled = false;
    setResolution({ state: 'loading' });
    const timer = window.setTimeout(() => {
      void Promise.all([
        client.readContract({ address: POLICY_REGISTRY, abi: policyRegistryAbi, functionName: 'policyExists', args: [id] }),
        client.readContract({ address: POLICY_REGISTRY, abi: policyRegistryAbi, functionName: 'policyAdmin', args: [id] }),
      ])
        .then(([exists, admin]) => {
          if (cancelled) return;
          const kind = policyKindFromId(id);
          if (!exists || !kind) {
            setResolution({ state: 'missing' });
            return;
          }
          const recent = recentPolicies.find((policy) => policy.id === id);
          setResolution({ state: 'found', id, kind, admin, localLabel: recent?.label });
        })
        .catch(() => {
          if (!cancelled) setResolution({ state: 'unavailable' });
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [allowZero, recentPolicies, value]);

  if (!resolution) return null;
  if (resolution.state === 'loading') return <p className="text-[11px] text-bds-gray-50">Looking up this Policy ID…</p>;
  if (resolution.state === 'invalid') return <p className="text-[11px] text-bds-red-60">{resolution.message}</p>;
  if (resolution.state === 'missing') {
    return <p className="text-[11px] text-bds-red-60">This Policy ID does not exist on Vibenet.</p>;
  }
  if (resolution.state === 'unavailable') {
    return <p className="text-[11px] text-bds-orange-60">Could not look up this Policy ID. Try again shortly.</p>;
  }

  const alwaysAllow = resolution.id === 0n;
  const alwaysBlock = resolution.id === (1n << 56n) + 1n;
  const title = alwaysAllow
    ? 'Always allow · Built-in'
    : alwaysBlock
      ? 'Always block · Built-in'
      : resolution.localLabel || policyKindLabel(resolution.kind);
  return (
    <div className="rounded-lg border border-bds-gray-10 bg-bds-gray-5 p-3 dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-bds-blue-0 px-2 py-1 text-[11px] font-medium text-base-blue">
          {title}
        </span>
        {resolution.localLabel && !alwaysAllow && !alwaysBlock ? (
          <span className="text-[11px] text-bds-gray-50">{policyKindLabel(resolution.kind)}</span>
        ) : null}
      </div>
      <p className="mt-2 text-[12px] text-bds-gray-60">
        {alwaysAllow ? 'Everyone passes this policy.' : alwaysBlock ? 'No wallet passes this policy.' : policyMeaning(resolution.kind)}
      </p>
      <p className="mt-1 text-[11px] text-bds-gray-50">
        Resolves to Policy Registry entry #{resolution.id.toString()}.
      </p>
      {!/^0x0{40}$/i.test(resolution.admin) ? (
        <p className={cn('mt-1 text-[11px] text-bds-gray-50')}>Managed by {shortAddress(resolution.admin)}</p>
      ) : null}
    </div>
  );
}
