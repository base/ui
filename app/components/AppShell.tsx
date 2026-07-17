'use client';

import { CSSProperties, PropsWithChildren, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';

import { isTabActive, NAV_ITEMS, NavIcon, tabsForPath, titleForPath } from '../navigation';
import { BLUE, BORDER, DISABLED, INK, MUTED, SELECTED } from '../theme';
import { spectrum } from '../spectrum';

import { Text } from './ui/Text';

function BaseLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 450 450" fill="none">
      <path d="M0 35.55C0 23.3732 0 17.2848 2.29438 12.6014C4.49116 8.11719 8.11719 4.49116 12.6014 2.29438C17.2848 0 23.3732 0 35.55 0H414.45C426.627 0 432.715 0 437.399 2.29438C441.883 4.49116 445.509 8.11719 447.706 12.6014C450 17.2848 450 23.3732 450 35.55V414.45C450 426.627 450 432.715 447.706 437.399C445.509 441.883 441.883 445.509 437.399 447.706C432.715 450 426.627 450 414.45 450H35.55C23.3732 450 17.2848 450 12.6014 447.706C8.11719 445.509 4.49116 441.883 2.29438 437.399C0 432.715 0 426.627 0 414.45V35.55Z" fill="#0000FF"/>
    </svg>
  );
}

const SIDEBAR_WIDTH = 248;

type NavRowProps = {
  icon: NavIcon;
  label: string;
  href: string;
  active: boolean;
  enabled: boolean;
  onNavigate?: () => void;
  layoutScope?: string;
};

type NavGlyphProps = {
  name: NavIcon;
};

const styles: Record<string, CSSProperties> = {
  root: { display: 'flex', height: '100vh', overflow: 'hidden', color: INK },
  sidebar: {
    width: SIDEBAR_WIDTH,
    flexShrink: 0,
    borderRight: '1px solid rgba(0,0,0,0.06)',
    display: 'flex',
    flexDirection: 'column',
    padding: '0 12px 20px',
    position: 'relative',
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
  brandMark: { width: 22, height: 22, display: 'inline-block' },
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
  navIcon: { display: 'inline-flex', width: 20, height: 20 },
  externalArrow: { marginLeft: 'auto', display: 'inline-flex', width: 14, height: 14, position: 'relative' as const },
  soon: {
    marginLeft: 'auto',
    fontSize: 11,
    fontWeight: 400,
    color: MUTED,
    border: `1px solid ${BORDER}`,
    borderRadius: 999,
    padding: '1px 6px',
  },
  sidebarFooter: {
    marginTop: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    position: 'relative',
  },
  footerLink: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 10px',
    borderRadius: 8,
    textDecoration: 'none',
    color: spectrum.gray[50],
  },
  footerIcon: { display: 'inline-flex', width: 18, height: 18 },
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
  contentInner: { maxWidth: 1280, margin: '0 auto', padding: '24px 28px 80px' },
};

function topbarTabStyle(active: boolean): CSSProperties {
  return {
    ...styles.topbarTab,
    color: active ? INK : MUTED,
    fontWeight: active ? 500 : 400,
    borderBottomColor: active ? BLUE : 'transparent',
    transition: 'border-color 150ms ease-out',
  };
}

