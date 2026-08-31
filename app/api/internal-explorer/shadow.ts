// Shadow-metrics proxy types + fetchers for TIPS shadow blocks.
// Server-only: do not import from client bundles.

export interface ShadowBlockSummary {
  number: number;
  hash: string;
  canonicalHash?: string;
  timestamp: number;
  builderVersion: string;
  gasUsed: number;
  txCount: number;
  nonDepositTxCount: number;
  priorityFeeInversions: number;
}

interface ShadowBlockSummaryWire {
  number: number;
  hash: string;
  canonicalHash?: string;
  timestamp: number;
  builderVersion: string;
  gasUsed: string | number;
  txCount: string | number;
  nonDepositTxCount: string | number;
  priorityFeeInversions: string | number;
}

export interface ShadowTxSummary {
  index: number;
  hash: string;
  from?: string;
  to?: string;
  gasUsed?: number;
  gasLimit: number;
  txType: string;
}

export interface ShadowBlockDetail {
  number: number;
  hash: string;
  parentHash: string;
  timestamp: number;
  gasUsed: number;
  gasLimit: number;
  baseFeePerGas?: number;
  reorgedOut: boolean;
  canonicalHash?: string;
  txCount: number;
  transactions: ShadowTxSummary[];
}

export class ShadowUnavailableError extends Error {
  constructor(message = 'shadow metrics unavailable') {
    super(message);
    this.name = 'ShadowUnavailableError';
  }
}

export class ShadowNotFoundError extends Error {
  constructor(message = 'shadow block not found') {
    super(message);
    this.name = 'ShadowNotFoundError';
  }
}

const SHADOW_FETCH_TIMEOUT_MS = 4000;

function parseShadowNumber(value: string | number): number {
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeShadowSummary(summary: ShadowBlockSummaryWire): ShadowBlockSummary {
  return {
    number: summary.number,
    hash: summary.hash.toLowerCase(),
    canonicalHash: summary.canonicalHash?.toLowerCase(),
    timestamp: summary.timestamp,
    builderVersion: summary.builderVersion,
    gasUsed: parseShadowNumber(summary.gasUsed),
    txCount: parseShadowNumber(summary.txCount),
    nonDepositTxCount: parseShadowNumber(summary.nonDepositTxCount),
    priorityFeeInversions: parseShadowNumber(summary.priorityFeeInversions),
  };
}

async function fetchShadowMetrics<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SHADOW_FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-store', signal: controller.signal });
  } catch {
    if (controller.signal.aborted) {
      throw new ShadowUnavailableError('shadow-metrics request timed out');
    }
    throw new ShadowUnavailableError('failed to reach shadow-metrics');
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 404) {
    throw new ShadowNotFoundError();
  }

  if (!response.ok) {
    throw new ShadowUnavailableError(`shadow-metrics responded ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function fetchShadowCandidates(
  baseUrl: string,
  canonicalHash: string,
): Promise<ShadowBlockSummary[]> {
  const batch = await fetchShadowCandidatesBatch(baseUrl, [canonicalHash]);
  return batch[canonicalHash.toLowerCase()] ?? [];
}

export async function fetchShadowCandidatesBatch(
  baseUrl: string,
  hashes: string[],
): Promise<Record<string, ShadowBlockSummary[]>> {
  if (hashes.length === 0) return {};
  const root = baseUrl.replace(/\/$/, '');
  const canonical = encodeURIComponent(hashes.join(','));
  const url = `${root}/shadow-candidates?canonical=${canonical}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SHADOW_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) return {};
    const data = (await response.json()) as Record<string, ShadowBlockSummaryWire[]>;
    return Object.fromEntries(
      Object.entries(data).map(([hash, summaries]) => [
        hash.toLowerCase(),
        summaries.map(normalizeShadowSummary),
      ]),
    );
  } catch {
    return {};
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchRecentShadowBlocks(
  baseUrl: string,
  options: { limit?: number; before?: number } = {},
): Promise<ShadowBlockSummary[]> {
  const root = baseUrl.replace(/\/$/, '');
  const params = new URLSearchParams();
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.before !== undefined) params.set('before', String(options.before));
  const query = params.toString();
  const url = query ? `${root}/shadow-blocks?${query}` : `${root}/shadow-blocks`;
  const summaries = await fetchShadowMetrics<ShadowBlockSummaryWire[]>(url);
  return summaries.map(normalizeShadowSummary);
}

export async function fetchShadowBlockSummary(
  baseUrl: string,
  hash: string,
): Promise<ShadowBlockSummary> {
  const root = baseUrl.replace(/\/$/, '');
  const url = `${root}/shadow-blocks/${encodeURIComponent(hash)}`;
  const summary = await fetchShadowMetrics<ShadowBlockSummaryWire>(url);
  return normalizeShadowSummary(summary);
}

export async function fetchShadowBlockDetail(
  baseUrl: string,
  hash: string,
): Promise<ShadowBlockDetail> {
  const root = baseUrl.replace(/\/$/, '');
  const url = `${root}/blocks/${encodeURIComponent(hash)}`;
  return fetchShadowMetrics<ShadowBlockDetail>(url);
}
