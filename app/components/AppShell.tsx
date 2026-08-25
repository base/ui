'use client';

import { CSSProperties, MouseEvent as ReactMouseEvent, PropsWithChildren, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Toaster } from 'sonner';

import { getActiveParent, NAV_ITEMS, NavChild, NavIcon } from '../navigation';
import { BLUE, BORDER, BRAND_BLUE, DISABLED, INK, MUTED, SELECTED } from '../theme';
import { getChangeBySlug } from '../upgrades/data/changes';
import { demoLabel } from '../vibenet/demos/catalogue';
import { getUpgradeById } from '../upgrades/data/upgrades';
import { titleForPath } from '../navigation';

import { trackNavClick } from '../analytics/events';
import { navSlideDirection } from './nav-motion';
import { NavScrollArea } from './NavScrollArea';
import { AnimatedBaseLogo, BaseMark } from './ui/AnimatedBaseLogo';
import { Breadcrumb } from './ui/Breadcrumb';
import { cn } from './ui/cn';
import { AnimatedArrowIcon, CloseIcon } from './ui/icons';
import { Text } from './ui/Text';

const SIDEBAR_WIDTH = 248;
/** Matches base.org's nav logo size, which the animation timings are tuned for. */
const BRAND_MARK_SIZE = 28;
/** Sized down to sit comfortably in the 56px-tall mobile header. */
const MOBILE_BRAND_MARK_SIZE = 24;

type NavRowProps = {
  icon?: NavIcon;
  label: string;
  href: string;
  active: boolean;
  enabled: boolean;
  hasChildren?: boolean;
  onNavigate?: () => void;
  layoutScope?: string;
};

type NavGlyphProps = {
  name: NavIcon;
};

