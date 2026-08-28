'use client';

import { useState } from 'react';
import type { Hex } from 'viem';

import { Text } from '../../../../components/ui/Text';
import { VIBENET_EXPLORER_PATH } from '../../../library/config';
import { short } from '../../account/shared';
import { walletErrorMessage } from '../../../library/wallet';
import { CallRow, ReviewArrow } from '../../_shared/CallRow';
import { TransactionModal, type TxStep } from '../../_shared/TransactionModal';
import type { TokenInfo } from '../lib/types';
import { Notice } from './primitives';

// "Gas Payments" flow: send a real transaction whose network fee is paid in the
// currently selected stablecoin, not ETH. The account spends the token; the
// demo's own ERC-8168 gas payer spends the ETH that actually buys the gas, so
// the account never needs to hold ETH. This is a demonstration send, not a
// persistent setting — every payment pays its own fee in the token.
export function GasModule({
  open,
  onClose,
  token,
  ethAmount,
  recipient,
  fee,
  onPay,
}: {
  open: boolean;
  onClose: () => void;
  token: TokenInfo | null;
  /** ETH being sent by the demo transaction, e.g. "0.001". */
  ethAmount: string;
  /** Recipient of the demo ETH transfer. */
  recipient: string;
  /** Flat per-transaction fee in token terms, e.g. "0.10". */
  fee: string;
  /** Sends the demo transaction with its gas paid in the token; resolves to the tx hash. */
  onPay: () => Promise<Hex | null>;
}) {
  const [step, setStep] = useState<TxStep>('build');
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);

  const isStablecoin = token?.variant === 'stablecoin';

  const reset = () => {
    setStep('build');
    setFinalizing(false);
    setError(null);
    setTxHash(null);
  };

  const handleClose = () => {
    if (finalizing) return;
    reset();
    onClose();
  };

  const submit = async () => {
    setError(null);
    setStep('submitted');
    setFinalizing(true);
    try {
      const hash = await onPay();
      if (!hash) throw new Error('The gas payment could not be sent.');
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
      titles={{ build: 'Gas Payments', submitted: 'Gas Payments' }}
      canProceed={Boolean(isStablecoin)}
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
          <Text variant="title3">Sent</Text>
          <Text variant="label.regular" tone="muted">
            Gas paid in {token?.symbol}.
          </Text>
        </div>
      )}
      buildBody={
        token && isStablecoin ? (
          <div className="flex flex-col gap-4">
            <ul className="flex flex-col gap-2">
              <CallRow index={1}>
                <span className="font-normal">Send {ethAmount} ETH</span>
                <ReviewArrow />
                <span className="text-bds-gray-70 dark:text-bds-gray-30">{short(recipient)}</span>
              </CallRow>
            </ul>
            <div className="flex items-center justify-between gap-3 border-t border-bds-gray-10 pt-3 text-[13px] dark:border-white/10">
              <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">Network fee</span>
              <span className="rounded-full bg-bds-blue-0 px-2 py-0.5 text-[11px] font-medium text-base-blue">
                {fee} {token.symbol}
              </span>
            </div>
          </div>
        ) : (
          <Notice>Paying for gas in a token is a Stablecoin feature.</Notice>
        )
      }
    />
  );
}
