'use client';

import { useState } from 'react';
import { encodeFunctionData, isAddress, type Address, type Hex } from 'viem';

import { Text } from '../../../../components/ui/Text';
import { VIBENET_EXPLORER_PATH } from '../../../library/config';
import { walletErrorMessage } from '../../../library/wallet';
import { AddressAutocomplete, type AddressBookEntry } from '../../_shared/AddressAutocomplete';
import { TransactionModal, type TxStep } from '../../_shared/TransactionModal';
import { B20_HELP } from '../lib/glossary';
import { READ_MEMO_PROMPT } from '../lib/prompts';
import { amount, b20Abi, memoToBytes32 } from '../lib/protocol';
import type { TokenInfo } from '../lib/types';
import { CopyPromptButton } from './CopyPromptButton';
import { ErrorNote, Field, Input } from './primitives';

type MemoModuleProps = {
  open: boolean;
  onClose: () => void;
  token: TokenInfo | null;
  addressBook: AddressBookEntry[];
  onSend: (label: string, to: Address, data: Hex, action: string) => Promise<Hex | null>;
};

// Send-with-memo flow, presented through the shared TransactionModal. It attaches
// a bytes32 reference to a B20 transfer so the transaction can be reconciled later.
export function MemoModule(props: MemoModuleProps) {
  if (!props.open) return null;
  return <MemoModuleInner {...props} />;
}

function MemoModuleInner({
  open,
  onClose,
  token,
  addressBook,
  onSend,
}: MemoModuleProps) {
  const [to, setTo] = useState('');
  const [value, setValue] = useState('');
  const [memo, setMemo] = useState('');
  const [step, setStep] = useState<TxStep>('build');
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);

  const handleClose = () => {
    if (finalizing) return;
    onClose();
  };

  const submit = async () => {
    if (!token) return;
    setError(null);
    let data: Hex;
    try {
      const m = memoToBytes32(memo);
      const v = amount(value, token.decimals);
      if (v <= 0n) throw new Error('Enter an amount greater than zero.');
      if (!isAddress(to)) throw new Error('Paste a valid wallet address for the recipient.');
      data = encodeFunctionData({ abi: b20Abi, functionName: 'transferWithMemo', args: [to, v, m] });
    } catch (cause) {
      setError(walletErrorMessage(cause));
      return;
    }
    setStep('submitted');
    setFinalizing(true);
    try {
      const hash = await onSend(
        token.variant === 'stablecoin' ? `Send ${token.symbol} with memo` : 'Transfer with memo',
        token.address,
        data,
        'memo_transfer',
      );
      if (!hash) throw new Error('The transfer could not be sent.');
      setTxHash(hash);
    } catch (cause) {
      setError(walletErrorMessage(cause));
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <TransactionModal
      open={open}
      onClose={handleClose}
      step={step}
      busy={finalizing}
      error={error ?? undefined}
      result={txHash ? { txHash } : null}
      titles={{ build: 'Send with Memo', submitted: 'Send with Memo' }}
      titleAction={<CopyPromptButton prompt={READ_MEMO_PROMPT} module="memos" />}
      canProceed={Boolean(token)}
      proceedLabel="Send"
      onProceed={() => void submit()}
      onSubmittedBack={() => {
        setStep('build');
        setError(null);
      }}
      onRetry={() => void submit()}
      onDone={handleClose}
      explorerTxPath={(hash) => `${VIBENET_EXPLORER_PATH}/tx/${hash}`}
      renderSuccess={() => (
        <div className="flex flex-col items-center gap-1">
          <Text variant="title3">Transfer sent</Text>
          <Text variant="label.regular" tone="muted">
            Your transfer with memo was submitted.
          </Text>
        </div>
      )}
      buildBody={
        token ? (
          <div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="To">
                <AddressAutocomplete
                  value={to}
                  onChange={setTo}
                  accounts={addressBook}
                  placeholder="0x… wallet address or account name"
                  className="h-10 px-3 text-[14px]"
                />
              </Field>
              <Field label="Amount">
                <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="25" inputMode="decimal" />
              </Field>
              <Field label="Memo" help={B20_HELP.memo}>
                <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Invoice-1042" />
              </Field>
            </div>
            {memo ? (
              <p className="mt-3 font-mono text-[11px] text-bds-gray-50">
                {(() => {
                  try {
                    return memoToBytes32(memo);
                  } catch {
                    return 'Memo is too long';
                  }
                })()}
              </p>
            ) : null}
            <ErrorNote message={error} />
          </div>
        ) : null
      }
    />
  );
}