function NavGlyph({ name }: NavGlyphProps) {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'home':
      return (
        <svg {...common} className="nav-home-icon">
          <path d="M12 14V21M12 21h6.5c1.38 0 2.5-1.12 2.5-2.5v-7.95c0-.78-.37-1.52-.99-2L13.51 3.66a2.62 2.62 0 0 0-3.02 0L3.99 8.57c-.62.47-.99 1.2-.99 1.99v7.95C3 19.88 4.12 21 5.5 21H12Z" />
        </svg>
      );
    case 'snapshots':
      return (
        <svg width={common.width} height={common.height} viewBox="5 6.5 30 27" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="nav-snapshots-icon">
          <path d="M23.5 21C23.5 22.933 21.933 24.5 20 24.5C18.067 24.5 16.5 22.933 16.5 21C16.5 19.067 18.067 17.5 20 17.5C21.933 17.5 23.5 19.067 23.5 21Z" />
          <path d="M9 16.5826C9 14.604 10.604 13 12.5826 13H12.6972C13.8235 13 14.8753 12.4371 15.5 11.5C16.1247 10.5629 17.1765 10 18.3028 10H21.6972C22.8235 10 23.8753 10.5629 24.5 11.5C25.1247 12.4371 26.1765 13 27.3028 13H27.4174C29.396 13 31 14.604 31 16.5826V26C31 28.2091 29.2091 30 27 30H13C10.7909 30 9 28.2091 9 26V16.5826Z" />
        </svg>
      );
    case 'upgrades':
      return (
        <svg {...common}>
          <path d="M3 6.7C3 4.65 4.65 3 6.7 3h10.6C19.35 3 21 4.65 21 6.7v10.6c0 2.05-1.65 3.7-3.7 3.7H6.7C4.65 21 3 19.35 3 17.3V6.7Z" />
          <path
            d="M12.2 16.5V7.9M16.9 12.6 12.2 7.9 7.6 12.6"
            className="nav-upgrades-arrow"
          />
        </svg>
      );
    case 'vibenet':
      return (
        <svg {...common} viewBox="5 5 30 30" strokeWidth={2.5} className="nav-vibenet-icon">
          <path d="M30.2895 14.8575L20.0038 20.0002M20.0038 20.0002L10.2895 14.2861M20.0038 20.0002L20.0038 30.8571M30.8608 22.8275V17.1724C30.8608 15.3861 29.9078 13.7354 28.3608 12.8423L22.4737 9.44331C20.9267 8.55015 19.0207 8.55015 17.4737 9.44331L11.5865 12.8423C10.0395 13.7354 9.08649 15.3861 9.08649 17.1724V22.8275C9.08649 24.6138 10.0395 26.2644 11.5865 27.1576L17.4737 30.5566C19.0207 31.4497 20.9267 31.4497 22.4737 30.5566L28.3608 27.1576C29.9078 26.2644 30.8608 24.6138 30.8608 22.8275Z" />
        </svg>
      );
    case 'tips':
      return (
        <svg width={common.width} height={common.height} viewBox="5 5 30 30" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M23 13H30.5M12 13H14.5M18.5 13H19M23 20H30.5M12 20H14.5M18.5 20H19M23 27H30.5M12 27H14.5M18.5 27H19" />
        </svg>
      );
    default:
      return null;
  }
}

function NavRow({ icon, label, href, active, enabled, onNavigate, layoutScope = 'desktop' }: NavRowProps) {
  let color = DISABLED;
  if (enabled) {
    color = active ? spectrum.gray[80] : spectrum.gray[50];
  }

  const row = (
    <div
      style={{
        ...styles.navRow,
        position: 'relative',
        color,
        fontWeight: active ? 500 : 400,
        cursor: enabled ? 'pointer' : 'default',
      }}
    >
      {active && (
        <motion.div
          layoutId={`nav-active-bg-${layoutScope}`}
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 8,
            background: spectrum.gray[5],
          }}
          transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
        />
      )}
      <span style={{ ...styles.navIcon, position: 'relative' }}>
        <NavGlyph name={icon} />
      </span>
      <Text as="span" variant="label.medium" tone="inherit" style={{ position: 'relative' }}>{label}</Text>
      {!enabled && <span style={{ ...styles.soon, position: 'relative' }}>Soon</span>}
    </div>
  );

  if (!enabled) return row;
  return (
    <Link
      href={href}
      style={styles.navLink}
      onClick={onNavigate}
    >
      {row}
    </Link>
  );
}

function ExternalNavRow({ label, href, icon, showArrow = true }: { label: string; href: string; icon?: React.ReactNode; showArrow?: boolean }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="external-nav-row" style={{ ...styles.navLink, display: 'block' }}>
      <div style={{ ...styles.navRow, color: spectrum.gray[50] }}>
        {icon && <span style={{ ...styles.navIcon, position: 'relative' }}>{icon}</span>}
        <Text as="span" variant="label.medium" tone="inherit" style={{ position: 'relative' }}>{label}</Text>
        {showArrow && (
          <span className="external-nav-arrow" style={styles.externalArrow}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="m4.5 19.5 15-15m0 0H8.25m11.25 0v11.25" />
            </svg>
          </span>
        )}
      </div>
    </a>
  );
}

