import {
  baseSepoliaDeployment,
  type Eip8130Deployment,
  vibenetDevnetDeployment,
} from "@aa";

// omni-ui has no account backend of its own; these resolve to vibenet's
// cross-origin routes (see library/config.ts). Ported from same-origin paths.
import {
  ACCOUNT_BUNDLER_URL,
  ACCOUNT_PAYER_URL,
} from "../../../library/config";

/**
 * How EIP-8130 accounts execute on a given chain:
 * - `erc4337`        — portable path via the ERC-4337 EntryPoint (works today).
 * - `eip8130-native` — first-class `AA_TX_TYPE` transactions (once a chain ships
 *   EIP-8130 natively). The same account address works on both.
 */
export type AaMode = "erc4337" | "eip8130-native";

export type DemoChain = {
  id: number;
  name: string;
  shortName: string;
  mode: AaMode;
  /** `live` = usable now; `preview` = wired but pending native 8130 support. */
  status: "live" | "preview";
  rpcUrl?: string;
  blockExplorer?: string;
  /** EIP-8130 system contracts used for address derivation + execution. */
  deployment: Eip8130Deployment;
  tagline: string;
};

export const BASE_SEPOLIA: DemoChain = {
  id: 84532,
  name: "Base Sepolia",
  shortName: "base-sepolia",
  mode: "erc4337",
  status: "live",
  rpcUrl: "https://sepolia.base.org",
  blockExplorer: "https://sepolia.basescan.org",
  deployment: baseSepoliaDeployment,
  tagline: "ERC-4337 today — live system contracts deployed.",
};

export const VIBENET: DemoChain = {
  // Base "vibenet" devnet running native EIP-8130 (Cobalt). Native AA_TX_TYPE
  // flows (create, owner change, EOA delegation) are verified end-to-end here.
  id: 84538453,
  name: "Vibenet",
  shortName: "vibenet",
  mode: "eip8130-native",
  status: "preview",
  // Enshrined 8130 system contracts as derived by the devnet execution client.
  deployment: vibenetDevnetDeployment,
  tagline: "Native AA_TX_TYPE — first-class account abstraction transactions.",
};

export const DEMO_CHAINS: readonly DemoChain[] = [VIBENET];

export function getDemoChain(shortName: string): DemoChain {
  return DEMO_CHAINS.find((c) => c.shortName === shortName) ?? VIBENET;
}

/**
 * Canonical EIP-8130 system contracts. These deploy to the same addresses on
 * every chain (deterministic deployment), which is exactly why an account's
 * address is identical everywhere — derived from key(s) + salt + this config,
 * never from a per-chain factory.
 */
export const CANON_DEPLOYMENT = baseSepoliaDeployment;

export type DeployEstimate = {
  /** Estimated gas to deploy the account + run one no-op call. */
  gas: number;
  /** Rough end-to-end inclusion latency (ms) for a fresh account. */
  latencyMs: number;
  /** Path the transaction takes to reach the chain. */
  path: string;
};

/**
 * Illustrative deploy+call estimates. Not measured onchain — they model the
 * structural difference between the two execution paths:
 *
 * - ERC-4337: a UserOperation is relayed wallet → bundler → EntryPoint, which
 *   adds per-op verification overhead, EntryPoint accounting, and large
 *   calldata, plus a bundler round-trip before inclusion.
 * - Native EIP-8130: the account-abstraction transaction is a first-class tx
 *   type — no EntryPoint, no bundler hop, account creation handled inline.
 */
export function estimateDeployAndCall(mode: AaMode): DeployEstimate {
  if (mode === "eip8130-native")
    return { gas: 172_000, latencyMs: 2_000, path: "direct inclusion" };
  return {
    gas: 286_000,
    latencyMs: 6_000,
    path: "wallet → bundler → EntryPoint",
  };
}

export function pctCheaper(from: DeployEstimate, to: DeployEstimate): number {
  return Math.round(((from.gas - to.gas) / from.gas) * 100);
}

/**
 * Structural gas floor for a single composed transaction.
 *
 * This is NOT the expected gas usage — it's a conservative safe *minimum* used
 * as a fallback (when the node can't run `eth_estimateGas`) and as a floor
 * under {@link safeGasLimit} so a pathological node under-estimate (an inner
 * CALL that OOGs is still a valid 8130 inclusion) can't under-provision a tx.
 *
 * The native constants are calibrated from observed on-chain usage on the
 * vibenet devnet — with headroom, but no longer the 2–6× over-provisioning the
 * old values produced:
 *   - a 2-call non-deploy native tx used ~34k gas
 *   - the account `create()` on first use added ~100k on top
 * so base ≈ 20k, per-call ≈ 10k, deploy ≈ 100k in practice. We pad each ~1.3×
 * to keep the floor safely above reality (per-call keeps extra headroom for a
 * value-bearing inner CALL's 9k stipend, which the node estimate can miss).
 */
