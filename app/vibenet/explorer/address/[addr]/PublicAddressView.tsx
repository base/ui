'use client';

// Read-only inspector for an address that is not one of your local accounts:
// assets, actors (owners + session keys as indexed), and activity. No `@aa` —
// this is the light public path. Shares the assets + activity components with
// the owned management view and renders inside the shared AccountShell.

import { useMemo } from 'react';

import { Card } from '../../../../components/ui/Card';
import { Text } from '../../../../components/ui/Text';
import { DetailList, DetailRow } from '../../../components/DetailList';
import { ExplorerLink } from '../../../components/ExplorerLink';
import { Badge } from '../../../demos/_shared/primitives';
import type { ActorEntry, ExplorerAddressResponse } from '../../../library/api-types';
import { authLabel, expiryLabel, K1_AUTHENTICATOR, scopeChips } from '../../../library/explorer';
import { shortAddress } from '../../../library/format';
import { AccountShell, useSectionParam, type ShellSection } from './AccountShell';
import { ActivityTable } from './ActivityTable';
import { AssetsCard } from './AssetsCard';

const CHIP =
  'inline-flex items-center rounded-full border border-bds-gray-10 px-2.5 py-1 text-[11px] leading-none text-bds-gray-60 dark:border-white/10 dark:text-bds-gray-40';

const SECTIONS: ShellSection[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'actors', label: 'Actors' },
  { id: 'activity', label: 'Activity' },
];

function ActorCard({ actor }: { actor: ActorEntry }) {
  return (
    <Card className="bg-background p-4 dark:bg-white/5">
      <div className="flex flex-wrap items-center gap-2">
        <code className="font-mono text-[13px]" title={actor.actorId}>
          {shortAddress(actor.actorId, 14, 4)}
        </code>
        {actor.isSelf ? <span className={CHIP}>self</span> : null}
        <Badge>{authLabel(actor.authenticator)}</Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {scopeChips(actor.scope).map((chip) => (
          <span key={chip} className={CHIP}>
            {chip}
          </span>
        ))}
        <span className={CHIP}>{expiryLabel(actor.expiry)}</span>
        {actor.policyType !== 0 ? <span className={CHIP}>policy · type {actor.policyType}</span> : null}
      </div>
      {actor.policyManager ? (
        <DetailList className="mt-3">
          <DetailRow label="policy manager">
            <ExplorerLink kind="address" value={actor.policyManager} label={actor.policyManager} className="break-all" />
          </DetailRow>
          {actor.policyCommitment ? (
            <DetailRow label="commitment">
              <code className="break-all font-mono" title={actor.policyCommitment}>
                {shortAddress(actor.policyCommitment, 14, 4)}
              </code>
            </DetailRow>
          ) : null}
        </DetailList>
      ) : null}
    </Card>
  );
}

export function PublicAddressView({ address, data }: { address: string; data: ExplorerAddressResponse }) {
  const [section, selectSection] = useSectionParam({
    valid: SECTIONS.map((s) => s.id),
    fallback: 'overview',
  });

  const typeBadge = data.is_contract ? 'Contract' : data.is_aa ? 'Smart account' : 'EOA';

  // Implicit secp256k1 self key when no AccountConfiguration events are indexed.
  const selfActor = useMemo<ActorEntry>(
    () => ({
      actorId: data.self_actor_id ?? '',
      authenticator: K1_AUTHENTICATOR,
      scope: 0,
      expiry: 0,
      policyType: 0,
      policyManager: null,
      policyCommitment: null,
      isSelf: true,
    }),
    [data.self_actor_id],
  );

  return (
    <AccountShell
      name="Address"
      address={address}
      badges={<Badge>{typeBadge}</Badge>}
      sections={SECTIONS}
      activeSection={section}
      onSelectSection={selectSection}
    >
      {section === 'overview' ? (
        <AssetsCard address={address} activity={data.activity} />
      ) : section === 'actors' ? (
        data.actors_indexed ? (
          data.actors.length === 0 ? (
            <Text variant="label.regular" tone="muted">
              No active actors — every registered actor has been revoked.
            </Text>
          ) : (
            <div className="flex flex-col gap-3">
              {data.actors.map((actor) => (
                <ActorCard key={actor.actorId} actor={actor} />
              ))}
            </div>
          )
        ) : (
          <div className="flex flex-col gap-2">
            <ActorCard actor={selfActor} />
            <Text variant="footnote" tone="muted">
              Implicit secp256k1 self key — no AccountConfiguration events indexed for this address yet.
            </Text>
          </div>
        )
      ) : (
        <ActivityTable activity={data.activity} />
      )}
    </AccountShell>
  );
}
