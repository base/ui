import { createPublicClient, http } from 'viem';

import { VIBENET_RPC_URL } from '../../../library/config';

export const CHAIN_ID = 84538453;
// Batch concurrent eth_calls into a single HTTP request. Inspecting a token
// fires ~15 reads (name/symbol/supply plus 3 reads per policy scope); without
// batching each is its own round-trip, which is what made token load feel slow.
export const client = createPublicClient({ transport: http(VIBENET_RPC_URL, { batch: true }) });
export const STORAGE_KEY = 'vibenet.b20.recent.v1';
export const POLICY_STORAGE_KEY = 'vibenet.b20.recent-policies.v1';
export const PAYER_STORAGE_KEY = 'vibenet.b20.payer.v1';

export const INITIAL_ALLOCATION_MEMO = 'Initial deposit';
