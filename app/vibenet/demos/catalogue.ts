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
  /** Nested demos shown from a group landing page. */
  children?: DemoEntry[];
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
    title: 'Validity Transactions',
    shortTitle: 'Validity Transactions',
    summary:
      'Explore transactions that remain pending until their onchain conditions are satisfied, then execute without a keeper or a custom settlement contract.',
    points: [
      'Attach storage and block-number conditions to signed transactions',
      'Let the sequencer evaluate validity before inclusion',
      'Build intent-like flows from ordinary account transactions',
    ],
    available: true,
    listed: false,
    children: [
      {
        href: '/vibenet/demos/validity/conditional-swaps',
        title: 'Conditional Swaps',
        summary:
          'Place a swap that waits for a target price, then lands or expires as a shared simulated market moves through its validity window.',
        points: [
          'Set a buy or sell price against a live VIBE/USDV pool',
          'Inspect the EIP-8130 predicates attached to the swap',
          'Watch pending orders fill, expire, or get replaced',
        ],
        available: true,
      },
      {
        href: '/vibenet/demos/validity/race-the-agent',
        title: 'Race the Agent',
        summary:
          'Submit a withdrawal before it is valid, then race a randomized onchain condition with an ordinary transaction sent by hand.',
        points: [
          'Compare the same permissionless withdrawal call two ways',
          'Watch a dedicated agent subaccount flip shared chain state',
          'Judge the result by inclusion blocks, not browser timing',
        ],
        available: true,
      },
    ],
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

function entryLabel(entry: DemoEntry | undefined, fallbackSlug: string): string {
  return entry?.shortTitle ?? entry?.title ?? prettifySlug(fallbackSlug);
}

/** Finds a registered top-level or nested demo by its full route. */
export function demoForPath(pathname: string): DemoEntry | undefined {
  for (const demo of DEMOS) {
    if (demo.href === pathname) return demo;
    const child = demo.children?.find((entry) => entry.href === pathname);
    if (child) return child;
  }
  return undefined;
}

export type DemoBreadcrumb = {
  childLabel: string;
  middle?: { label: string; href: string };
};

/** Resolves catalogue-backed labels for any route below `/vibenet/demos`. */
export function demoBreadcrumb(pathname: string): DemoBreadcrumb | null {
  const prefix = '/vibenet/demos/';
  if (!pathname.startsWith(prefix)) return null;

  const segments = pathname.slice(prefix.length).split('/').filter(Boolean);
  if (segments.length === 0) return null;

  const parentHref = `${prefix}${segments[0]}`;
  const parent = DEMOS.find((entry) => entry.href === parentHref);
  const parentLabel = entryLabel(parent, segments[0]);
  if (segments.length === 1) return { childLabel: parentLabel };

  const child = parent?.children?.find((entry) => entry.href === pathname);
  return {
    middle: { label: parentLabel, href: parentHref },
    childLabel: entryLabel(child, segments.at(-1) ?? ''),
  };
}
