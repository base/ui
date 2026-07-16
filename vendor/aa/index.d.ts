// Hand-written types for the self-contained AA vendor bundle (index.js).
// Covers the surface the vibenet account demo uses. Generated artifact pairing:
// `bun run vendor/aa/build.mjs` rebuilds index.js from the sibling viem branch.

export type Hex = `0x${string}`
export type Address = `0x${string}`

// ---------------------------------------------------------------------------
// Core viem (subset)
// ---------------------------------------------------------------------------

export type LocalAccount = {
  address: Address
  publicKey: Hex
  sign?: (parameters: { hash: Hex }) => Promise<Hex>
  signMessage: (parameters: { message: string | { raw: Hex } }) => Promise<Hex>
  signTypedData: (parameters: any) => Promise<Hex>
  type: string
}

export type Client = {
  chain?: { id: number; name?: string } | undefined
  request: (args: any) => Promise<any>
  [key: string]: any
}

export function http(url?: string, config?: any): any
export function custom(provider: any, config?: any): any
export function createPublicClient(parameters: any): Client
export function createWalletClient(parameters: any): Client
export function createBundlerClient(parameters: any): Client

export function encodeAbiParameters(params: readonly any[], values: readonly any[]): Hex
export function decodeAbiParameters(params: readonly any[], data: Hex): readonly any[]
export function encodeFunctionData(parameters: any): Hex
export function parseAbi(signatures: readonly string[]): any
export function keccak256(value: Hex | Uint8Array): Hex
export function slice(value: Hex, start?: number, end?: number): Hex
export function toHex(value: string | number | bigint | boolean | Uint8Array, opts?: any): Hex
export function hexToBigInt(hex: Hex, opts?: any): bigint
export function concatHex(values: readonly Hex[]): Hex
export function parseEther(ether: string): bigint
export function parseUnits(value: string, decimals: number): bigint
export function formatEther(wei: bigint): string
export const zeroAddress: Address

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export function generatePrivateKey(): Hex
export function privateKeyToAccount(privateKey: Hex): LocalAccount

// ---------------------------------------------------------------------------
// WebAuthn (ERC-4337 / passkeys)
// ---------------------------------------------------------------------------

export type P256Credential = { id: string; publicKey: Hex; raw: unknown }
export function createWebAuthnCredential(parameters: {
  name?: string
  [key: string]: any
}): Promise<P256Credential>

export type WebAuthnAccount = {
  id: string
  publicKey: Hex
  sign: (parameters: { hash: Hex }) => Promise<{
    signature: Hex
    webauthn: {
      authenticatorData: Hex
      clientDataJSON: string
      challengeIndex: number
      typeIndex: number
    }
    raw: unknown
  }>
}
export function toWebAuthnAccount(parameters: {
  credential: { id: string; publicKey: Hex }
  getFn?: any
  rpId?: string
}): WebAuthnAccount

export const entryPoint07Address: Address
export const entryPoint07Abi: readonly any[]

// ---------------------------------------------------------------------------
// EIP-8130
// ---------------------------------------------------------------------------

export type AaActor = { actorId: Hex; authenticator: Address }
export type AaAuthorizeActor = {
  changeType: 0x01
  actorId: Hex
  authenticator: Address
  scope?: number
  expiry?: bigint
  policyType?: number
  policyData?: Hex
}
export type AaRevokeActor = { changeType: 0x02; actorId: Hex }
export type AaActorChange = AaAuthorizeActor | AaRevokeActor
export type AaAccountChangeCreate = {
  type: 'create'
  userSalt: Hex
  code: Hex
  initialActors: readonly AaActor[]
}
export type AaAccountChangeConfig = {
  type: 'config'
  chainId: number
  sequence: number
  actorChanges: readonly AaActorChange[]
  auth: Hex
}
export type AaAccountChangeDelegation = { type: 'delegation'; target: Address }
export type AaAccountChange =
  | AaAccountChangeCreate
  | AaAccountChangeConfig
  | AaAccountChangeDelegation
export type AaCall = { to: Address; data?: Hex; value?: bigint }

export type Signer = {
  address: Address
  sign?: (parameters: { hash: Hex }) => Promise<Hex>
  authenticator?: Address
}

export type Policy = { type: number; manager: Address; commitment: Hex }
export type AuthorizeActorOptions = {
  scope?: number
  expiry?: bigint
  policy?: Policy
}

