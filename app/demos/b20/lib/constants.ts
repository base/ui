import { createPublicClient, http, isAddress, type Address } from 'viem';

import { VIBENET_RPC_URL } from '../../../vibenet/library/config';
import type { Module } from './types';

// The Vibenet demo purposefully uses a raw EIP-1193 wallet rather than adding a
// second provider framework. viem owns ABI correctness and public RPC reads.
export const CHAIN_ID = 84538453;
export const client = createPublicClient({ transport: http(VIBENET_RPC_URL) });
export const STORAGE_KEY = 'vibenet.b20.recent.v1';
export const POLICY_STORAGE_KEY = 'vibenet.b20.recent-policies.v1';

const configuredSampleToken = process.env.NEXT_PUBLIC_B20_SAMPLE_TOKEN;
export const SAMPLE_TOKEN = (
  configuredSampleToken && isAddress(configuredSampleToken)
    ? configuredSampleToken
    : '0xb200000000000000000000D7E62F6c2E13Ea9dDb'
) as Address;
export const SAMPLE_MEMO_TX = '0x91e52e0c63d05116b9fda41d1168c2fe9b7b9fcadf9071494c16410c809d1b09';

export const INITIAL_ALLOCATION_MEMO = 'Initial deposit';
export const INITIAL_ALLOCATION_MAX = 100n;

export const MODULES: Array<{ value: Module; label: string }> = [
  { value: 'policy', label: 'Policies' },
  { value: 'memos', label: 'Memos' },
  { value: 'announcements', label: 'Announcements' },
  { value: 'deploy', label: 'Create a token' },
];
