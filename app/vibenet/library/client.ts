// Typed client for the vibenet dataplane API.
//
// vibenet's backend runs in its own repo/infra; omni-ui consumes it cross-origin
// (see vibenet PR #7). The base URL is configured via
// `NEXT_PUBLIC_VIBENET_API_BASE_URL` and falls back to the public production host.
// CORS on the vibenet side allows GET/POST/OPTIONS with `Content-Type` and no
// credentials, so plain `fetch` works from both the browser and server components.

import type {
  AccountBalancesResponse,
  ConfigResponse,
  ContractsResponse,
  ExplorerAddressResponse,
  ExplorerBlockResponse,
  ExplorerBlocksResponse,
  ExplorerStatsResponse,
  ExplorerTxResponse,
  FaucetDripEthResponse,
  FaucetDripNfvResponse,
  FaucetDripRequest,
  FaucetDripUsdvResponse,
  FaucetStatusResponse,
  HealthResponse,
  VibesAddressResponse,
  VibesLeaderboardResponse,
  VibesRecentResponse,
} from './api-types';

const DEFAULT_BASE_URL = 'https://vibes.base.org';

// An unset OR empty env var falls back to the default. Trailing slash trimmed
// so `${BASE}${path}` never doubles up.
const configuredBaseUrl = process.env.NEXT_PUBLIC_VIBENET_API_BASE_URL;
export const VIBENET_API_BASE_URL = (
  configuredBaseUrl && configuredBaseUrl.length > 0 ? configuredBaseUrl : DEFAULT_BASE_URL
).replace(/\/+$/, '');

/** Thrown when the API responds with a non-2xx status. */
export class VibenetApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'VibenetApiError';
    this.status = status;
  }
}

function isApiError(body: unknown): body is { error: string } {
  return (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as { error: unknown }).error === 'string'
  );
}

type RequestOptions = {
  method: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
};

async function request<T>(path: string, options: RequestOptions): Promise<T> {
  const hasBody = options.body !== undefined;
  const response = await fetch(`${VIBENET_API_BASE_URL}${path}`, {
    method: options.method,
    // Live data — never serve a stale cached response.
    cache: 'no-store',
    signal: options.signal,
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message = isApiError(body)
      ? body.error
      : `vibenet API request to ${path} failed (${response.status})`;
    throw new VibenetApiError(message, response.status);
  }

  return body as T;
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { method: 'GET', signal });
}

async function post<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { method: 'POST', body, signal });
}

const enc = encodeURIComponent;

/** Networks the account balances endpoint accepts. */
export type AccountNetwork = 'vibenet' | 'base-sepolia';

// Typed endpoint helpers. The account rpc/payer/bundler JSON-RPC passthroughs
// are consumed directly by viem transports (see demos/account), not through
// this client; only the balances read is surfaced here.
export const vibenetApi = {
  health: async (signal?: AbortSignal) => get<HealthResponse>('/api/vibenet/health', signal),
  config: async (signal?: AbortSignal) => get<ConfigResponse>('/api/vibenet/config', signal),
  contracts: async (signal?: AbortSignal) =>
    get<ContractsResponse>('/api/vibenet/contracts', signal),

  explorer: {
    stats: async (signal?: AbortSignal) =>
      get<ExplorerStatsResponse>('/api/vibenet/explorer/stats', signal),
    blocks: async (signal?: AbortSignal) =>
      get<ExplorerBlocksResponse>('/api/vibenet/explorer/blocks', signal),
    block: async (hashOrNumber: string, signal?: AbortSignal) =>
      get<ExplorerBlockResponse>(`/api/vibenet/explorer/block/${enc(hashOrNumber)}`, signal),
    tx: async (hash: string, signal?: AbortSignal) =>
      get<ExplorerTxResponse>(`/api/vibenet/explorer/tx/${enc(hash)}`, signal),
    address: async (addr: string, signal?: AbortSignal) =>
      get<ExplorerAddressResponse>(`/api/vibenet/explorer/address/${enc(addr)}`, signal),
  },

  faucet: {
    status: async (signal?: AbortSignal) =>
      get<FaucetStatusResponse>('/api/vibenet/faucet/status', signal),
    drip: async (body: FaucetDripRequest, signal?: AbortSignal) =>
      post<FaucetDripEthResponse>('/api/vibenet/faucet/drip', body, signal),
    dripUsdv: async (body: FaucetDripRequest, signal?: AbortSignal) =>
      post<FaucetDripUsdvResponse>('/api/vibenet/faucet/drip-usdv', body, signal),
    dripNfv: async (body: FaucetDripRequest, signal?: AbortSignal) =>
      post<FaucetDripNfvResponse>('/api/vibenet/faucet/drip-nfv', body, signal),
  },

  account: {
    balances: async (address: string, network: AccountNetwork, signal?: AbortSignal) =>
      get<AccountBalancesResponse>(
        `/api/vibenet/account/balances?address=${enc(address)}&network=${enc(network)}`,
        signal,
      ),
  },

  vibes: {
    recent: async (signal?: AbortSignal) => get<VibesRecentResponse>('/api/vibenet/vibes', signal),
    leaderboard: async (signal?: AbortSignal) =>
      get<VibesLeaderboardResponse>('/api/vibenet/vibes?leaderboard=1', signal),
    address: async (addr: string, signal?: AbortSignal) =>
      get<VibesAddressResponse>(`/api/vibenet/vibes?address=${enc(addr)}`, signal),
  },
};
