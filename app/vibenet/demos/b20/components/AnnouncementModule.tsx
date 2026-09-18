'use client';

import { useState } from 'react';
import { encodeFunctionData, type Address, type Hex } from 'viem';

import { Text } from '../../../../components/ui/Text';
import { VIBENET_EXPLORER_PATH } from '../../../library/config';
import { walletErrorMessage } from '../../../library/wallet';
import { TransactionModal, type TxStep } from '../../_shared/TransactionModal';
import { client } from '../lib/constants';
import { B20_HELP } from '../lib/glossary';
import { READ_ANNOUNCEMENT_PROMPT } from '../lib/prompts';
import { assetAbi, b20Abi, roleId } from '../lib/protocol';
import type { TokenAccess, TokenInfo } from '../lib/types';
import { CopyPromptButton } from './CopyPromptButton';
import { ErrorNote, Field, Input, Notice } from './primitives';

type AnnouncementModuleProps = {
  open: boolean;
  onClose: () => void;
  token: TokenInfo | null;
  tokenAccess: TokenAccess;
  wallet: Address | null;
  onSend: (label: string, to: Address, data: Hex, action: string) => Promise<Hex | null>;
};

// Disclosure-only announcement flow, presented through the shared TransactionModal.
// Publishing requires OPERATOR_ROLE and an Asset token (Stablecoins do not support
// announcements).
export function AnnouncementModule(props: AnnouncementModuleProps) {
  if (!props.open) return null;
  return <AnnouncementModuleInner {...props} />;
}

function AnnouncementModuleInner({
  open,
  onClose,
  token,
  tokenAccess,
  wallet,
  onSend,
}: AnnouncementModuleProps) {
  const [id, setId] = useState('');
  const [description, setDescription] = useState('');
  const [uri, setUri] = useState('');
  const [step, setStep] = useState<TxStep>('build');
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);

  const handleClose = () => {
    if (finalizing) return;
    onClose();
  };

  const isAsset = token?.variant === 'asset';

  const submit = async () => {
    if (!token || !isAsset) return;
    setError(null);
    const announcementId = id.trim();
    if (!announcementId || !description.trim()) {
      setError('Announcement ID and description are required.');
      return;
    }
    if (!wallet) {
      setError('Create an account before you announce.');
      return;
    }
    setStep('submitted');
    setFinalizing(true);
    try {
      const [isOperator, idUsed] = await Promise.all([
        client.readContract({
          address: token.address,
          abi: b20Abi,
          functionName: 'hasRole',
          args: [roleId('OPERATOR_ROLE'), wallet],
        }),
        client.readContract({
          address: token.address,
          abi: assetAbi,
          functionName: 'isAnnouncementIdUsed',
          args: [announcementId],
        }),
      ]);
      if (!isOperator)
        throw new Error('This wallet does not have permission to publish announcements for this asset.');
      if (idUsed) throw new Error(`Announcement ID “${announcementId}” has already been used. Choose another one.`);
      const data = encodeFunctionData({
        abi: assetAbi,
        functionName: 'announce',
        args: [[], announcementId, description.trim(), uri.trim()],
      });
      try {
        await client.estimateGas({ account: wallet, to: token.address, data });
      } catch (cause) {
        throw new Error(`We could not prepare this announcement for your wallet: ${walletErrorMessage(cause)}.`);
      }
      const hash = await onSend('Asset announcement', token.address, data, 'announce');
      if (!hash) throw new Error('The announcement could not be published.');
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
      titles={{ build: 'Publish Announcement', submitted: 'Publish Announcement' }}
      titleAction={<CopyPromptButton prompt={READ_ANNOUNCEMENT_PROMPT} module="announcements" />}
      canProceed={Boolean(isAsset && tokenAccess === 'operator')}
      proceedLabel="Publish Announcement"
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
          <Text variant="title3">Announcement published</Text>
          <Text variant="label.regular" tone="muted">
            Your disclosure is now on-chain.
          </Text>
        </div>
      )}
      buildBody={
        !token ? null : !isAsset ? (
          <Notice>Announcements are an Asset token feature. Create an Asset token to publish updates for holders.</Notice>
        ) : (
          <div>
            {tokenAccess !== 'operator' ? (
              <div className="rounded-xl border border-bds-blue-20 bg-bds-blue-0 p-4 text-[13px]">
                <strong>Publishing needs the operator role on this asset</strong>
                <p className="mt-1 text-bds-gray-60">
                  Create your own Asset token to write and publish announcements.
                </p>
              </div>
            ) : null}
            <div className={`grid gap-4 md:grid-cols-2 ${tokenAccess !== 'operator' ? 'mt-5' : ''}`}>
              <Field label="Announcement ID (required)" help={B20_HELP.announcementId}>
                <Input value={id} onChange={(e) => setId(e.target.value)} placeholder="2026-Q4-reserves" required />
              </Field>
              <Field label="Supporting link" help={B20_HELP.disclosureUrl}>
                <Input value={uri} onChange={(e) => setUri(e.target.value)} placeholder="https://…" />
              </Field>
              <Field label="Announcement description (required)">
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Quarterly reserve attestation"
                  required
                />
              </Field>
            </div>
            <ErrorNote message={error} />
          </div>
        )
      }
    />
  );
}
