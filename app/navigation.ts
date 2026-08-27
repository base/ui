import { BENCHMARK_ENABLED } from './benchmark/flag';
import { EXPLORER_ENABLED, EXPLORER_LABEL } from './internal-explorer/flag';

export type NavIcon = 'home' | 'snapshots' | 'upgrades' | 'changelog' | 'vibenet' | 'overview' | 'demos' | 'faucet' | 'explorer' | 'internal-explorer' | 'benchmark' | 'runs' | 'loadtest';

export type NavChild = {
  label: string;
  href: string;
  icon?: NavIcon;
  exact?: boolean;
};

export type NavItem = {
  label: string;
  href: string;
  icon: NavIcon;
  enabled: boolean;
  children?: NavChild[];
};

export const NAV_ITEMS: NavItem[] = [
  { label: 'Home', href: '/', icon: 'home', enabled: true },
  {
    label: 'Vibenet',
    href: '/vibenet',
    icon: 'vibenet',
    enabled: true,
    children: [
      { label: 'Overview', href: '/vibenet', icon: 'overview', exact: true },
      { label: 'Faucet', href: '/vibenet/faucet', icon: 'faucet' },
      { label: 'Explorer', href: '/vibenet/explorer', icon: 'explorer' },
    ],
  },
  { label: 'Upgrades', href: '/upgrades', icon: 'upgrades', enabled: true },
  { label: 'Changelog', href: '/upgrades/changelog', icon: 'changelog', enabled: true },
  { label: 'Snapshots', href: '/snapshots', icon: 'snapshots', enabled: true },
  // Internal Explorer is internal-only; present only in the internal build
  // target (deploy.config.mjs). See app/internal-explorer/flag.ts.
  ...(EXPLORER_ENABLED
    ? [{ label: EXPLORER_LABEL, href: '/internal-explorer', icon: 'internal-explorer', enabled: true } as NavItem]
    : []),
  // Benchmark is internal-only; present only in the internal build target
  // (deploy.config.mjs). See app/benchmark/flag.ts. The two children were the
  // report's own in-page tab bar upstream.
  ...(BENCHMARK_ENABLED
    ? [
        {
          label: 'Benchmark',
          href: '/benchmark',
          icon: 'benchmark',
          enabled: true,
          children: [
            { label: 'Benchmarks', href: '/benchmark/run', icon: 'runs' },
            { label: 'Load Tests', href: '/benchmark/load-tests', icon: 'loadtest' },
          ],
        } as NavItem,
      ]
    : []),
];

/** Prefix match unless `exact` or the href is `/`. */
export function pathMatches(href: string, pathname: string, exact = false): boolean {
  if (exact || href === '/') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function titleForPath(pathname: string): string {
  if (pathname === '/') return 'Home';
  for (const item of NAV_ITEMS) {
    if (item.children) {
      for (const child of item.children) {
        if (pathMatches(child.href, pathname, child.exact)) return child.label;
      }
    }
  }
  const matches = NAV_ITEMS.filter((item) => pathMatches(item.href, pathname));
  if (matches.length === 0) return '';
  matches.sort((a, b) => b.href.length - a.href.length);
  return matches[0].label;
}

export function getActiveParent(pathname: string): NavItem | null {
  return NAV_ITEMS.find(
    (item) => item.children && item.enabled && pathMatches(item.href, pathname),
  ) ?? null;
}

/**
 * Path for the active-row pill. `pendingPath === '/'` is the back-header
 * pane only — the page has not moved, so highlight still follows `pathname`.
 */
export function navHighlightPath(pendingPath: string | null, pathname: string): string {
  return pendingPath && pendingPath !== '/' ? pendingPath : pathname;
}

/** Which sliding pane to show. Back-header (`'/'`) forces the root list. */
export function navActiveParent(pendingPath: string | null, pathname: string): NavItem | null {
  if (pendingPath === '/') return null;
  return getActiveParent(pendingPath ?? pathname);
}

export function isChildActive(child: NavChild, pathname: string): boolean {
  return pathMatches(child.href, pathname, child.exact);
}

export function isTopNavActive(item: NavItem, pathname: string): boolean {
  if (!pathMatches(item.href, pathname)) return false;
  return !NAV_ITEMS.some(
    (other) => other.href !== item.href && other.href.startsWith(item.href) && pathMatches(other.href, pathname),
  );
}
