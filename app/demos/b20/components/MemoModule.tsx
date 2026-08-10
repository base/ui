'use client';

import Link from 'next/link';
import { useState } from 'react';
import { encodeFunctionData, isAddress, type Address, type Hex } from 'viem';

import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Text } from '../../../components/ui/Text';
import { VIBENET_EXPLORER_PATH } from '../../../vibenet/library/config';
import { walletErrorMessage } from '../../../vibenet/library/wallet';
import { SAMPLE_MEMO_TX } from '../lib/constants';
import { B20_HELP } from '../lib/glossary';
import { amount, b20Abi, memoToBytes32 } from '../lib/protocol';
import { READ_MEMO_PROMPT } from '../lib/prompts';
import type { TokenAccess, TokenInfo } from '../lib/types';
import { CopyPromptButton } from './CopyPromptButton';
import { MemoHistory } from './MemoHistory';
import { EmptyToken, ErrorNote, Field, Input, ModuleHeading } from './primitives';

export function MemoModule({
  token,
  tokenAccess,
  onDeploy,
  onSend,
  busy,
}: {
  token: TokenInfo | null;
  tokenAccess: TokenAccess;
  onDeploy: () => void;
  onSend: (label: string, to: Address, data: Hex, action: string) => Promise<Hex | null>;
  busy: string | null;
}) {
  const [to, setTo] = useState('');
  const [value, setValue] = useState('');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!token) return;
    setError(null);
    try {
      const m = memoToBytes32(memo);
      const v = amount(value, token.decimals);
      if (v <= 0n) throw new Error('Enter an amount greater than zero.');
      if (!isAddress(to)) throw new Error('Paste a valid wallet address for the recipient.');
      const data = encodeFunctionData({ abi: b20Abi, functionName: 'transferWithMemo', args: [to, v, m] });
      await onSend('Transfer with memo', token.address, data, 'memo_transfer');
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
        <Card className="bg-white p-5 dark:bg-white/5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="rounded-full bg-bds-blue-0 px-2 py-1 text-[11px] text-base-blue dark:bg-bds-blue-100/40 dark:text-bds-blue-20">
                Sample transaction
              </span>
              <Text className="mt-3" variant="headline">
                Transfer with memo
              </Text>
              <Text variant="footnote" tone="muted">
                A token transfer with a memo attached to help identify the transaction’s purpose.
              </Text>
            </div>
            <Link
              href={`${VIBENET_EXPLORER_PATH}/tx/${SAMPLE_MEMO_TX}`}
              className="text-[12px] text-base-blue hover:underline"
            >
              View transaction ↗
            </Link>
          </div>
          <dl className="mt-5 grid gap-3 rounded-xl border border-bds-gray-10 p-4 text-[13px] sm:grid-cols-2 dark:border-white/10">
            <div>
              <dt className="text-[11px] text-bds-gray-50">Operation</dt>
              <dd className="mt-1">Transfer with a note</dd>
            </div>
            <div>
              <dt className="text-[11px] text-bds-gray-50">Amount</dt>
              <dd className="mt-1">0.001 {token.symbol}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-bds-gray-50">Memo</dt>
              <dd className="mt-1 font-medium">sending test</dd>
            </div>
            <div>
              <dt className="text-[11px] text-bds-gray-50">Encoding</dt>
              <dd className="mt-1 font-mono text-[11px]">bytes32</dd>
            </div>
          </dl>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-bds-gray-10 pt-4 dark:border-white/10">
            <p className="text-[12px] text-bds-gray-50">Create a token to add memos to your own transactions.</p>
            <Button size="sm" onClick={onDeploy}>
              Create your own token
            </Button>
          </div>
        </Card>
        <MemoHistory address={token.address} decimals={token.decimals} symbol={token.symbol} />
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
      <Card className="bg-white p-5 dark:bg-white/5">
        {!token ? (
          <EmptyToken />
        ) : (
          <>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Wallet receiving tokens">
                <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Paste a wallet address" />
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
              {busy ? 'Waiting for wallet…' : 'Submit transfer with memo'}
            </Button>
          </>
        )}
      </Card>
      {token ? <MemoHistory address={token.address} decimals={token.decimals} symbol={token.symbol} /> : null}
    </div>
  );
}
