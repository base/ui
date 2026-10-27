import { unstable_cache } from 'next/cache';

import type { Snapshot } from './snapshot.mjs';

// chain.base.org lists the latest node snapshots publicly. It sends no CORS header, so the server fetches it.
export const ARCHIVE_SNAPSHOTS_URL = 'https://chain.base.org/api/snapshots';
const TIMEOUT_MS = 5_000;
const REVALIDATE_SECONDS = 3_600;

// `size` is the whole archive snapshot, proofs included: production nodes run archive with proofs.
export type ArchiveSize = { size: number; sizeWithoutProofs: number; block: number; date: string; source: 'chain.base.org' };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isSize = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

// The mainnet archive entry, checked field by field; extra fields are ignored. Null when the shape is off.
export function parseArchiveSize(json: unknown): ArchiveSize | null {
  if (!Array.isArray(json)) return null;
  const entry = json.find((e) => isObj(e) && e.network === 'mainnet' && e.profile === 'archive');
  if (!isObj(entry)) return null;
  const { size, block, date, components } = entry;
  if (!isSize(size) || size === 0 || !Number.isSafeInteger(block) || (block as number) <= 0) return null;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(components)) return null;
  if (!components.every((c) => isObj(c) && typeof c.name === 'string' && isSize(c.size))) return null;
  const proofs = (components as { name: string; size: number }[]).find((c) => c.name === 'proofs')?.size ?? 0;
  if (proofs > size) return null;
  return { size, sizeWithoutProofs: size - proofs, block: block as number, date, source: 'chain.base.org' };
}

// Throws on any failure so a failed fetch is not cached.
export async function fetchArchiveSize(fetchImpl: typeof fetch = fetch): Promise<ArchiveSize> {
  const res = await fetchImpl(ARCHIVE_SNAPSHOTS_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${ARCHIVE_SNAPSHOTS_URL}: ${res.status}`);
  const archive = parseArchiveSize(await res.json());
  if (!archive) throw new Error(`${ARCHIVE_SNAPSHOTS_URL}: unexpected response shape`);
  return archive;
}

const fetchArchiveSizeCached = unstable_cache(() => fetchArchiveSize(), ['scaling-archive-size'], { revalidate: REVALIDATE_SECONDS });

// Optional context: on failure the page keeps the snapshot's archive size.
export async function loadArchiveSize(load: () => Promise<ArchiveSize> = fetchArchiveSizeCached): Promise<ArchiveSize | null> {
  try {
    return await load();
  } catch (error) {
    console.warn('[scaling] archive size from chain.base.org unavailable, using the snapshot value:', error);
    return null;
  }
}

// Only mainnet snapshots take the live mainnet archive size; testnet and synthetic ones keep their own.
export function withArchiveSize(snapshot: Snapshot, archive: ArchiveSize | null): Snapshot {
  if (!archive || !/\bmainnet\b/i.test(snapshot.network)) return snapshot;
  return {
    ...snapshot,
    production: {
      ...snapshot.production,
      archiveBytes: { value: archive.size, asOf: archive.date, source: `chain.base.org snapshot, block ${archive.block.toLocaleString('en-US')}`, note: 'incl. proofs' },
    },
  };
}
