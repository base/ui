// Read-only sample data shown in the B20 demo before a user deploys their own
// token. Kept out of the components so the copy is easy to review/revise in one
// place and the render functions stay presentational.

import type { Address } from 'viem';

import type { TokenInfo } from './types';

const SAMPLE_POLICY_ADMIN = '0x1111111111111111111111111111111111111111' as Address;

// This is intentionally a B20-shaped, synthetic address. It identifies the
// local walkthrough only; it is not a deployed contract and must never be read
// from the public RPC.
export const SAMPLE_TOKEN: TokenInfo = {
  address: '0xb200000000000000000000D7E62F6c2E13Ea9dDb' as Address,
  name: 'Vibenet Reserve Asset',
  symbol: 'VRA',
  decimals: 18,
  variant: 'asset',
  supply: 2_500_000n * 10n ** 18n,
  cap: 5_000_000n * 10n ** 18n,
  policies: [
    {
      scope: 'TRANSFER_SENDER_POLICY',
      label: 'Transfer sender',
      id: (1n << 56n) + 42n,
      exists: true,
      admin: SAMPLE_POLICY_ADMIN,
    },
    {
      scope: 'TRANSFER_RECEIVER_POLICY',
      label: 'Transfer receiver',
      id: 0n,
      exists: true,
      admin: SAMPLE_POLICY_ADMIN,
    },
    {
      scope: 'TRANSFER_EXECUTOR_POLICY',
      label: 'Transfer executor',
      id: 0n,
      exists: true,
      admin: SAMPLE_POLICY_ADMIN,
    },
    {
      scope: 'MINT_RECEIVER_POLICY',
      label: 'Mint recipient',
      id: 7n,
      exists: true,
      admin: SAMPLE_POLICY_ADMIN,
    },
  ],
};

export type SampleMemo = {
  id: string;
  operation: 'transfer' | 'mint';
  memo: string;
  caller: Address;
  from: Address;
  to: Address;
  value: bigint;
};

export const SAMPLE_MEMOS: SampleMemo[] = [
  {
    id: 'reserve-transfer-001',
    operation: 'transfer',
    memo: 'sending test',
    caller: SAMPLE_POLICY_ADMIN,
    from: SAMPLE_POLICY_ADMIN,
    to: '0x2222222222222222222222222222222222222222' as Address,
    value: 1_000_000_000_000_000n,
  },
];

/** Returns the local walkthrough token without initiating a network read. */
export function sampleTokenForAddress(candidate: string | null | undefined): TokenInfo | null {
  return candidate?.toLowerCase() === SAMPLE_TOKEN.address.toLowerCase() ? SAMPLE_TOKEN : null;
}

export type SampleAnnouncement = {
  id: string;
  type: string;
  title: string;
  description: string;
  uri: string;
  effective: string;
  call: string;
};

export const SAMPLE_ANNOUNCEMENTS: SampleAnnouncement[] = [
  {
    id: '2026-Q4-reserves',
    type: 'Disclosure only',
    title: 'Quarterly Reserve Attestation',
    description: 'The issuer shared its quarterly reserve report.',
    uri: 'https://example.com/disclosures/2026-q4-reserves',
    effective: 'Published 20 Dec 2026',
    call: 'No token change',
  },
];
