'use client';

// Read-only inspector for an address that is not one of your local accounts:
// assets and activity. Contract addresses that implement ERC-20 swap in a
// token profile and a transfer list. No `@aa` — this is the light public path.
// Shares the assets + activity components with the owned management view and
// renders inside AccountShell.

import { useEffect, useState } from 'react';

import { Spinner } from '../../../../components/ui/Spinner';
import { Badge } from '../../../demos/_shared/primitives';
import type { ExplorerAddressResponse } from '../../../library/api-types';
import { fetchErc20Profile, type Erc20Profile } from '../../../library/token';
import { AccountShell, useSectionParam, type ShellSection } from './AccountShell';
import { ActivityTable } from './ActivityTable';
import { AssetsCard } from './AssetsCard';
import { TokenMark, TokenOverview } from './TokenOverview';
import { TokenTransfers } from './TokenTransfers';

const SECTIONS: ShellSection[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'activity', label: 'Activity' },
];

const TOKEN_SECTIONS: ShellSection[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'activity', label: 'Transfers' },
];

function SectionSpinner() {
  return (
    <div className="flex min-h-40 items-center justify-center">
      <Spinner className="h-6 w-6 text-bds-gray-50" />
    </div>
  );
}

export function PublicAddressView({ address, data }: { address: string; data: ExplorerAddressResponse }) {
  // undefined while a contract's ERC-20 probe is in flight, null when it isn't a token.
  const [profile, setProfile] = useState<Erc20Profile | null | undefined>(data.is_contract ? undefined : null);

  useEffect(() => {
    if (!data.is_contract) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    setProfile(undefined);
    fetchErc20Profile(address).then((next) => {
      if (!cancelled) setProfile(next);
    });
    return () => {
      cancelled = true;
    };
  }, [address, data.is_contract]);

  useEffect(() => {
    if (!profile) return;
    const previous = document.title;
    document.title = `${profile.symbol} · Vibenet Explorer`;
    return () => {
      document.title = previous;
    };
  }, [profile]);

  const sections = profile ? TOKEN_SECTIONS : SECTIONS;
  const [section, selectSection] = useSectionParam({
    valid: sections.map((s) => s.id),
    fallback: 'overview',
  });

  const typeBadge = data.is_contract ? 'Contract' : data.is_aa ? 'Smart account' : 'EOA';
  const tokenName = profile && profile.name.toLowerCase() !== profile.symbol.toLowerCase() ? profile.name : null;

  return (
    <AccountShell
      name={profile ? profile.symbol : 'Address'}
      subtitle={tokenName}
      avatar={profile ? <TokenMark symbol={profile.symbol} /> : undefined}
      address={address}
      badges={profile ? <Badge tone="blue">ERC-20</Badge> : <Badge>{typeBadge}</Badge>}
      sections={sections}
      activeSection={section}
      onSelectSection={selectSection}
    >
      {section === 'overview' ? (
        profile ? (
          <TokenOverview profile={profile} codeSize={data.code_size} />
        ) : profile === undefined ? (
          <SectionSpinner />
        ) : (
          <AssetsCard address={address} activity={data.activity} />
        )
      ) : profile ? (
        <TokenTransfers
          token={address}
          symbol={profile.symbol}
          decimals={profile.decimals}
          activity={data.activity}
        />
      ) : profile === undefined ? (
        <SectionSpinner />
      ) : (
        <ActivityTable activity={data.activity} />
      )}
    </AccountShell>
  );
}
