import { resolveTipsChain, type TipsChain } from '../../../../tips/chains';
import {
  bundleHistoryFromAuditEvents,
  getJoinedAuditEventsByBundle,
} from '../../audit-events';
import { getAuditRpcUrl, getRpcUrl } from '../../config';
import { tipsDisabledResponse } from '../../guard';
import { rpcCall } from '../../rpc';
import { getBundleHistory } from '../../s3';
import type { BundleEvent, BundleHistory, BundleTransaction } from '../../transaction-data';

export const runtime = 'nodejs';

export interface BundleHistoryResponse {
  hash: string;
  history: BundleEvent[];
}

interface RpcBundleTransaction {
  hash: string;
  from: string;
  to?: string | null;
  type?: string;
  chainId?: string;
  nonce?: string;
  gas?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  value?: string;
  input?: string;
  accessList?: unknown[];
  r?: string;
  s?: string;
  v?: string;
  yParity?: string;
}

function bundleTransactionFromRpc(tx: RpcBundleTransaction): BundleTransaction {
  return {
    signer: tx.from,
    type: tx.type ?? '',
    chainId: tx.chainId ?? '0x0',
    nonce: tx.nonce ?? '0x0',
    gas: tx.gas ?? '0x0',
    maxFeePerGas: tx.maxFeePerGas ?? tx.gasPrice ?? '0x0',
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas ?? '0x0',
    to: tx.to ?? null,
    value: tx.value ?? '0x0',
    accessList: Array.isArray(tx.accessList) ? tx.accessList : [],
    input: tx.input ?? '0x',
    r: tx.r ?? '',
    s: tx.s ?? '',
    yParity: tx.yParity ?? '',
    v: tx.v ?? '',
    hash: tx.hash,
  };
}

// Fills in full transaction fields for each bundle tx hash from the execution RPC.
// Audit/S3 bundle events only carry the tx hashes (and metering), so the on-chain
// signer/value/gas come from eth_getTransactionByHash.
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
  const transactions = new Map<string, BundleTransaction>();

  await Promise.all(
    hashes.map(async (hash) => {
      const result = await rpcCall(rpcUrl, 'eth_getTransactionByHash', [hash]);
      if (result && typeof result === 'object') {
        const tx = result as RpcBundleTransaction;
        transactions.set(hash, bundleTransactionFromRpc(tx));
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
  const disabled = tipsDisabledResponse();
  if (disabled) return disabled;
  const chain = resolveTipsChain(new URL(request.url).searchParams.get('chain'));

  try {
    const { hash } = await params;

    const bundle = await getAuditBundleHistory(chain, hash);
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

async function getAuditBundleHistory(
  chain: TipsChain,
  hash: string,
): Promise<BundleHistory | null> {
  const auditRpcUrl = getAuditRpcUrl(chain);
  if (!auditRpcUrl) {
    return getBundleHistory(chain, hash);
  }

  try {
    const events = await getJoinedAuditEventsByBundle(auditRpcUrl, hash);
    return bundleHistoryFromAuditEvents(hash, events) ?? (await getBundleHistory(chain, hash));
  } catch (error) {
    console.error('Falling back to S3 bundle history:', error);
    return getBundleHistory(chain, hash);
  }
}
