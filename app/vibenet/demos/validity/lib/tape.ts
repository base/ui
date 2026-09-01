import type { Address, Hex } from 'viem';

import { reservesFromSyncLog } from './amm';
import {
  BLOCK_SECONDS,
  CANDLE_BUCKET_MS,
  CANDLE_SAMPLE_MS,
  CANDLE_WINDOW_MS,
} from './constants';
import { quoteWad } from './quote';

export type TapeSample = { t: number; price: number };

export const TAPE_KEEP_MS = CANDLE_WINDOW_MS + CANDLE_BUCKET_MS;
export const TAPE_MAX_SAMPLES = Math.ceil(TAPE_KEEP_MS / CANDLE_SAMPLE_MS) + 8;
const BACKFILL_COVERAGE_MS = (CANDLE_WINDOW_MS * 4) / 5;

type TapeStore = Map<string, TapeSample[]>;

function globalStore(): TapeStore {
  const root = globalThis as typeof globalThis & { __validityTape?: TapeStore };
  if (!root.__validityTape) root.__validityTape = new Map();
  return root.__validityTape;
}

export function resetTapeStore(): void {
  globalStore().clear();
}

export function isAddress(value: string | null | undefined): value is Address {
  return Boolean(value && /^0x[0-9a-fA-F]{40}$/.test(value));
}

export function parseTapeSamples(value: unknown): TapeSample[] {
  if (!Array.isArray(value)) return [];
  const out: TapeSample[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const t = Number((row as { t?: unknown }).t);
    const price = Number((row as { price?: unknown }).price);
    if (!Number.isFinite(t) || !Number.isFinite(price) || price <= 0) continue;
    out.push({ t, price });
    if (out.length >= TAPE_MAX_SAMPLES) break;
  }
  return out;
}

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

export function tapeCoverageMs(samples: readonly TapeSample[], now = Date.now()): number {
  if (samples.length === 0) return 0;
  const first = samples[0].t;
  const last = samples[samples.length - 1].t;
  return Math.max(0, Math.min(now, last) - first);
}

export function needsLogBackfill(samples: readonly TapeSample[], now = Date.now()): boolean {
  return tapeCoverageMs(samples, now) < BACKFILL_COVERAGE_MS;
}

export function readTape(pair: Address): TapeSample[] {
  return mergeTape(globalStore().get(pair.toLowerCase()) ?? [], [], Date.now());
}

export function writeTape(pair: Address, incoming: readonly TapeSample[]): TapeSample[] {
  const key = pair.toLowerCase();
  const next = mergeTape(globalStore().get(key) ?? [], incoming, Date.now());
  globalStore().set(key, next);
  return next;
}

export type RpcLog = {
  address?: string;
  topics?: Hex[];
  data?: Hex;
  blockNumber?: string;
};

export function samplesFromSyncLogs(args: {
  logs: readonly RpcLog[];
  pair: Address;
  vibeToken0: boolean;
  latestBlock: bigint;
  now: number;
}): TapeSample[] {
  const blockMs = BLOCK_SECONDS * 1000;
  const incoming: TapeSample[] = [];
  for (const log of args.logs) {
    if (!log.address || !log.topics?.length || !log.data || !log.blockNumber) continue;
    if (log.address.toLowerCase() !== args.pair.toLowerCase()) continue;
    const reserves = reservesFromSyncLog({
      address: log.address as Address,
      topics: log.topics,
      data: log.data,
    });
    if (!reserves) continue;
    let block: bigint;
    try {
      block = BigInt(log.blockNumber);
    } catch {
      continue;
    }
    const t = args.now - Number(args.latestBlock - block) * blockMs;
    const price = Number(quoteWad(reserves.reserve0, reserves.reserve1, args.vibeToken0)) / 1e18;
    incoming.push({ t, price });
  }
  return mergeTape([], incoming, args.now);
}

export function lookbackBlocks(): bigint {
  return BigInt(Math.ceil(TAPE_KEEP_MS / (BLOCK_SECONDS * 1000)) + 8);
}