export function estimateTxGas(params: {
  mode: AaMode;
  deploy: boolean;
  calls: number;
  keyChanges: number;
  // Number of calls routed through a PolicyManager (session-key sends). Each
  // adds the PolicyManager.execute frame, policy validation, spend-tracking
  // SSTOREs, and the callback into executeBatch on top of the inner call.
  policyCalls?: number;
}): number {
  const { mode, deploy, calls, keyChanges, policyCalls = 0 } = params;
  // ERC-4337: EntryPoint overhead (unchanged — different execution path).
  // EIP-8130 native: base covers intrinsic gas for authenticator dispatch,
  // AccountConfiguration lookup, and RLP calldata.
  const base = mode === "erc4337" ? 60_000 : 45_000;
  // Native deploy covers account `create()` execution plus the AccountConfiguration
  // setup the node charges as intrinsic. Kept generous: when a tx bundles staged
  // config changes + a policy install, the node's `eth_estimateGas` can't
  // simulate it and throws, so this structural floor is the ONLY gas source and
  // must stay above the tx's real intrinsic (unused gas is refunded anyway).
  const deployCost = deploy ? (mode === "erc4337" ? 250_000 : 160_000) : 0;
  const perCall = mode === "erc4337" ? 30_000 : 22_000;
  const perKeyChange = 26_000;
  const wrap = calls > 1 ? 9_000 : 0; // executeBatch routing
  // A policy-gated session call detours through PolicyManager.execute, which
  // decodes + validates the binding, updates spend tracking (cold SSTORE on
  // first use), and calls back into executeBatch. Budget generously: a
  // successful transfer's storage writes cost well beyond a bare call, and the
  // node's estimate can be low when the simulated inner call reverts (an 8130
  // reverting phase is still a valid inclusion), so the floor is the backstop.
  const perPolicyCall = 55_000;
  return (
    base +
    deployCost +
    calls * perCall +
    keyChanges * perKeyChange +
    policyCalls * perPolicyCall +
    wrap
  );
}

/** Public Base Sepolia RPC (read path: gas, balance, receipts). */
export const BASE_SEPOLIA_RPC = "https://sepolia.base.org";

/** Canonical Circle USDC on Base Sepolia (6 decimals) — the demo stablecoin. */
export const BASE_SEPOLIA_USDC =
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

/** Minimal viem `Chain` for Base Sepolia (read client + bundler client). */
export const baseSepoliaChain = {
  id: 84532,
  name: "Base Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [BASE_SEPOLIA_RPC] } },
} as const;

/** Cross-origin vibenet route that proxies ERC-4337 JSON-RPC to the bundler. */
export const BUNDLER_PROXY_PATH = ACCOUNT_BUNDLER_URL;

/** Cross-origin vibenet route that runs the ERC-8168 payer. */
export const PAYER_PROXY_PATH = ACCOUNT_PAYER_URL;

/**
 * ERC-8168 payer web service endpoint (native EIP-8130 gas sponsorship + USDV
 * token payment).
 *
 * In omni-ui this is vibenet's cross-origin {@link PAYER_PROXY_PATH} — already
 * an absolute URL, which viem's `http()` transport requires. Set
 * `NEXT_PUBLIC_PAYER_URL` to point at a standalone `just payer` instead (e.g.
 * for local `npm run dev` against a local payer).
 */
export const PAYER_URL = process.env.NEXT_PUBLIC_PAYER_URL ?? ACCOUNT_PAYER_URL;

/**
 * Whether the demo should attempt a paymaster-sponsored UserOperation (no
 * account funding required). Set `NEXT_PUBLIC_BASE_SEPOLIA_SPONSOR=1` when the
 * configured bundler endpoint also serves `pm_*` sponsorship.
 */
export const SPONSOR_BASE_SEPOLIA =
  process.env.NEXT_PUBLIC_BASE_SEPOLIA_SPONSOR === "1";

export function basescanTx(hash: string): string {
  return `https://sepolia.basescan.org/tx/${hash}`;
}
export function basescanAddress(addr: string): string {
  return `https://sepolia.basescan.org/address/${addr}`;
}
