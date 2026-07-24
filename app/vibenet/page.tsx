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
import {
  addEthereumChain,
  getChainId,
  getEthereum,
  isUnrecognizedChain,
  isUserRejection,
  switchEthereumChain,
  walletErrorMessage,
} from './library/wallet';

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
      const target = Number(chainId);
      // Already on vibenet — nothing to do, and no prompt to dismiss.
      if ((await getChainId(eth)) === target) {
        setWalletStatus('Already connected to base vibenet.');
        return;
      }
      try {
        // Prefer switching (works when the chain is already added); only add it
        // when the wallet reports it's unrecognized (EIP-3326 4902).
        try {
          await switchEthereumChain(eth, target);
          setWalletStatus('Switched to base vibenet.');
        } catch (err) {
          if (isUserRejection(err)) {
            setWalletStatus('Request dismissed — no changes made.');
            return;
          }
          if (!isUnrecognizedChain(err)) throw err;
          await addEthereumChain(eth, {
            chainId: target,
            chainName: config.title ?? 'base vibenet',
            rpcUrl: VIBENET_RPC_URL,
            explorerUrl: `${window.location.origin}${VIBENET_EXPLORER_PATH}`,
          });
          setWalletStatus('Network added. Your wallet should now be on base vibenet.');
        }
      } catch (err) {
        if (isUserRejection(err)) {
          setWalletStatus('Request dismissed — no changes made.');
          return;
        }
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
        className="flex flex-wrap items-center gap-3 py-4"
      >
        <span className="w-32 shrink-0 text-[14px] text-bds-gray-50 dark:text-bds-gray-40">
          {contract.label}
        </span>
        <Link
          href={`${VIBENET_EXPLORER_PATH}/address/${contract.address}`}
          className="min-w-0 flex-1 truncate text-[14px] text-black transition-colors hover:text-base-blue hover:underline dark:text-white dark:hover:text-bds-blue-20"
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
    <div className="animate-in -mb-20 flex min-h-[calc(100vh-116px)] flex-col gap-16 pb-4 text-black dark:text-white">
      <header className="flex flex-col gap-4 pb-4 md:flex-row md:items-start md:justify-between md:gap-8">
        <div className="flex max-w-xl flex-1 flex-col gap-6">
          <img src="/vibenet-illo.svg" alt="" width={48} height={48} className="mt-8" />
          <Text variant="title2" tone="muted">
            <span className="text-black dark:text-white">Vibenet</span> is an ephemeral Base developer network for testing in-flight features.
          </Text>
        </div>
        <Card className="flex flex-col gap-0.5 bg-white px-5 py-5 dark:bg-white/5 md:min-w-[360px]">
          <Text variant="label" className="mb-2.5">Connect to Vibenet</Text>
          <div className="flex items-center justify-between gap-3">
            <Text variant="label" tone="muted">Chain ID</Text>
            <CopyableValue value={chainId} />
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <Text variant="label" tone="muted">RPC URL</Text>
            <CopyableValue value={VIBENET_RPC_URL} />
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <Text variant="label" tone="muted">Explorer</Text>
            <Link
              href={VIBENET_EXPLORER_PATH}
              className="font-mono text-[13px] text-black transition-colors hover:text-base-blue dark:text-white dark:hover:text-bds-blue-20"
            >
              {VIBENET_EXPLORER_PATH}
            </Link>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={handleAddToWallet} disabled={!chainId}>
              Add to Wallet
            </Button>
            {walletStatus ? (
              <Text variant="footnote" tone="muted">{walletStatus}</Text>
            ) : null}
          </div>
        </Card>
      </header>

      <section className="flex flex-col gap-6">
        <Text variant="headline">Features</Text>
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

      <section className="flex flex-col gap-6 md:hidden">
        <Text variant="title2">Connect</Text>
        <Card className="flex flex-col gap-4 bg-white p-6 dark:bg-white/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Text variant="label" tone="muted">Chain ID</Text>
            <CopyableValue value={chainId} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-bds-gray-10 pt-4 dark:border-white/10">
            <Text variant="label" tone="muted">RPC URL</Text>
            <CopyableValue value={VIBENET_RPC_URL} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-bds-gray-10 pt-4 dark:border-white/10">
            <Text variant="label" tone="muted">Explorer</Text>
            <Link
              href={VIBENET_EXPLORER_PATH}
              className="font-mono text-[13px] text-base-blue hover:underline dark:text-bds-blue-20"
            >
              {VIBENET_EXPLORER_PATH}
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="sm" onClick={handleAddToWallet} disabled={!chainId}>
              Add to Wallet
            </Button>
            {walletStatus ? (
              <Text variant="footnote" tone="muted">{walletStatus}</Text>
            ) : null}
          </div>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <Text variant="headline">Deployed Contracts</Text>
        <div className="flex flex-col divide-y divide-bds-gray-10 border-y border-bds-gray-10 dark:divide-white/10 dark:border-white/10">
          {contractsBody}
        </div>
      </section>

      <footer className="mt-auto flex flex-wrap items-center gap-x-6 gap-y-2 pb-4 text-[12px] text-bds-gray-30 dark:text-bds-gray-50">
        <span>
          branch{' '}
          {branch ? (
            <a
              href={`https://github.com/base/base/tree/${branch}`}
              target="_blank"
              rel="noopener"
              className="text-bds-gray-50 transition-colors hover:text-bds-gray-70 hover:no-underline dark:text-bds-gray-40 dark:hover:text-bds-gray-30"
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
              className="text-bds-gray-50 transition-colors hover:text-bds-gray-70 hover:no-underline dark:text-bds-gray-40 dark:hover:text-bds-gray-30"
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