export const key: {
  k1(address: Address): AaActor
  p256(publicKey: { x: Hex; y: Hex } | Hex, options?: { authenticator?: Address }): AaActor
  passkey(publicKey: { x: Hex; y: Hex } | Hex, options?: { authenticator?: Address }): AaActor
  delegate(delegatedAccount: Address, options?: { authenticator?: Address }): AaActor
  trustedExecutor(caller: Address): AaActor
}
export function authorizeActor(actor: AaActor, options?: AuthorizeActorOptions): AaAuthorizeActor
export function revokeActor(actor: AaActor | Hex): AaRevokeActor
export function toScope(...flags: number[]): number
export function encodePolicyData(policy: Policy): Hex

export const actorScope: {
  signature: number
  sender: number
  payer: number
  config: number
}
export const ecrecoverAuthenticator: Address
export const trustedExecutorAuthenticator: Address
export const canonicalAuthenticators: {
  k1: Address
  p256: Address
  passkey: Address
  delegate: Address
}
/**
 * Representative auth-payload byte length (bytes after a prefixed blob's
 * 20-byte selector) for each canonical authenticator, keyed by *lowercased*
 * address. Used by `estimateGas8130`'s `senderAuthVerifier`/`payerAuthVerifier`
 * hint to synthesize a stub blob without the caller specifying an exact size.
 */
export const canonicalAuthDataLength: Record<string, number>
export const accountConfigAddress: Address
export const defaultAccountAddress: Address
export const nonceManagerAddress: Address
export const nonceManagerAbi: readonly any[]

// --- EIP-8130 RPC extensions (base eip8130 RPC support) --------------------

/**
 * Reads the current config-change sequences for an EIP-8130 account.
 * Use `local` as the `sequence` parameter when building the next AccountChange.
 */
export function getConfigSequence8130(
  client: Client,
  parameters: {
    accountConfiguration: Address
    account: Address
  },
): Promise<{ local: bigint; multichain: bigint }>

/** Read the EIP-8130 nonce via `eth_getTransactionCount` (2D channel-nonce). */
export function getTransactionCount8130(
  client: Client,
  parameters: {
    address: Address
    nonceKey?: bigint
    blockNumber?: bigint
    blockTag?: string
  },
): Promise<bigint>

/**
 * Estimate gas for an `AA_TX_TYPE` call via the EIP-8130 `eth_estimateGas`.
 *
 * The node prices authentication gas from the auth blob's *shape*, never a
 * real signature. Provide at most one of, in priority order:
 * `senderAuth` (raw blob, priced verbatim) > `senderAuthVerifier` (+ optional
 * `senderAuthSize`, synthesizes `verifier || filler`) > nothing (node
 * default: configured k1 stub if `sender`/`from` names a configured account,
 * else the default-EOA bare k1 stub). Same for `payerAuth`/`payerAuthVerifier`.
 */
export function estimateGas8130(
  client: Client,
  parameters: {
    /** Sender account. Interchangeable with `sender` (must agree if both set). */
    from?: Address
    /** The EIP-8130 sender account. Interchangeable with `from`. */
    sender?: Address
    // Simplified mode (no accountChanges/calls)
    to?: Address
    data?: Hex
    value?: bigint
    // Full-body mode
    accountChanges?: readonly AaAccountChange[]
    calls?: readonly (readonly { to: Address; value?: bigint; data?: Hex }[])[]
    nonceKey?: bigint
    nonceSequence?: number
    // Sender authentication
    /** Raw `senderAuth` blob, priced verbatim. Takes priority over `senderAuthVerifier`. */
    senderAuth?: Hex
    /** Verifier (authenticator) address hint; see `canonicalAuthenticators`. */
    senderAuthVerifier?: Address
    /** Overrides the verifier's default auth-payload length, or (alone) prices a bare filler blob of this length. */
    senderAuthSize?: number
    // Common
    payer?: Address
    /** Raw `payerAuth` blob, priced verbatim. Takes priority over `payerAuthVerifier`. */
    payerAuth?: Hex
    /** Payer verifier address hint. See `senderAuthVerifier`. */
    payerAuthVerifier?: Address
    /** Payer auth-payload byte length override. See `senderAuthSize`. */
    payerAuthSize?: number
    blockNumber?: bigint
    blockTag?: string
  },
): Promise<bigint>

