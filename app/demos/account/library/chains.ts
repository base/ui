import {
  type Address,
  baseSepoliaDeployment,
  type Eip8130Deployment,
  vibenetDevnetDeployment,
} from "@aa";

import { isAddress } from "../../../vibenet/library/format";

/**
 * Last-known-good vibenet EIP-8130 system contracts — a STATIC FALLBACK only.
 *
 * vibenet is ephemeral: a reset redeploys the enshrined system contracts, and
 * several land at NEW addresses (accountConfiguration, DefaultAccount, high-rate
 * payer, DelegateAuthenticator, PolicyManager, SessionPolicy). The account
 * address is a CREATE2 of `keccak(0xff ‖ accountConfiguration ‖ salt ‖
 * keccak(proxyCode→DefaultAccount))`, so with stale addresses the client derives
 * a `from` the node can't reproduce → "EIP-8130 validation failed: create
 * address does not match the sender".
 *
 * Rather than re-hardcode after every reset, the demo resolves these at runtime
 * from https://api.vibes.base.org/api/vibenet/contracts via {@link deploymentFromContracts}.
 * This constant is used only until that fetch lands (or if it fails). The K1
 * authenticator (ecrecover precompile) and p256/webAuthn/alwaysValid
 * authenticators are deterministic across resets; `accounts.upgradeable`/
 * `accounts.erc4337` are not deployed on the native vibenet path (unused here).
 */
const VIBENET_DEPLOYMENT = {
  ...vibenetDevnetDeployment,
  accountConfiguration: "0x53648Cf00356fbAA1F2B531715c6B64AaBDE1555",
  accounts: {
    ...vibenetDevnetDeployment.accounts,
    default: "0x58da469ef71Dd4B092B010CdA37DE124C926EebD",
    defaultHighRate: "0x23Fe6949d6370330Ae32e7c17E1265D65955C92a",
  },
  authenticators: {
    ...vibenetDevnetDeployment.authenticators,
    delegate: "0xbb73E3871FBaC8aef1a7Ee8A24E21139916f14C2",
  },
  policies: {
    manager: "0x6e9E627770C1c90371A2E4CB9474A7Af577a4306",
    sessionPolicy: "0x58ef2d572a1bC528f0B9121d686B2618809604Dc",
  },
} satisfies Eip8130Deployment;

/**
 * Build an {@link Eip8130Deployment} from the live `/api/vibenet/contracts`
 * `eip8130` block so a devnet reset never requires a code change — the demo just
 * refetches. Falls back to {@link VIBENET_DEPLOYMENT} per field for anything the
 * API omits (K1 precompile; `upgradeable`/`erc4337`, unused on the native path),
 * and returns `null` when the payload lacks the core address-derivation
 * contracts (AccountConfiguration + DefaultAccount) so callers keep the static set.
 */
export function deploymentFromContracts(
  contracts: Record<string, unknown> | null | undefined,
): Eip8130Deployment | null {
  const eip8130 = (contracts as { eip8130?: Record<string, unknown> } | null)
    ?.eip8130;
  if (!eip8130 || typeof eip8130 !== "object") return null;

  // Core derivation inputs — without both, the live payload is unusable.
  if (!isAddress(eip8130.AccountConfiguration) || !isAddress(eip8130.DefaultAccount))
    return null;

  // Valid address by API key, else the static fallback.
  const addr = (key: string, fallback: Address): Address =>
    isAddress(eip8130[key]) ? (eip8130[key] as Address) : fallback;

  const fb = VIBENET_DEPLOYMENT;
  return {
    accountConfiguration: eip8130.AccountConfiguration as Address,
    accounts: {
      upgradeable: fb.accounts.upgradeable, // not deployed on native vibenet
      default: eip8130.DefaultAccount as Address,
      defaultHighRate: addr("CanonicalHighRatePayerAccount", fb.accounts.defaultHighRate),
      erc4337: fb.accounts.erc4337, // ERC-4337 path is Base Sepolia only
    },
    authenticators: {
      k1: fb.authenticators.k1, // ecrecover precompile — constant across resets
      p256: addr("P256Authenticator", fb.authenticators.p256),
      webAuthn: addr("WebAuthnAuthenticator", fb.authenticators.webAuthn),
      delegate: addr("DelegateAuthenticator", fb.authenticators.delegate),
      alwaysValid: addr("AlwaysValidAuthenticator", fb.authenticators.alwaysValid),
    },
    policies: {
      manager: addr("PolicyManager", fb.policies.manager),
      sessionPolicy: addr("SessionPolicy", fb.policies.sessionPolicy),
    },
  };
}

// omni-ui has no account backend of its own; these resolve to vibenet's
// cross-origin routes (see library/config.ts). Ported from same-origin paths.
import {
  ACCOUNT_BUNDLER_URL,
  ACCOUNT_PAYER_URL,
} from "../../../vibenet/library/config";

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
  tagline: "ERC-4337 today. Live system contracts deployed.",
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
  // vibenet is ephemeral — see VIBENET_DEPLOYMENT for the post-reset addresses.
  deployment: VIBENET_DEPLOYMENT,
  tagline: "Native AA_TX_TYPE. First-class account abstraction transactions.",
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
  // Number of calls that transfer a non-zero native ETH value. Each needs the
  // ~9k value stipend plus (for a not-yet-existent recipient) the ~25k
  // new-account creation cost. The node's `eth_estimateGas` misses this — it
  // converges to the tx-envelope cost, ignoring that the inner value transfer
  // must actually succeed — so the floor must carry it or a send to a cold
  // recipient OOG-reverts on-chain (unused gas is refunded, an OOG is not).
  valueCalls?: number;
  // When true, this value is the SOLE gas source (the node's `eth_estimateGas`
  // is unavailable, reverted, or the user chose "Send anyway"), so it is scaled
  // up by {@link FALLBACK_SAFETY} to over-provision on purpose — unused gas is
  // refunded, whereas an under-estimate causes an on-chain OOG revert. When
  // false (the default) it is used only as a *floor* beneath a successful node
  // estimate, so it must stay realistic-with-headroom or it would swamp the
  // node's accurate estimate and permanently over-price every transaction.
  fallback?: boolean;
}): number {
  const {
    mode,
    deploy,
    calls,
    keyChanges,
    policyCalls = 0,
    valueCalls = 0,
    fallback = false,
  } = params;
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
  // Headroom for a value-bearing inner CALL the node estimate can't see: the 9k
  // value-transfer surcharge (G_callvalue, which itself includes the 2,300 callee
  // stipend) + 25k creation of a cold recipient account (G_newaccount). Additive
  // on top of `perCall` (a value call is still a call). Both native and 4337 pay
  // it — the EVM cost is the same regardless of execution path.
  const perValueCall = 34_000;
  // 2x safety multiplier, applied ONLY in fallback mode (see `fallback` above):
  // when the node's `eth_estimateGas` is unavailable or reverts (staged config +
  // policy bundles, cold-account creation on a value transfer to a fresh
  // recipient, etc.) this structural value is the sole gas source, so over-budget
  // on purpose — unused gas is refunded, and an underestimate causes an on-chain
  // OOG revert (far worse than a temporarily higher limit). As a *floor* beneath
  // a successful node estimate we must NOT double it, or it would always exceed
  // the (buffered) real estimate and permanently over-price every transaction.
  const FALLBACK_SAFETY = fallback ? 2 : 1;
  return (
    FALLBACK_SAFETY *
    (base +
      deployCost +
      calls * perCall +
      keyChanges * perKeyChange +
      policyCalls * perPolicyCall +
      valueCalls * perValueCall +
      wrap)
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
