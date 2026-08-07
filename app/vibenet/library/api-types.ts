// Public contract for the vibenet dataplane API (`/api/vibenet/*`).
//
// This is a self-contained copy of vibenet's `src/lib/vibenet/api-types.ts`
// (exposed by vibenet PR #7, "Phase A: expose vibenet dataplane API"). The
// upstream file re-exports several row/entry types from internal modules
// (`db.ts`, `accountConfigEvents.ts`) that omni-ui does NOT port; those are
// inlined here so this module has no vibenet-internal dependencies.
//
// Source of truth: vibenet `docs/openapi.json` + `src/lib/vibenet/api-types.ts`.
// Keep in sync with those when the API changes.
//
// Conventions:
//   *_wei / *_units / drip_* — decimal strings (bigint-safe over JSON).
//   Hex quantities from the explorer block/tx routes are `0x`-prefixed strings
//   mirroring the go-ethereum JSON-RPC encoding.

export type Address = string;
export type Hex = string;

/** Every endpoint may return this instead of its success shape on error. */
export type ApiError = {
  error: string;
};

// ---------------------------------------------------------------------------
// Inlined row/entry types (upstream: `@/lib/vibenet/db`)
// ---------------------------------------------------------------------------
export type BlockRow = {
  number: number;
  hash: string;
  timestamp: number;
  miner: string;
  tx_count: number;
  gas_used: number;
  gas_limit: number;
  base_fee: string | null;
};
export type TxRow = {
  hash: string;
  block_num: number;
  tx_index: number;
  from_addr: string;
  to_addr: string | null;
  value: string;
  status: number;
  created: string | null;
};
export type ActivityRow = {
  address: string;
  block_num: number;
  tx_index: number;
  log_index: number;
  tx_hash: string;
  role: number;
  token: string | null;
};
export type StatsRow = {
  blocks: number;
  txs: number;
  addresses: number;
};

// ---------------------------------------------------------------------------
// Inlined types (upstream: `@/lib/vibenet/accountConfigEvents`)
// ---------------------------------------------------------------------------
export type DecodedAccountConfigEvent = {
  eventName: string;
  args: Record<string, unknown>;
};
export type ActorEntry = {
  actorId: string;
  authenticator: string;
  scope: number;
  /** Unix seconds; `0` = no expiry. */
  expiry: number;
  policyType: number;
  policyManager: string | null;
  policyCommitment: string | null;
  /** True when this is the account's own secp256k1 self key. */
  isSelf: boolean;
};

// ---------------------------------------------------------------------------
// GET /api/vibenet/health
// ---------------------------------------------------------------------------
export type HealthResponse = {
  ok: boolean;
  chainId: number;
  lastIndexedBlock: number | null;
};

// ---------------------------------------------------------------------------
// GET /api/vibenet/chain-health
//
// L2 *chain* health for the in-app maintenance banner. Deliberately distinct
// from /api/vibenet/health above (which is the load-balancer liveness probe).
// Source of truth: vibenet `src/app/api/vibenet/chain-health/route.ts`.
// NOTE: this endpoint always responds HTTP 200 — branch on `healthy`, never the
// status code. `healthy === (reason === null)`.
// ---------------------------------------------------------------------------
export type ChainHealthResponse = {
  healthy: boolean;
  reason: 'maintenance' | 'halted' | 'tx_not_landing' | 'rpc_unreachable' | null;
  detail: string | null;
  /** Latest block number (`0` when unknown). */
  head: number;
  /** Seconds since the head block's timestamp. */
  headAgeSecs: number;
  /** Faucet pending − mined nonce. */
  faucetBacklog: number;
  /** How long the faucet's mined nonce has been frozen, in seconds. */
  stuckSecs: number;
};

