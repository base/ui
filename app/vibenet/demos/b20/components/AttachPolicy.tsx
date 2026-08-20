'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { encodeFunctionData, type Address, type Hex } from 'viem';

import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { Select } from '../../../../components/ui/Select';
import { Text } from '../../../../components/ui/Text';
import { VIBENET_EXPLORER_PATH } from '../../../library/config';
import { walletErrorMessage } from '../../../library/wallet';
import { client } from '../lib/constants';
import {
  b20Abi,
  normalizePolicyId,
  POLICY_REGISTRY,
  policyRegistryAbi,
  POLICY_SCOPES,
  policyKindLabel,
  scopeId,
} from '../lib/protocol';
import type { RecentPolicy, TokenInfo } from '../lib/types';
import { ErrorNote, Field, Input } from './primitives';
import { PolicyIdSummary } from './PolicyIdSummary';

export type TokenAdminStatus = 'disconnected' | 'checking' | 'allowed' | 'denied';

export function AttachPolicy({
  token,
  adminStatus,
  recentPolicies,
  onSend,
  busy,
  suggestedPolicyId,
}: {
  token: TokenInfo;
  adminStatus: TokenAdminStatus;
  recentPolicies: RecentPolicy[];
  onSend: (label: string, to: Address, data: Hex, action: string) => Promise<Hex | null>;
  busy: string | null;
  suggestedPolicyId: bigint | null;
}) {
  const [scope, setScope] = useState<(typeof POLICY_SCOPES)[number][0]>(POLICY_SCOPES[0][0]);
  const [policyId, setPolicyId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [updatedHash, setUpdatedHash] = useState<Hex | null>(null);
  const currentPolicyId = token.policies.find((policy) => policy.scope === scope)?.id ?? 0n;
  useEffect(() => {
    if (suggestedPolicyId !== null) {
      setPolicyId(suggestedPolicyId.toString());
      setUpdatedHash(null);
    }
  }, [suggestedPolicyId]);

  const submit = async () => {
    setError(null);
    setUpdatedHash(null);
    try {
      const id = normalizePolicyId(policyId, { allowZero: true });
      const exists = await client.readContract({
        address: POLICY_REGISTRY,
        abi: policyRegistryAbi,
        functionName: 'policyExists',
        args: [id],
      });
      if (!exists) throw new Error(`Policy ID ${id.toString()} does not exist on Vibenet.`);
      const data = encodeFunctionData({
        abi: b20Abi,
        functionName: 'updatePolicy',
        args: [scopeId(scope), id],
      });
      const label = POLICY_SCOPES.find(([value]) => value === scope)?.[1] ?? scope;
      const hash = await onSend(`Update ${label} policy`, token.address, data, 'attach_policy');
      if (hash) setUpdatedHash(hash);
    } catch (cause) {
      setError(walletErrorMessage(cause));
    }
  };

  return (
    <Card id="attach-policy-card" className="bg-background p-5 dark:bg-white/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Text as="h3" variant="headline">
            Attach a policy to this token
          </Text>
          <Text variant="footnote" tone="muted" className="mt-1 max-w-2xl">
            Assign an existing uint64 Policy ID to a token scope. The change applies immediately to subsequent token
            operations.
          </Text>
        </div>
        <span className="rounded-full bg-bds-gray-5 px-2 py-1 text-[11px] text-bds-gray-60 dark:bg-white/10">
          DEFAULT_ADMIN_ROLE required
        </span>
      </div>

      {adminStatus !== 'allowed' ? (
        <p className="mt-4 rounded-lg bg-bds-gray-5 p-4 text-[13px] text-bds-gray-60 dark:bg-white/10">
          {adminStatus === 'checking'
            ? 'Checking whether your wallet is a token admin…'
            : adminStatus === 'disconnected'
              ? 'Use the token admin wallet to attach or replace a policy.'
              : 'Your demo wallet does not hold this token’s DEFAULT_ADMIN_ROLE.'}
        </p>
      ) : (
        <>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Text as="span" variant="label" tone="muted">
                Token policy scope
              </Text>
              <Select
                value={scope}
                onValueChange={(value) => {
                  setScope(value as (typeof POLICY_SCOPES)[number][0]);
                  setUpdatedHash(null);
                }}
                options={POLICY_SCOPES.map(([value, label]) => ({ value, label }))}
                ariaLabel="Token policy scope"
                className="h-10"
              />
              <Text variant="footnote" tone="muted">
                Current Policy ID: {currentPolicyId.toString()}
                {currentPolicyId === 0n ? ' (ALWAYS_ALLOW)' : ''}
              </Text>
            </div>
            <div className="flex flex-col gap-2">
              {recentPolicies.length ? (
                <Select
                  value={
                    recentPolicies.some((policy) => policy.id.toString() === policyId.trim()) ? policyId.trim() : ''
                  }
                  onValueChange={(value) => {
                    setPolicyId(value);
                    setUpdatedHash(null);
                  }}
                  options={recentPolicies.map((policy) => ({
                    value: policy.id.toString(),
                    label: `${policy.label ? `${policy.label} · ` : ''}${policyKindLabel(policy.kind)} · ID ${policy.id.toString()}`,
                  }))}
                  placeholder="Choose a recent policy"
                  ariaLabel="Choose a recent policy to attach"
                  className="h-10 text-[12px]"
                />
              ) : null}
              <Field
                label="Policy ID (uint64)"
                hint="Use 0 to restore the built-in ALWAYS_ALLOW policy for this scope."
              >
                <Input
                  value={policyId}
                  onChange={(event) => {
                    setPolicyId(event.target.value);
                    setUpdatedHash(null);
                  }}
                  placeholder="Enter a decimal Policy ID"
                  inputMode="numeric"
                />
              </Field>
              <PolicyIdSummary value={policyId} recentPolicies={recentPolicies} allowZero />
            </div>
          </div>
          <ErrorNote message={error} />
          {updatedHash ? (
            <p className="mt-4 rounded-lg bg-bds-green-0 p-3 text-[13px] text-bds-green-70">
              Policy attached successfully.{' '}
              <Link href={`${VIBENET_EXPLORER_PATH}/tx/${updatedHash}`} className="text-base-blue hover:underline">
                View transaction ↗
              </Link>
            </p>
          ) : null}
          <Button className="mt-5" onClick={() => void submit()} disabled={!!busy}>
            {busy ? 'Sending…' : 'Attach policy'}
          </Button>
        </>
      )}
    </Card>
  );
}
