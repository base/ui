---
name: build-with-viem-eip8130
description: >-
  Build apps on Base's native account abstraction (EIP-8130) and payer
  sponsorship (ERC-8168) using the viem experimental module. Use when writing
  code that creates or operates 8130 smart accounts, authorizes session-key
  actors or policies, sends batched calls, sponsors gas with a payer, or wires a
  frontend/script against the vibenet devnet or Base Sepolia.
---

# Build with viem — EIP-8130 (native account abstraction)

EIP-8130 puts account abstraction **in the protocol**. Accounts are portable
across EVM chains, support multiple signer types (secp256k1, P-256, WebAuthn),
key rotation without changing address,
scoped session-key actors, on-chain policies, and native ERC-8168 gas
sponsorship. The tooling lives in viem's `experimental/eip8130` module.

## Where the code lives

- **EIP-8130 spec:** https://eip.tools/eip/8130 (payer standard:
  https://eip.tools/eip/8168).
- **viem fork/branch:** `github.com/chunter-cb/viem`, branch `feat/eip-8130`
  (module: `src/experimental/eip8130`, payer: `src/experimental/eip8168`;
  docs: `site/pages/experimental/eip8130`). The experimental module is not yet
  in npm `viem`, so install the fork branch.
- **RPC endpoints (vibenet), chain id `84538453`:**
  - Public execution RPC — `https://rpc.vibes.base.org`. This **is** 8130-capable
    (`AA_TX_TYPE` / `0x79`); use it for reads, estimates, and broadcasts from
    Node/scripts.
  - Browser proxy — `https://vibes.base.org/api/vibenet/account/rpc`. Same
    upstream chain, exposed as a same-origin Next.js proxy so the web UI can
    call `eth_*` without CORS. Prefer this from the browser; from Node either
    URL works.
  - Hosted payer — `https://vibes.base.org/api/vibenet/account/payer`.
  - Faucet — `POST https://vibes.base.org/api/vibenet/faucet/drip`
    with `{ "address": "0x…" }`.
- **Base Sepolia** — `https://sepolia.base.org`, chain id `84532`.

Add the fork branch as your `viem` dependency, then import from
`viem/experimental/eip8130` (and `viem/experimental/eip8168`):

```bash
bun add "viem@github:chunter-cb/viem#feat/eip-8130"
```

```ts
import { privateKeyToAccount } from "viem/accounts";
import { newSmartAccount8130, sendCalls8130 } from "viem/experimental/eip8130";
```

## Core concepts

- **Account** — a viem-style account object with `.address` (deterministic,
  CREATE2-derived), `.create()` / `.createChange` (first-tx deploy change), and
  `signTransaction`. Create via `newSmartAccount8130` / `to8130Account` /
  `toEoa8130Account`.
- **Signer** — a signing object that can produce `sender_auth`. For K1, use
  `privateKeyToAccount(pk)` (a viem `LocalAccount`). For P-256 / WebAuthn use
  `toP256Signer` / `toWebAuthnSigner`.
- **Actor** — an on-chain identity (`{ actorId, authenticator }`), built with
  `key.k1(address)` / `key.p256(...)` / `key.webAuthn(...)`. Used for
  `initialActors`, `authorizeActor`, `revokeActor` — **not** as the `signer`
  passed to `newSmartAccount8130`.
- **Scope** (`actorScope`) — `scopeUnrestricted` (0x00) is admin. Bits:
  `sender` `policy` `nonce` `selfPayer` `sponsorPayer`. A policy-bearing actor
  must be restricted (non-zero scope), or `authorizeActor` throws.
- **Nonce mode** — admin (`0x00`) or an actor with the `nonce` bit
  (`SCOPE_NONCE`) may use **ordered** (sequenced, expiry-free) *or* nonce-free
  (expiring) nonces; sends default to ordered. Only a restricted actor
  **without** `SCOPE_NONCE` is confined to nonce-free.
