'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { Hex } from 'viem';

import { trackReflexRun } from '../../../../analytics/events';
import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { cn } from '../../../../components/ui/cn';
import { Text } from '../../../../components/ui/Text';
import { VIBENET_EXPLORER_PATH } from '../../../library/config';
import { walletErrorMessage } from '../../../library/wallet';
import { AccountDemoShell } from '../../_components/AccountDemoShell';
import { ViewTransactionButton } from '../../_shared/ViewTransactionButton';
import type { Inclusion } from '../../_shared/inclusion';
import { AccountEngineProvider, useAccountEngine } from '../../account/useAccountEngine';
import { outcomeCopy, reflexOutcome, type ReflexOutcome } from './lib/game';

const TARGETS = Array.from({ length: 9 }, (_, index) => index);

type Phase = 'idle' | 'preparing' | 'countdown' | 'racing' | 'result' | 'error';

type Result = {
  outcome: ReflexOutcome;
  reactionMs: number | null;
  inclusionMs: number;
  hash: Hex;
  inclusion?: Inclusion;
};

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function BaseTarget({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12 sm:h-14 sm:w-14" aria-hidden="true">
      <circle
        cx="24"
        cy="24"
        r="19"
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M12 25.5h23.5c-.8 6-5.7 10.5-12 10.5-6.7 0-12.2-5.2-12.5-11.8v-.8C11.3 16.9 16.8 12 23.5 12c6.3 0 11.2 4.4 12 10.5H12"
        fill={active ? 'var(--background)' : 'currentColor'}
      />
    </svg>
  );
}

