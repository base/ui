import { type Hash } from 'viem';

import { resolveExplorerChainFromRequest } from '../../chain';
import {
  bundleHistoryFromAuditEvents,
  getJoinedAuditEventsByBundle,
} from '../../audit-events';
import { getAuditRpcUrl, getRpcUrl } from '../../config';
import { explorerDisabledResponse } from '../../guard';
import type { BundleEvent, BundleTransaction } from '../../transaction-data';
import { publicClientFor, type ExplorerPublicClient } from '../../viem';

export const runtime = 'nodejs';

export interface BundleHistoryResponse {
  hash: string;
  history: BundleEvent[];
}

function bigintToHex(value: bigint | null | undefined): string {
  return value === null || value === undefined ? '0x0' : `0x${value.toString(16)}`;
}

function numberToHex(value: number | null | undefined): string {
  return value === null || value === undefined ? '0x0' : `0x${value.toString(16)}`;
}

function bundleTransactionFromViem(
  tx: Awaited<ReturnType<ExplorerPublicClient['getTransaction']>>,
): BundleTransaction {
  return {
    signer: tx.from,
    type: tx.typeHex ?? '',
    chainId: numberToHex(tx.chainId),
    nonce: numberToHex(tx.nonce),
    gas: bigintToHex(tx.gas),
    maxFeePerGas: bigintToHex(tx.maxFeePerGas ?? tx.gasPrice),
    maxPriorityFeePerGas: bigintToHex(tx.maxPriorityFeePerGas),
    to: tx.to,
    value: bigintToHex(tx.value),
    accessList: [...(tx.accessList ?? [])],
    input: tx.input,
    r: tx.r ?? '',
    s: tx.s ?? '',
    yParity: numberToHex(tx.yParity),
    v: bigintToHex(tx.v),
    hash: tx.hash,
  };
}

// Fills in full transaction fields for each bundle tx hash from the execution RPC.
// Audit bundle events only carry the tx hashes (and metering), so the on-chain
// signer/value/gas come from getTransaction.
async function enrichBundleTransactionsFromRpc(
  rpcUrl: string,
  history: BundleEvent[],
): Promise<BundleEvent[]> {
  const hashes = Array.from(
    new Set(
      history.flatMap(
        (event) => event.data.bundle?.txs.map((tx) => tx.hash).filter(Boolean) ?? [],
      ),
    ),
  );
  const client = publicClientFor(rpcUrl);
  const transactions = new Map<string, BundleTransaction>();

  await Promise.all(
    hashes.map(async (hash) => {
      try {
        const tx = await client.getTransaction({ hash: hash as Hash });
        transactions.set(hash, bundleTransactionFromViem(tx));
      } catch (error) {
        console.error(`Failed to fetch transaction ${hash} from RPC:`, error);
      }
    }),
  );

  return history.map((event) => {
    if (!event.data.bundle) return event;
    return {
      ...event,
      data: {
        ...event.data,
        bundle: {
          ...event.data.bundle,
          txs: event.data.bundle.txs.map((tx) => transactions.get(tx.hash) ?? tx),
        },
      },
    };
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ hash: string }> }) {
  const disabled = explorerDisabledResponse();
  if (disabled) return disabled;
  const chain = resolveExplorerChainFromRequest(request);

  // Bundle history comes only from the audit events RPC (Postgres-backed).
  const auditRpcUrl = getAuditRpcUrl(chain);
  if (!auditRpcUrl) {
    return Response.json({ error: 'Bundle not found' }, { status: 404 });
  }

  const { hash } = await params;

  let events;
  try {
    events = await getJoinedAuditEventsByBundle(auditRpcUrl, hash);
  } catch (error) {
    console.error('Error fetching bundle history from audit RPC:', error);
    return Response.json({ error: 'Audit RPC unavailable' }, { status: 502 });
  }

  try {
    const bundle = bundleHistoryFromAuditEvents(hash, events);
    if (!bundle) {
      return Response.json({ error: 'Bundle not found' }, { status: 404 });
    }

    const history = await enrichBundleTransactionsFromRpc(getRpcUrl(chain), bundle.history);
    history.sort((lhs, rhs) => (lhs.data.timestamp < rhs.data.timestamp ? -1 : 1));

    const response: BundleHistoryResponse = {
      hash,
      history,
    };

    return Response.json(response);
  } catch (error) {
    console.error('Error fetching bundle data:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
