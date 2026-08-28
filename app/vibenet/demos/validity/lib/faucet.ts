import { VibenetApiError } from '../../../library/client';

export function faucetErrorMessage(err: unknown): string {
  if (err instanceof VibenetApiError) {
    if (err.status === 429) return 'Faucet rate limited — wait a minute and try again.';
    return err.message;
  }
  return err instanceof Error ? err.message : 'Faucet request failed.';
}
