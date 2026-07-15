// View/domain types for the Vibenet section UI.
//
// These are deliberately separate from the API wire types in `api-types.ts`:
// that file describes what the vibenet backend returns; this file describes how
// the UI models features, contracts, and chain info. Data lives in `data/*.ts`
// (mirroring how the Upgrades section splits `library/types.ts` from
// `data/changes.ts`).

import type { FaucetStatusResponse } from './api-types';

// --- Features -------------------------------------------------------------

export type FeatureStatus = 'live' | 'preview' | 'coming-soon';

export type FeatureHighlight = {
  title: string;
  detail: string;
};

export type FeatureLink = {
  label: string;
  href: string;
  /** External links open in a new tab and get an arrow affordance. */
  external?: boolean;
};

// A capability showcased on the landing page. The catalog is a plain list
// (`data/features.ts`), so "multiple features deployed concurrently" is just
// multiple entries — no page changes required to add one.
export type VibenetFeature = {
  id: string;
  /** Short eyebrow/tag, e.g. an EIP number. */
  tag?: string;
  title: string;
  summary: string;
  status: FeatureStatus;
  /** Optional availability note, e.g. "Coming in Base Cobalt". */
  availability?: string;
  /** Bullet highlights; when present the card renders the richer promo layout. */
  highlights?: FeatureHighlight[];
  /** Primary action. Omitted while a target isn't ready (the card shows status). */
  cta?: FeatureLink;
  /** Secondary links (docs, EIP, etc.). */
  links?: FeatureLink[];
};

// --- Contracts ------------------------------------------------------------

export type WatchableToken = {
  type: 'ERC20';
  symbol: string;
  decimals: number;
};

// Static metadata for a known contract key. The registry only *enhances* the
// contracts the API returns; unknown contracts still render (with a humanized
// label), so new public deployments appear without editing the page.
export type ContractMeta = {
  label: string;
  /** Present for tokens that can be added to a wallet (EIP-747). */
  watch?: WatchableToken;
  /** Internal/demo deployments kept out of the public list. */
  hidden?: boolean;
};

// A contract resolved for display: raw key + address from the API, enhanced
// with registry metadata (or a humanized fallback label).
export type ResolvedContract = {
  key: string;
  address: string;
  label: string;
  watch?: WatchableToken;
};

// --- Faucet ---------------------------------------------------------------

export type FaucetTokenId = 'eth' | 'usdv' | 'nfv';

// Normalized result of a successful drip, independent of which token endpoint
// served it.
export type DripOutcome = {
  txHash: string;
  to: string;
  /** Token contract involved, for a "via" link (USDV/NFV mints). */
  via?: { label: string; address: string };
};

// A drippable asset. The catalog (`data/faucetTokens.ts`) owns availability,
// labels, and how to perform the drip, so adding an asset is one entry.
export type FaucetToken = {
  id: FaucetTokenId;
  label: string;
  /** Whether the drip is currently possible (e.g. the token is deployed). */
  isEnabled: (status: FaucetStatusResponse) => boolean;
  /** Button label; may fold in the drip amount from status. */
  actionLabel: (status: FaucetStatusResponse | null) => string;
  /** Short value for the status summary pill. */
  summaryValue: (status: FaucetStatusResponse) => string;
  /** Perform the drip and normalize the response. */
  drip: (address: string) => Promise<DripOutcome>;
};

// UI state for the in-flight / last drip request.
export type DripState =
  | { phase: 'idle' }
  | { phase: 'pending'; tokenId: FaucetTokenId }
  | { phase: 'success'; tokenId: FaucetTokenId; outcome: DripOutcome }
  | { phase: 'error'; tokenId: FaucetTokenId; message: string };