function ReflexGameInner() {
  const engine = useAccountEngine();
  const [phase, setPhase] = useState<Phase>('idle');
  const [countdown, setCountdown] = useState<3 | 2 | 1 | 'GO' | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [hasReacted, setHasReacted] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const startedAt = useRef(0);
  const reactionMs = useRef<number | null>(null);
  const transactionHash = useRef<Hex | null>(null);

  useEffect(() => {
    if (phase !== 'racing') return;
    let frame = 0;
    const update = () => {
      setElapsed(Math.round(performance.now() - startedAt.current));
      frame = window.requestAnimationFrame(update);
    };
    frame = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(frame);
  }, [phase]);

  const reset = () => {
    setPhase('idle');
    setCountdown(null);
    setTarget(null);
    setElapsed(0);
    setHasReacted(false);
    setResult(null);
    setError('');
    startedAt.current = 0;
    reactionMs.current = null;
    transactionHash.current = null;
  };

  const finish = () => {
    const inclusionMs = Math.max(0, Math.round(performance.now() - startedAt.current));
    const reaction = reactionMs.current;
    const outcome = reaction === null ? 'block' : reflexOutcome(reaction, inclusionMs);
    const hash = transactionHash.current;
    if (!hash) return;
    setElapsed(inclusionMs);
    setTarget(null);
    setResult({ outcome, reactionMs: reaction, inclusionMs, hash });
    setPhase('result');
    trackReflexRun(outcome);
  };

  const startRun = async () => {
    if (!engine.acct || phase !== 'idle' && phase !== 'result' && phase !== 'error') return;
    setPhase('preparing');
    setError('');
    setResult(null);
    setElapsed(0);
    setHasReacted(false);
    reactionMs.current = null;
    transactionHash.current = null;
    trackReflexRun('started');

    try {
      const account = engine.acct;
      const response = await engine.sendActiveCalls({
        calls: [{ to: account.address, data: '0x', value: '0' }],
        metadata: '200ms Reflex',
        beforeBroadcast: async () => {
          setPhase('countdown');
          for (const value of [3, 2, 1] as const) {
            setCountdown(value);
            await sleep(1_000);
          }
          setCountdown('GO');
        },
        onBroadcast: (hash) => {
          transactionHash.current = hash;
          startedAt.current = performance.now();
          setTarget(Math.floor(Math.random() * TARGETS.length));
          setCountdown(null);
          setPhase('racing');
        },
        onReceipt: finish,
      });

      setResult((current) => current ? { ...current, inclusion: response.inclusion } : current);
      engine.pushActivity({
        kind: 'transact',
        title: '200ms Reflex run',
        detail: reactionMs.current === null ? 'The block won' : `Reaction: ${reactionMs.current} ms`,
        txHash: response.hash,
        serialized: response.serialized,
        network: engine.chain.name,
        mode: engine.chain.mode,
        account: account.address,
      });
    } catch (cause) {
      setTarget(null);
      setCountdown(null);
      setError(walletErrorMessage(cause));
      setPhase('error');
      trackReflexRun('error');
    }
  };

  const hitTarget = (index: number, event: MouseEvent<HTMLButtonElement>) => {
    if (phase !== 'racing' || index !== target || reactionMs.current !== null) return;
    const reaction = Math.max(0, Math.round(event.timeStamp - startedAt.current));
    reactionMs.current = reaction;
    setElapsed(reaction);
    setHasReacted(true);
    setTarget(null);
  };

  const outcome = result ? outcomeCopy(result.outcome) : null;
  const busy = phase === 'preparing' || phase === 'countdown' || phase === 'racing';
  const arenaStatus =
    phase === 'racing'
      ? hasReacted
        ? 'Waiting for the block…'
        : 'Hit the lit target'
      : phase === 'result'
        ? 'Race complete'
        : phase === 'error'
          ? 'Ready to try again'
          : 'Move your cursor into the arena';

  return (
    <AccountDemoShell
      gateTitle="Create an account to race a block"
      gateDescription="Reflex sends a zero-value transaction from your local Vibenet account, then compares your reaction with its real inclusion."
      className="animate-in gap-8"
    >
      <header className="border-b border-bds-gray-10 pb-8 dark:border-white/10">
        <Text variant="caption" className="mb-3 text-base-blue dark:text-white">Vibenet · 200ms Blocks</Text>
        <Text as="h1" variant="display" className="text-balance">Can you beat a block?</Text>
        <Text variant="body" tone="muted" className="mt-4 max-w-2xl">
          After a 3–2–1 countdown, a real transaction is broadcast and one target lights up. Hit it before Vibenet
          seals the transaction in a complete native block.
        </Text>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,.75fr)]">
        <Card className="relative overflow-hidden bg-background p-4 dark:bg-white/[0.03] sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <Text variant="caption" tone="muted">Reaction arena</Text>
              <Text variant="label" className="mt-1">{arenaStatus}</Text>
            </div>
            <div className="font-mono text-[28px] font-[500] tabular-nums tracking-[-0.04em]">
              {phase === 'racing' ? `${elapsed} ms` : phase === 'result' ? 'Done' : '— ms'}
            </div>
          </div>

          <div className="relative grid min-h-[360px] grid-cols-3 gap-3 rounded-xl bg-bds-gray-5 p-3 dark:bg-black/20 sm:gap-4 sm:p-5">
            {TARGETS.map((index) => {
              const active = phase === 'racing' && target === index;
              return (
                <button
                  key={index}
                  type="button"
                  onClick={(event) => hitTarget(index, event)}
                  aria-label={active ? 'Hit the active target' : 'Inactive target'}
                  className={cn(
                    'relative flex min-h-24 items-center justify-center rounded-xl border transition-[color,background-color,border-color,transform] duration-100',
                    active
                      ? 'scale-[1.03] border-base-blue bg-base-blue text-white shadow-[0_0_0_4px_rgba(0,82,255,0.12)] dark:text-black'
                      : 'border-bds-gray-10 bg-background text-bds-gray-30 dark:border-white/10 dark:bg-white/[0.04] dark:text-bds-gray-60',
                  )}
                >
                  {active ? <span className="absolute inset-2 animate-ping rounded-lg border border-current opacity-30" /> : null}
                  <BaseTarget active={active} />
                </button>
              );
            })}

            {phase === 'preparing' || phase === 'countdown' ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/90 backdrop-blur-[2px] dark:bg-black/80">
                <Text variant="caption" tone="muted">{phase === 'preparing' ? 'Preparing transaction' : 'Get ready'}</Text>
                <div className="mt-2 text-[88px] leading-none font-[550] tracking-[-0.08em] text-base-blue dark:text-white">
                  {phase === 'preparing' ? '…' : countdown}
                </div>
              </div>
            ) : null}
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="flex min-h-[250px] flex-col bg-background p-6 dark:bg-white/[0.03]">
            <Text variant="caption" tone="muted">The race</Text>
            {result && outcome ? (
              <>
                <Text variant="title1" className="mt-4 text-balance">{outcome.title}</Text>
                <Text variant="label.regular" tone="muted" className="mt-2">{outcome.detail}</Text>
                <div className="mt-6 grid grid-cols-2 gap-3 border-y border-bds-gray-10 py-4 dark:border-white/10">
                  <div>
                    <Text variant="caption" tone="muted">You</Text>
                    <Text variant="title2" className="mt-1 font-mono tabular-nums">
                      {result.reactionMs === null ? 'Missed' : `${result.reactionMs} ms`}
                    </Text>
                  </div>
                  <div>
                    <Text variant="caption" tone="muted">Txn inclusion</Text>
                    <Text variant="title2" className="mt-1 font-mono tabular-nums">{result.inclusionMs} ms</Text>
                  </div>
                </div>
                <Text variant="footnote" tone="muted" className="mt-3">
                  Measured from RPC acceptance until this page observed the receipt.
                </Text>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button size="sm" onClick={reset}>Race Again</Button>
                  <ViewTransactionButton href={`${VIBENET_EXPLORER_PATH}/tx/${result.hash}`} />
                </div>
              </>
            ) : phase === 'error' ? (
              <>
                <Text variant="title2" className="mt-4">Run interrupted</Text>
                <Text variant="label.regular" tone="muted" className="mt-2">{error}</Text>
                <Button size="sm" className="mt-6" onClick={reset}>Try Again</Button>
              </>
            ) : (
              <>
                <div className="mt-5 flex items-end gap-2">
                  <span className="text-[64px] leading-none font-[550] tracking-[-0.08em]">200</span>
                  <Text variant="title2" className="mb-1">ms</Text>
                </div>
                <Text variant="label.regular" tone="muted" className="mt-2">
                  One full block. Signing happens first, then the countdown starts immediately before broadcast.
                </Text>
                <Button
                  size="sm"
                  className="mt-auto disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={() => void startRun()}
                  disabled={busy}
                >
                  {busy ? 'Race in progress' : 'Start Race'}
                </Button>
              </>
            )}
          </Card>

          <Card className="bg-bds-gray-5 p-5 dark:bg-white/[0.03]">
            <Text variant="label">How it works</Text>
            <ol className="mt-3 flex flex-col gap-2 text-[13px] leading-5 text-bds-gray-60">
              <li><span className="mr-2 font-mono text-foreground">01</span> Sign and prepare the transaction.</li>
              <li><span className="mr-2 font-mono text-foreground">02</span> Position your cursor during 3–2–1.</li>
              <li><span className="mr-2 font-mono text-foreground">03</span> Hit the target before the receipt arrives.</li>
            </ol>
          </Card>
        </div>
      </div>
    </AccountDemoShell>
  );
}

export function ReflexGame() {
  return (
    <AccountEngineProvider>
      <ReflexGameInner />
    </AccountEngineProvider>
  );
}
