'use client';

import { use, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { Card } from '../../../../components/ui/Card';
import { Text } from '../../../../components/ui/Text';
import { DetailList, DetailRow } from '../../../components/DetailList';
import { ExplorerLink } from '../../../components/ExplorerLink';
import type { ActorEntry, ExplorerAddressResponse } from '../../../library/api-types';
import { vibenetApi } from '../../../library/client';
import {
  authLabel,
  expiryLabel,
  K1_AUTHENTICATOR,
  roleLabel,
  scopeChips,
  weiToEth,
} from '../../../library/explorer';
import { shortAddress } from '../../../library/format';

const CHIP =
  'inline-flex items-center rounded-full border border-bds-gray-10 px-2.5 py-1 text-[11px] leading-none text-bds-gray-60 dark:border-white/10 dark:text-bds-gray-40';
const BADGE =
  'inline-flex items-center rounded-md bg-bds-blue-0 px-2 py-1 text-[11px] leading-none text-bds-blue-60 dark:bg-bds-blue-100/40 dark:text-base-blue';
const TH =
  'px-3 py-2 text-left text-[11px] font-medium uppercase tracking-[0.6px] text-bds-gray-60 dark:text-bds-gray-40';
const TD = 'px-3 py-2.5 text-[13px]';

type ActorCardProps = {
  actor: ActorEntry;
};

function ActorCard({ actor }: ActorCardProps) {
  return (
    <Card className="bg-white p-4 dark:bg-white/5">
      <div className="flex flex-wrap items-center gap-2">
        <code className="font-mono text-[13px]" title={actor.actorId}>
          {shortAddress(actor.actorId, 14, 4)}
        </code>
        {actor.isSelf ? <span className={CHIP}>self</span> : null}
        <span className={BADGE}>{authLabel(actor.authenticator)}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {scopeChips(actor.scope).map((chip) => (
          <span key={chip} className={CHIP}>
            {chip}
          </span>
        ))}
        <span className={CHIP}>{expiryLabel(actor.expiry)}</span>
        {actor.policyType !== 0 ? (
          <span className={CHIP}>policy · type {actor.policyType}</span>
        ) : null}
      </div>
      {actor.policyManager ? (
        <DetailList className="mt-3">
          <DetailRow label="policy manager">
            <ExplorerLink
              kind="address"
              value={actor.policyManager}
              label={actor.policyManager}
              className="break-all"
            />
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

type PageProps = {
  params: Promise<{ addr: string }>;
};

export default function ExplorerAddressPage({ params }: PageProps) {
  const { addr } = use(params);
  const [data, setData] = useState<ExplorerAddressResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    vibenetApi.explorer
      .address(addr)
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [addr]);

  // Implicit secp256k1 self key shown when no AccountConfiguration events are
  // indexed yet. Memoized so it's a stable prop for ActorCard.
  const selfActor = useMemo<ActorEntry>(
    () => ({
      actorId: data?.self_actor_id ?? '',
      authenticator: K1_AUTHENTICATOR,
      scope: 0,
      expiry: 0,
      policyType: 0,
      policyManager: null,
      policyCommitment: null,
      isSelf: true,
    }),
    [data?.self_actor_id],
  );

  let typeBody: ReactNode = 'EOA';
  if (data?.is_contract) {
    typeBody = `Contract (${data.code_size.toLocaleString()} bytes)`;
  } else if (data?.is_aa) {
    typeBody = (
      <>
        EIP-8130 AA Account <span className={BADGE}>native AA</span>
      </>
    );
  }

  let actorsBody: ReactNode = null;
  if (data) {
    if (data.actors_indexed) {
      actorsBody =
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
        );
    } else {
      actorsBody = (
        <div className="flex flex-col gap-2">
          <ActorCard actor={selfActor} />
          <Text variant="footnote" tone="muted">
            Implicit secp256k1 self key — no AccountConfiguration events indexed for this address
            yet.
          </Text>
        </div>
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Text variant="title2">Address</Text>
        <code className="mt-1 block break-all font-mono text-[13px] text-bds-gray-60 dark:text-bds-gray-40">
          {addr}
        </code>
      </div>

      {loading ? (
        <Text variant="label.regular" tone="muted">
          Loading…
        </Text>
      ) : null}

      {data ? (
        <>
          <Card className="bg-white p-6 dark:bg-white/5">
            <DetailList>
              <DetailRow label="Type">{typeBody}</DetailRow>
              <DetailRow label="Balance">{weiToEth(data.balance_wei)}</DetailRow>
              <DetailRow label="Nonce">{data.nonce.toString()}</DetailRow>
            </DetailList>
          </Card>

          <section className="flex flex-col gap-3">
            <Text variant="title3">Actors</Text>
            {actorsBody}
          </section>

          <section className="flex flex-col gap-3">
            <Text variant="title3">Activity</Text>
            {data.activity.length === 0 ? (
              <Card className="bg-white p-4 dark:bg-white/5">
                <Text variant="label.regular" tone="muted">
                  No activity indexed yet.
                </Text>
              </Card>
            ) : (
              <Card className="overflow-hidden bg-white dark:bg-white/5">
                <table className="w-full border-collapse">
                  <thead>
                    <tr
                      aria-label="Column headers"
                      className="border-b border-bds-gray-10 dark:border-white/10"
                    >
                      <th className={TH}>Block</th>
                      <th className={TH}>Tx</th>
                      <th className={TH}>Role</th>
                      <th className={TH}>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.activity.map((row) => (
                      <tr
                        key={`${row.tx_hash}-${row.role}-${row.log_index}`}
                        aria-label={`Activity ${row.tx_hash}`}
                        className="border-b border-bds-gray-10 last:border-0 dark:border-white/10"
                      >
                        <td className={TD}>
                          <ExplorerLink
                            kind="block"
                            value={String(row.block_num)}
                            label={row.block_num.toLocaleString()}
                          />
                        </td>
                        <td className={TD}>
                          <ExplorerLink kind="tx" value={row.tx_hash} />
                        </td>
                        <td className={TD}>{roleLabel(row.role)}</td>
                        <td className={TD}>
                          {row.token ? (
                            <span>
                              via <ExplorerLink kind="address" value={row.token} />
                            </span>
                          ) : (
                            <span className="text-bds-gray-60 dark:text-bds-gray-40">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
