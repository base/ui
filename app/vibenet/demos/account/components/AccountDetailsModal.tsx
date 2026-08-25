'use client';

// Account Details modal (owners / session keys / sub-accounts / assets). Shared
// by every demo that manages local EIP-8130 accounts — driven entirely off an
// `AccountEngine` (see `useAccountEngine`), so the same manager UI works
// wherever the account dropdown appears.

import { Modal } from '../../../../components/ui/Modal';
import type { AccountEngine } from '../useAccountEngine';
import { ConfigView } from './ConfigView';

type AccountDetailsModalProps = {
  engine: AccountEngine;
  /** "Jump to Transact" — page-specific navigation, omitted where there is no
   * Transact modal (e.g. B20), which hides the button entirely. */
  onTransact?: () => void;
};

export function AccountDetailsModal({ engine, onTransact }: AccountDetailsModalProps) {
  const e = engine;
  return (
    <Modal open={e.detailsOpen && !!e.acct} onClose={() => e.setDetailsOpen(false)} title="Account Details" className="max-w-lg">
      {e.acct ? (
        <ConfigView engine={e} onTransact={onTransact} />
      ) : null}
    </Modal>
  );
}
