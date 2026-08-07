/**
 * Sitemap cross-check.
 *
 * The sitemap and the generated index are two answers to the same question. If
 * they disagree, something is wrong and a human should look — a route missing
 * from the sitemap is an SEO bug, and a sitemap URL with no page file is
 * usually a dynamic route we correctly skipped. We report drift; we never
 * silently reconcile.
 */

import fs from 'node:fs';
import path from 'node:path';
import { findMatchingBracket } from './metadata.mjs';

/** Strip the origin and any trailing slash so '/x/' and '/x' compare equal. */
export function normalizePath(urlOrPath, origin) {
  let p = String(urlOrPath).trim();
  if (p.startsWith(origin)) p = p.slice(origin.length);
  else if (/^https?:\/\//.test(p)) {
    try { p = new URL(p).pathname; } catch { /* leave as-is */ }
  }
  if (!p.startsWith('/')) p = `/${p}`;
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p || '/';
}

/** Pull <loc> values out of a sitemap.xml. */
export function parseSitemapXml(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => m[1]);
}

/**
 * Statically extract `url:` string literals from an app/sitemap.ts.
 *
 * Deliberately shallow — a sitemap built from a database or a fetch yields
 * nothing, and that is fine. Returning nothing means "no cross-check
 * available", which we report as such rather than as zero drift.
 */
export function parseSitemapSource(src) {
  const urls = [];
  for (const m of src.matchAll(/\burl\s*:\s*(['"`])([^'"`\n]+)\1/g)) {
    urls.push(m[2]);
  }

  // Also catch `${origin}/path` and `` `${BASE}/upgrades` `` forms, which are
  // common enough that ignoring them would produce phantom drift. A tail that
  // still contains an interpolation (e.g. `${BASE}${path}`, where the path is
  // assembled at runtime) is NOT a statically-knowable URL — dropping it avoids
  // recording the raw `${...}` expression as a phantom route.
  for (const m of src.matchAll(/\burl\s*:\s*`\$\{[^}]+\}([^`]*)`/g)) {
    const tail = m[1] || '/';
    if (!tail.includes('${')) urls.push(tail);
  }

  // Fallback: a sitemap that maps an array of `{ path: '/x' }` records onto an
  // origin (so the `url:` is fully computed at runtime) still exposes its routes
  // as `path:` string literals. Only consult these when no usable `url:` was
  // found, and require a leading slash so unrelated string keys don't leak in.
  if (urls.length === 0) {
    for (const m of src.matchAll(/\bpath\s*:\s*(['"])(\/[^'"\n]*)\1/g)) {
      urls.push(m[2]);
    }
  }

  return urls;
}

/**
 * Locate and read the sitemap, preferring the static file.
 * @returns {{urls: string[]|null, source: string|null}} urls null = unavailable
 */
export function readSitemap(repoRoot, config) {
  const staticPath = path.join(repoRoot, config.outDir, 'sitemap.xml');
  if (fs.existsSync(staticPath)) {
    const urls = parseSitemapXml(fs.readFileSync(staticPath, 'utf8'));
    return { urls, source: path.relative(repoRoot, staticPath) };
  }

  for (const ext of ['ts', 'js', 'mjs', 'tsx']) {
    const srcPath = path.join(repoRoot, config.appDir, `sitemap.${ext}`);
    if (!fs.existsSync(srcPath)) continue;
    const urls = parseSitemapSource(fs.readFileSync(srcPath, 'utf8'));
    if (urls.length === 0) {
      // Present but not statically readable — say so instead of claiming clean.
      return { urls: null, source: path.relative(repoRoot, srcPath) };
    }
    return { urls, source: path.relative(repoRoot, srcPath) };
  }

  return { urls: null, source: null };
}

/**
 * Compare discovered routes against sitemap URLs.
 * @returns {{onlyInApp: string[], onlyInSitemap: string[], checked: boolean}}
 */
export function diffRoutes(routes, sitemapUrls, origin) {
  if (!sitemapUrls) return { onlyInApp: [], onlyInSitemap: [], checked: false };

  const appSet = new Set(routes.map((r) => normalizePath(r.urlPath, origin)));
  const mapSet = new Set(sitemapUrls.map((u) => normalizePath(u, origin)));

  return {
    onlyInApp: [...appSet].filter((p) => !mapSet.has(p)).sort(),
    onlyInSitemap: [...mapSet].filter((p) => !appSet.has(p)).sort(),
    checked: true,
  };
}

export function hasDrift(drift) {
  return drift.checked && (drift.onlyInApp.length > 0 || drift.onlyInSitemap.length > 0);
}

/** One-line-per-item human report, or null when clean. */
export function formatDrift(drift, sitemapSource) {
  if (!drift.checked) {
    return sitemapSource
      ? `sitemap ${sitemapSource} found but URLs are computed at runtime — no cross-check performed`
      : 'no sitemap found — no cross-check performed';
  }
  if (!hasDrift(drift)) return null;
  const lines = [];
  for (const p of drift.onlyInApp) lines.push(`  ${p} — in app/, missing from sitemap`);
  for (const p of drift.onlyInSitemap) lines.push(`  ${p} — in sitemap, no page file found`);
  return lines.join('\n');
}

/** Machine-readable footer comment for llms-full.txt so drift shows in diffs. */
export function driftComment(drift) {
  if (!drift.checked) return '<!-- drift: not checked (no static sitemap) -->';
  return `<!-- drift: ${drift.onlyInApp.length} only-in-app, ${drift.onlyInSitemap.length} only-in-sitemap -->`;
}

// Re-exported so callers get the bracket matcher without importing metadata.mjs
// just for it.
export { findMatchingBracket };
