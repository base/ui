'use client';

// Common page shell for account-backed demos (account demo, B20, …). It owns
// the cross-demo account chrome so each demo only supplies its body + activity:
//   - the account switcher, rendered into the app top bar (desktop) and inline
//     on mobile (the top bar is hidden there);
//   - a full-page DemoGate (empty state until a local account exists);
//   - the shared create/details account-management modals;
//   - the collapsible ActivityDrawer pinned to the bottom, for demos that hand
//     it activity (B20 keeps its log in the page flow instead, so it passes
//     none and the drawer is skipped).
// Each demo renders this inside one AccountEngineProvider, avoiding duplicate
// store instances and repeated account-settings wiring.

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '../../../components/ui/cn';
import { AccountSwitcher } from '../_shared/AccountSwitcher';
import { ActivityDrawer } from '../_shared/ActivityDrawer';
import { DemoGate } from '../_shared/DemoGate';
import { CreateAccountModal } from '../account/components/CreateAccountModal';
import { useAccountEngine } from '../account/useAccountEngine';

type AccountDemoShellProps = {
  // Empty-state copy.
  gateTitle?: string;
  gateDescription?: string;
  // Activity drawer. Omit `activity` to render no drawer at all.
  activity?: ReactNode;
  activityCount?: number;
  activityEmptyMessage?: string;
  // Extra classes for the root (gap, demo-specific tweaks).
  className?: string;
  children: ReactNode;
};

export function AccountDemoShell({
  gateTitle,
  gateDescription,
  activity,
  activityCount = 0,
  activityEmptyMessage,
  className,
  children,
}: AccountDemoShellProps) {
  const engine = useAccountEngine();
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);
  // The switcher and the empty-state gate both open the create-account modal.
  const [createOpen, setCreateOpen] = useState(false);
  const onCreate = () => setCreateOpen(true);
  useEffect(() => {
    setTopbarSlot(document.getElementById('topbar-actions-slot'));
  }, []);

  const switcher = (
    <AccountSwitcher
      accounts={engine.accounts}
      activeAccountId={engine.activeAccountId}
      onSelect={engine.setActiveAccountId}
      onCreate={onCreate}
      onDelete={engine.deleteAccount}
      onDetails={(id) => {
        const addr = engine.accounts.find((a) => a.id === id)?.address;
        if (addr) window.open(`/vibenet/explorer/address/${addr}`, '_blank', 'noopener,noreferrer');
      }}
    />
  );

  const hasAccounts = engine.accounts.length > 0;

  return (
    <>
      {/* flex-1 fills the content column so the activity drawer can sit at the
          bottom on short pages (`mt-auto`). A 100vh min-height overshot the
          padded scrollport and left extra scroll below the drawer. */}
      <div className={cn('relative -mb-20 flex min-w-0 flex-1 flex-col text-foreground', className)}>
        {/* Desktop: the switcher lives in the app top bar. Hidden until an account
            exists so the gate reads as a clean full-page empty state. */}
        {hasAccounts && topbarSlot ? createPortal(switcher, topbarSlot) : null}

        <DemoGate
          accounts={engine.accounts}
          hydrated={engine.hydrated}
          onCreate={onCreate}
          title={gateTitle}
          description={gateDescription}
        >
          {/* Mobile only — desktop uses the top-bar switcher. */}
          <div className="shrink-0 md:hidden">{switcher}</div>
          {children}
          {activity ? (
            <ActivityDrawer count={activityCount} emptyMessage={activityEmptyMessage}>
              {activity}
            </ActivityDrawer>
          ) : null}
        </DemoGate>
      </div>

      <CreateAccountModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}
