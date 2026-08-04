/**
 * Next.js App Router route discovery.
 *
 * Walks the app directory and maps page files to URL paths, applying Next's
 * own conventions for route groups, parallel slots, private folders, and
 * dynamic segments. Also collects `route.ts` files separately — they are not
 * pages, but they are the machine-readable endpoints an agent wants.
 */

import fs from 'node:fs';
import path from 'node:path';
import { matchesAny } from './config.mjs';

const PAGE_FILES = new Set([
  'page.tsx', 'page.ts', 'page.jsx', 'page.js', 'page.mdx', 'page.md',
]);
const ROUTE_FILES = new Set(['route.ts', 'route.js', 'route.tsx', 'route.mjs']);

/** Special files that are not routes. */
const NON_ROUTE_BASENAMES = new Set([
  'layout', 'template', 'loading', 'error', 'global-error', 'not-found', 'default',
]);

const PRUNED_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'coverage', '__tests__', '__mocks__',
]);

const IGNORED_FILE_PATTERNS = [
  /\.d\.ts$/, /\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /\.stories\.[jt]sx?$/,
];

export function isPageFile(name) {
  return PAGE_FILES.has(name);
}

export function isRouteHandlerFile(name) {
  return ROUTE_FILES.has(name);
}

export function isIgnoredFile(name) {
  if (IGNORED_FILE_PATTERNS.some((re) => re.test(name))) return true;
  const base = name.replace(/\.[jt]sx?$|\.mdx?$/, '');
  return NON_ROUTE_BASENAMES.has(base);
}

/** A directory whose entire subtree is excluded from routing. */
export function isExcludedDir(name) {
  if (PRUNED_DIRS.has(name)) return true;
  if (name.startsWith('@')) return true; // parallel route slot
  if (name.startsWith('_')) return true; // private folder
  if (name.startsWith('.')) return true;
  return false;
}

/** A `(group)` segment exists on disk but contributes nothing to the URL. */
export function isRouteGroup(name) {
  return name.startsWith('(') && name.endsWith(')');
}

/** `[slug]`, `[...rest]`, `[[...rest]]` */
export function isDynamicSegment(name) {
  return name.startsWith('[') && name.endsWith(']');
}

/**
 * Discover every static page route under the app directory.
 *
 * @param {string} repoRoot
 * @param {object} config
 * @returns {{routes: Route[], endpoints: string[], warnings: string[]}}
 *
 * Route = { urlPath, filePath, segments, layoutChain, dynamic }
 *   urlPath     '/demos/account' (root is '/')
 *   filePath    repo-relative path to the page file
 *   layoutChain repo-relative layout.tsx paths, nearest ancestor LAST
 */
export function discoverRoutes(repoRoot, config) {
  const appDir = path.join(repoRoot, config.appDir);
  if (!fs.existsSync(appDir)) {
    throw new Error(`App directory not found: ${config.appDir}`);
  }

  const routes = [];
  const endpoints = [];
  const warnings = [];

  /**
   * @param {string} absDir
   * @param {string[]} urlSegments segments contributing to the URL so far
   * @param {string[]} layoutChain layouts inherited from ancestors
   */
  function walk(absDir, urlSegments, layoutChain) {
    let entries;
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch (err) {
      warnings.push(`could not read ${path.relative(repoRoot, absDir)}: ${err.message}`);
      return;
    }

    // Sort so traversal order never depends on the filesystem. The determinism
    // test monkeypatches readdirSync to return reversed entries; this is what
    // makes that test pass.
    entries = [...entries].sort((a, b) => a.name.localeCompare(b.name, 'en'));

    const chain = [...layoutChain];
    const layout = entries.find(
      (e) => e.isFile() && /^layout\.(tsx|ts|jsx|js)$/.test(e.name),
    );
    if (layout) chain.push(path.relative(repoRoot, path.join(absDir, layout.name)));

    for (const entry of entries) {
      const abs = path.join(absDir, entry.name);

      if (entry.isFile()) {
        if (isRouteHandlerFile(entry.name)) {
          endpoints.push(`/${urlSegments.join('/')}`.replace(/\/+/g, '/'));
          continue;
        }
        if (!isPageFile(entry.name) || isIgnoredFile(entry.name)) continue;

        const urlPath = urlSegments.length === 0 ? '/' : `/${urlSegments.join('/')}`;
        routes.push({
          urlPath,
          filePath: path.relative(repoRoot, abs),
          segments: [...urlSegments],
          layoutChain: chain,
          dynamic: urlSegments.some((s) => isDynamicSegment(s)),
        });
        continue;
      }

      if (!entry.isDirectory()) continue;
      if (isExcludedDir(entry.name)) continue;

      if (isRouteGroup(entry.name)) {
        // Group contributes no URL segment but does contribute its layout.
        walk(abs, urlSegments, chain);
        continue;
      }

      if (isDynamicSegment(entry.name)) {
        if (config.dynamicRoutes === 'exclude') {
          warnings.push(
            `skipped dynamic route ${path.relative(repoRoot, abs)} (dynamicRoutes: 'exclude')`,
          );
          continue;
        }
        // 'template' mode: keep the literal Next pattern in the URL.
      }

      walk(abs, [...urlSegments, entry.name], chain);
    }
  }

  walk(appDir, [], []);

  const filtered = routes.filter((r) => !matchesAny(r.urlPath, config.exclude));

  // Deterministic order: root first, then lexicographic with numeric awareness
  // so /upgrades/2 sorts before /upgrades/10.
  filtered.sort((a, b) => {
    if (a.urlPath === '/') return -1;
    if (b.urlPath === '/') return 1;
    return a.urlPath.localeCompare(b.urlPath, 'en', { numeric: true });
  });

  const seen = new Set();
  const deduped = [];
  for (const route of filtered) {
    if (seen.has(route.urlPath)) {
      warnings.push(`duplicate route ${route.urlPath} (${route.filePath}) — keeping the first`);
      continue;
    }
    seen.add(route.urlPath);
    deduped.push(route);
  }

  return {
    routes: deduped,
    endpoints: [...new Set(endpoints)].sort((a, b) => a.localeCompare(b, 'en')),
    warnings,
  };
}

/**
 * Assign routes to configured sections, in config order. Anything unmatched
 * lands in a trailing "Other" bucket rather than being dropped silently.
 *
 * Within a section, routes are ordered by which `match` pattern they hit first.
 * That makes the order editorial rather than alphabetical: a section declaring
 * `['/', '/upgrades', '/upgrades/**', '/snapshots']` reads in that order, which
 * is how the site's own nav reads. Ties fall back to alphabetical so the result
 * stays deterministic.
 */
export function groupRoutes(routes, config) {
  const groups = config.sections.map((s) => ({ ...s, routes: [] }));
  const other = { id: 'other', title: 'Other', routes: [] };

  for (const route of routes) {
    const group = groups.find((g) => matchesAny(route.urlPath, g.match));
    (group ?? other).routes.push(route);
  }

  for (const group of groups) {
    const rank = (urlPath) => {
      const i = group.match.findIndex((p) => matchesAny(urlPath, [p]));
      return i === -1 ? group.match.length : i;
    };
    group.routes.sort((a, b) => {
      const diff = rank(a.urlPath) - rank(b.urlPath);
      return diff !== 0 ? diff : a.urlPath.localeCompare(b.urlPath, 'en', { numeric: true });
    });
  }

  const result = groups.filter((g) => g.routes.length > 0);
  if (other.routes.length > 0) result.push(other);
  return result;
}
