// Demo apps directory. Each app connects to the active account through a scoped
// grant it fully controls: a capped session key (subscriptions) or a delegated
// sub-account. Ported from base/vibenet `account/page.tsx` DEMO_APPS. The
// "Vibe'n" mini-game is intentionally omitted (it was unlisted upstream).

import type { Address } from '@aa';

import type { PolicySpec } from './policy';

export type DemoApp = {
  id: string;
  name: string;
  emoji: string;
  grant: 'session' | 'subaccount';
  desc: string;
  /** For session apps: how long the grant lives + its policy summary. */
  expiryId?: string;
  policyLabel?: string;
  /** Build the app's SessionPolicy spec (account address available for self-targets). */
  spec?: (account: Address) => PolicySpec;
};

export const DEMO_APPS: DemoApp[] = [
  {
    id: 'monthly-vibes',
    name: 'Subscriptions',
    emoji: '🎧',
    grant: 'session',
    expiryId: 'none',
    policyLabel: 'Spend limit',
    spec: () => ({ limits: [{ token: 'stable', amount: '1', periodSecs: 30 }] }),
    desc: 'An app that bills from a capped session key — at most 1 USDV every 30s, and only via the USDV transfer. No re-signing each cycle; cancel by revoking the key.',
  },
  {
    id: 'spending-account',
    name: 'Spending Account',
    emoji: '💳',
    grant: 'subaccount',
    desc: 'A separate account you also own — added with your main account as one owner and a fresh spare key as another. Spend from it day-to-day without risking the funds in your main account.',
  },
];
