'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';

import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Text } from '../components/ui/Text';

import { CopyableValue } from './components/CopyableValue';
import { FeatureCard } from './components/FeatureCard';
import { WatchAssetButton } from './components/WatchAssetButton';
import { resolveContracts } from './data/contracts';
import { FEATURES, featuresFromConfig } from './data/features';
import type { ConfigResponse } from './library/api-types';
import { vibenetApi } from './library/client';
import { VIBENET_EXPLORER_PATH, VIBENET_RPC_URL } from './library/config';
import { addEthereumChain, getEthereum, walletErrorMessage } from './library/wallet';

export default function VibenetHomePage() {
  const [config, setConfig] = useState<Partial<ConfigResponse>>({});
  const [contracts, setContracts] = useState<Record<string, unknown> | null>(null);
  const [chainId, setChainId] = useState('');
  const [walletStatus, setWalletStatus] = useState('');

  useEffect(() => {
    let cancelled = false;
    vibenetApi
      .config()
      .then((next) => {
        if (!cancelled) setConfig(next);
      })
      .catch(() => {});
    vibenetApi
      .contracts()
      .then((next) => {
        if (!cancelled) setContracts(next);
      })
      .catch(() => {
        if (!cancelled) setContracts({});
      });
    vibenetApi.faucet
      .status()
      .then((status) => {
        if (!cancelled && status.chain_id) setChainId(String(status.chain_id));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAddToWallet = useCallback(() => {
    async function run() {
      const eth = getEthereum();
      if (!eth) {
        setWalletStatus('No browser wallet detected on this page.');
        return;
      }
      try {
        await addEthereumChain(eth, {
          chainId: Number(chainId),
          chainName: config.title ?? 'base vibenet',
          rpcUrl: VIBENET_RPC_URL,
          explorerUrl: `${window.location.origin}${VIBENET_EXPLORER_PATH}`,
        });
        setWalletStatus('Network added. Your wallet should now be on base vibenet.');
      } catch (err) {
        setWalletStatus(`Wallet did not add the network: ${walletErrorMessage(err)}`);
      }
    }
    void run();
  }, [chainId, config.title]);

  const dynamicFeatures = featuresFromConfig(config.features);
  const contractRows = resolveContracts(contracts);

  let contractsBody: ReactNode;
  if (!contractRows) {
    contractsBody = (
      <Text variant="label.regular" tone="muted" className="p-4">
        Loading…
      </Text>
    );
  } else if (contractRows.length === 0) {
    contractsBody = (
      <Text variant="label.regular" tone="muted" className="p-4">
        No contracts deployed on this vibe.
      </Text>
    );
  } else {
    contractsBody = contractRows.map((contract) => (
      <div
        key={contract.key}
        className="flex flex-wrap items-center gap-3 bg-white p-4 dark:bg-white/5"
      >
        <span className="w-32 shrink-0 text-[14px] font-medium text-black dark:text-white">
          {contract.label}
        </span>
        <Link
          href={`${VIBENET_EXPLORER_PATH}/address/${contract.address}`}
          className="min-w-0 flex-1 truncate font-mono text-[13px] text-base-blue hover:underline dark:text-bds-blue-20"
        >
          {contract.address}
        </Link>
        {contract.watch ? (
          <WatchAssetButton address={contract.address} token={contract.watch} />
        ) : null}
      </div>
    ));
  }

  const branch = config.branch && config.branch !== 'unknown' ? config.branch : null;
  const commit = config.commit && config.commit !== 'unknown' ? config.commit : null;

  return (
    <div className="flex flex-col gap-16 pb-4 text-black dark:text-white">
      <header className="flex flex-col gap-4 border-b border-bds-gray-10 pb-12 dark:border-white/10">
        <div className="max-w-3xl">
          <Text variant="caption" className="mb-4 text-base-blue dark:text-white">
            {config.title ?? 'Base Vibenet'}
          </Text>
          <Text variant="display" className="text-balance">
            Test New Features
          </Text>
          <Text variant="body" tone="muted" className="mt-5 max-w-2xl">
            {config.subtitle ?? 'An ephemeral Base devnet for trying out in-flight features.'}
          </Text>
        </div>
      </header>

      <section className="flex flex-col gap-6">
        <Text variant="title2">Features</Text>
        <div className="flex flex-col gap-4">
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.id} feature={feature} />
          ))}
        </div>
        {dynamicFeatures.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
            {dynamicFeatures.map((feature) => (
              <FeatureCard key={feature.id} feature={feature} />
            ))}
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-6">
        <Text variant="title2">Connect</Text>
        <Card className="flex flex-col gap-4 bg-white p-6 dark:bg-white/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Text variant="label" tone="muted">
              Chain ID
            </Text>
            <CopyableValue value={chainId} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-bds-gray-10 pt-4 dark:border-white/10">
            <Text variant="label" tone="muted">
              RPC URL
            </Text>
            <CopyableValue value={VIBENET_RPC_URL} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-bds-gray-10 pt-4 dark:border-white/10">
            <Text variant="label" tone="muted">
              Explorer
            </Text>
            <Link
              href={VIBENET_EXPLORER_PATH}
              className="font-mono text-[13px] text-base-blue hover:underline dark:text-bds-blue-20"
            >
              {VIBENET_EXPLORER_PATH}
            </Link>
          </div>
          <Text variant="footnote" tone="muted">
            Public RPC access is IP rate limited.
          </Text>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="sm" onClick={handleAddToWallet} disabled={!chainId}>
              Add to wallet
            </Button>
            {walletStatus ? (
              <Text variant="footnote" tone="muted">
                {walletStatus}
              </Text>
            ) : null}
          </div>
        </Card>
      </section>

      <section className="flex flex-col gap-6">
        <Text variant="title2">Deployed Contracts</Text>
        <Card className="flex flex-col divide-y divide-bds-gray-10 overflow-hidden dark:divide-white/10">
          {contractsBody}
        </Card>
      </section>

      <footer className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-bds-gray-10 pt-6 font-mono text-[12px] text-bds-gray-60 dark:border-white/10 dark:text-bds-gray-40">
        <span>
          branch{' '}
          {branch ? (
            <a
              href={`https://github.com/base/base/tree/${branch}`}
              target="_blank"
              rel="noopener"
              className="text-base-blue hover:underline dark:text-bds-blue-20"
            >
              {branch}
            </a>
          ) : (
            'unknown'
          )}
        </span>
        <span>
          commit{' '}
          {commit ? (
            <a
              href={`https://github.com/base/base/commit/${commit}`}
              target="_blank"
              rel="noopener"
              className="text-base-blue hover:underline dark:text-bds-blue-20"
            >
              {commit.slice(0, 12)}
            </a>
          ) : (
            'unknown'
          )}
        </span>
      </footer>
    </div>
  );
}
