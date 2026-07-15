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
