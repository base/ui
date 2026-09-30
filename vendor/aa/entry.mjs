// Bundle entry for the self-contained "account abstraction" vendor module.
//
// The EIP-8130 / ERC-8168 surface isn't in a published viem release, so we
// bundle the needed viem (+ ox/@noble) surface into a single self-contained ESM
// artifact (vendor/aa/index.js) with no external deps. Only what the app
// imports from `@aa` is exported; keep index.d.ts in sync.
//
// Source: the sibling viem checkout (../viem) on branch feat/aa-tx-split,
// bundled straight from its TypeScript sources (the Keystore-free `eip8130`
// core, not `experimental/keystore`). Rebuild with:
// `bun run vendor/aa/build.mjs` (see build.mjs).

// Core viem
export {
  createPublicClient,
  decodeAbiParameters,
  encodeAbiParameters,
  encodeFunctionData,
  http,
  parseAbi,
  parseEther,
  parseUnits,
  toHex,
  zeroAddress,
} from '../../../viem/src/index.ts'

// Local accounts
export {
  generatePrivateKey,
  privateKeyToAccount,
} from '../../../viem/src/accounts/index.ts'

// EIP-8130 (native account abstraction) — secp256k1 EOA senders with optional
// code delegation.
export {
  allPhasesSucceeded,
  delegationCost,
  estimateGas,
  getTransactionCount,
  getTransactionReceipt,
  k1AuthCost,
  k1Authenticator,
  nonceFreeCost,
  nonceKeyMax,
  parseReceiptFields,
  prepareTransactionRequest,
  sendTransaction,
  toEoaAccount,
  txValueCost,
} from '../../../viem/src/eip8130/index.ts'

// ERC-8168 (payer / sponsorship)
export {
  createPayerClient,
  encodeTokenTransfer,
  isDeclinedOffer,
  isTokenOffer,
  parsePayerError,
  selectPaymentOption,
} from '../../../viem/src/eip8168/index.ts'
