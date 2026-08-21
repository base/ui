// Shadow-metrics proxy types + fetchers for TIPS shadow blocks.
// Server-only: do not import from client bundles.

export interface ShadowBlockSummary {
  number: number;
  hash: string;
  canonicalHash: string;
  timestamp: number;
  shadowBuilderVersion: string;
  canonicalBuilderVersion?: string;
  shadowGasUsed: number;
  canonicalGasUsed?: number;
  gasDiffAbs?: number;
  gasDiffPct?: number;
  shadowTxCount: number;
  canonicalTxCount?: number;
  txCountDiff?: number;
  shadowNonDepositTxCount: number;
  canonicalNonDepositTxCount?: number;
  shadowPriorityFeeInversions: number;
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

async function fetchShadowMetrics<T>(url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-store' });
  } catch {
    throw new ShadowUnavailableError('failed to reach shadow-metrics');
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
  return batch[canonicalHash] ?? [];
}

export async function fetchShadowCandidatesBatch(
  baseUrl: string,
  hashes: string[],
): Promise<Record<string, ShadowBlockSummary[]>> {
  if (hashes.length === 0) return {};
  const root = baseUrl.replace(/\/$/, '');
  const canonical = encodeURIComponent(hashes.join(','));
  const url = `${root}/shadow-candidates?canonical=${canonical}`;

  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return {};
    return (await response.json()) as Record<string, ShadowBlockSummary[]>;
  } catch {
    return {};
  }
}

export async function fetchShadowBlockSummary(
  baseUrl: string,
  hash: string,
): Promise<ShadowBlockSummary> {
  const root = baseUrl.replace(/\/$/, '');
  const url = `${root}/shadow-blocks/${encodeURIComponent(hash)}`;
  return fetchShadowMetrics<ShadowBlockSummary>(url);
}

export async function fetchShadowBlockDetail(
  baseUrl: string,
  hash: string,
): Promise<ShadowBlockDetail> {
  const root = baseUrl.replace(/\/$/, '');
  const url = `${root}/blocks/${encodeURIComponent(hash)}`;
  return fetchShadowMetrics<ShadowBlockDetail>(url);
}