- **Policy** — on-chain rules (e.g. `SessionPolicy`: per-token spend limits +
  call scopes). Built with `defineSessionPolicy` + `encodeSessionPolicyConfig`.
- **Calls** — a batch of `{ to, value?, data? }` executed atomically, with
  optional signed top-level `metadata` (set via `dataSuffix` on send).
- **Payer (ERC-8168)** — a service that co-signs `payer_auth` to pay gas
  (sponsored or in ERC-20). Client: `createPayerClient`.

## Minimal end-to-end: create a smart account and send a batch

```ts
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import {
  createPublicClient, http, parseEther, toHex,
  newSmartAccount8130, sendCalls8130, estimateGas8130, encodeWalletCalls,
  waitForTransactionReceipt8130, allPhasesSucceeded,
} from "viem/experimental/eip8130";

const chainId = 84538453; // vibenet (Base Sepolia = 84532)
const RPC_URL = "https://rpc.vibes.base.org"; // 8130-capable public RPC
const chain = {
  id: chainId,
  name: "vibenet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
};
const client = createPublicClient({ chain, transport: http(RPC_URL) });
// Browser apps: use https://vibes.base.org/api/vibenet/account/rpc instead
// (same chain, CORS-safe proxy).

// 1) Signer = LocalAccount (NOT key.k1 — that builds an actor identity).
const signer = privateKeyToAccount(generatePrivateKey());
//    P-256: toP256Signer({ privateKey }) · WebAuthn: toWebAuthnSigner(...)

// 2) Deterministic account — address exists before any tx. The owner is an
//    admin actor (scope 0x00), so sends default to ORDERED (sequenced) nonces,
//    which are expiry-free. (Nonce-free/expiring mode is opt-in via
//    `nonceKey: nonceKeyMax` — see Gotchas for its current known bug.)
//    key.k1(signer.address) is what newSmartAccount8130 uses internally for
//    the primary actor — you only call key.* when authorizing extra actors.

// 3) Fund account.address (faucet), then estimate + send.
await fetch("https://vibes.base.org/api/vibenet/faucet/drip", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ address: account.address }),
});

const calls = [{ to: "0x…recipient", value: parseEther("0.001") }];
const wire = encodeWalletCalls({ account: account.address, calls: [calls] });
const gas = await estimateGas8130(client, {
  sender: account.address,
  accountChanges: [account.createChange],
  calls: wire,
});

const hash = await sendCalls8130(client, {
  account,
  accountChanges: [account.createChange], // omit on subsequent txs
  calls,
  dataSuffix: toHex("invoice #4242"), // maps to signed metadata
  gas: (gas * 120n) / 100n,
});

// 4) Wait and check every phase succeeded.
const receipt = await waitForTransactionReceipt8130(client, { hash });
if (!allPhasesSucceeded(receipt)) throw new Error("a phase reverted");
```

Canonical contract addresses per chain come from `getEip8130Deployment(chainId)`
(or `canonicalEip8130Deployment`): `accountConfiguration`, `accounts.*`,
`authenticators.*`, `policies.{manager,sessionPolicy}`.

The current canonical deployment uses AccountConfiguration
`0x53648Cf00356fbAA1F2B531715c6B64AaBDE1555`, DefaultAccount
`0x58da469ef71Dd4B092B010CdA37DE124C926EebD`, PolicyManager
`0x6e9E627770C1c90371A2E4CB9474A7Af577a4306`, and SessionPolicy
`0x58ef2d572a1bC528f0B9121d686B2618809604Dc`.

## Authorize a policy-gated session actor

