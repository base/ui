import { delegationCost, k1AuthCost, nonceFreeCost, txValueCost } from "@aa";

// omni-ui has no account backend of its own; the payer resolves to vibenet's
// cross-origin route (see library/config.ts).
import { ACCOUNT_PAYER_URL } from "../../../library/config";

/**
 * How EIP-8130 accounts execute on a given chain. Only first-class
 * `AA_TX_TYPE` transactions are supported now that the Keystore (and with it
 * the ERC-4337 path through smart accounts) is disabled.
 */
export type AaMode = "eip8130-native";

export type DemoChain = {
  id: number;
  name: string;
  shortName: string;
  mode: AaMode;
  /** `live` = usable now; `preview` = wired but pending native 8130 support. */
  status: "live" | "preview";
  rpcUrl?: string;
  blockExplorer?: string;
  tagline: string;
};

export const VIBENET: DemoChain = {
  // Base "vibenet" devnet running native EIP-8130 (Cobalt) with the Keystore
  // disabled: senders are secp256k1 EOAs with optional code delegation.
  id: 84538453,
  name: "Vibenet",
  shortName: "vibenet",
  mode: "eip8130-native",
  status: "preview",
  tagline: "Native AA_TX_TYPE. First-class account abstraction transactions.",
};

export const DEMO_CHAINS: readonly DemoChain[] = [VIBENET];

export function getDemoChain(shortName: string): DemoChain {
  return DEMO_CHAINS.find((c) => c.shortName === shortName) ?? VIBENET;
}

/**
 * Structural gas floor for a single composed EOA transaction.
 *
 * This is NOT the expected gas usage — it's a conservative safe *minimum* used
 * as a fallback (when the node can't run `eth_estimateGas`) and as a floor
 * under {@link safeGasLimit} so a pathological node under-estimate (an inner
 * CALL that OOGs is still a valid 8130 inclusion) can't under-provision a tx.
 *
 * Calibrated from observed vibenet usage (a 2-call native tx used ~34k gas),
 * padded ~1.3×. The protocol dispatches each call natively from the sender, so
 * there is no account-contract routing overhead.
 */
export function estimateTxGas(params: {
  calls: number;
  // Calls with a non-zero native value to someone other than the sender. Each
  // pays the intrinsic TX_VALUE_COST, plus headroom for creating a cold
  // recipient (G_newaccount) that the node estimate can miss.
  valueCalls?: number;
  // A `delegation` account change (set or clear EIP-7702-style code).
  delegation?: boolean;
  // Nonce-free mode prices the replay ring buffer instead of a nonce slot.
  nonceless?: boolean;
  // A sponsoring payer adds its own K1 authentication.
  payer?: boolean;
  // A phase-0 ERC-20 transfer paying the payer (balance SSTOREs on top of the call).
  tokenPayment?: boolean;
  // When true, this value is the SOLE gas source (the node's `eth_estimateGas`
  // is unavailable or the user chose "Send anyway"), so it is doubled to
  // over-provision on purpose — unused gas is refunded, whereas an
  // under-estimate causes an on-chain OOG revert. When false (the default) it
  // is only a *floor* beneath a successful node estimate and must stay
  // realistic or it would permanently over-price every transaction.
  fallback?: boolean;
}): number {
  const {
    calls,
    valueCalls = 0,
    delegation = false,
    nonceless = false,
    payer = false,
    tokenPayment = false,
    fallback = false,
  } = params;
  const base = 45_000;
  const perCall = 22_000;
  const perValueCall = Number(txValueCost) + 25_000;
  // Delegation entry intrinsic plus headroom for writing the delegation code.
  const delegationGas = delegation ? Number(delegationCost) + 25_000 : 0;
  const nonceGas = nonceless ? Number(nonceFreeCost) : 0;
  const payerGas = payer ? Number(k1AuthCost) + 3_000 : 0;
  const tokenPaymentGas = tokenPayment ? 30_000 : 0;
  const FALLBACK_SAFETY = fallback ? 2 : 1;
  return (
    FALLBACK_SAFETY *
    (base +
      calls * perCall +
      valueCalls * perValueCall +
      delegationGas +
      nonceGas +
      payerGas +
      tokenPaymentGas)
  );
}

/**
 * ERC-8168 payer web service endpoint (native EIP-8130 gas sponsorship + USDV
 * token payment).
 *
 * In omni-ui this is vibenet's cross-origin payer route — already an absolute
 * URL, which viem's `http()` transport requires. Set `NEXT_PUBLIC_PAYER_URL` to
 * point at a standalone `just payer` instead (e.g. for local `npm run dev`
 * against a local payer).
 */
export const PAYER_URL = process.env.NEXT_PUBLIC_PAYER_URL ?? ACCOUNT_PAYER_URL;
