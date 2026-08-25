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
  constructor(message = 'shadow metrics unavailable', options?: ErrorOptions) {
    super(message, options);
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
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ShadowUnavailableError('shadow-metrics request timed out', { cause: error });
    }
    throw new ShadowUnavailableError('failed to reach shadow-metrics', { cause: error });
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

  let data: Record<string, ShadowBlockSummaryWire[]>;
  try {
    data = await fetchShadowMetrics<Record<string, ShadowBlockSummaryWire[]>>(url);
  } catch (error) {
    // Unlike its siblings this degrades instead of throwing, because candidates
    // only decorate the block views. Log it: otherwise an unreachable
    // shadow-metrics looks identical to a block with no candidates.
    console.error('Error fetching shadow candidates:', { url, hashCount: hashes.length }, error);
    return {};
  }

  try {
    return Object.fromEntries(
      Object.entries(data).map(([hash, summaries]) => [
        hash.toLowerCase(),
        summaries.map(normalizeShadowSummary),
      ]),
    );
  } catch (error) {
    console.error('Error parsing shadow candidates:', { url }, error);
    return {};
  }
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