export type Eip8130ReceiptFields = {
  payer?: Address
  phaseStatuses?: readonly Hex[]
  metadata?: Hex
}
/** Parse the EIP-8130 fields off a raw JSON-RPC receipt (graceful if absent). */
export function parseEip8130ReceiptFields(receipt: any): Eip8130ReceiptFields
/** Returns `true` when every reported call phase succeeded. */
export function allPhasesSucceeded(fields: {
  phaseStatuses?: readonly Hex[]
}): boolean
/** Fetch a receipt and surface the EIP-8130 AA fields under `.eip8130`. */
export function getTransactionReceipt8130(
  client: Client,
  parameters: { hash: Hex },
): Promise<(Record<string, any> & { eip8130: Eip8130ReceiptFields }) | null>

/**
 * Poll `eth_getTransactionReceipt` until an EIP-8130 tx is mined.
 * Unlike `waitForTransactionReceipt`, this skips replacement-detection (which
 * breaks on 2D nonces) and uses `getTransactionReceipt8130` internally.
 */
export function waitForTransactionReceipt8130(
  client: Client,
  parameters: {
    hash: Hex
    pollingInterval?: number
    timeout?: number
  },
): Promise<Record<string, any> & { eip8130: Eip8130ReceiptFields }>

/** Fetch an EIP-8130 transaction by hash with strong typing. */
export type Transaction8130 = {
  type: '0x79'
  hash: Hex
  from: Address
  chainId: number
  nonceKey: Hex
  nonceSequence: number
  expiry: number
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
  gas: bigint
  calls: readonly (readonly any[])[]
  accountChanges: readonly any[]
  metadata: Hex
  payer: Address | null
  senderAuth: Hex
  payerAuth: Hex
  gasPrice: bigint | null
  blockHash: Hex | null
  blockNumber: bigint | null
  transactionIndex: number | null
}
export function getTransaction8130(
  client: Client,
  parameters: { hash: Hex },
): Promise<Transaction8130>

// --- Actor policies (EIP-8130 restricted actors) ---------------------------
export type PolicyBinding = {
  account: Address
  policy: Address
  policyConfig: Hex
  validAfter: bigint
  validUntil: bigint
  salt: bigint
}
export type SessionPolicy = {
  manager: Address
  policy: Address
  binding: PolicyBinding
  commitment: Hex
  actorPolicy: Policy
  installCall(actorId: Hex): AaCall
  executeCall(executionData: Hex): AaCall
}
export function commitmentOf(binding: PolicyBinding): Hex
export function defineSessionPolicy(parameters: {
  account: Address
  policyConfig: Hex
  policy?: Address
  manager?: Address
  validAfter?: bigint
  validUntil?: bigint
  salt?: bigint
  policyType?: number
}): SessionPolicy

export type SessionPolicyTokenLimit = {
  token: Address
  limit: bigint
  period?: bigint
}
export type SessionPolicySelectorRule = {
  selector: Hex
  recipients?: readonly Address[]
}
export type SessionPolicyCallScope = {
  target: Address
  selectorRules?: readonly SessionPolicySelectorRule[]
}
export type SessionPolicyConfig = {
  tokenLimits?: readonly SessionPolicyTokenLimit[]
  callScopes?: readonly SessionPolicyCallScope[]
}
export type SessionPolicyAction = {
  target: Address
  value?: bigint
  data?: Hex
}
export const sessionPolicyAddress: Address
export function encodeSessionPolicyConfig(config: SessionPolicyConfig): Hex
export function encodeSessionPolicyAction(action: SessionPolicyAction): Hex
export const policyManagerAbi: readonly unknown[]
export const sessionPolicyAbi: readonly unknown[]

export function erc1167Bytecode(implementation: Address): Hex
export function upgradeableProxyBytecode(implementation: Address): Hex

export function computeAddress8130(parameters: {
  userSalt: Hex
  code: Hex
  initialActors: readonly AaActor[]
  accountConfigAddress?: Address
}): Address

