import { VIBENET_API_BASE_URL } from './client';

// Chain connection details surfaced on the Vibenet landing page. The RPC host
// is separate from the dataplane API host (see client.ts): it is the endpoint a
// user's wallet talks to directly. Defaults to the public devnet RPC and can be
// overridden (e.g. for a local devnet) via NEXT_PUBLIC_VIBENET_RPC_URL.
const DEFAULT_RPC_URL = 'https://rpc.vibes.base.org';

const configuredRpcUrl = process.env.NEXT_PUBLIC_VIBENET_RPC_URL;
export const VIBENET_RPC_URL =
  configuredRpcUrl && configuredRpcUrl.length > 0 ? configuredRpcUrl : DEFAULT_RPC_URL;

// The block explorer now lives inside omni-ui (Vibenet section), so explorer
// links are internal paths rather than a separate subdomain.
export const VIBENET_EXPLORER_PATH = '/vibenet/explorer';

// Account demo backend. Unlike the source (base/vibenet), which ran these as
// same-origin Next.js route handlers, omni-ui has no account backend of its own
// and consumes vibenet's cross-origin (verified CORS-open). viem's `http()`
// transport requires an absolute URL, which these already are.
//   - rpc     — JSON-RPC read path (gas, balances, receipts) for native 8130.
//   - payer   — ERC-8168 gas-sponsorship / USDV token-payment service.
//   - bundler — ERC-4337 JSON-RPC passthrough (Base Sepolia path).
export const ACCOUNT_RPC_URL = `${VIBENET_API_BASE_URL}/api/vibenet/account/rpc`;
export const ACCOUNT_PAYER_URL = `${VIBENET_API_BASE_URL}/api/vibenet/account/payer`;
export const ACCOUNT_BUNDLER_URL = `${VIBENET_API_BASE_URL}/api/vibenet/account/bundler`;
