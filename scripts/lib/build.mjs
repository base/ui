/**
 * Shared pipeline for both generators: locate the repo, load config, discover
 * routes, resolve metadata, cross-check the sitemap.
 *
 * Both llms.mjs and agents.mjs describe the same site, so they must see the
 * same route set. Sharing this stage is what guarantees that.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, assertNoRouteCollision } from './config.mjs';
import { discoverRoutes, groupRoutes } from './routes.mjs';
import { resolveRouteMetadata, SOURCES } from './metadata.mjs';
import { readSitemap, diffRoutes, hasDrift, formatDrift } from './sitemap.mjs';
import { normalizeOutput, formatBytes } from './markdown.mjs';

/**
 * Walk up from the scripts directory looking for a repo marker.
 *
 * Deliberately does not shell out to `git rev-parse` — the generators must run
 * in a plain directory (the test fixtures do exactly that) and must not require
 * git to be installed.
 */
export function findRepoRoot(startDir) {
  let dir = startDir ?? path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const root = path.parse(dir).root;
  while (dir !== root) {
    for (const marker of ['.git', 'package.json', 'llms.config.mjs']) {
      if (fs.existsSync(path.join(dir, marker))) return dir;
    }
    dir = path.dirname(dir);
  }
  return startDir ?? process.cwd();
}

/** Flags that consume the following argv entry when written `--key value`. */
const VALUE_FLAGS = new Set(['root', 'out']);

/** Parse `--flag`, `--key=value`, and `--key value` argv into an object. */
export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw.startsWith('--')) { args._.push(raw); continue; }
    const eq = raw.indexOf('=');
    if (eq !== -1) {
      args[raw.slice(2, eq)] = raw.slice(eq + 1);
      continue;
    }
    const key = raw.slice(2);
    const next = argv[i + 1];
    if (VALUE_FLAGS.has(key) && next !== undefined && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

/**
 * Run everything up to (but not including) rendering.
 * @returns {Promise<Context>}
 */
export async function buildContext(repoRoot) {
  const { config, configPath, warnings: configWarnings } = await loadConfig(repoRoot);
  assertNoRouteCollision(repoRoot, config);

  const { routes, endpoints: endpointPaths, warnings: routeWarnings } = discoverRoutes(repoRoot, config);
  if (routes.length === 0) {
    throw new Error(
      `No page files found under ${config.appDir}. Is appDir correct in llms.config.mjs?`,
    );
  }

  const metaWarnings = [];
  const pages = routes.map((route) => {
    const meta = resolveRouteMetadata(repoRoot, route, config);
    metaWarnings.push(...meta.warnings);
    return { ...route, ...meta };
  });

  const { urls: sitemapUrls, source: sitemapSource } = readSitemap(repoRoot, config);
  const drift = diffRoutes(routes, sitemapUrls, config.origin);

  const sourceCounts = Object.fromEntries(SOURCES.map((s) => [s, 0]));
  for (const page of pages) sourceCounts[page.source] += 1;

  // Drop freshness entries for paths that no longer exist. Without this, a
  // deleted route keeps being advertised as "changes daily" — telling an agent
  // to re-fetch a 404 is worse than saying nothing about it.
  const known = new Set([
    ...pages.map((p) => p.urlPath),
    ...(config.endpoints ?? []).map((e) => e.url),
    ...endpointPaths,
  ]);
  const freshness = {};
  for (const [urlPath, cadence] of Object.entries(config.freshness ?? {})) {
    if (known.has(urlPath)) freshness[urlPath] = cadence;
    else metaWarnings.push(`freshness entry ${urlPath} matches no route or endpoint; dropped`);
  }
  config.freshness = freshness;

  return {
    repoRoot,
    config,
    configPath,
    pages,
    groups: groupRoutes(pages, config),
    endpointPaths,
    drift,
    sitemapSource,
    sourceCounts,
    warnings: [...configWarnings, ...routeWarnings, ...metaWarnings],
  };
}

/**
 * Write a file only when its contents would change.
 *
 * Returning `changed` lets the hook skip an empty commit, and lets `--check`
 * report staleness without writing. Content is normalised first so a stray
 * trailing newline never registers as a change.
 */
export function writeIfChanged(absPath, contents) {
  const normalized = normalizeOutput(contents);
  const existed = fs.existsSync(absPath);
  const previous = existed ? fs.readFileSync(absPath, 'utf8') : null;
  const changed = previous !== normalized;
  if (changed) {
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, normalized, 'utf8');
  }
  return { changed, existed, bytes: Buffer.byteLength(normalized) };
}

