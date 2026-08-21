// The demo catalogue — one place to register a demo. The index page renders
// cards from it and the breadcrumb resolves its label from it, so the two can't
// drift. Plain data with no server-only imports, so client components (AppShell)
// can read it too.

export type DemoEntry = {
  /** Route for the demo, e.g. `/vibenet/demos/account`. */
  href: string;
  /**
   * Full name of the demo. Also the page title, which by convention reads
   * `{title} · Demos` — set it in the demo's own layout metadata, since this
   * catalogue is data and does not drive `<head>`.
   */
  title: string;
  /** Compact label for the breadcrumb; falls back to `title` when unset. */
  shortTitle?: string;
  summary: string;
  points: string[];
  available: boolean;
};

export const DEMOS: DemoEntry[] = [
  {
    href: '/vibenet/demos/account',
    title: 'Accounts',
    shortTitle: 'Account',
    summary:
      'Create portable account-abstraction accounts from in-browser keys, fund them from the faucet, and inspect balances across networks.',
    points: [
      'Smart & EOA accounts — deterministic addresses',
      'K1 / P-256 / passkey signers',
      'Live balances on Vibenet',
    ],
    available: true,
  },
  {
    href: '/vibenet/demos/b20',
    title: 'Tokens',
    shortTitle: 'Tokens',
    summary:
      'Make a gasless EIP-8130 smart wallet in one click, then inspect policy scopes, attach transaction memos, publish Asset announcements, and create Base-native B20 tokens.',
    points: [
      'One-click 8130 wallet — faucet-seeded, gasless via payer sponsorship',
      'Pay gas with your own stablecoin (ERC-8168 token payment)',
      'Policies, memos, and Asset announcements',
    ],
    available: true,
  },
];

/** `smart-wallet` -> `Smart Wallet`. Fallback for a route with no catalogue entry. */
function prettifySlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Breadcrumb label for the first path segment under /vibenet/demos. Prefers the
 * catalogue so the crumb matches the demo's real name, and degrades to a
 * title-cased slug for anything not registered.
 */
export function demoLabel(slug: string): string {
  const demo = DEMOS.find((entry) => entry.href === `/vibenet/demos/${slug}`);
  return demo?.shortTitle ?? demo?.title ?? prettifySlug(slug);
}
