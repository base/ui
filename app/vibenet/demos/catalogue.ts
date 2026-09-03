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
  /** When false, the route stays live but is omitted from the Vibenet demos grid. */
  listed?: boolean;
  /** Path to an icon image in /public, shown at the top of the demo card. */
  icon?: string;
};

/** Demos shown on the Vibenet index. Unlisted entries stay reachable by URL. */
export function listedDemos(): DemoEntry[] {
  return DEMOS.filter((demo) => demo.listed !== false);
}

export const DEMOS: DemoEntry[] = [
  {
    href: '/vibenet/demos/account',
    title: 'Accounts',
    shortTitle: 'Account',
    icon: '/account-illo.svg',
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
    icon: '/token-illo.svg',
    summary:
      "Create tokens with B20 — Base's enshrined, ERC-20-compatible token standard — then attach transfer policies, transaction memos, and Asset announcements with no custom contracts.",
    points: [
      'Pay gas with your own stablecoin (ERC-8168 token payment)',
      'Transaction memos for payment tracking and reconciliation',
      'Policies and Asset announcements',
    ],
    available: true,
  },
  {
    href: '/vibenet/demos/validity',
    title: 'Validity',
    shortTitle: 'Validity',
    summary:
      'Attach conditions to a transaction so the sequencer includes it only while they hold. A simulated pool shows a swap waiting on price, then landing or expiring.',
    points: [
      'Add storage and block-number conditions to an ordinary swap',
      'A simulated AMM makes those conditions visible on a moving mid',
      'Stack several 8130 conditions at once, or replace the resting one',
    ],
    available: true,
    listed: false,
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
