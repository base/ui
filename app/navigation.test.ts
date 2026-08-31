import { describe, expect, it } from 'vitest';

import {
  getActiveParent,
  isChildActive,
  isTopNavActive,
  navActiveParent,
  navHighlightPath,
  pathMatches,
  titleForPath,
} from './navigation';

describe('pathMatches', () => {
  it('matches a prefix unless exact', () => {
    expect(pathMatches('/vibenet', '/vibenet/faucet')).toBe(true);
    expect(pathMatches('/vibenet', '/vibenet/faucet', true)).toBe(false);
  });

  it('treats / as exact', () => {
    expect(pathMatches('/', '/')).toBe(true);
    expect(pathMatches('/', '/vibenet')).toBe(false);
  });
});

describe('getActiveParent', () => {
  it('returns the section for a child path', () => {
    expect(getActiveParent('/vibenet')?.href).toBe('/vibenet');
    expect(getActiveParent('/vibenet/faucet')?.href).toBe('/vibenet');
  });

  it('returns null on the root list', () => {
    expect(getActiveParent('/')).toBeNull();
    expect(getActiveParent('/snapshots')).toBeNull();
  });

  it('is the section root only for the parent href itself', () => {
    expect(getActiveParent('/vibenet')?.href === '/vibenet').toBe(true);
    expect(getActiveParent('/vibenet/faucet')?.href === '/vibenet/faucet').toBe(false);
  });
});

describe('isChildActive', () => {
  it('honors exact child hrefs', () => {
    expect(isChildActive({ label: 'Overview', href: '/vibenet', exact: true }, '/vibenet')).toBe(true);
    expect(isChildActive({ label: 'Overview', href: '/vibenet', exact: true }, '/vibenet/faucet')).toBe(false);
  });
});

describe('isTopNavActive', () => {
  it('highlights a section root while inside it', () => {
    expect(isTopNavActive({ label: 'Vibenet', href: '/vibenet', icon: 'vibenet', enabled: true, children: [] }, '/vibenet/faucet')).toBe(true);
  });

  it('does not mark Home active while Vibenet is on screen', () => {
    const home = { label: 'Home', href: '/', icon: 'home' as const, enabled: true };
    const vibenet = { label: 'Vibenet', href: '/vibenet', icon: 'vibenet' as const, enabled: true, children: [] };
    const path = navHighlightPath('/', '/vibenet');
    expect(isTopNavActive(home, path)).toBe(false);
    expect(isTopNavActive(vibenet, path)).toBe(true);
  });
});

describe('navHighlightPath', () => {
  it('keeps the real page highlighted after the back header', () => {
    expect(navHighlightPath('/', '/vibenet')).toBe('/vibenet');
  });

  it('follows a real pending navigation', () => {
    expect(navHighlightPath('/vibenet', '/')).toBe('/vibenet');
    expect(navHighlightPath(null, '/snapshots')).toBe('/snapshots');
  });
});

describe('navActiveParent', () => {
  it('shows the root list after the back header', () => {
    expect(navActiveParent('/', '/vibenet')).toBeNull();
  });

  it('shows the section pane for a section path', () => {
    expect(navActiveParent('/vibenet', '/')).toEqual(getActiveParent('/vibenet'));
    expect(navActiveParent(null, '/vibenet/faucet')).toEqual(getActiveParent('/vibenet/faucet'));
  });
});

describe('titleForPath', () => {
  it('uses the child label inside a section', () => {
    expect(titleForPath('/vibenet/faucet')).toBe('Faucet');
    expect(titleForPath('/vibenet')).toBe('Overview');
  });

  it('uses catalogue labels for grouped and nested demos', () => {
    expect(titleForPath('/vibenet/demos/validity')).toBe('Validity Transactions');
    expect(titleForPath('/vibenet/demos/validity/conditional-swaps')).toBe('Conditional Swaps');
    expect(titleForPath('/vibenet/demos/validity/race-the-agent')).toBe('Race the Agent');
  });
});