const styles: Record<string, CSSProperties> = {
  root: { display: 'flex', flex: 1, overflow: 'hidden', color: INK },
  sidebar: {
    width: SIDEBAR_WIDTH,
    flexShrink: 0,
    borderRight: `1px solid ${SELECTED}`,
    display: 'flex',
    flexDirection: 'column',
    padding: '0 0 20px',
    position: 'relative',
    overflow: 'hidden',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    position: 'relative',
  },
  brandLink: { display: 'inline-block', lineHeight: 0 },
  // Slot between the pinned footer and the top of the sidebar. Overflow hidden
  // clips the popLayout slide; scroll lives on NavScrollArea, which wraps the
  // logo and the sliding panes so the mark rolls away with the list.
  navSlot: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
    overflow: 'hidden',
  },
  // Sizes to its links. Height used to be 100% when each pane owned the
  // scroller; now the scroller is outside and a stretched pane would loop
  // against the content height.
  navPane: {
    display: 'flex',
    flexDirection: 'column',
  },
  // Clips the pane's horizontal slide so it never becomes overflow-x on the
  // scroll viewport. Height is content-sized, so this does not clip vertically.
  navSlideClip: {
    overflow: 'hidden',
  },
  // `isolation` makes the nav a stacking context so the active-row pill (which
  // renders at z-index -1 and travels across rows while animating) paints behind
  // every row's label instead of on top of the rows it passes over.
  nav: { display: 'flex', flexDirection: 'column', gap: 2, position: 'relative', isolation: 'isolate' },
  navLink: { textDecoration: 'none', color: 'inherit' },
  navRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 10px',
    borderRadius: 8,
    fontSize: 14,
    // Anchors the selected pill and the `.nav-row-hover` fill, both of which are
    // absolutely positioned within the row.
    position: 'relative',
  },
  navIcon: { display: 'inline-flex', width: 20, height: 20 },
  soon: {
    marginLeft: 'auto',
    fontSize: 11,
    fontWeight: 400,
    color: MUTED,
    border: `1px solid ${BORDER}`,
    borderRadius: 999,
    padding: '1px 6px',
  },
  // Pinned below the sliding panes so Status/Support/Docs/Blog stay put when
  // a section sub-nav slides in. The switch sits on the last row beside Blog.
  sidebarFooter: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    flexShrink: 0,
  },
  footerLastRow: {
    display: 'flex',
    alignItems: 'center',
  },
  footerLink: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 10px',
    borderRadius: 8,
    textDecoration: 'none',
    color: 'var(--bds-gray-50)',
  },
  footerIcon: { display: 'inline-flex', width: 18, height: 18 },
  // Hugs the switch rather than filling the row: with no label beside it, a
  // full-width button would hover-fill a strip of empty sidebar. The inherited
  // footer-row padding keeps the hit target at 54×38, comfortably past the 24×24
  // WCAG 2.5.8 floor even though the track itself is only 34×20.
  themeButton: {
    border: 0,
    background: 'transparent',
    cursor: 'pointer',
  },
  // The switch state and the theme are the same thing, so the off state only ever
  // renders on a light sidebar and the on state only on a dark one. Off therefore
  // has to hold up against white specifically, and a pale track left the white
  // thumb at 1.15:1 — invisible, against the 3:1 WCAG 1.4.11 asks of UI components.
  // The fix is a gray-50 track rather than an outlined thumb: it puts the thumb and
  // the track edge both at ~5:1 without ringing the icon in a second circle.
  switchTrack: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    width: 34,
    height: 20,
    padding: 2,
    borderRadius: 999,
    background: 'var(--bds-gray-50)',
    boxSizing: 'border-box',
  },
  switchTrackOn: { background: BRAND_BLUE },
  switchThumb: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
    borderRadius: '50%',
    // Reads against both the grey off-track and the blue on-track.
    background: 'var(--bds-gray-0)',
    color: 'var(--bds-gray-50)',
  },
  switchThumbOn: { transform: 'translateX(14px)', color: BRAND_BLUE },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  topbar: {
    height: 65,
    flexShrink: 0,
    borderBottom: `1px solid ${SELECTED}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 28px',
  },
  topbarTitle: { fontSize: 16, fontWeight: 500 },
  content: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' as const },
  contentInner: { width: '100%', maxWidth: 1280, margin: '0 auto', padding: '24px 28px 80px', flex: 1, display: 'flex', flexDirection: 'column' as const },
};

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
    case 'changelog':
      return (
        <svg {...common} viewBox="0 0 24 24" strokeWidth={1.8} className="nav-changelog-icon">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
        </svg>
      );
    case 'vibenet':
      return (
        <svg {...common} viewBox="4 3 34 34" strokeWidth={2.5} className="nav-vibenet-icon">
          <circle cx="20" cy="20" r="12" />
          <ellipse cx="20" cy="20" rx="5" ry="12" />
          <path d="M32 20H8.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'overview':
      return (
        <svg {...common} viewBox="4 4 32 32" strokeWidth={2.5} className="nav-overview-icon">
          <path d="M10 25C10 23.3431 11.3431 22 13 22H15C16.6569 22 18 23.3431 18 25V27C18 28.6569 16.6569 30 15 30H13C11.3431 30 10 28.6569 10 27V25Z" />
          <path d="M22 25C22 23.3431 23.3431 22 25 22H27C28.6569 22 30 23.3431 30 25V27C30 28.6569 28.6569 30 27 30H25C23.3431 30 22 28.6569 22 27V25Z" />
          <path d="M10 13C10 11.3431 11.3431 10 13 10H15C16.6569 10 18 11.3431 18 13V15C18 16.6569 16.6569 18 15 18H13C11.3431 18 10 16.6569 10 15V13Z" />
          <path d="M22 13C22 11.3431 23.3431 10 25 10H27C28.6569 10 30 11.3431 30 13V15C30 16.6569 28.6569 18 27 18H25C23.3431 18 22 16.6569 22 15V13Z" />
        </svg>
      );
    case 'demos':
      return (
        <svg {...common} viewBox="4 4 32 32" strokeWidth={2.5} className="nav-demos-icon">
          <path d="M30.2895 14.8575L20.0038 20.0002M20.0038 20.0002L10.2895 14.2861M20.0038 20.0002L20.0038 30.8571M30.8608 22.8275V17.1724C30.8608 15.3861 29.9078 13.7354 28.3608 12.8423L22.4737 9.44331C20.9267 8.55015 19.0207 8.55015 17.4737 9.44331L11.5865 12.8423C10.0395 13.7354 9.08649 15.3861 9.08649 17.1724V22.8275C9.08649 24.6138 10.0395 26.2644 11.5865 27.1576L17.4737 30.5566C19.0207 31.4497 20.9267 31.4497 22.4737 30.5566L28.3608 27.1576C29.9078 26.2644 30.8608 24.6138 30.8608 22.8275Z" strokeLinecap="round" />
        </svg>
      );
    case 'faucet':
      return (
        <svg {...common} viewBox="5 5 30 30" strokeWidth={2.5} className="nav-faucet-icon">
          <path d="M25.6645 30.7616C24.097 31.8902 22.2107 32.5 20.2792 32.5L19.7208 32.5C17.7892 32.5 15.903 31.8902 14.3355 30.7616C6.95342 25.4465 10.9093 13.7587 20 14.0833C29.0906 13.7587 33.0465 25.4465 25.6645 30.7616Z" />
          <path d="M17 24L20 27L23 24M20 27V19.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M19.7091 10.1729L19.7091 6.00013M23.4182 10.1729L23.4182 8.31831M16 10.1729L16 8.31831" strokeLinecap="round" />
        </svg>
      );
    case 'explorer':
      return (
        <svg {...common} viewBox="4 4 32 32" strokeWidth={2.5} className="nav-explorer-icon">
          <path d="M30 30.3125L23.0674 23.3799M23.0674 23.3799C24.5189 21.9284 25.4167 19.9232 25.4167 17.7083C25.4167 13.2785 21.8256 9.6875 17.3958 9.6875C12.966 9.6875 9.375 13.2785 9.375 17.7083C9.375 22.1381 12.966 25.7292 17.3958 25.7292C19.6107 25.7292 21.6159 24.8314 23.0674 23.3799Z" strokeLinecap="round" />
        </svg>
      );
    case 'internal-explorer':
      return (
        <svg {...common} className="nav-internal-explorer-icon">
          <path d="M4 19h4v2H4zM10 15h4v6h-4zM16 9h4v12h-4z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'benchmark':
      return (
        <svg {...common} className="nav-benchmark-icon">
          <path d="M3 3v15.5A2.5 2.5 0 0 0 5.5 21H21" />
          <path d="m7 15 3.5-4.5 3 2.5L19 6" />
        </svg>
      );
    case 'runs':
      return (
        <svg {...common} strokeWidth={1.8} className="nav-runs-icon">
          <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
        </svg>
      );
    case 'loadtest':
      return (
        <svg {...common} strokeWidth={1.8} className="nav-loadtest-icon">
          <path d="M3 12h3.5l2.5-6 4 12 2.5-6H21" />
        </svg>
      );
    default:
      return null;
  }
}

function NavRow({ icon, label, href, active, enabled, hasChildren, onNavigate, layoutScope = 'desktop' }: NavRowProps) {
  let color = DISABLED;
  if (enabled) {
    color = active ? 'var(--bds-gray-80)' : 'var(--bds-gray-50)';
  }

  const row = (
    <div
      className={`${hasChildren ? 'group ' : ''}${enabled ? 'nav-row-hover' : ''}`}
      style={{
        ...styles.navRow,
        color,
        fontWeight: active ? 500 : 400,
        cursor: enabled ? 'pointer' : 'default',
      }}
    >
      {active && (
        <motion.div
          layoutId={`nav-active-bg-${layoutScope}`}
          // Only remasure when the highlighted row changes. Theme toggles,
          // banner dismiss, and other sidebar rerenders shift this pill's
          // page position; without a dependency Motion would slide it there.
          layoutDependency={href}
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 8,
            // SELECTED (gray-10), a step darker than the SURFACE (gray-5) hover
            // fill, so the pill reads as landing on the hovered row rather than
            // dissolving into it.
            background: SELECTED,
            zIndex: -1,
            pointerEvents: 'none',
          }}
          transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
        />
      )}
      {icon && (
        <span style={styles.navIcon}>
          <NavGlyph name={icon} />
        </span>
      )}
      <Text as="span" variant="label.medium" tone="inherit">{label}</Text>
      {!enabled && <span style={styles.soon}>Soon</span>}
      {hasChildren && (
        <span style={{ marginLeft: 'auto', color: 'var(--bds-gray-50)' }}>
          <AnimatedArrowIcon size={16} strokeWidth={1.5} />
        </span>
      )}
    </div>
  );

  if (!enabled) return row;
  return (
    <Link
      href={href}
      style={styles.navLink}
      onClick={(event) => {
        if (opensInNewTab(event)) return;
        trackNavClick(label);
        onNavigate?.();
      }}
    >
      {row}
    </Link>
  );
}

/**
 * True for clicks the browser handles itself (new tab/window), which navigate
 * nothing here — so they must not move the nav's active state.
 */
function opensInNewTab(event: ReactMouseEvent): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

function isChildActive(child: NavChild, pathname: string): boolean {
  if (child.exact) return pathname === child.href;
  return pathname === child.href || pathname.startsWith(`${child.href}/`);
}

const slideVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? '60%' : '-60%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? '-60%' : '60%', opacity: 0 }),
};

const slideTransition = { duration: 0.2, ease: [0.23, 1, 0.32, 1] as const };

// How long the nav trusts a tapped href before falling back to the router. Only
// reached if a navigation never commits (aborted, failed, or a modified click that
// slipped through), so it just has to be longer than a slow route.
const PENDING_PATH_TIMEOUT_MS = 5000;

// Rides inside the switch thumb. Stroke is heavier than the nav glyphs' 1.8
// because at 10px that weight all but disappears.
function ThemeIcon({ dark }: { dark: boolean }) {
  const common = {
    width: 10,
    height: 10,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return dark ? (
    <svg {...common}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  ) : (
    <svg {...common}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

type SidebarContentProps = {
  dark: boolean;
  onToggleTheme: () => void;
  onNavigate?: () => void;
  hideBrand?: boolean;
  layoutScope?: string;
};

function SidebarContent({ dark, onToggleTheme, onNavigate, hideBrand, layoutScope = 'desktop' }: SidebarContentProps) {
  const pathname = usePathname() || '/';
  // The nav follows the tapped href immediately instead of waiting for the router:
  // usePathname() only updates once the route commits, which left the pill and the
  // sub-nav slide sitting still for the whole navigation — the tap felt dead, then
  // everything moved at once.
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const activePath = pendingPath ?? pathname;
  const activeParent = getActiveParent(activePath);
  const directionRef = useRef(1);
  const prevParentRef = useRef<string | null>(activeParent?.href ?? null);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const paneKey = activeParent?.href ?? 'main';

  // Direction must update during render. An effect applies one commit late,
  // so the first click of the section back-header still slid as if going in.
  const prevParent = prevParentRef.current;
  const currParent = activeParent?.href ?? null;
  const nextDirection = navSlideDirection(prevParent, currParent);
  if (nextDirection !== null) {
    directionRef.current = nextDirection;
    prevParentRef.current = currParent;
  }

  // Any commit hands control back to the router, including a Back that lands
  // somewhere other than the tapped href.
  useEffect(() => {
    setPendingPath(null);
  }, [pathname]);

  useEffect(() => {
    if (!pendingPath) return;
    const timer = setTimeout(() => setPendingPath(null), PENDING_PATH_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pendingPath]);

  // Shared scroller keeps one logo across pane swaps, so a leftover scrollTop
  // from the previous list would hide it. Jump back to the top on each swap.
  useEffect(() => {
    const viewport = scrollViewportRef.current;
    if (viewport) viewport.scrollTop = 0;
  }, [paneKey]);

  const selectPath = (href: string) => {
    setPendingPath(href);
    onNavigate?.();
  };

  const direction = directionRef.current;

  return (
    <>
      <div style={styles.navSlot}>
        <NavScrollArea viewportRef={scrollViewportRef}>
          {!hideBrand && (
            <div style={styles.brand} className="sidebar-gutter sidebar-brand">
              <AnimatedBaseLogo size={BRAND_MARK_SIZE} />
            </div>
          )}
          <div className="sidebar-gutter" style={styles.navSlideClip}>
            <AnimatePresence mode="popLayout" initial={false} custom={direction}>
              {activeParent ? (
                <motion.div
                  key={`sub-nav:${activeParent.href}`}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={slideTransition}
                  className="sidebar-nav-pane"
                  style={styles.navPane}
                >
                  <Link
                    href="/"
                    className="nav-header-hover group"
                    style={{ ...styles.navLink, display: 'flex', alignItems: 'center', padding: '9px 6px 9px 2px', marginBottom: 4, color: 'var(--bds-gray-50)' }}
                    onClick={(event) => {
                      if (opensInNewTab(event)) return;
                      selectPath('/');
                    }}
                  >
                    <svg
                      width={16}
                      height={16}
                      viewBox="0 0 20 20"
                      fill="none"
                      aria-hidden="true"
                      style={{ transform: 'scaleX(-1)', flexShrink: 0 }}
                    >
                      <path d="M7.5 4L13.5 10L7.5 16" stroke="currentColor" strokeWidth={1.5} />
                      <path
                        d="M13.5 10H0"
                        stroke="currentColor"
                        strokeWidth={1.5}
                        strokeDasharray="13.5"
                        strokeDashoffset="13.5"
                        className="transition-[stroke-dashoffset] duration-200 ease-out group-hover:[stroke-dashoffset:0]"
                      />
                    </svg>
                    <Text as="span" variant="label.medium" style={{ flex: 1, textAlign: 'center', paddingRight: 16 }}>{activeParent.label}</Text>
                  </Link>
                  <nav style={styles.nav}>
                    {activeParent.children!.map((child) => {
                      const active = isChildActive(child, activePath);
                      return (
                        <NavRow
                          key={child.href}
                          icon={child.icon}
                          label={child.label}
                          href={child.href}
                          active={active}
                          enabled={true}
                          onNavigate={() => selectPath(child.href)}
                          layoutScope={`${layoutScope}-sub`}
                        />
                      );
                    })}
                  </nav>
                </motion.div>
              ) : (
                <motion.div
                  key="main-nav"
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={slideTransition}
                  className="sidebar-nav-pane"
                  style={styles.navPane}
                >
                  <nav style={styles.nav}>
                    {NAV_ITEMS.filter((item) => item.icon).map((item) => {
                      let active: boolean;
                      if (item.href === '/') {
                        active = activePath === '/';
                      } else {
                        const isMatch = activePath === item.href || activePath.startsWith(`${item.href}/`);
                        const hasMoreSpecific = NAV_ITEMS.some(
                          (other) => other.href !== item.href && other.href.startsWith(item.href) && (activePath === other.href || activePath.startsWith(`${other.href}/`)),
                        );
                        active = isMatch && !hasMoreSpecific;
                      }
                      return (
                        <NavRow
                          key={item.href}
                          icon={item.icon}
                          label={item.label}
                          href={item.href}
                          active={active}
                          enabled={item.enabled}
                          hasChildren={!!item.children}
                          onNavigate={() => selectPath(item.href)}
                          layoutScope={layoutScope}
                        />
                      );
                    })}
                  </nav>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </NavScrollArea>
      </div>

      <div style={styles.sidebarFooter} className="sidebar-gutter">
        <a href="https://status.base.org" target="_blank" rel="noreferrer" style={styles.footerLink}>
          <span style={styles.footerIcon}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.25 12h4.5l2.25-6 4.5 12 2.25-6h6.75" />
            </svg>
          </span>
          <Text as="span" variant="label.medium" tone="inherit">Status</Text>
        </a>
        <a href="https://base.org/discord" target="_blank" rel="noreferrer" style={styles.footerLink}>
          <span style={styles.footerIcon}>
            <svg width={18} height={18} viewBox="0 -28.5 256 256" fill="currentColor">
              <path d="M216.856 16.597C200.285 8.843 182.566 3.208 164.042 0c-2.275 4.113-4.933 9.645-6.766 14.046-19.692-2.961-39.203-2.961-58.533 0-1.832-4.401-4.55-9.933-6.846-14.046C73.353 3.208 55.613 8.864 39.042 16.638 5.618 67.147-3.443 116.401 1.087 164.956c22.169 16.555 43.653 26.612 64.775 33.193 5.215-7.177 9.866-14.807 13.873-22.848-7.631-2.9-14.94-6.478-21.846-10.632 1.832-1.357 3.624-2.776 5.356-4.237 42.122 19.702 87.89 19.702 129.51 0 1.751 1.46 3.543 2.88 5.355 4.237-6.926 4.174-14.255 7.753-21.886 10.653 4.006 8.02 8.638 15.67 13.873 22.848 21.142-6.58 42.646-16.637 64.815-33.213 5.316-56.288-9.08-105.09-38.056-148.36ZM85.474 135.095c-12.645 0-23.015-11.805-23.015-26.18s10.149-26.2 23.015-26.2c12.867 0 23.236 11.804 23.015 26.2.02 14.375-10.148 26.18-23.015 26.18Zm85.051 0c-12.645 0-23.014-11.805-23.014-26.18s10.148-26.2 23.014-26.2c12.867 0 23.236 11.804 23.015 26.2 0 14.375-10.148 26.18-23.015 26.18Z" />
            </svg>
          </span>
          <Text as="span" variant="label.medium" tone="inherit">Support</Text>
        </a>
        <a href="https://docs.base.org" target="_blank" rel="noreferrer" style={styles.footerLink}>
          <span style={styles.footerIcon}>
            <svg width={18} height={18} viewBox="6 6 28 28" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 15H19.5M15 25H19.5M15 20H16M24 15L25 15M24 25H25M21 20H25M13 31H27C29.2091 31 31 29.2091 31 27V13C31 10.7909 29.2091 9 27 9H13C10.7909 9 9 10.7909 9 13V27C9 29.2091 10.7909 31 13 31Z" />
            </svg>
          </span>
          <Text as="span" variant="label.medium" tone="inherit">Docs</Text>
        </a>
        <div style={styles.footerLastRow}>
          <a href="https://blog.base.org" target="_blank" rel="noreferrer" style={{ ...styles.footerLink, flex: 1 }}>
            <span style={styles.footerIcon}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12.75 19.5V18.75C12.75 16.76 11.96 14.85 10.55 13.45C9.15 12.04 7.24 11.25 5.25 11.25H4.5M4.5 4.5H5.25C13.12 4.5 19.5 10.88 19.5 18.75V19.5M6 18.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
              </svg>
            </span>
            <Text as="span" variant="label.medium" tone="inherit">Blog</Text>
          </a>
          {/* `role="switch"` rather than a plain button: the control reports a state
              rather than firing an action, so screen readers announce "on"/"off"
              against a stable label instead of the label itself changing. The switch
              renders bare, so that name comes from `aria-label` — the visible track
              is decorative and hidden from the tree. */}
          <button
            type="button"
            role="switch"
            aria-checked={dark}
            aria-label="Dark mode"
            onClick={onToggleTheme}
            className="nav-header-hover theme-switch"
            style={{ ...styles.footerLink, ...styles.themeButton }}
          >
            <span
              aria-hidden
              className="theme-switch-track"
              style={{ ...styles.switchTrack, ...(dark ? styles.switchTrackOn : null) }}
            >
              <span
                className="theme-switch-thumb"
                style={{ ...styles.switchThumb, ...(dark ? styles.switchThumbOn : null) }}
              >
                <ThemeIcon dark={dark} />
              </span>
            </span>
          </button>
        </div>
      </div>
    </>
  );
}

type GlobalBannerProps = {
  dismissed: boolean;
  onDismiss: () => void;
  className?: string;
};

function GlobalBanner({ dismissed, onDismiss, className }: GlobalBannerProps) {
  const reducedMotion = useReducedMotion();
  const transition = reducedMotion ? { duration: 0 } : slideTransition;

  return (
    <AnimatePresence initial={false}>
      {!dismissed && (
        <motion.div
          key="global-banner"
          className={cn(className, 'relative overflow-clip after:inset-x-0 after:absolute after:bottom-0 after:border-b after:border-bds-gray-10 bg-bds-gray-5')}
          initial={false}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={transition}
        >
          <div className="relative flex w-full items-center justify-center border-b border-transparent py-2 pl-4 pr-10 sm:px-10">
            <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-center min-[860px]:flex-row min-[860px]:gap-5">
              <div className="flex min-w-0 flex-wrap items-center justify-center gap-x-2 gap-y-1 min-[860px]:flex-nowrap">
                <Text as="span" variant="label.medium" className="whitespace-nowrap">New!</Text>
                <Text as="span" variant="label.medium" className="whitespace-nowrap">EIP-8130: Accounts</Text>
                <span className="inline-block h-3.5 w-px shrink-0 bg-bds-gray-20"></span>
                <Link href="/vibenet/demos/account" className="group flex shrink-0 items-center gap-1 no-underline">
                  <Text as="span" variant="label.medium" className="text-base-blue">Test on Vibenet</Text>
                  <AnimatedArrowIcon size={14} strokeWidth={2} className="text-base-blue transition-transform duration-200 ease-out group-hover:translate-x-[3px]" />
                </Link>
              </div>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              className="absolute right-4 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center text-bds-gray-40 transition-colors hover:text-foreground"
              aria-label="Dismiss banner"
            >
              <CloseIcon size={10} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname() || '/';
  const title = titleForPath(pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  // Starts false on both server and client so the first render matches; the
  // effect below reads the attribute the pre-paint script in layout.tsx set.
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.dataset.theme === 'dark');
  }, []);

  const toggleTheme = () => {
    const nextDark = !dark;
    document.documentElement.dataset.theme = nextDark ? 'dark' : 'light';
    setDark(nextDark);
    try {
      localStorage.setItem('theme', nextDark ? 'dark' : 'light');
    } catch {
      // Private browsing or a blocked-storage profile — the theme still applies
      // for this session, it just won't survive a reload.
    }
  };

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
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Desktop: banner spans the full width above the shell. On mobile it is
          rendered below the fixed header instead (see below), so it isn't hidden
          behind it. */}
      <GlobalBanner
        dismissed={bannerDismissed}
        onDismiss={() => setBannerDismissed(true)}
        className="hidden md:flex"
      />
      <div style={styles.root}>
        {/* Desktop sidebar */}
        <aside className="sidebar-desktop" style={styles.sidebar}>
          <SidebarContent dark={dark} onToggleTheme={toggleTheme} />
        </aside>

        {/* Mobile header (logo + hamburger) */}
        <header className="mobile-header">
          {/* Static on touch: the morph is hover-driven, so base.org leaves its
              mobile mark static too. */}
          <Link href="/" aria-label="Base home" style={styles.brandLink}>
            <BaseMark size={MOBILE_BRAND_MARK_SIZE} />
          </Link>
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
              <SidebarContent
                dark={dark}
                onToggleTheme={toggleTheme}
                onNavigate={() => setMenuOpen(false)}
                hideBrand
                layoutScope="mobile"
              />
            </motion.aside>
          )}
        </AnimatePresence>

        <div className="mobile-content-offset" style={styles.main}>
          {/* Mobile: banner sits below the fixed header (which the top slot is
              hidden behind), so it's visible without scrolling. */}
          <GlobalBanner
            dismissed={bannerDismissed}
            onDismiss={() => setBannerDismissed(true)}
            className="flex md:hidden"
          />
          <header className="topbar-desktop" style={{ ...styles.topbar, position: 'relative', zIndex: 40 }}>
            <div id="topbar-actions-slot" className="absolute right-7 top-1/2 z-10 flex -translate-y-1/2 items-center gap-2" />
            {(() => {
              const slugMatch = pathname.match(/^\/upgrades\/changelog\/(.+)$/);
              if (slugMatch) {
                const change = getChangeBySlug(slugMatch[1]);
                return (
                  <Breadcrumb
                    parentLabel="Changelog"
                    parentHref="/upgrades/changelog"
                    childLabel={change?.title ?? slugMatch[1]}
                  />
                );
              }
              const upgradeMatch = pathname.match(/^\/upgrades\/upgrade\/(.+)$/);
              if (upgradeMatch) {
                const upgrade = getUpgradeById(upgradeMatch[1]);
                return (
                  <Breadcrumb
                    parentLabel="Upgrades"
                    parentHref="/upgrades"
                    childLabel={upgrade?.name ?? upgradeMatch[1]}
                  />
                );
              }
              if (pathname.startsWith('/vibenet') && pathname !== '/vibenet') {
                let childLabel = title;
                let middle: { label: string; href: string } | undefined;
                const explorerDetailMatch = pathname.match(/^\/vibenet\/explorer\/(tx|block|address)\/(.+)$/);
                const demoMatch = pathname.match(/^\/vibenet\/demos\/(.+)$/);
                if (explorerDetailMatch) {
                  middle = { label: 'Explorer', href: '/vibenet/explorer' };
                  const raw = explorerDetailMatch[2];
                  childLabel = raw.startsWith('0x') && raw.length > 12
                    ? `${raw.slice(0, 6)}…${raw.slice(-4)}`
                    : raw;
                } else if (demoMatch) {
                  childLabel = demoLabel(demoMatch[1].split('/')[0]);
                }
                return (
                  <Breadcrumb
                    parentLabel="Vibenet"
                    parentHref="/vibenet"
                    middle={middle}
                    childLabel={childLabel}
                  />
                );
              }
              return <Text as="span" variant="headline">{title}</Text>;
            })()}
          </header>
          <main style={styles.content}>
            <div style={styles.contentInner}>{children}</div>
          </main>
        </div>
      </div>
      <Toaster position="top-center" style={{ '--width': '300px' } as React.CSSProperties} toastOptions={{ className: 'text-[13px] font-base tracking-[0px]' }} />
    </div>
  );
}