// ---------------------------------------------------------------------------
// GET /api/vibenet/config     (contents of config.json, rendered from content.yaml)
// ---------------------------------------------------------------------------
export type ConfigResponse = {
  title: string;
  subtitle: string;
  features: unknown[];
  branch: string;
  commit: string;
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// GET /api/vibenet/contracts  (raw contracts.json; `{}` during boot window)
// ---------------------------------------------------------------------------
export type ContractsResponse = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Explorer
// ---------------------------------------------------------------------------

// GET /api/vibenet/explorer/stats
export type ExplorerStatsResponse = StatsRow;

// GET /api/vibenet/explorer/blocks
export type ExplorerBlocksResponse = {
  blocks: BlockRow[];
  txs: TxRow[];
};

// GET /api/vibenet/explorer/block/[hash]   (accepts block hash or number)
export type ExplorerBlockResponse = {
  number: Hex;
  hash: Hex | null;
  parentHash: Hex;
  timestamp: Hex;
  miner: Address;
  gasUsed: Hex;
  gasLimit: Hex;
  baseFeePerGas: Hex | null;
  transactions: Hex[];
};

// GET /api/vibenet/explorer/tx/[hash]
export type ExplorerAaCall = {
  to: Address | null;
  value: Hex;
  data: Hex;
};
export type ExplorerAaPayload = {
  sender: Address;
  nonceKey: Hex;
  nonceSequence: Hex;
  expiry: Hex;
  maxFeePerGas: Hex | null;
  maxPriorityFeePerGas: Hex | null;
  /** Per-phase batches of calls. */
  calls: ExplorerAaCall[][];
  accountChanges: unknown[];
};
export type ExplorerTxLog = {
  address: Address;
  topics: Hex[];
  data: Hex;
  logIndex: number;
  decoded: DecodedAccountConfigEvent | null;
};
export type ExplorerTxResponse = {
  hash: Hex;
  blockHash: Hex;
  blockNumber: Hex | null;
  timestamp: Hex | null;
  from: Address;
  to: Address | null;
  value: Hex | null;
  gas: Hex | null;
  gasPrice: Hex;
  gasUsed: Hex | null;
  effectiveGasPrice: Hex | null;
  fee: Hex | null;
  type: string | number | null;
  typeHex: Hex | null;
  nonce: Hex | null;
  input: Hex;
  transactionIndex: Hex | null;
  status: 'pending' | 'ok' | 'fail';
  contractAddress: Address | null;
  /** True for EIP-8130 (type 0x79) account-abstraction transactions. */
  isAa: boolean;
  aa: ExplorerAaPayload | null;
  payer: Address | null;
  phaseStatuses: string[] | null;
  metadata: Hex | null;
  logs: ExplorerTxLog[];
};

// GET /api/vibenet/explorer/address/[addr]
export type ExplorerAddressResponse = {
  address: Address;
  balance_wei: Hex;
  nonce: number;
  is_contract: boolean;
  is_aa: boolean;
  code_size: number;
  activity: ActivityRow[];
  actors: ActorEntry[];
  actors_indexed: boolean;
  self_actor_id: Hex;
};

// ---------------------------------------------------------------------------
// Faucet
// ---------------------------------------------------------------------------

// GET /api/vibenet/faucet/status
export type FaucetStatusResponse = {
  address: Address;
  chain_id: number;
  drip_wei: string;
  balance_wei: string;
  ip_cooldown_secs: number;
  addr_cooldown_secs: number;
  usdv_address?: Address;
  usdv_drip_units?: string;
  nfv_address?: Address;
};

// POST /api/vibenet/faucet/{drip,drip-usdv,drip-nfv}
export type FaucetDripRequest = {
  address: Address;
};
export type FaucetDripEthResponse = {
  tx_hash: Hex;
  amount_wei: string;
  to: Address;
};
export type FaucetDripUsdvResponse = {
  tx_hash: Hex;
  to: Address;
  usdv_address: Address;
};
export type FaucetDripNfvResponse = {
  tx_hash: Hex;
  to: Address;
  nfv_address: Address;
};

// ---------------------------------------------------------------------------
// Vibes  (GET /api/vibenet/vibes; ?leaderboard=1 | ?address=0x…)
// ---------------------------------------------------------------------------
export type VibeEntry = {
  txHash: Hex | null;
  blockNumber: number;
  from: Address;
  to: Address;
  count: number;
};
export type VibesRecentResponse = {
  recent: VibeEntry[];
  contractAddress: Address;
};
export type VibesLeaderboardResponse = {
  leaders: { address: Address; count: number }[];
  contractAddress: Address;
};
export type VibesAddressResponse = {
  address: Address;
  sent: number;
  received: number;
  history: VibeEntry[];
  contractAddress: Address;
};

// ---------------------------------------------------------------------------
// Account  (STAGED — migrated in a later phase; types kept for completeness)
// ---------------------------------------------------------------------------

// GET /api/vibenet/account/balances?address=0x…&network=vibenet|base-sepolia
export type AccountBalancesResponse = {
  eth_wei: string | null;
  usdv: string | null;
  usdv_decimals: number | null;
  usdv_symbol: string | null;
};

// POST /api/vibenet/account/{payer,rpc,bundler} — JSON-RPC passthrough.
// Request/response follow the JSON-RPC 2.0 envelope (payer_* / eth_* methods).
export type JsonRpcRequest = {
  jsonrpc?: string;
  id?: unknown;
  method?: string;
  params?: unknown[];
};
export type JsonRpcResponse<T = unknown> = {
  jsonrpc: '2.0';
  id: unknown;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
};
