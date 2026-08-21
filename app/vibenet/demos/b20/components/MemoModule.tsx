'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { encodeFunctionData, isAddress, type Address, type Hex } from 'viem';

import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { Text } from '../../../../components/ui/Text';
import { VIBENET_EXPLORER_PATH } from '../../../library/config';
import { walletErrorMessage } from '../../../library/wallet';
import { AddressAutocomplete, type AddressBookEntry } from '../../_shared/AddressAutocomplete';
import { B20_HELP } from '../lib/glossary';
import { amount, b20Abi, formatAmount, memoToBytes32, shortAddress } from '../lib/protocol';
import { READ_MEMO_PROMPT } from '../lib/prompts';
import { SAMPLE_MEMOS } from '../lib/samples';
import type { TokenAccess, TokenInfo } from '../lib/types';
import { CopyPromptButton } from './CopyPromptButton';
import { MemoHistory } from './MemoHistory';
import { EmptyToken, ErrorNote, Field, Input, ModuleHeading } from './primitives';

export function MemoModule({
  token,
  tokenAccess,
  addressBook,
  onDeploy,
  onSend,
  busy,
  refreshKey,
  prefill,
  onPrefillConsumed,
  feeNote,
  onEnableTokenGas,
}: {
  token: TokenInfo | null;
  tokenAccess: TokenAccess;
  addressBook: AddressBookEntry[];
  onDeploy: () => void;
  onSend: (label: string, to: Address, data: Hex, action: string) => Promise<Hex | null>;
  busy: string | null;
  /** Bumped by the parent after each transaction so the memo history re-reads. */
  refreshKey?: number;
  /** One-shot prefill for the transfer form (guided "first payment" flow). */
  prefill?: { to: string; amount: string; memo: string } | null;
  onPrefillConsumed?: () => void;
  /** Per-transaction network fee in token terms (e.g. "0.1 ATLN") when token gas is on. */
  feeNote?: string | null;
  /** Set when the selected token is an eligible stablecoin still on sponsored gas. */
  onEnableTokenGas?: (() => void) | null;
}) {
  const [to, setTo] = useState('');
  const [value, setValue] = useState('');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!prefill) return;
    setTo(prefill.to);
    setValue(prefill.amount);
    setMemo(prefill.memo);
    onPrefillConsumed?.();
  }, [prefill, onPrefillConsumed]);
  const [sent, setSent] = useState<{ title: string; summary: string; hash: Hex } | null>(null);
  const submit = async () => {
    if (!token) return;
    setError(null);
    setSent(null);
    try {
      const m = memoToBytes32(memo);
      const v = amount(value, token.decimals);
      if (v <= 0n) throw new Error('Enter an amount greater than zero.');
      if (!isAddress(to)) throw new Error('Paste a valid wallet address for the recipient.');
      const hash = await onSend(
        'Transfer with memo',
        token.address,
        encodeFunctionData({ abi: b20Abi, functionName: 'transferWithMemo', args: [to, v, m] }),
        'memo_transfer',
      );
      if (hash) {
        setSent({
          title: `Sent ${value} ${token.symbol} to ${shortAddress(to)}`,
          summary: `Memo “${memo}” is recorded onchain with the transfer.`,
          hash,
        });
        setTo('');
        setValue('');
        setMemo('');
      }
    } catch (error) {
      setError(walletErrorMessage(error));
    }
  };

  if (token && tokenAccess === 'sample')
    return (
      <div className="flex flex-col gap-5">
        <ModuleHeading
          icon="▤"
          title="Memos"
          description="See the short references attached to token activity."
          action={<CopyPromptButton prompt={READ_MEMO_PROMPT} module="memos" />}
        />
        <Card className="bg-background p-5 dark:bg-white/5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="rounded-full bg-bds-blue-0 px-2 py-1 text-[11px] text-base-blue">
                Sample data · Read only
              </span>
              <Text className="mt-3" variant="headline">
                Memo history
              </Text>
              <Text variant="footnote" tone="muted">
                Example token activity with short references attached to it. These records are local mock data.
              </Text>
            </div>
            <span className="text-[12px] text-bds-gray-50">
              {SAMPLE_MEMOS.length} memo{SAMPLE_MEMOS.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="mt-5 divide-y divide-bds-gray-10 border-y border-bds-gray-10 dark:divide-white/10 dark:border-white/10">
            {SAMPLE_MEMOS.map((row) => (
              <article key={row.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] text-bds-gray-50">Memo</p>
                    <p className="mt-1 text-[16px] font-medium">{row.memo}</p>
                  </div>
                  <span className="rounded-full bg-bds-gray-5 px-2 py-1 text-[11px] capitalize text-bds-gray-60 dark:bg-white/10">
                    {row.operation} with memo
                  </span>
                </div>
                <dl className="mt-4 grid gap-3 text-[12px] sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-bds-gray-50">Memo caller</dt>
                    <dd className="mt-0.5 font-mono">{shortAddress(row.caller)}</dd>
                  </div>
                  <div>
                    <dt className="text-bds-gray-50">From</dt>
                    <dd className="mt-0.5 font-mono">{shortAddress(row.from)}</dd>
                  </div>
                  <div>
                    <dt className="text-bds-gray-50">To</dt>
                    <dd className="mt-0.5 font-mono">{shortAddress(row.to)}</dd>
                  </div>
                  <div>
                    <dt className="text-bds-gray-50">Amount</dt>
                    <dd className="mt-0.5">{formatAmount(row.value, token.decimals)} {token.symbol}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-bds-gray-10 pt-4 dark:border-white/10">
            <p className="text-[12px] text-bds-gray-50">Create a token to add memos to your own transactions.</p>
            <Button size="sm" onClick={onDeploy}>
              Create your own token
            </Button>
          </div>
        </Card>
      </div>
    );
  return (
    <div className="flex flex-col gap-5">
      <ModuleHeading
        icon="▤"
        title="Memos"
        description="Add a short reference to a token transfer so your team can find it later."
        action={<CopyPromptButton prompt={READ_MEMO_PROMPT} module="memos" />}
      />
      {sent ? (
        <div
          role="status"
          className="animate-in flex items-start gap-3 rounded-xl border border-bds-green-20 bg-bds-green-0 p-4"
        >
          <span
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bds-green-50 text-[13px] text-white"
            aria-hidden="true"
          >
            ✓
          </span>
          <div className="min-w-0 flex-1">
            <Text variant="label">{sent.title}</Text>
            <Text variant="footnote" tone="muted" className="mt-0.5">
              {sent.summary}
            </Text>
            <Link
              href={`${VIBENET_EXPLORER_PATH}/tx/${sent.hash}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-[12px] text-base-blue hover:underline"
            >
              View transaction ↗
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setSent(null)}
            aria-label="Dismiss confirmation"
            className="-mr-1 -mt-1 shrink-0 rounded-full px-2 py-1 text-[12px] text-bds-gray-50 transition-colors hover:bg-bds-gray-5 hover:text-foreground dark:hover:bg-white/10 dark:hover:text-white"
          >
            ×
          </button>
        </div>
      ) : null}
      <Card className="bg-background p-5 dark:bg-white/5">
        {!token ? (
          <EmptyToken />
        ) : (
          <>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Wallet receiving tokens">
                <AddressAutocomplete
                  value={to}
                  onChange={setTo}
                  accounts={addressBook}
                  placeholder="0x… wallet address or account name"
                />
              </Field>
              <Field label={`Amount (${token.symbol})`}>
                <Input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="25"
                  inputMode="decimal"
                />
              </Field>
              <Field label="Memo" help={B20_HELP.memo}>
                <Input
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="Invoice-1042"
                />
              </Field>
            </div>
            <p className="mt-3 font-mono text-[11px] text-bds-gray-50">
              {memo
                ? (() => {
                    try {
                      return memoToBytes32(memo);
                    } catch {
                      return 'Memo is too long';
                    }
                  })()
                : 'Your memo preview will appear here'}
            </p>
            <ErrorNote message={error} />
            <Button className="mt-5" onClick={() => void submit()} disabled={!!busy}>
              {busy === 'memo_transfer' ? 'Sending…' : 'Submit transfer with memo'}
            </Button>
            <p className="mt-3 text-[12px] text-bds-gray-50">
              {feeNote
                ? `Network fee: ${feeNote} — paid from your balance.`
                : 'Network fee: sponsored.'}
              {!feeNote && onEnableTokenGas && token ? (
                <>
                  {' '}
                  <button
                    type="button"
                    onClick={onEnableTokenGas}
                    className="text-base-blue hover:underline"
                  >
                    Pay fees in {token.symbol} instead →
                  </button>
                </>
              ) : null}
            </p>
          </>
        )}
      </Card>
      {token ? (
        <MemoHistory address={token.address} decimals={token.decimals} symbol={token.symbol} refreshKey={refreshKey} />
      ) : null}
    </div>
  );
}
