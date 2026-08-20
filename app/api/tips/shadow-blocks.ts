// Shadow block listing proxied from the shadow-metrics HTTP API. Chain-aware:
// the caller passes the resolved base URL (getShadowMetricsUrl(chain)). Offset-
// paginated to match the upstream /shadow-blocks endpoint. The `*Diff` fields are
// shadow − canonical (positive = shadow used more). Server-only.

export const DEFAULT_SHADOW_BLOCKS_PAGE_LIMIT = 25;
export const MAX_SHADOW_BLOCKS_PAGE_LIMIT = 100;

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

export interface ShadowBlocksPage {
  offset: number;
  limit: number;
  totalCount: number;
  nextOffset: number | null;
  hasMore: boolean;
}

export interface ShadowBlocksResponse {
  blocks: ShadowBlockSummary[];
  page: ShadowBlocksPage;
}

export interface ShadowBlocksQuery {
  offset: number;
  limit: number;
}

export class InvalidShadowBlocksQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidShadowBlocksQueryError';
  }
}

export class ShadowBlocksUnavailableError extends Error {
  constructor(message = 'shadow blocks unavailable') {
    super(message);
    this.name = 'ShadowBlocksUnavailableError';
  }
}

function parseNonNegativeInteger(value: string | null, name: string): number | null {
  if (value === null) return null;
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new InvalidShadowBlocksQueryError(`${name} must be a non-negative integer`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new InvalidShadowBlocksQueryError(`${name} is too large`);
  }
  return parsed;
}

export function parseShadowBlocksQuery(searchParams: URLSearchParams): ShadowBlocksQuery {
  const offset = parseNonNegativeInteger(searchParams.get('offset'), 'offset') ?? 0;
  const rawLimit = searchParams.get('limit');
  const limit =
    rawLimit === null
      ? DEFAULT_SHADOW_BLOCKS_PAGE_LIMIT
      : parseNonNegativeInteger(rawLimit, 'limit');

  if (limit === null || limit < 1 || limit > MAX_SHADOW_BLOCKS_PAGE_LIMIT) {
    throw new InvalidShadowBlocksQueryError(
      `limit must be between 1 and ${MAX_SHADOW_BLOCKS_PAGE_LIMIT}`,
    );
  }

  return { offset, limit };
}

interface UpstreamShadowBlocksResponse {
  blocks: ShadowBlockSummary[];
  totalCount: number;
}

export async function listShadowBlocks(
  baseUrl: string,
  query: ShadowBlocksQuery,
): Promise<ShadowBlocksResponse> {
  const root = baseUrl.replace(/\/$/, '');
  const url = `${root}/shadow-blocks?limit=${query.limit}&offset=${query.offset}`;

  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-store' });
  } catch {
    throw new ShadowBlocksUnavailableError('failed to reach shadow-metrics');
  }

  if (!response.ok) {
    throw new ShadowBlocksUnavailableError(`shadow-metrics responded ${response.status}`);
  }

  const data = (await response.json()) as UpstreamShadowBlocksResponse;
  const blocks = data.blocks ?? [];
  const nextOffset = query.offset + blocks.length;
  const hasMore = nextOffset < data.totalCount;

  return {
    blocks,
    page: {
      offset: query.offset,
      limit: query.limit,
      totalCount: data.totalCount,
      nextOffset: hasMore ? nextOffset : null,
      hasMore,
    },
  };
}
