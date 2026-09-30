// Hand-written types for the self-contained AA vendor bundle (index.js).
// Covers exactly the surface entry.mjs exports. Generated artifact pairing:
// `bun run vendor/aa/build.mjs` rebuilds index.js from the sibling viem branch
// (feat/aa-tx-split). The chain runs with the EIP-8130 Keystore disabled, so
// only the Keystore-free core is declared: secp256k1 EOA senders, optional
// `delegation` account changes, and ERC-8168 payers.

export type Hex = `0x${string}`
export type Address = `0x${string}`

// ---------------------------------------------------------------------------
// Core viem (subset)
// ---------------------------------------------------------------------------

export type LocalAccount = {
  address: Address
  publicKey: Hex
  sign?: (parameters: { hash: Hex }) => Promise<Hex>
  signMessage: (parameters: { message: string | { raw: Hex | Uint8Array } }) => Promise<Hex>
  signTypedData: (parameters: any) => Promise<Hex>
  source: string
  type: 'local'
}

export type Client = {
  chain?: { id: number; name?: string } | undefined
  request: (args: any) => Promise<any>
  [key: string]: any
}

export function http(url?: string, config?: any): any
export function createPublicClient(parameters: any): Client

export function encodeAbiParameters(params: readonly any[], values: readonly any[]): Hex
export function decodeAbiParameters(params: readonly any[], data: Hex): readonly any[]
export function encodeFunctionData(parameters: any): Hex
export function parseAbi(signatures: readonly string[]): any
export function toHex(value: string | number | bigint | boolean | Uint8Array, opts?: any): Hex
export function parseEther(ether: string): bigint
export function parseUnits(value: string, decimals: number): bigint
export const zeroAddress: Address

// ---------------------------------------------------------------------------
// Local accounts
// ---------------------------------------------------------------------------

export function generatePrivateKey(): Hex
export function privateKeyToAccount(privateKey: Hex): LocalAccount

// ---------------------------------------------------------------------------
// EIP-8130 (native account abstraction, Keystore-free core)
// ---------------------------------------------------------------------------

/** A call within a phase: dispatched from `sender` with `msg.value = value`. */
export type AaCall = { to: Address; data?: Hex | undefined; value?: bigint | undefined }
/** Ordered call phases; each phase is atomic, and a reverted phase skips the rest. */
export type AaCalls = readonly (readonly AaCall[])[]

/**
 * `delegation` account change: EIP-7702-style code delegation for the sender,
 * authorized by `sender_auth`. The zero address clears it. At most one per
 * transaction.
 */
export type AaAccountChangeDelegation = { type: 'delegation'; target: Address }
export type AaAccountChange = AaAccountChangeDelegation

/** The `payer` wire field: a named payer address, or `'0x00'` for open mode. */
export type AaPayer = Address | '0x00'

export type TransactionSerializable8130 = {
  chainId: number
  /** Names the sender; omit to recover it from a raw 65-byte `senderAuth`. */
  from?: Address | undefined
  /** Nonce channel. `nonceKeyMax` selects nonce-free (expiring) mode. */
  nonceKey?: bigint | undefined
  nonceSequence?: bigint | undefined
  /** Unix ms (or seconds below `timestampMsThreshold`). `0`/omitted = none. */
  validAfter?: bigint | undefined
  /** Unix ms (or seconds below `timestampMsThreshold`). Required non-zero in nonce-free mode. */
  validBefore?: bigint | undefined
  maxPriorityFeePerGas?: bigint | undefined
  maxFeePerGas?: bigint | undefined
  gas?: bigint | undefined
  accountChanges?: readonly AaAccountChange[] | undefined
  calls?: AaCalls | undefined
  /** Opaque top-level metadata, authenticated by sender and payer. */
  metadata?: Hex | undefined
  payer?: AaPayer | undefined
  senderAuth?: Hex | undefined
  payerAuth?: Hex | undefined
}
export type TransactionSerialized8130 = Hex

