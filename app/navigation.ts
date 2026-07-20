export type NavIcon = 'home' | 'snapshots' | 'upgrades' | 'changelog' | 'vibenet' | 'tips';

export type NavItem = {
  label: string;
  href: string;
  icon: NavIcon;
  enabled: boolean;
};

// The surfaces the omni site consolidates. Only enabled ones are linked;
// the rest are shown as upcoming so the structure reflects the roadmap.
export const NAV_ITEMS: NavItem[] = [
  { label: 'Home', href: '/', icon: 'home', enabled: true },
  { label: 'Snapshots', href: '/snapshots', icon: 'snapshots', enabled: true },
  { label: 'Upgrades', href: '/upgrades', icon: 'upgrades', enabled: true },
  { label: 'Changelog', href: '/upgrades/changelog', icon: 'changelog', enabled: true },
  { label: 'Vibenet', href: '/vibenet', icon: 'vibenet', enabled: true },
  { label: 'TIPS', href: '/tips', icon: 'tips', enabled: false },
];

export function titleForPath(pathname: string): string {
  if (pathname === '/') return 'Home';
  const matches = NAV_ITEMS.filter(
    (item) => item.href !== '/' && (pathname === item.href || pathname.startsWith(`${item.href}/`)),
  );
  if (matches.length === 0) return '';
  matches.sort((a, b) => b.href.length - a.href.length);
  return matches[0].label;
}

// A sub-page tab within a top-level section. These render in the topbar (the
// section nav), not the side nav — only top-level NAV_ITEMS appear there.
export type SectionTab = {
  label: string;
  href: string;
  // Match only on an exact pathname (for a section index whose href is a prefix
  // of every sub-route).
  exact?: boolean;
};

// Section top-nav tabs, keyed by the section's route prefix. A section with no
// entry simply shows no tabs. Detail routes (e.g. changelog/[slug]) inherit the
// section's tabs but highlight none.
const SECTION_TABS: { prefix: string; tabs: SectionTab[] }[] = [
  {
    prefix: '/vibenet',
    // Account is staged for a later phase.
    tabs: [
      { label: 'Overview', href: '/vibenet', exact: true },
{ label: 'Explorer', href: '/vibenet/explorer' },
    ],
  },
];

export function tabsForPath(pathname: string): SectionTab[] {
  const section = SECTION_TABS.find(
    (s) => pathname === s.prefix || pathname.startsWith(`${s.prefix}/`),
  );
  return section ? section.tabs : [];
}

export function isTabActive(pathname: string, tab: SectionTab): boolean {
  if (tab.exact) return pathname === tab.href;
  return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
}
