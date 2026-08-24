import { afterEach, describe, expect, it, vi } from 'vitest';

// deploy.config.mjs reads NEXT_PUBLIC_DEPLOY_TARGET at module-evaluation time, so
// each case stubs the env and re-imports with a fresh module registry.
async function loadWithTarget(target) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_DEPLOY_TARGET', target);
  return import('./deploy.config.mjs');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('deploy.config', () => {
  it('defaults to external when the target is unset', async () => {
    const c = await loadWithTarget(undefined);
    expect(c.TARGET).toBe('external');
  });

  it('treats any non-internal value as external', async () => {
    const c = await loadWithTarget('nonsense');
    expect(c.TARGET).toBe('external');
  });

  describe('external target', () => {
    it('excludes internal-only surfaces', async () => {
      const c = await loadWithTarget('external');
      expect(c.surfaceEnabled('tips')).toBe(false);
      expect(c.surfaceEnabled('benchmark')).toBe(false);
    });

    it('reports the disabled route + api prefixes and subtree globs', async () => {
      const c = await loadWithTarget('external');
      expect(c.disabledRoutePrefixes()).toEqual(['/internal-explorer', '/tips', '/benchmark']);
      // Benchmark contributes no api prefix: it calls the report API directly
      // from the browser rather than through a route handler in this app.
      expect(c.disabledApiPrefixes()).toEqual(['/api/internal-explorer', '/api/tips']);
      expect(c.disabledRouteGlobs()).toEqual([
        '/internal-explorer',
        '/internal-explorer/**',
        '/tips',
        '/tips/**',
        '/benchmark',
        '/benchmark/**',
      ]);
    });
  });

  describe('internal target', () => {
    it('includes internal-only surfaces', async () => {
      const c = await loadWithTarget('internal');
      expect(c.TARGET).toBe('internal');
      expect(c.surfaceEnabled('tips')).toBe(true);
      expect(c.surfaceEnabled('benchmark')).toBe(true);
    });

    it('disables nothing', async () => {
      const c = await loadWithTarget('internal');
      expect(c.disabledRoutePrefixes()).toEqual([]);
      expect(c.disabledApiPrefixes()).toEqual([]);
      expect(c.disabledRouteGlobs()).toEqual([]);
    });
  });

  it('treats surfaces absent from the matrix as enabled everywhere', async () => {
    const external = await loadWithTarget('external');
    expect(external.surfaceEnabled('snapshots')).toBe(true);
    const internal = await loadWithTarget('internal');
    expect(internal.surfaceEnabled('snapshots')).toBe(true);
  });
});