```ts
import {
  key, authorizeActor, actorScope,
  defineSessionPolicy, encodeSessionPolicyConfig, getEip8130Deployment,
} from "viem/experimental/eip8130";

const dep = getEip8130Deployment(chainId);
const policyConfig = encodeSessionPolicyConfig({
  tokenLimits: [{ token: usdv, limit: 100_000_000n, period: 604_800n }], // 100 USDV / week
  callScopes: [{ target: usdv, selectorRules: [{ selector: "0xa9059cbb" }] }], // transfer only
});
const session = defineSessionPolicy({
  account: account.address, policy: dep.policies.sessionPolicy,
  policyConfig, manager: dep.policies.manager, validUntil: 1_900_000_000n,
});

// #43 has no install step. Every execute carries the full PolicyBinding and
// the manager recomputes its authorized commitment.
const call = session.executeCall({ target, value: 0n, data });

// Actor identity for authorize (not a LocalAccount). SCOPE_POLICY is set
// automatically when `policy` is present.
const sessionActor = key.p256({ x: "0x…", y: "0x…" });
const change = authorizeActor(sessionActor, {
  scope: actorScope.sender,
  expiry: 1_900_000_000n,
  policy: session.actorPolicy,
});
// Include `change` in accountChanges of a sendCalls8130 signed by an admin actor.
```

## Verifying a config change (and why it can look "silent")

Account changes (authorize/revoke) do **not** surface success the way calls do.
Check them by **reading back on-chain state**, not by the receipt:

- **`receipt.logs` is empty even on a successful authorize.** `ActorAuthorized`
  is not surfaced as a normal EVM log here — "no events" is NOT a failure. Do
  not gate success on scanning logs.
- **`allPhasesSucceeded` / `phaseStatuses` only cover CALL phases**, not the
  account-change application. A skipped authorize marks no failed phase, throws
  nothing, and the tx still reports `status: success`.
- **The only reliable success check is a read-back:** `isActor8130`,
  `getActorConfig8130`, or a bumped `getConfigSequence8130`.
- **Reads lag ~1 block (~2s)** behind the receipt — poll the read-back.

Sequence correctness (the usual cause of a silent no-op): the digest binds
`(account, chainId, sequence)`. Always read the **live** counter for the channel
right before signing — never hardcode it. Session-key auth uses the **local**
channel (`chainId = chain.id`); owner changes use the **multichain** channel
(`chainId = 0`). The first-authorize sequence depends on the deploy path:

| Deploy path | First local sequence |
|---|---|
| Smart wallet (`createAccount`) | `1` (create bumps local 0→1) |
| Explicit `importAccount` | `1` |
| Bare 7702 delegation (`account.delegate`) | `0` (delegation does not initialize state) |

```ts
import { getConfigSequence8130, isActor8130 } from "viem/experimental/eip8130";

const { local } = await getConfigSequence8130(client, {
  accountConfiguration: dep.accountConfiguration,
  account: account.address,
}); // read live — do not assume 0 or 1
const change = await account.change([authorizeActor(/* … */)], {
  chainId, // local channel for session keys
  sequence: Number(local),
});
// … send the tx, then verify by read-back (polled for ~1 block of lag):
const bound = await isActor8130(client, {
  account: account.address, actorId, accountConfiguration: dep.accountConfiguration,
});
if (!bound) throw new Error("authorize was skipped — check sequence/channel");
```

A runnable end-to-end example (create → register PolicyManager + session key →
drive a real `Counter.increment()` through the session key, with read-back
verification at each step) lives in `tmp/policy-smoke.mjs`.

## Sponsor gas with a payer (ERC-8168)

The hosted vibenet payer supports **both** ERC-8168 modes:

- `mode: "send"` (default) — payer co-signs and submits (`payer_sendTransaction`)
- `mode: "sign"` — payer co-signs only; you broadcast with `eth_sendRawTransaction`