export type Signer = {
  address: Address
  sign?: ((parameters: { hash: Hex }) => Promise<Hex>) | undefined
  /** Defaults to `k1Authenticator` (native secp256k1). */
  authenticator?: Address | undefined
}

/** An account that can send AA transactions: it names the sender and signs `sender_auth`. */
export type AaAccount = {
  readonly address: Address
  readonly signer: Signer
  signTransaction(
    transaction: TransactionSerializable8130,
    options?: { payer?: { account: Signer; address?: AaPayer | undefined } | undefined },
  ): Promise<TransactionSerialized8130>
}

export type ToEoaAccountReturnType = AaAccount & {
  readonly type: 'local'
  readonly source: 'eip8130'
  readonly publicKey: Hex
  signMessage(parameters: { message: string | { raw: Hex | Uint8Array } }): Promise<Hex>
  signTypedData(parameters: any): Promise<Hex>
  /** Builds a `delegation` account change setting (or, with the zero address, clearing) this EOA's code. */
  delegate(target: Address): AaAccountChangeDelegation
}

/**
 * Wraps a secp256k1 EOA signer for AA transactions. The EOA key is the account:
 * `sender_auth` is `k1Authenticator || r || s || v` when the sender is named,
 * or a raw 65-byte signature when it is recovered.
 */
export function toEoaAccount(signer: Signer): ToEoaAccountReturnType

export const k1Authenticator: Address
/** Nonce-free mode selector: `nonceKey === nonceKeyMax` (2**256 - 1). */
export const nonceKeyMax: bigint
export const k1AuthCost: bigint
export const txValueCost: bigint
export const delegationCost: bigint
export const nonceFreeCost: bigint

/** Read the EIP-8130 nonce via `eth_getTransactionCount` (2D channel-nonce). */
export function getTransactionCount(
  client: Client,
  parameters: {
    address: Address
    /** `nonceKeyMax` has no counter; the node rejects it. */
    nonceKey?: bigint | undefined
    blockNumber?: bigint | undefined
    blockTag?: string | undefined
  },
): Promise<bigint>

/**
 * Estimate gas for an `AA_TX_TYPE` call via the EIP-8130 `eth_estimateGas`.
 * Authentication gas is priced from the auth blob's shape: `senderAuth` (raw
 * blob) > `senderAuthAuthenticator` (+ optional `senderAuthSize`) > the node
 * default. Same for the payer.
 */
export function estimateGas(
  client: Client,
  parameters: {
    from?: Address | undefined
    sender?: Address | undefined
    // Simplified mode (no accountChanges/calls)
    to?: Address | undefined
    data?: Hex | undefined
    value?: bigint | undefined
    // Full-body mode
    accountChanges?: readonly AaAccountChange[] | undefined
    /** A flat list is one phase; a nested array prices explicit phases. */
    calls?: readonly AaCall[] | AaCalls | undefined
    nonceKey?: bigint | undefined
    validAfter?: bigint | undefined
    /** The deadline you will sign with (required for nonce-free sends). */
    validBefore?: bigint | undefined
    senderAuth?: Hex | undefined
    senderAuthAuthenticator?: Address | undefined
    senderAuthSize?: number | undefined
    senderActorId?: Hex | undefined
    payer?: AaPayer | undefined
    payerAuth?: Hex | undefined
    payerAuthAuthenticator?: Address | undefined
    payerAuthSize?: number | undefined
    /** Written to the transaction's `metadata` field. */
    dataSuffix?: Hex | undefined
    blockNumber?: bigint | undefined
    blockTag?: string | undefined
  },
): Promise<bigint>

export type SendTransactionPayer = {
  account: Signer
  address?: AaPayer | undefined
}

type FeeOverrides = {
  maxFeePerGas?: bigint | undefined
  maxPriorityFeePerGas?: bigint | undefined
}