export type To8130AccountReturnType = {
  readonly address: Address
  readonly signer: Signer
  readonly initialActors: readonly AaActor[]
  create(): AaAccountChangeCreate
  change(
    actorChanges: readonly AaActorChange[],
    options?: { chainId?: number; sequence?: number },
  ): Promise<AaAccountChangeConfig>
  delegate(target: Address): AaAccountChangeDelegation
  signTransaction(transaction: any, options?: any): Promise<Hex>
}
/**
 * Two shapes:
 * - Smart account: supply userSalt + code + initialActors (address derived via CREATE2)
 * - Delegated EOA: supply address only (no salt/code/actors; use delegate(impl) in first tx)
 */
export function to8130Account(parameters: (
  | {
      signer: Signer
      userSalt: Hex
      code: Hex
      initialActors: readonly AaActor[]
      authenticator?: Address
      accountConfigAddress?: Address
      address?: Address
    }
  | {
      signer: Signer
      address: Address
      authenticator?: Address
      userSalt?: undefined
      code?: undefined
      initialActors?: undefined
    }
)): To8130AccountReturnType

export type NewSmartAccount8130ReturnType = To8130AccountReturnType & {
  /** The `create` account-change — include in `accountChanges` for the first tx. */
  readonly createChange: AaAccountChangeCreate
}

/**
 * Creates a new EIP-8130 smart account from a signer. Automatically derives the
 * actor, bytecode, and counterfactual address. Include `account.createChange` in
 * the first transaction's `accountChanges` to deploy the account.
 *
 * Supports K1 (secp256k1), P-256, and WebAuthn signers (detected automatically).
 */
export function newSmartAccount8130(parameters: {
  signer: Signer & { publicKey?: { x: Hex; y: Hex } }
  salt?: Hex
  implementation?: Address
  code?: Hex
  extraActors?: readonly AaActor[]
  accountConfigAddress?: Address
}): NewSmartAccount8130ReturnType

/**
 * Wraps a secp256k1 EOA for EIP-8130 transactions using the implicit self-actor
 * path. `senderAuth` is a raw 65-byte ECDSA sig (no authenticator prefix); the
 * node recovers the sender via ecrecover. Use when the EOA address IS the account
 * and no smart-contract deployment is needed.
 */
export function toEoa8130Account(signer: Signer): {
  readonly address: Address
  readonly signer: Signer
  /** EIP-7702 delegation change — include in first tx's accountChanges. */
  delegate(target: Address): AaAccountChangeDelegation
  /** Sign authorize/revoke actor changes (e.g. add P256 key alongside K1). */
  change(
    actorChanges: readonly AaActorChange[],
    options?: { chainId?: number; sequence?: number },
  ): Promise<AaAccountChangeConfig>
  /** Raw 65-byte K1 sig — no authenticator prefix, no `from` field. */
  signTransaction(
    transaction: TransactionSerializable8130,
    options?: { payer?: { account: Signer; address?: Address } },
  ): Promise<Hex>
}

export type TransactionSerializable8130 = {
  chainId: number
  from?: Address
  nonceKey?: bigint
  nonceSequence?: bigint
  expiry?: bigint
  maxPriorityFeePerGas?: bigint
  maxFeePerGas?: bigint
  gas?: bigint
  accountChanges?: readonly AaAccountChange[]
  calls?: readonly (readonly AaCall[])[]
  metadata?: Hex
  payer?: Address
  senderAuth?: Hex
  payerAuth?: Hex
}

export function parseTransaction8130(serialized: Hex): TransactionSerializable8130

export function serializeTransaction8130(
  transaction: TransactionSerializable8130,
): Hex

/** Sender signature hash — fields through `payer`. */
export function getSenderSignatureHash8130(
  transaction: TransactionSerializable8130 & { to?: "hex" | "bytes" },
): Hex

/**
 * Resolves the sender (`from`) of an EIP-8130 tx. Returns `transaction.from`
 * when set; otherwise (EOA path) recovers it via ecrecover over the sender hash.
 */
export function recoverSenderAddress8130(parameters: {
  transaction: TransactionSerializable8130;
}): Promise<Address>

/** Payer signature hash — fields through `calls`/`metadata`, excluding `payer`. */
export function getPayerSignatureHash8130(
  transaction: TransactionSerializable8130 & { to?: "hex" | "bytes" },
): Hex

export function encodeWalletCalls(parameters: {
  account: Address
  calls: readonly (readonly AaCall[])[]
  encodeExecute?: (parameters: {
    account: Address
    calls: readonly { to: Address; data: Hex; value: bigint }[]
  }) => AaCall
}): readonly (readonly AaCall[])[]

