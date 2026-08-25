'use client';

// Common page shell for account-backed demos (account demo, B20, …). It owns
// the cross-demo account chrome so each demo only supplies its body + activity:
//   - the account switcher, rendered into the app top bar (desktop) and inline
//     on mobile (the top bar is hidden there);
//   - a full-page DemoGate (empty state until a local account exists);
//   - the shared create/details account-management modals;
//   - the collapsible ActivityDrawer pinned to the bottom.
// Each demo owns one AccountEngine and passes it here, avoiding duplicate store
// instances and repeated account-settings wiring.

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '../../../components/ui/cn';
import { AccountSwitcher } from '../_shared/AccountSwitcher';
import { ActivityDrawer } from '../_shared/ActivityDrawer';
import { DemoGate } from '../_shared/DemoGate';
import { AccountDetailsModal } from '../account/components/AccountDetailsModal';
import { CreateAccountModal } from '../account/components/CreateAccountModal';
import type { AccountEngine } from '../account/useAccountEngine';

type AccountDemoShellProps = {
  engine: AccountEngine;
  /** Page-specific navigation from Account Details. Omit when the demo has no
   * transaction builder of its own (for example B20). */
  onTransactFromDetails?: () => void;
  // Empty-state copy.
  gateTitle?: string;
  gateDescription?: string;
  // Activity drawer.
  activity: ReactNode;
  activityCount: number;
  activityEmptyMessage?: string;
  // Extra classes for the root (gap, demo-specific tweaks).
  className?: string;
  children: ReactNode;
};

export function AccountDemoShell({
  engine,
  onTransactFromDetails,
  gateTitle,
  gateDescription,
  activity,
  activityCount,
  activityEmptyMessage,
  className,
  children,
}: AccountDemoShellProps) {
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTopbarSlot(document.getElementById('topbar-actions-slot'));
  }, []);

  const switcher = (
    <AccountSwitcher
      accounts={engine.accounts}
      activeAccountId={engine.activeAccountId}
      onSelect={engine.setActiveAccountId}
      onCreate={engine.openCreate}
      onDelete={engine.removeAccount}
      onDetails={engine.openAccountDetails}
    />
  );

  const hasAccounts = engine.accounts.length > 0;

  return (
    <>
      <div className={cn('relative -mb-20 flex min-h-[calc(100vh-116px)] flex-1 flex-col text-foreground', className)}>
        {/* Desktop: the switcher lives in the app top bar. Hidden until an account
            exists so the gate reads as a clean full-page empty state. */}
        {hasAccounts && topbarSlot ? createPortal(switcher, topbarSlot) : null}

        <DemoGate
          accounts={engine.accounts}
          hydrated={engine.hydrated}
          onCreate={engine.openCreate}
          title={gateTitle}
          description={gateDescription}
        >
          {/* Mobile only — desktop uses the top-bar switcher. */}
          <div className="shrink-0 md:hidden">{switcher}</div>
          {children}
          <ActivityDrawer count={activityCount} emptyMessage={activityEmptyMessage}>
            {activity}
          </ActivityDrawer>
        </DemoGate>
      </div>

      <AccountDetailsModal engine={engine} onTransact={onTransactFromDetails} />
      <CreateAccountModal engine={engine} />
    </>
  );
}
