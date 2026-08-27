'use client';

import { useState } from 'react';
import { encodeFunctionData, isAddress, type Address, type Hex } from 'viem';

import { Text } from '../../../../components/ui/Text';
import { VIBENET_EXPLORER_PATH } from '../../../library/config';
import { walletErrorMessage } from '../../../library/wallet';
import { AddressAutocomplete, type AddressBookEntry } from '../../_shared/AddressAutocomplete';
import { TransactionModal, type TxStep } from '../../_shared/TransactionModal';
import { amount, b20Abi, memoToBytes32 } from '../lib/protocol';
import type { TokenInfo } from '../lib/types';
import { ErrorNote, Field, Input } from './primitives';

// Plain token transfer — a recipient and an amount, presented through the shared
// TransactionModal.
export function TransferModule({
  open,
  onClose,
  token,
  addressBook,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  token: TokenInfo | null;
  addressBook: AddressBookEntry[];
  onSend: (label: string, to: Address, data: Hex, action: string) => Promise<Hex | null>;
}) {
  const [to, setTo] = useState('');
  const [value, setValue] = useState('');
  const [step, setStep] = useState<TxStep>('build');
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);

  const reset = () => {
    setStep('build');
    setFinalizing(false);
    setError(null);
    setTxHash(null);
    setTo('');
    setValue('');
  };

  const handleClose = () => {
    if (finalizing) return;
    reset();
    onClose();
  };

  const submit = async () => {
    if (!token) return;
    setError(null);
    let data: Hex;
    try {
      const v = amount(value, token.decimals);
      if (v <= 0n) throw new Error('Enter an amount greater than zero.');
      if (!isAddress(to)) throw new Error('Paste a valid wallet address for the recipient.');
      data = encodeFunctionData({ abi: b20Abi, functionName: 'transferWithMemo', args: [to, v, memoToBytes32('')] });
    } catch (cause) {
      setError(walletErrorMessage(cause));
      return;
    }
    setStep('submitted');
    setFinalizing(true);
    try {
      const hash = await onSend(`Send ${token.symbol}`, token.address, data, 'transfer');
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
      titles={{ build: 'Transfer', submitted: 'Transfer' }}
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
            Your {token?.symbol} transfer was submitted.
          </Text>
        </div>
      )}
      buildBody={
        token ? (
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
          </div>
        ) : null
      }
    />
  );
}
