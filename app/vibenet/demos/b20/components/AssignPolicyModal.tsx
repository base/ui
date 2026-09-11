'use client';

import { useState } from 'react';
import { encodeFunctionData, type Address, type Hex } from 'viem';

import { Text } from '../../../../components/ui/Text';
import { VIBENET_EXPLORER_PATH } from '../../../library/config';
import { walletErrorMessage } from '../../../library/wallet';
import { CallRow, ReviewArrow } from '../../_shared/CallRow';
import type { Inclusion } from '../../_shared/inclusion';
import { TransactionModal, type TxStep } from '../../_shared/TransactionModal';
import { b20Abi, scopeId } from '../lib/protocol';
import type { TokenInfo } from '../lib/types';

export type PendingAssignment = { scope: string; scopeLabel: string; policyId: bigint; policyLabel: string };

// Assign (or clear) a policy on a token feature, through the shared
// TransactionModal so the change is reviewed and confirmed like every other send.
export function AssignPolicyModal({
  open,
  onClose,
  token,
  assignment,
  onSend,
  inclusionFor,
}: {
  open: boolean;
  onClose: () => void;
  token: TokenInfo | null;
  assignment: PendingAssignment | null;
  onSend: (label: string, to: Address, data: Hex, action: string) => Promise<Hex | null>;
  /** Inclusion timing for a landed hash — which 200 ms block, how fast. */
  inclusionFor?: (hash: Hex) => Inclusion | undefined;
}) {
  const [step, setStep] = useState<TxStep>('build');
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);

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
    if (!token || !assignment) return;
    setError(null);
    setStep('submitted');
    setFinalizing(true);
    try {
      const data = encodeFunctionData({
        abi: b20Abi,
        functionName: 'updatePolicy',
        args: [scopeId(assignment.scope), assignment.policyId],
      });
      const hash = await onSend(`Update policy · ${assignment.scopeLabel}`, token.address, data, 'attach_policy');
      if (!hash) throw new Error('The policy could not be updated.');
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
      result={txHash ? { txHash, inclusion: inclusionFor?.(txHash) } : null}
      titles={{ build: 'Assign Policy', submitted: 'Assign Policy' }}
      canProceed={Boolean(assignment)}
      proceedLabel="Assign"
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
          <Text variant="title3">Policy updated</Text>
          <Text variant="label.regular" tone="muted">
            Updated “{assignment?.scopeLabel}” to {assignment?.policyLabel}.
          </Text>
        </div>
      )}
      buildBody={
        assignment ? (
          <ul className="flex flex-col gap-2">
            <CallRow index={1}>
              <span className="font-normal">{assignment.scopeLabel}</span>
              <ReviewArrow />
              <span className="text-bds-gray-70 dark:text-bds-gray-30">{assignment.policyLabel}</span>
            </CallRow>
          </ul>
        ) : null
      }
    />
  );
}
