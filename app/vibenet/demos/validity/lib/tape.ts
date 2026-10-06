import {
  BLOCK_SECONDS,
  CANDLE_BACKFILL_MS,
  CANDLE_BUCKET_MS,
  CANDLE_SAMPLE_MS,
  CANDLE_WINDOW_MS,
} from './constants';
import { quoteWad } from './quote';

export type TapeSample = { t: number; price: number };

export const TAPE_KEEP_MS = CANDLE_WINDOW_MS + CANDLE_BUCKET_MS;

export function mergeTape(
  existing: readonly TapeSample[],
  incoming: readonly TapeSample[],
  now = Date.now(),
): TapeSample[] {
  const slots = new Map<number, number>();
  const cutoff = now - TAPE_KEEP_MS;
  for (const sample of [...existing, ...incoming]) {
    if (!Number.isFinite(sample.price) || sample.price <= 0 || !Number.isFinite(sample.t)) continue;
    if (sample.t < cutoff || sample.t > now + CANDLE_SAMPLE_MS) continue;
    const slot = Math.floor(sample.t / CANDLE_SAMPLE_MS) * CANDLE_SAMPLE_MS;
    slots.set(slot, sample.price);
  }
  return [...slots.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([t, price]) => ({ t, price }));
}

export type SyncLog = {
  blockNumber: bigint;
  args: { reserve0?: bigint; reserve1?: bigint };
};

export function samplesFromSyncLogs(args: {
  logs: readonly SyncLog[];
  vibeToken0: boolean;
  latestBlock: bigint;
  now: number;
}): TapeSample[] {
  const blockMs = BLOCK_SECONDS * 1000;
  const incoming: TapeSample[] = [];
  for (const log of args.logs) {
    const { reserve0, reserve1 } = log.args;
    if (reserve0 === undefined || reserve1 === undefined) continue;
    const t = args.now - Number(args.latestBlock - log.blockNumber) * blockMs;
    const price = Number(quoteWad(reserve0, reserve1, args.vibeToken0)) / 1e18;
    incoming.push({ t, price });
  }
  return mergeTape([], incoming, args.now);
}

/** With no Sync in the lookback, the price was flat at the current mid the whole time. */
export function backfillSamples(args: {
  logs: readonly SyncLog[];
  vibeToken0: boolean;
  latestBlock: bigint;
  now: number;
  mid: number;
}): TapeSample[] {
  const fromLogs = samplesFromSyncLogs(args);
  const flat = fromLogs.length === 0 ? [{ t: args.now - CANDLE_BACKFILL_MS, price: args.mid }] : [];
  return mergeTape(flat, [...fromLogs, { t: args.now, price: args.mid }], args.now);
}

export function backfillBlocks(): bigint {
  return BigInt(Math.ceil(CANDLE_BACKFILL_MS / (BLOCK_SECONDS * 1000)));
}
