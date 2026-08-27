import type { Address } from 'viem';

import { VibenetApiError, vibenetApi } from '../../../library/client';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function faucetErrorMessage(err: unknown): string {
  if (err instanceof VibenetApiError) {
    if (err.status === 429) return 'Faucet rate limited — wait a minute and try again.';
    return err.message;
  }
  return err instanceof Error ? err.message : 'Faucet request failed.';
}

/** Drip Vibenet ETH and wait until the address shows a balance. */
export async function seedEthFromFaucet(
  address: Address,
  getBalance: () => Promise<bigint>,
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await vibenetApi.faucet.drip({ address });
      break;
    } catch (err) {
      if (attempt >= 3) throw err;
      await sleep(11_000);
    }
  }
  for (let i = 0; i < 30; i += 1) {
    if ((await getBalance()) > 0n) return;
    await sleep(2_000);
  }
  throw new Error('Faucet drip submitted, but ETH has not landed yet. Try again in a minute.');
}