/** Compare without writing — the `--check` path. */
export function wouldChange(absPath, contents) {
  const normalized = normalizeOutput(contents);
  if (!fs.existsSync(absPath)) return { stale: true, reason: 'missing' };
  const previous = fs.readFileSync(absPath, 'utf8');
  if (previous === normalized) return { stale: false, reason: 'current' };

  const a = previous.split('\n');
  const b = normalized.split('\n');
  let diff = Math.abs(a.length - b.length);
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) if (a[i] !== b[i]) diff += 1;
  return { stale: true, reason: `${diff} line${diff === 1 ? '' : 's'} would change` };
}

const GREEN = '[32m';
const RED = '[31m';
const DIM = '[2m';
const RESET = '[0m';
const color = (c, s) => (process.stdout.isTTY ? `${c}${s}${RESET}` : s);

/** Shared `--check` reporter. Returns the process exit code. */
export function reportCheck(label, ctx, results) {
  const lines = [`${label} check`, ''];
  const { sourceCounts } = ctx;
  lines.push(`  routes discovered      ${ctx.pages.length}`);
  lines.push(`  metadata from config   ${sourceCounts.config}`);
  lines.push(`  metadata from page     ${sourceCounts.page}`);
  lines.push(`  metadata from layout   ${sourceCounts.layout}`);
  lines.push(`  metadata fallback      ${sourceCounts.fallback}`);
  lines.push('');

  let failed = sourceCounts.fallback > 0;

  for (const { file, check, validation } of results) {
    if (check.stale) {
      failed = true;
      lines.push(`  ${color(RED, 'FAIL')} ${file.padEnd(22)} ${check.reason}`);
    } else {
      lines.push(`  ${color(GREEN, 'ok')}   ${file.padEnd(22)} current`);
    }
    if (validation && !validation.ok) {
      failed = true;
      for (const err of validation.errors) lines.push(`       ${color(RED, '·')} ${err}`);
    }
    // Warnings never fail the check — they are quality nudges, not defects.
    for (const warn of validation?.warnings ?? []) {
      lines.push(`       ${color(DIM, '·')} ${warn}`);
    }
  }

  if (hasDrift(ctx.drift)) {
    failed = true;
    lines.push(`  ${color(RED, 'FAIL')} sitemap drift`);
    lines.push(formatDrift(ctx.drift, ctx.sitemapSource));
  }

  if (sourceCounts.fallback > 0) {
    lines.push('');
    lines.push(`  ${sourceCounts.fallback} route(s) fell back to a humanized slug.`);
    lines.push('  Add `export const metadata` to those pages, or set them in llms.config.mjs.');
    lines.push('  To bootstrap from the live site: node scripts/llms.mjs --bootstrap-config');
  }

  lines.push('');
  lines.push(failed ? `  Run: npm run ${label}` : `  ${color(GREEN, 'All current.')}`);
  lines.push('');
  process.stdout.write(lines.join('\n'));
  return failed ? 1 : 0;
}

/** Shared `--status` reporter. Always exit 0. */
export function reportStatus(label, ctx, files) {
  const lines = [`${label} status`, ''];
  for (const file of files) {
    const abs = path.join(ctx.repoRoot, file);
    if (!fs.existsSync(abs)) {
      lines.push(`  ${file.padEnd(24)} ${color(DIM, 'not generated yet')}`);
      continue;
    }
    const stat = fs.statSync(abs);
    const when = stat.mtime.toISOString().slice(0, 16).replace('T', ' ');
    lines.push(`  ${file.padEnd(24)} ${formatBytes(stat.size).padStart(8)}   modified ${when}`);
  }
  lines.push('');
  lines.push(`  origin   ${ctx.config.origin}`);
  lines.push(`  appDir   ${ctx.config.appDir}`);
  lines.push(`  config   ${ctx.configPath ? path.relative(ctx.repoRoot, ctx.configPath) : 'none (using defaults)'}`);
  lines.push(`  routes   ${ctx.pages.length}`);
  lines.push(`  sitemap  ${ctx.sitemapSource ?? 'none'}`);

  const drift = formatDrift(ctx.drift, ctx.sitemapSource);
  if (drift) {
    lines.push('');
    lines.push('  drift:');
    lines.push(drift);
  }

  if (ctx.warnings.length > 0) {
    lines.push('');
    lines.push(`  ${ctx.warnings.length} warning(s):`);
    for (const w of ctx.warnings.slice(0, 12)) lines.push(`    ${w}`);
    if (ctx.warnings.length > 12) lines.push(`    ... and ${ctx.warnings.length - 12} more`);
  }

  lines.push('');
  process.stdout.write(lines.join('\n'));
  return 0;
}

export { hasDrift, formatDrift };