export type PrepareTransactionRequestParameters = FeeOverrides & {
  account: AaAccount
  calls: AaCalls
  accountChanges?: readonly AaAccountChange[] | undefined
  payer?: SendTransactionPayer | undefined
  gas: bigint
  nonceKey?: bigint | undefined
  nonceSequence?: bigint | undefined
  validAfter?: bigint | undefined
  validBefore?: bigint | undefined
  /** "Now" (unix ms) for the auto-computed nonce-free `validBefore`. */
  now?: bigint | undefined
  /** Window (ms) added to `now` for a nonce-free send; defaults to 15s. */
  expiryWindow?: bigint | undefined
  dataSuffix?: Hex | undefined
}

/** Fills chain id, nonce sequence and fees; requires `client.chain`. */
export function prepareTransactionRequest(
  client: Client,
  parameters: PrepareTransactionRequestParameters,
): Promise<TransactionSerializable8130>

export type SendTransactionParameters = Omit<PrepareTransactionRequestParameters, 'calls'> & {
  calls: readonly AaCall[] | AaCalls
  onTransaction?: ((transaction: TransactionSerializable8130) => void) | undefined
}

/** Prepares, signs (sender and, when set, payer) and submits an AA transaction. */
export function sendTransaction(client: Client, parameters: SendTransactionParameters): Promise<Hex>

export type ReceiptFields = {
  payer?: Address | undefined
  phaseStatuses?: readonly Hex[] | undefined
  metadata?: Hex | undefined
}
/** Parse the EIP-8130 fields off a raw JSON-RPC receipt (graceful if absent). */
export function parseReceiptFields(receipt: any): ReceiptFields
/** Returns `true` when every reported call phase succeeded. */
export function allPhasesSucceeded(fields: { phaseStatuses?: readonly Hex[] | undefined }): boolean
/** Fetch a receipt and surface the EIP-8130 AA fields under `.eip8130`. */
export function getTransactionReceipt(
  client: Client,
  parameters: { hash: Hex },
): Promise<(Record<string, any> & { eip8130: ReceiptFields }) | null>

// ---------------------------------------------------------------------------
// ERC-8168 (payer / sponsorship)
// ---------------------------------------------------------------------------

export type PayerRpcCall = { to: Address; value?: Hex | undefined; data?: Hex | undefined }

export type BalanceLimit = {
  unit: 'asset' | 'count'
  available: Hex
  limit?: Hex | undefined
  spent?: Hex | undefined
  asset?: string | undefined
  symbol?: string | undefined
  decimals?: number | undefined
}

export type PayerBalance = {
  kind: 'sponsorship' | 'credit'
  limits: readonly BalanceLimit[]
  validFor?: number | undefined
  payer?: Address | undefined
  endpoint?: string | undefined
  name?: string | undefined
}

export type PayerGasEstimate = { gasLimit: Hex; maxFeePerGas: Hex; maxPriorityFeePerGas: Hex }

export type PayerConditions = {
  /** Upper bound on the transaction's expiry, in seconds from now. */
  maxExpiry?: number | undefined
  maxGasLimit?: Hex | undefined
  maxCost?: Hex | undefined
}

export type PayerProvider = { name: string; icon?: string | undefined }

export type BaseOffer = {
  payer: Address
  endpoint?: string | undefined
  /** Optional methods beyond `payer_getTerms` / `payer_sendTransaction` (e.g. `payer_signTransaction`). */
  methods?: readonly string[] | undefined
  ttl: number
  conditions?: PayerConditions | undefined
  provider?: PayerProvider | undefined
}

export type SponsoredOfferSelectable = BaseOffer & {
  kind: 'sponsored'
  balance?: PayerBalance | undefined
}

export type SponsoredOfferDeclined = {
  kind: 'sponsored_declined'
  code: string
  reason?: string | undefined
  balance?: PayerBalance | undefined
  gas?: { estimatedCost: Hex; maxCost: Hex } | undefined
  provider?: PayerProvider | undefined
}

export type SponsoredOffer = SponsoredOfferSelectable | SponsoredOfferDeclined

export type TokenChoice = {
  token: Address
  symbol: string
  decimals: number
  /** Phase-0 amount, quoted against the terms' `gasEstimate`. */
  paymentAmount: Hex
  feeRecipient?: Address | undefined
  rate: { numerator: Hex; denominator: Hex }
  fiatRate?: Hex | undefined
  refund?: { window: number } | undefined
}

