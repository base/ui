'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { Card, LinkCard } from '../components/ui/Card';
import { Text } from '../components/ui/Text';

import { CopyableValue } from './components/CopyableValue';
import { listedDemos, type DemoEntry } from './demos/catalogue';
import type { ConfigResponse } from './library/api-types';
import { vibenetApi } from './library/client';
import { VIBENET_EXPLORER_PATH, VIBENET_RPC_URL } from './library/config';

export default function VibenetHomePage() {
  const [config, setConfig] = useState<Partial<ConfigResponse>>({});
  const [chainId, setChainId] = useState('');

  useEffect(() => {
    let cancelled = false;
    vibenetApi
      .config()
      .then((next) => {
        if (!cancelled) setConfig(next);
      })
      .catch(() => {});
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

  const branch = config.branch && config.branch !== 'unknown' ? config.branch : null;
  const commit = config.commit && config.commit !== 'unknown' ? config.commit : null;

  return (
    <div className="animate-in -mb-20 flex min-w-0 flex-1 flex-col gap-16 pb-4 text-foreground">
      <header className="flex flex-col gap-4 pb-4 md:flex-row md:items-start md:justify-between md:gap-8">
        <div className="flex max-w-xl flex-1 flex-col gap-6">
          <img src="/vibenet-illo.svg" alt="" width={48} height={48} className="mt-8" />
          <Text variant="title2" tone="muted">
            <span className="text-foreground">Vibenet</span> is an ephemeral Base developer network for testing in-flight features.
          </Text>
        </div>
        <Card className="flex flex-col gap-0.5 bg-background px-5 py-5 dark:bg-white/5 md:min-w-[360px]">
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
              className="font-mono text-[13px] text-foreground transition-colors hover:text-base-blue dark:text-white"
            >
              {VIBENET_EXPLORER_PATH}
            </Link>
          </div>
        </Card>
      </header>

      <section className="flex flex-col gap-6">
        <Text variant="headline">Demos</Text>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {listedDemos().map((demo) =>
            demo.available ? (
              <LinkCard
                key={demo.href}
                href={demo.href}
                interactive={false}
                className="group flex flex-col gap-4 bg-background p-6 transition-colors hover:bg-bds-gray-5 dark:bg-white/5 dark:hover:bg-white/[0.08]"
              >
                <DemoCardBody demo={demo} />
              </LinkCard>
            ) : (
              <Card
                key={demo.href}
                className="flex flex-col gap-4 bg-background p-6 opacity-60 dark:bg-white/5"
              >
                <DemoCardBody demo={demo} />
              </Card>
            ),
          )}
        </div>
      </section>

      <section className="flex flex-col gap-6 md:hidden">
        <Text variant="title2">Connect</Text>
        <Card className="flex flex-col gap-4 bg-background p-6 dark:bg-white/5">
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
              className="font-mono text-[13px] text-base-blue hover:underline"
            >
              {VIBENET_EXPLORER_PATH}
            </Link>
          </div>
        </Card>
      </section>

      <footer className="mt-auto flex flex-wrap items-center gap-x-6 gap-y-2 pb-4 text-[12px] text-bds-gray-30">
        <span>
          branch{' '}
          {branch ? (
            <a
              href={`https://github.com/base/base/tree/${branch}`}
              target="_blank"
              rel="noopener"
              className="text-bds-gray-50 transition-colors hover:text-bds-gray-70 hover:no-underline dark:text-bds-gray-40"
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
              className="text-bds-gray-50 transition-colors hover:text-bds-gray-70 hover:no-underline dark:text-bds-gray-40"
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

function DemoCardBody({ demo }: { demo: DemoEntry }) {
  return (
    <>
      <div>
        <div className="flex items-center gap-2">
          <Text variant="headline">{demo.title}</Text>
          {!demo.available ? (
            <span className="text-[11px] uppercase tracking-[0.6px] text-bds-gray-60 dark:text-bds-gray-40">
              Coming soon
            </span>
          ) : null}
        </div>
        <Text variant="body" tone="muted" className="mt-2">
          {demo.summary}
        </Text>
      </div>
      <ul className="mt-auto flex flex-col gap-2 border-t border-bds-gray-10 pt-4 dark:border-white/10">
        {demo.points.map((point) => (
          <li key={point} className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-[1px] bg-bds-gray-30" aria-hidden="true" />
            <Text as="span" variant="label.regular" tone="muted">{point}</Text>
          </li>
        ))}
      </ul>
    </>
  );
}