```ts
import { createPayerClient, sendSponsoredCalls } from "viem/experimental/eip8168";
import { waitForTransactionReceipt8130 } from "viem/experimental/eip8130";

const payerClient = createPayerClient({
  url: "https://vibes.base.org/api/vibenet/account/payer",
});

// Default mode:"send" — payer co-signs and broadcasts.
const { transactionHash: hash } = await sendSponsoredCalls(client, {
  account,
  payerClient,
  accountChanges: [account.createChange],
  calls: [{ to: account.address, value: 0n, data: "0x" }],
  context: { flow: "transact" }, // budgets free grants per (sender, flow)
});
const receipt = await waitForTransactionReceipt8130(client, { hash });
```

For self-submit (e.g. custom RPC / retry control), pass `mode: "sign"` and
broadcast the returned `signedTransaction` yourself.

## Reading account state (viem actions)

All take `(client, params)` and read the on-chain `AccountConfiguration`:
`getActorConfig8130`, `isActor8130`, `getPolicy8130`, `getSessionSpend8130`,
`getLockStatus8130` / `isLocked8130`, `getConfigSequence8130`,
`getTransactionCount8130`, `getTransaction8130`, `getTransactionReceipt8130`,
`waitForTransactionReceipt8130`.

## Account creation modes

- `newSmartAccount8130({ signer })` — new CREATE2 smart account (most common).
  `signer` must be a signing account (`privateKeyToAccount(pk)`, `toP256Signer`,
  or `toWebAuthnSigner`) — **not** `key.k1(...)`.
- `to8130Account({ signer, userSalt, code, initialActors, authenticator, accountConfigAddress })`
  — full control over salt / initial actors.
- `to8130Account({ signer, address, authenticator })` — a configured (non-default)
  actor on an existing/delegated account.
- `toEoa8130Account(signer)` — an EOA acting as its own default K1 actor
  (raw 65-byte sig, EIP-7702 delegation via `account.delegate(impl)`).

## Locking

`lockCall` / `initiateUnlockCall` build `applySignedLockChanges` calls; hash the
change to sign with `hashLockChange8130` (`lockChangeTypehash`). `lockCall`
requires `unlockDelay >= 1`.

## Gotchas

- **`key.k1` ≠ signer.** `key.k1(address)` builds an actor id for authorize /
  `initialActors`. Passing it (or a raw private-key hex) as `signer` to
  `newSmartAccount8130` fails with an opaque `pad()` TypeError — use
  `privateKeyToAccount(pk)`.
- Fund `account.address` **before** a self-paid first tx — the deploy+batch pays
  gas from the account (unless a payer sponsors it).
- Only the **first** tx includes `account.createChange`; later txs omit it.
- Attribution goes in `dataSuffix` on `sendCalls8130` (maps to signed `metadata`).
- Hosted payer supports `mode: "send"` (default, payer submits) and
  `mode: "sign"` (co-sign only; you broadcast).
- `rpc.vibes.base.org` **is** fine for `0x79` broadcasts (Node/scripts). The
  `account/rpc` URL is only required in the browser (CORS proxy to the same
  chain).
- **Nonce-free (expiring) sends have a known bug (planned fix July 22):** the
  node can intermittently reject a valid `0x79` with a misleading
  `transaction type not supported` (the short `expiry` lapses before
  validation). Until then, prefer **ordered (expiry-free)** sends — the default
  for admin and `SCOPE_NONCE` actors — which are unaffected.
- A policy actor must have a non-zero scope; admin (scope 0) + policy is rejected.
- Contract addresses are bytecode-derived — the deployed system must be compiled
  with the same solc as `canonicalEip8130Deployment`, or account creation fails
  with "create address mismatch".
- Chains must be 8130-aware: use `register8130Chains` / `is8130Enabled` when
  operating outside the built-in `eip8130ChainIds`.

## Reference

- Full API surface: `src/experimental/eip8130/index.ts` on the viem fork branch.
- viem docs: `site/pages/experimental/eip8130` on the fork branch — creating
  accounts, sending txs, session keys, batching, payer services, and more.
- First-run smoke that mirrors this skill: `tmp/skill-first-run.mjs`.
