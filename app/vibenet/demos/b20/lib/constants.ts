import { createPublicClient, http } from 'viem';

import { VIBENET_RPC_URL } from '../../../library/config';
import type { Module } from './types';

export const CHAIN_ID = 84538453;
export const client = createPublicClient({ transport: http(VIBENET_RPC_URL) });
export const STORAGE_KEY = 'vibenet.b20.recent.v1';
export const POLICY_STORAGE_KEY = 'vibenet.b20.recent-policies.v1';
export const PAYER_STORAGE_KEY = 'vibenet.b20.payer.v1';

export const INITIAL_ALLOCATION_MEMO = 'Initial deposit';
export const INITIAL_ALLOCATION_MAX = 100n;

export const MODULES: Array<{ value: Module; label: string }> = [
  { value: 'policy', label: 'Policies' },
  { value: 'memos', label: 'Memos' },
  { value: 'announcements', label: 'Announcements' },
  { value: 'deploy', label: 'Create a token' },
];
