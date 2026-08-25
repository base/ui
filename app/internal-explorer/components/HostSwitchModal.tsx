'use client';

import { useEffect, useState } from 'react';

import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Modal } from '../../components/ui/Modal';
import { Text } from '../../components/ui/Text';
import { explorerChainInfo, type ExplorerChain } from '../chains';
import { explorerHostEnvironment, explorerHostLabel, type ExplorerHostMap } from '../hosts';

type HostSwitchModalProps = {
  open: boolean;
  chain: ExplorerChain | null;
  destinationHost: string;
  hosts: ExplorerHostMap;
  onCancel: () => void;
  onConfirm: (dontShowAgain: boolean) => void;
};

export function HostSwitchModal({
  open,
  chain,
  destinationHost,
  hosts,
  onCancel,
  onConfirm,
}: HostSwitchModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    if (open) setDontShowAgain(false);
  }, [open]);

  const chainLabel = chain ? explorerChainInfo(chain).label : '';
  const environment = explorerHostEnvironment(destinationHost, hosts);
  const hostname = explorerHostLabel(destinationHost);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Switch Internal Explorer environment?"
      className="max-w-lg"
      footer={
        <div className="flex w-full flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            role="checkbox"
            aria-checked={dontShowAgain}
            onClick={() => setDontShowAgain((value) => !value)}
            className="flex items-center gap-2 text-left"
          >
            <Checkbox checked={dontShowAgain} />
            <Text as="span" variant="label">
              Don&apos;t show this again
            </Text>
          </button>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={() => onConfirm(dontShowAgain)}>
              Continue
            </Button>
          </div>
        </div>
      }
    >
      <Text variant="body" tone="muted">
        You are leaving this Internal Explorer environment for the {environment} environment at{' '}
        {hostname}. Observability for {chainLabel} is served there.
      </Text>
    </Modal>
  );
}
