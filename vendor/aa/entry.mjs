// Bundle entry for the self-contained "account abstraction" vendor module.
//
// We can't `npm/bun install` viem 2.52.2 here: the cbhq registry mirror lacks
// its exact-pinned transitive deps (ox@0.14.29, @noble/*), and npmjs.org is
// unreachable. So we bundle the needed viem (+ ox/@noble) surface into a single
// self-contained ESM artifact (vendor/aa/index.js) with no external deps.
//
// Source: the sibling viem checkout (../viem) on branch
// feat/eip-8130, built to src/_esm. Rebuild with:
// `bun run vendor/aa/build.mjs` (see build.mjs).

// Core viem
export {
  concatHex,
  createPublicClient,
  createWalletClient,
  custom,
  decodeAbiParameters,
  encodeAbiParameters,
  encodeFunctionData,
  formatEther,
  hexToBigInt,
  http,
  keccak256,
  parseAbi,
  parseEther,
  parseUnits,
  slice,
  toHex,
  zeroAddress,
} from '../../../viem/src/_esm/index.js'

// Local accounts
export {
  generatePrivateKey,
  privateKeyToAccount,
} from '../../../viem/src/_esm/accounts/index.js'

// ERC-4337 / WebAuthn
export {
  createBundlerClient,
  createWebAuthnCredential,
  entryPoint07Abi,
  entryPoint07Address,
  toWebAuthnAccount,
} from '../../../viem/src/_esm/account-abstraction/index.js'

// EIP-8130 (native account abstraction) — includes toDelegate8130Signer /
// delegateAuthSize (sub-account delegate signing).
export * from '../../../viem/src/_esm/experimental/eip8130/index.js'

// ERC-8168 (payer / sponsorship)
export {
  buildSponsoredCalls,
  createPayerClient,
  encodeTokenTransfer,
  isDeclinedOffer,
  isSelectableOffer,
  isSponsoredOffer,
  isTokenOffer,
  parsePayerError,
  payerErrorCode,
  payerRejectedCode,
  selectPaymentOption,
  sendSponsoredCalls,
  sponsorshipDeclineCode,
} from '../../../viem/src/_esm/experimental/eip8168/index.js'
