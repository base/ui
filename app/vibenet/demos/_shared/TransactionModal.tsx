'use client';

// Shared transaction dialog used across the demos (account "Advanced
// Transactions", B20 create-token, B20 send-with-memo). It owns the consistent
// chrome — a three-step modal (build → review → submitted), the standard
// footers, and a default submitted view (spinner → success / error) — while the
// caller keeps its own state and handlers. `step` is controlled by the caller,
// so each flow drives its own transitions (some skip the review step, some jump
// straight to it from a preset). Callers may fully override the review and
// submitted bodies, or supply a custom success renderer for the default one.

import Link from 'next/link';
import type { ReactNode } from 'react';

import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Spinner } from '../../../components/ui/Spinner';
import { Text } from '../../../components/ui/Text';

export type TxStep = 'build' | 'review' | 'submitted';
export type TxResult = { txHash?: string } | null;

const DEFAULT_TITLES: Record<TxStep, string> = {
  build: 'Create Transaction',
  review: 'Review Transaction',
  submitted: 'Submitted',
};

type TransactionModalProps = {
  open: boolean;
  onClose: () => void;
  step: TxStep;
  /** True while the transaction is signing/broadcasting. Locks close + footers. */
  busy: boolean;
  error?: string;
  result?: TxResult;
  /** Per-step titles; falls back to sensible defaults. */
  titles?: Partial<Record<TxStep, string>>;

  // Build step.
  buildBody: ReactNode;
  /** Info shown to the left of the build primary button (e.g. a gas summary). */
  buildInfo?: ReactNode;
  canProceed: boolean;
  proceedLabel: string;
  onProceed: () => void;

  // Review step (optional — omit reviewBody for flows that skip review).
  reviewBody?: ReactNode;
  /** Summary shown to the left of the review footer buttons (e.g. gas + signer). */
  reviewInfo?: ReactNode;
  confirmLabel?: string;
  onConfirm?: () => void;
  onReviewBack?: () => void;

  // Submitted step.
  /** Full override of the submitted body; otherwise the default view renders. */
  submittedBody?: ReactNode;
  /** Custom success content for the default submitted view. */
  renderSuccess?: () => ReactNode;
  successExtra?: ReactNode;
  explorerTxPath?: (hash: string) => string;
  onSubmittedBack?: () => void;
  onRetry?: () => void;
  onDone: () => void;
};

function DefaultSubmitted({
  busy,
  error,
  result,
  renderSuccess,
}: {
  busy: boolean;
  error?: string;
  result?: TxResult;
  renderSuccess?: () => ReactNode;
}) {
  if (busy) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <Spinner />
        <Text variant="label.regular" tone="muted">
          Submitting transaction…
        </Text>
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border border-bds-red-20 bg-bds-red-0 p-4 text-[13px] text-bds-red-70 [line-break:anywhere]">
        {error}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-4 py-2 text-center">
      <span
        className="flex h-12 w-12 items-center justify-center rounded-full bg-bds-green-50 text-xl text-white"
        aria-hidden="true"
      >
        ✓
      </span>
      {renderSuccess ? renderSuccess() : <Text variant="title3">Transaction submitted</Text>}
    </div>
  );
}

export function TransactionModal({
  open,
  onClose,
  step,
  busy,
  error,
  result,
  titles,
  buildBody,
  buildInfo,
  canProceed,
  proceedLabel,
  onProceed,
  reviewBody,
  reviewInfo,
  confirmLabel = 'Send',
  onConfirm,
  onReviewBack,
  submittedBody,
  renderSuccess,
  successExtra,
  explorerTxPath,
  onSubmittedBack,
  onRetry,
  onDone,
}: TransactionModalProps) {
  const title = titles?.[step] ?? DEFAULT_TITLES[step];

  const body =
    step === 'build' ? (
      buildBody
    ) : step === 'review' ? (
      reviewBody
    ) : submittedBody ? (
      submittedBody
    ) : (
      <DefaultSubmitted busy={busy} error={error} result={result} renderSuccess={renderSuccess} />
    );

  let footer: ReactNode = null;
  if (step === 'build') {
    footer = (
      <div className="flex w-full items-center justify-between gap-3">
        {buildInfo ?? <span />}
        <Button
          size="sm"
          onClick={onProceed}
          disabled={!canProceed || busy}
          className="disabled:cursor-not-allowed disabled:opacity-50"
        >
          {proceedLabel}
        </Button>
      </div>
    );
  } else if (step === 'review') {
    footer = (
      <div className="flex w-full items-center justify-between gap-3">
        {reviewInfo ?? <span />}
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onReviewBack} disabled={busy}>
            Back
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onConfirm}
            disabled={busy}
            className="disabled:cursor-not-allowed disabled:opacity-50"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    );
  } else {
    // submitted
    footer = busy ? null : error ? (
      <>
        {onSubmittedBack ? (
          <Button variant="secondary" size="sm" onClick={onSubmittedBack}>
            Back
          </Button>
        ) : null}
        {onRetry ? (
          <Button variant="primary" size="sm" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </>
    ) : (
      <>
        {successExtra}
        {result?.txHash && explorerTxPath ? (
          <Link href={explorerTxPath(result.txHash)}>
            <Button variant="secondary" size="sm">
              View Transaction
            </Button>
          </Link>
        ) : null}
        <Button variant="primary" size="sm" onClick={onDone}>
          Done
        </Button>
      </>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={title} footer={footer}>
      {body}
    </Modal>
  );
}
