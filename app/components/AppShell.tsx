'use client';

import { CSSProperties, PropsWithChildren } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { trackNavClick } from '../analytics/events';
import { isTabActive, NAV_ITEMS, NavIcon, tabsForPath, titleForPath } from '../navigation';
import { BLUE, BORDER, DISABLED, INK, MUTED, SELECTED, SURFACE } from '../theme';

import { DotGrid } from './DotGrid';

const SIDEBAR_WIDTH = 248;

type NavRowProps = {
  icon: NavIcon;
  label: string;
  href: string;
  active: boolean;
  enabled: boolean;
};

type NavGlyphProps = {
  name: NavIcon;
};

type SocialIconProps = {
  name: 'x' | 'discord' | 'mail';
  href: string;
};

const styles: Record<string, CSSProperties> = {
  root: { display: 'flex', height: '100vh', overflow: 'hidden', color: INK },
  sidebar: {
    width: SIDEBAR_WIDTH,
    flexShrink: 0,
    background: SURFACE,
    display: 'flex',
    flexDirection: 'column',
    padding: '0 12px 20px',
    position: 'relative',
    overflow: 'hidden',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '0 8px',
    height: 64,
    flexShrink: 0,
    position: 'relative',
  },
  brandMark: { width: 22, height: 22, borderRadius: 2, background: BLUE, display: 'inline-block' },
  brandName: { fontSize: 17, fontWeight: 500 },
  nav: { display: 'flex', flexDirection: 'column', gap: 2, position: 'relative' },
  navLink: { textDecoration: 'none', color: 'inherit' },
  navRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 10px',
    borderRadius: 8,
    fontSize: 14,
  },
  navIcon: { display: 'inline-flex', width: 16, height: 16 },
  soon: {
    marginLeft: 'auto',
    fontSize: 13,
    fontWeight: 400,
    color: MUTED,
    border: `1px solid ${BORDER}`,
    borderRadius: 999,
    padding: '2px 9px',
  },
  sidebarFooter: {
    marginTop: 'auto',
    display: 'flex',
    gap: 16,
    padding: '8px',
    position: 'relative',
  },
  social: { color: DISABLED, display: 'inline-flex' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  topbar: {
    height: 65,
    flexShrink: 0,
    borderBottom: `1px solid ${SELECTED}`,
    display: 'flex',
    alignItems: 'center',
    padding: '0 28px',
  },
  topbarTitle: { fontSize: 16, fontWeight: 500 },
  topbarNav: {
    marginLeft: 'auto',
    alignSelf: 'stretch',
    display: 'flex',
    alignItems: 'stretch',
    gap: 4,
    overflowX: 'auto',
  },
  topbarTab: {
    display: 'inline-flex',
    alignItems: 'center',
    height: '100%',
    padding: '0 10px',
    fontSize: 14,
    whiteSpace: 'nowrap',
    textDecoration: 'none',
    borderBottom: '2px solid transparent',
    marginBottom: -1,
  },
  content: { flex: 1, overflowY: 'auto' },
  contentInner: { maxWidth: 1280, margin: '0 auto', padding: '40px 28px 80px' },
};

function topbarTabStyle(active: boolean): CSSProperties {
  return {
    ...styles.topbarTab,
    color: active ? INK : MUTED,
    fontWeight: active ? 500 : 400,
    borderBottomColor: active ? BLUE : 'transparent',
  };
}

function NavGlyph({ name }: NavGlyphProps) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'home':
      return (
        <svg {...common}>
          <path d="M3 10.5 12 4l9 6.5" />
          <path d="M5 9.5V20h14V9.5" />
        </svg>
      );
    case 'snapshots':
      return (
        <svg {...common}>
          <ellipse cx="12" cy="6" rx="7" ry="3" />
          <path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
          <path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
        </svg>
      );
    case 'upgrades':
      return (
        <svg {...common}>
          <path d="M12 20V8" />
          <path d="m6 12 6-6 6 6" />
          <path d="M5 4h14" />
        </svg>
      );
    case 'vibenet':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3c3 3 3 15 0 18-3-3-3-15 0-18Z" />
        </svg>
      );
    case 'tips':
      return (
        <svg {...common}>
          <path d="M13 3 4 14h7l-1 7 9-11h-7l1-7Z" />
        </svg>
      );
    default:
      return null;
  }
}