function SidebarContent({ onNavigate, hideBrand, layoutScope = 'desktop' }: { onNavigate?: () => void; hideBrand?: boolean; layoutScope?: string }) {
  const pathname = usePathname() || '/';
  return (
    <>
      {!hideBrand && (
        <div style={styles.brand}>
          <span style={styles.brandMark}>
            <BaseLogo />
          </span>
        </div>
      )}

      <nav style={styles.nav}>
        {NAV_ITEMS.filter((item) => item.icon !== 'tips').map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <NavRow
              key={item.href}
              icon={item.icon}
              label={item.label}
              href={item.href}
              active={active}
              enabled={item.enabled}
              onNavigate={onNavigate}
              layoutScope={layoutScope}
            />
          );
        })}
        <ExternalNavRow
          label="Explorer"
          href="https://basescan.org"
          icon={
            <svg width={18} height={18} viewBox="6 6 28 28" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="nav-explorer-icon">
              <path d="M30 30.3125L23.0674 23.3799M23.0674 23.3799C24.5189 21.9284 25.4167 19.9232 25.4167 17.7083C25.4167 13.2785 21.8256 9.6875 17.3958 9.6875C12.966 9.6875 9.375 13.2785 9.375 17.7083C9.375 22.1381 12.966 25.7292 17.3958 25.7292C19.6107 25.7292 21.6159 24.8314 23.0674 23.3799Z" />
            </svg>
          }
        />
        {NAV_ITEMS.filter((item) => item.icon === 'tips').map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <NavRow
              key={item.href}
              icon={item.icon}
              label={item.label}
              href={item.href}
              active={active}
              enabled={item.enabled}
              onNavigate={onNavigate}
              layoutScope={layoutScope}
            />
          );
        })}
      </nav>

      <div style={styles.sidebarFooter}>
        <a href="https://base.org/discord" target="_blank" rel="noreferrer" style={styles.footerLink}>
          <span style={styles.footerIcon}>
            <svg width={18} height={18} viewBox="0 -28.5 256 256" fill="currentColor">
              <path d="M216.856 16.597C200.285 8.843 182.566 3.208 164.042 0c-2.275 4.113-4.933 9.645-6.766 14.046-19.692-2.961-39.203-2.961-58.533 0-1.832-4.401-4.55-9.933-6.846-14.046C73.353 3.208 55.613 8.864 39.042 16.638 5.618 67.147-3.443 116.401 1.087 164.956c22.169 16.555 43.653 26.612 64.775 33.193 5.215-7.177 9.866-14.807 13.873-22.848-7.631-2.9-14.94-6.478-21.846-10.632 1.832-1.357 3.624-2.776 5.356-4.237 42.122 19.702 87.89 19.702 129.51 0 1.751 1.46 3.543 2.88 5.355 4.237-6.926 4.174-14.255 7.753-21.886 10.653 4.006 8.02 8.638 15.67 13.873 22.848 21.142-6.58 42.646-16.637 64.815-33.213 5.316-56.288-9.08-105.09-38.056-148.36ZM85.474 135.095c-12.645 0-23.015-11.805-23.015-26.18s10.149-26.2 23.015-26.2c12.867 0 23.236 11.804 23.015 26.2.02 14.375-10.148 26.18-23.015 26.18Zm85.051 0c-12.645 0-23.014-11.805-23.014-26.18s10.148-26.2 23.014-26.2c12.867 0 23.236 11.804 23.015 26.2 0 14.375-10.148 26.18-23.015 26.18Z" />
            </svg>
          </span>
          <Text as="span" variant="label.medium" tone="inherit">Support</Text>
        </a>
        <a href="https://blog.base.org" target="_blank" rel="noreferrer" style={styles.footerLink}>
          <span style={styles.footerIcon}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.75 19.5V18.75C12.75 16.76 11.96 14.85 10.55 13.45C9.15 12.04 7.24 11.25 5.25 11.25H4.5M4.5 4.5H5.25C13.12 4.5 19.5 10.88 19.5 18.75V19.5M6 18.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
            </svg>
          </span>
          <Text as="span" variant="label.medium" tone="inherit">Blog</Text>
        </a>
      </div>
    </>
  );
}

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname() || '/';
  const title = titleForPath(pathname);
  const tabs = tabsForPath(pathname);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  return (
    <div style={styles.root}>
      {/* Desktop sidebar */}
      <aside className="sidebar-desktop" style={styles.sidebar}>
        <SidebarContent />
      </aside>

      {/* Mobile header (logo + hamburger) */}
      <header className="mobile-header">
        <span style={styles.brandMark}>
          <BaseLogo />
        </span>
        <button
          className="hamburger-btn"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
        >
          <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
            <line className={`hamburger-line hamburger-top ${menuOpen ? 'open' : ''}`} x1="4" y1="10" x2="16" y2="10" />
            <line className={`hamburger-line hamburger-bottom ${menuOpen ? 'open' : ''}`} x1="4" y1="10" x2="16" y2="10" />
          </svg>
        </button>
      </header>

      {/* Mobile drawer (full-screen from right) */}
      <AnimatePresence>
        {menuOpen && (
          <motion.aside
            className="drawer"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
          >
            <SidebarContent onNavigate={() => setMenuOpen(false)} hideBrand layoutScope="mobile" />
          </motion.aside>
        )}
      </AnimatePresence>

      <div className="mobile-content-offset" style={styles.main}>
        <header className="topbar-desktop" style={{ ...styles.topbar, justifyContent: tabs.length > 0 ? undefined : 'center' }}>
          <Text as="span" variant="headline">{title}</Text>
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
                    <Text as="span" variant="label.medium" tone="inherit">{tab.label}</Text>
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
