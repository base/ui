export const TEST_TYPES = ['swaps', 'transfers'] as const;

export type TestType = (typeof TEST_TYPES)[number];

export const DEFAULT_TEST_TYPE: TestType = 'swaps';

/** Load-test network path param for each in-page sidebar option. */
export const TEST_TYPE_NETWORK: Record<TestType, string> = {
  swaps: 'sepolia',
  transfers: 'b20-sepolia',
};

export const TEST_TYPE_LABEL: Record<TestType, string> = {
  swaps: 'Swaps',
  transfers: 'Transfers',
};
