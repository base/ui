'use client';

import { useCallback, useState } from 'react';

import { Button } from '../../components/ui/Button';
import type { WatchableToken } from '../library/types';
import { getEthereum, watchAsset } from '../library/wallet';

type WatchAssetButtonProps = {
  address: string;
  token: WatchableToken;
};

// Adds an ERC-20 token to the connected wallet (EIP-747), reporting transient
// status back on the button itself.
export function WatchAssetButton({ address, token }: WatchAssetButtonProps) {
  const [status, setStatus] = useState('');

  const handleWatch = useCallback(() => {
    async function run() {
      const eth = getEthereum();
      if (!eth) {
        setStatus('No wallet detected');
        window.setTimeout(() => setStatus(''), 1500);
        return;
      }
      try {
        await watchAsset(eth, { ...token, address });
        setStatus(`${token.symbol} added`);
      } catch {
        setStatus('Rejected');
      } finally {
        window.setTimeout(() => setStatus(''), 1800);
      }
    }
    void run();
  }, [address, token]);

  return (
    <Button variant="secondary" size="sm" onClick={handleWatch}>
      {status || `Add ${token.symbol} to wallet`}
    </Button>
  );
}
