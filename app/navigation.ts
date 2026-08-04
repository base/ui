import { TIPS_ENABLED } from './tips/flag';

export type NavIcon = 'home' | 'snapshots' | 'upgrades' | 'changelog' | 'vibenet' | 'overview' | 'demos' | 'faucet' | 'explorer' | 'tips';

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
  { label: 'Demos', href: '/demos', icon: 'demos', enabled: true },
  { label: 'Upgrades', href: '/upgrades', icon: 'upgrades', enabled: true },
  { label: 'Changelog', href: '/upgrades/changelog', icon: 'changelog', enabled: true },
  { label: 'Snapshots', href: '/snapshots', icon: 'snapshots', enabled: true },
  // TIPS is internal-only; present only in the internal build target
  // (deploy.config.mjs). See app/tips/flag.ts.
  ...(TIPS_ENABLED
    ? [{ label: 'TIPS', href: '/tips', icon: 'tips', enabled: true } as NavItem]
    : []),
];

export function titleForPath(pathname: string): string {
  if (pathname === '/') return 'Home';
  for (const item of NAV_ITEMS) {
    if (item.children) {
      for (const child of item.children) {
        if (child.exact && pathname === child.href) return child.label;
        if (!child.exact && (pathname === child.href || pathname.startsWith(`${child.href}/`))) {
          return child.label;
        }
      }
    }
  }
  const matches = NAV_ITEMS.filter(
    (item) => item.href !== '/' && (pathname === item.href || pathname.startsWith(`${item.href}/`)),
  );
  if (matches.length === 0) return '';
  matches.sort((a, b) => b.href.length - a.href.length);
  return matches[0].label;
}

export function getActiveParent(pathname: string): NavItem | null {
  return NAV_ITEMS.find(
    (item) => item.children && item.enabled && (pathname === item.href || pathname.startsWith(`${item.href}/`)),
  ) ?? null;
}
