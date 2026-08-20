// Single block detail proxied from a shadow chain's shadow-metrics /blocks/{id}
// endpoint. `id` is a decimal block number or a 0x block hash (canonical or a
// reorged-out shadow block). Server-only.

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

export class ShadowBlockNotFoundError extends Error {
  constructor(message = 'block not found') {
    super(message);
    this.name = 'ShadowBlockNotFoundError';
  }
}

export class ShadowBlockDetailUnavailableError extends Error {
  constructor(message = 'block detail unavailable') {
    super(message);
    this.name = 'ShadowBlockDetailUnavailableError';
  }
}

export async function fetchShadowBlockDetail(
  baseUrl: string,
  id: string,
): Promise<ShadowBlockDetail> {
  const root = baseUrl.replace(/\/$/, '');
  const url = `${root}/blocks/${encodeURIComponent(id)}`;

  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-store' });
  } catch {
    throw new ShadowBlockDetailUnavailableError('failed to reach shadow-metrics');
  }

  if (response.status === 404) {
    throw new ShadowBlockNotFoundError();
  }
  if (!response.ok) {
    throw new ShadowBlockDetailUnavailableError(`shadow-metrics responded ${response.status}`);
  }

  return (await response.json()) as ShadowBlockDetail;
}