export type TokenPaymentOffer = BaseOffer & {
  kind: 'token'
  tokens: readonly TokenChoice[]
  paymentMode?: 'transfer' | 'any' | undefined
}

export type PaymentOption = SponsoredOffer | TokenPaymentOffer

export type GetTermsParameters = {
  chainId: Hex
  from: Address
  calls: readonly PayerRpcCall[]
  gasLimit?: Hex | undefined
  preferredTokens?: readonly Address[] | undefined
  fiatCurrency?: string | undefined
  context?: Record<string, unknown> | undefined
}

export type GetTermsReturnType = {
  options: readonly PaymentOption[]
  gasEstimate?: PayerGasEstimate | undefined
  fiatCurrency?: string | undefined
}

export type TokenCharged = { token: Address; amount: Hex }

export type PayerSendTransactionParameters = {
  signedTransaction: Hex
  context?: Record<string, unknown> | undefined
}
export type PayerSendTransactionReturnType = { transactionHash: Hex; tokenCharged?: TokenCharged | undefined }
export type PayerSignTransactionParameters = {
  signedTransaction: Hex
  context?: Record<string, unknown> | undefined
}
export type PayerSignTransactionReturnType = { signedTransaction: Hex; tokenCharged?: TokenCharged | undefined }

export type GetSponsorshipBalanceParameters = {
  from: Address
  chainId?: Hex | undefined
  payer?: Address | undefined
  endpoint?: string | undefined
  kind?: readonly ('sponsorship' | 'credit')[] | undefined
  context?: Record<string, unknown> | undefined
}
export type GetSponsorshipBalanceReturnType = { balances: readonly PayerBalance[]; ttl: number }

export type PayerClient = {
  getTerms(parameters: GetTermsParameters): Promise<GetTermsReturnType>
  sendTransaction(parameters: PayerSendTransactionParameters): Promise<PayerSendTransactionReturnType>
  /** Only when the picked offer lists `payer_signTransaction` in `methods`. */
  signTransaction(parameters: PayerSignTransactionParameters): Promise<PayerSignTransactionReturnType>
  getSponsorshipBalance(parameters: GetSponsorshipBalanceParameters): Promise<GetSponsorshipBalanceReturnType>
}

export function createPayerClient(parameters: { url?: string | undefined; transport?: any }): PayerClient

export type SelectPaymentOptionReturnType = {
  option: SponsoredOfferSelectable | TokenPaymentOffer
  tokenChoice?: TokenChoice | undefined
}
/** Picks one selectable offer: the matching token offer when `token` is set, else sponsorship first. */
export function selectPaymentOption(
  terms: GetTermsReturnType,
  parameters?: { token?: Address | undefined },
): SelectPaymentOptionReturnType
export function isTokenOffer(option: PaymentOption): option is TokenPaymentOffer
export function isDeclinedOffer(option: PaymentOption): option is SponsoredOfferDeclined

/** Builds the phase-0 `IERC20.transfer(to, amount)` call. */
export function encodeTokenTransfer(parameters: { token: Address; to: Address; amount: bigint }): AaCall

export type PayerRequote = {
  token: Address
  paymentAmount: Hex
  feeRecipient?: Address | undefined
  rate?: { numerator: Hex; denominator: Hex } | undefined
  ttl?: number | undefined
}

/** `error.data` on a `-32000` payer rejection; branch on the string `code`. */
export type PayerRejectedData = {
  code: string
  reason?: string | undefined
  balance?: PayerBalance | undefined
  gas?: { estimatedCost: Hex; maxCost: Hex } | undefined
  /** `GAS_TOO_LOW`: the smallest gas limit the calls need. */
  minGasLimit?: Hex | undefined
  /** `PAYMENT_INSUFFICIENT`: the corrected phase-0 transfer. */
  requote?: PayerRequote | undefined
}

/** Extracts {@link PayerRejectedData} from a thrown payer error; `undefined` for other errors. */
export function parsePayerError(error: unknown): PayerRejectedData | undefined
