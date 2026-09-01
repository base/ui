import { NextResponse } from 'next/server';
import {
  decodeFunctionResult,
  encodeEventTopics,
  encodeFunctionData,
  parseAbi,
  toHex,
  type Address,
} from 'viem';

import { pairAbi } from '../../../../vibenet/demos/validity/lib/constants';
import { quoteWad } from '../../../../vibenet/demos/validity/lib/quote';
import {
  isAddress,
  lookbackBlocks,
  needsLogBackfill,
  parseTapeSamples,
  readTape,
  samplesFromSyncLogs,
  writeTape,
  type RpcLog,
  type TapeSample,
} from '../../../../vibenet/demos/validity/lib/tape';
import { forwardJsonRpc } from '../forward';

const SYNC_TOPIC = encodeEventTopics({
  abi: parseAbi(['event Sync(uint112 reserve0, uint112 reserve1)']),
  eventName: 'Sync',
})[0];

type JsonRpcResponse = { result?: unknown; error?: { message?: string } };

async function rpc<T>(method: string, params: unknown[]): Promise<T | null> {
  const body = (await forwardJsonRpc({ jsonrpc: '2.0', id: 1, method, params })) as JsonRpcResponse;
  if (body.error?.message || body.result === undefined || body.result === null) return null;
  return body.result as T;
}

async function backfillFromLogs(pair: Address, vibeToken0: boolean, now: number): Promise<TapeSample[]> {
  const latestHex = await rpc<string>('eth_blockNumber', []);
  if (!latestHex) return [];
  let latest: bigint;
  try {
    latest = BigInt(latestHex);
  } catch {
    return [];
  }
  const lookback = lookbackBlocks();
  const from = latest > lookback ? latest - lookback : 0n;
  const logs = await rpc<RpcLog[]>('eth_getLogs', [
    {
      address: pair,
      fromBlock: toHex(from),
      toBlock: 'latest',
      topics: [SYNC_TOPIC],
    },
  ]);
  if (!logs?.length) return [];
  return samplesFromSyncLogs({ logs, pair, vibeToken0, latestBlock: latest, now });
}

async function currentMid(pair: Address, vibeToken0: boolean): Promise<number | null> {
  const data = encodeFunctionData({ abi: pairAbi, functionName: 'getReserves' });
  const raw = await rpc<`0x${string}`>('eth_call', [{ to: pair, data }, 'latest']);
  if (!raw) return null;
  try {
    const decoded = decodeFunctionResult({
      abi: pairAbi,
      functionName: 'getReserves',
      data: raw,
    }) as [bigint, bigint, number];
    const price = Number(quoteWad(decoded[0], decoded[1], vibeToken0)) / 1e18;
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pair = url.searchParams.get('pair');
  if (!isAddress(pair)) {
    return NextResponse.json({ error: 'pair required' }, { status: 400 });
  }
  const vibeToken0 = url.searchParams.get('vibeToken0') !== '0';
  const now = Date.now();
  let samples = readTape(pair);
  if (needsLogBackfill(samples, now)) {
    const fromLogs = await backfillFromLogs(pair, vibeToken0, now);
    if (fromLogs.length > 0) samples = writeTape(pair, fromLogs);
  }
  const mid = await currentMid(pair, vibeToken0);
  if (mid !== null) samples = writeTape(pair, [{ t: now, price: mid }]);
  return NextResponse.json(
    { samples },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const record = body && typeof body === 'object' ? (body as { pair?: unknown; samples?: unknown }) : {};
  if (!isAddress(typeof record.pair === 'string' ? record.pair : null)) {
    return NextResponse.json({ error: 'pair required' }, { status: 400 });
  }
  const samples = writeTape(record.pair as Address, parseTapeSamples(record.samples));
  return NextResponse.json({ ok: true, count: samples.length });
}
