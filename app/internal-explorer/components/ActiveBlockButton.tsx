'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { trackExplorerActiveBlockJump } from '../../analytics/events';
import { Button } from '../../components/ui/Button';
import type { ExplorerChain } from '../chains';
import { explorerApi, ExplorerApiError } from '../library/client';
import { explorerHref } from '../library/links';

type ActiveBlockJump = 'latest' | 'previous';

function failureMessage(error: unknown, jump: ActiveBlockJump): string {
  const missing = error instanceof ExplorerApiError && error.status === 404;
  if (jump === 'previous') {
    return missing
      ? 'No previous block with user transactions'
      : 'Failed to find the previous active block';
  }
  return missing
    ? 'No recent block with user transactions'
    : 'Failed to find the latest active block';
}

// Zeronet heads are often L1-attributes-only. Latest walks back from chain
// head; previous walks back from the current block.
export function ActiveBlockButton({
  chain,
  onError,
  before,
}: {
  chain: ExplorerChain;
  onError?: (error: string | null) => void;
  before?: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const jump: ActiveBlockJump = before === undefined ? 'latest' : 'previous';

  if (chain !== 'zeronet') return null;

  function report(message: string | null) {
    setLocalError(onError ? null : message);
    onError?.(message);
  }

  async function go() {
    if (before === 0) {
      report('No previous active block');
      return;
    }
    setLoading(true);
    report(null);
    try {
      const block = await explorerApi.latestActiveBlock(
        chain,
        before === undefined ? undefined : { before },
      );
      trackExplorerActiveBlockJump(chain, jump);
      router.push(explorerHref(`/block/${block.hash}`, chain));
    } catch (error) {
      report(failureMessage(error, jump));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-1 sm:items-end">
      <Button
        variant="outline"
        size="sm"
        onClick={() => void go()}
        disabled={loading || before === 0}
      >
        {loading ? 'Finding…' : jump === 'previous' ? 'Previous active block' : 'Latest active block'}
      </Button>
      {localError ? (
        <span className="text-xs text-bds-red-70 dark:text-bds-red-20">{localError}</span>
      ) : null}
    </div>
  );
}