function SocialIcon({ name, href }: SocialIconProps) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'currentColor' };
  let glyph = null;
  if (name === 'x') {
    glyph = (
      <svg {...common}>
        <path d="M18.24 2.25h3.3l-7.2 8.24 8.48 11.26h-6.64l-5.2-6.8-5.96 6.8H1.5l7.7-8.8L1.05 2.25h6.8l4.7 6.22 5.69-6.22Zm-1.16 17.52h1.83L7.02 4.13H5.06l12.02 15.64Z" />
      </svg>
    );
  } else if (name === 'discord') {
    glyph = (
      <svg {...common}>
        <path d="M20.3 4.9A19 19 0 0 0 15.6 3.4l-.24.5a14 14 0 0 1 4.14 2.1c-1.6-.9-3.4-1.5-5.3-1.7a15 15 0 0 0-4.5 0c-1.9.2-3.7.8-5.3 1.7a14 14 0 0 1 4.14-2.1l-.24-.5A19 19 0 0 0 3.7 4.9C1.9 8 1 11.7 1.3 15.4a19 19 0 0 0 5.7 2.9l.7-1.2c-.7-.3-1.4-.6-2-1l.5-.4a13 13 0 0 0 11.6 0l.5.4c-.6.4-1.3.7-2 1l.7 1.2a19 19 0 0 0 5.7-2.9c.4-4.3-.7-8-2.9-10.5ZM8.5 13.5c-1 0-1.9-1-1.9-2.1 0-1.2.9-2.1 1.9-2.1s1.9 1 1.9 2.1c0 1.2-.8 2.1-1.9 2.1Zm7 0c-1 0-1.9-1-1.9-2.1 0-1.2.9-2.1 1.9-2.1s1.9 1 1.9 2.1c0 1.2-.8 2.1-1.9 2.1Z" />
      </svg>
    );
  } else {
    glyph = (
      <svg {...common} fill="none" stroke="currentColor" strokeWidth={1.8}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m4 7 8 6 8-6" />
      </svg>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" style={styles.social} aria-label={name}>
      {glyph}
    </a>
  );
}

function NavRow({ icon, label, href, active, enabled }: NavRowProps) {
  let color = DISABLED;
  if (enabled) {
    color = active ? INK : MUTED;
  }

  const row = (
    <div
      style={{
        ...styles.navRow,
        background: active ? SELECTED : 'transparent',
        border: `1px solid ${active ? 'rgba(0,0,0,0.08)' : 'transparent'}`,
        color,
        fontWeight: active ? 500 : 400,
        cursor: enabled ? 'pointer' : 'default',
      }}
    >
      <span style={styles.navIcon}>
        <NavGlyph name={icon} />
      </span>
      <span>{label}</span>
      {!enabled && <span style={styles.soon}>Soon</span>}
    </div>
  );

  if (!enabled) return row;
  return (
    <Link href={href} style={styles.navLink} onClick={() => trackNavClick(label)}>
      {row}
    </Link>
  );
}

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname() || '/';
  const title = titleForPath(pathname);
  const tabs = tabsForPath(pathname);

  return (
    <div style={styles.root}>
      <aside style={styles.sidebar}>
        <DotGrid />
        <div style={styles.brand}>
          <span style={styles.brandMark} />
          <span style={styles.brandName}>Labs</span>
        </div>

        <nav style={styles.nav}>
          {NAV_ITEMS.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <NavRow
                key={item.href}
                icon={item.icon}
                label={item.label}
                href={item.href}
                active={active}
                enabled={item.enabled}
              />
            );
          })}
        </nav>

        <div style={styles.sidebarFooter}>
          <SocialIcon name="x" href="https://x.com/base" />
          <SocialIcon name="discord" href="https://base.org/discord" />
          <SocialIcon name="mail" href="mailto:" />
        </div>
      </aside>

      <div style={styles.main}>
        <header style={styles.topbar}>
          <span style={styles.topbarTitle}>{title}</span>
          {tabs.length > 0 && (
            <nav style={styles.topbarNav}>
              {tabs.map((tab) => {
                const active = isTabActive(pathname, tab);
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    aria-current={active ? 'page' : undefined}
                    style={topbarTabStyle(active)}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </nav>
          )}
        </header>
        <main style={styles.content}>
          <div style={styles.contentInner}>{children}</div>
        </main>
      </div>
    </div>
  );
}