export function sendCalls8130(
  client: Client,
  parameters: {
    account: To8130AccountReturnType
    calls: readonly AaCall[] | readonly (readonly AaCall[])[]
    accountChanges?: readonly AaAccountChange[]
    payer?: { account: Signer; address?: Address }
    gas: bigint
    nonceKey?: bigint
    nonceSequence?: bigint
    maxFeePerGas?: bigint
    maxPriorityFeePerGas?: bigint
  },
): Promise<Hex>

export function toSmartAccount8130(parameters: {
  owner: Address | LocalAccount
  client: Client
  authenticator?: Address
  sign?: (hash: Hex) => Promise<Hex>
  stubData?: Hex
  userSalt?: Hex
  initialActors?: readonly AaActor[]
  implementation?: Address
  code?: Hex
  address?: Address
  accountConfigAddress?: Address
  [key: string]: any
}): Promise<any>

export type Eip8130Deployment = {
  accountConfiguration: Address
  accounts: {
    upgradeable: Address
    default: Address
    defaultHighRate: Address
    erc4337: Address
  }
  authenticators: {
    k1: Address
    p256: Address
    webAuthn: Address
    delegate: Address
    alwaysValid: Address
  }
  policies?: {
    manager: Address
    sessionPolicy: Address
  }
}
export const baseSepoliaDeployment: Eip8130Deployment & {
  policies: { manager: Address; sessionPolicy: Address }
}
export const vibenetDevnetDeployment: Eip8130Deployment & {
  policies: { manager: Address; sessionPolicy: Address }
}
export const eip8130Deployments: Record<number, Eip8130Deployment>
export function getEip8130Deployment(chainId: number): Eip8130Deployment | undefined

export const eip8130ChainIds: Set<number>
export function register8130Chains(...chainIds: number[]): void
export function is8130Enabled(chain: number | { id: number }, parameters?: { chainIds?: Iterable<number> }): boolean

export function toP256Signer(parameters: {
  privateKey: Hex
  authenticator?: Address
  address?: Address
}): Signer & { publicKey: { x: Hex; y: Hex } }

export type WebAuthnSignSource = {
  publicKey: Hex | { x: Hex; y: Hex }
  sign: (parameters: { hash: Hex }) => Promise<{
    signature: Hex
    webauthn: {
      authenticatorData: Hex
      clientDataJSON: string
      challengeIndex: number
      typeIndex: number
    }
  }>
}
export function toWebAuthnSigner(
  source: WebAuthnSignSource,
  parameters?: { authenticator?: Address; address?: Address },
): Signer & { publicKey: { x: Hex; y: Hex } }

// ---------------------------------------------------------------------------
// ERC-8168 (payer / sponsorship)
// ---------------------------------------------------------------------------

export type PayerClient = {
  getTerms(parameters: any): Promise<any>
  sendTransaction(parameters: any): Promise<any>
  signTransaction(parameters: any): Promise<any>
  getSponsorshipBalance(parameters: any): Promise<any>
}
export function createPayerClient(parameters: { url?: string; transport?: any }): PayerClient
export function sendSponsoredCalls(client: Client, parameters: any): Promise<any>
export function buildSponsoredCalls(parameters: any): any
export function selectPaymentOption(terms: any, parameters?: any): any
export function isTokenOffer(option: any): boolean
export function isSponsoredOffer(option: any): boolean
export function isDeclinedOffer(option: any): boolean
export function isSelectableOffer(option: any): boolean
export function encodeTokenTransfer(parameters: { token: Address; to: Address; amount: bigint }): any

export type PayerRequote = {
  token: Address
  paymentAmount: Hex
  feeRecipient?: Address
  rate?: { numerator: Hex; denominator: Hex }
  ttl?: number
}
export type PayerRejectedData = {
  code: string
  reason?: string
  balance?: any
  gas?: { estimatedCost: Hex; maxCost: Hex }
  minGasLimit?: Hex
  requote?: PayerRequote
}
/** Extracts the `PAYER_REJECTED` `data` payload from a thrown payer error (or `undefined`). */
export function parsePayerError(error: unknown): PayerRejectedData | undefined
export const payerErrorCode: Record<string, string>
export const payerRejectedCode: -32000
export const sponsorshipDeclineCode: Record<string, string>
