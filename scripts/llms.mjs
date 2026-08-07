#!/usr/bin/env node
/**
 * Generate public/llms.txt and public/llms-full.txt from a Next.js App Router
 * route tree.
 *
 *   node scripts/llms.mjs                    write both files
 *   node scripts/llms.mjs --check            write nothing, exit 1 if stale
 *   node scripts/llms.mjs --status           write nothing, always exit 0
 *   node scripts/llms.mjs --bootstrap-config scrape the live site, print config
 *
 * Zero dependencies. Node 20+.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  findRepoRoot, parseArgs, buildContext, writeIfChanged, wouldChange,
  reportCheck, reportStatus,
} from './lib/build.mjs';
import {
  bullet, section, joinBlocks, blockquote, absoluteUrl, extractExtras,
  extrasRegion, autogenRegion, collapseWhitespace, formatBytes, normalizeOutput,
} from './lib/markdown.mjs';
import { validateLlmsTxt } from './lib/validate.mjs';
import { driftComment } from './lib/sitemap.mjs';
import { bootstrapConfig } from './lib/net.mjs';

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * The freshness paragraph. This is one of the highest-value things in the file:
 * it tells an agent which answers go stale and must be re-fetched, rather than
 * letting it cache a snapshot block height for the rest of a session.
 */
function renderFreshness(config) {
  const entries = Object.entries(config.freshness ?? {});
  if (entries.length === 0) return null;

  const byCadence = new Map();
  for (const [route, cadence] of entries) {
    if (!byCadence.has(cadence)) byCadence.set(cadence, []);
    byCadence.get(cadence).push(route);
  }

  const parts = [...byCadence.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'en'))
    .map(([cadence, routes]) => {
      const list = routes.sort();
      const verb = list.length === 1 ? 'changes' : 'change';
      return `${list.join(' and ')} ${verb} ${cadence}`;
    });

  const ephemeral = (config.networks ?? []).filter((n) => n.ephemeral);
  const tail = ephemeral.length
    ? ` ${ephemeral.map((n) => n.name.replace(/\s*\(.*\)$/, '')).join(' and ')} is ephemeral — never treat an address, balance, block height, or chain ID from it as durable.`
    : '';

  return `Freshness: ${parts.join('. ')}. Re-fetch these within a session rather than reusing an earlier response.${tail}`;
}

function renderRouteSections(groups, config) {
  return groups
    .map((group) =>
      section(
        group.title,
        group.routes.map((page) =>
          bullet(page.title, absoluteUrl(config.origin, page.urlPath), page.description),
        ),
      ),
    )
    .filter(Boolean);
}

/**
 * Machine-readable endpoints. Pointing an agent at JSON it can parse beats any
 * amount of prose describing the same data in HTML.
 */
function renderEndpoints(config) {
  if (!config.endpoints?.length) return null;
  return section(
    'Machine-readable endpoints',
    config.endpoints.map((e) =>
      bullet(e.title, absoluteUrl(config.origin, e.url), e.description),
    ),
  );
}

function renderNetworkReference(config) {
  if (!config.networks?.length) return null;
  const lines = config.networks.map((net) => {
    const url = net.guide ?? net.explorer;
    if (net.ephemeral) return bullet(net.name, url, net.note);
    const title = `${net.name} — chain ID ${net.chainId}`;
    return bullet(title, url, `RPC ${net.rpc}, explorer ${net.explorer}.`);
  });

  const faucets = config.networks.filter((n) => n.faucet && !n.ephemeral);
  for (const net of faucets) {
    lines.push(bullet(`${net.name} faucets`, net.faucet, `Testnet funds for ${net.name}.`));
  }

  return section('Network reference', lines);
}

/**
 * The Optional section. Per the spec these URLs may be skipped when a shorter
 * context is needed, which makes it the right home for cross-links to the wider
 * Base agent surface — they compose with this file rather than duplicating it.
 */
function renderOptional(config, { includeFull = true } = {}) {
  const r = config.related ?? {};
  const lines = [];
  if (r.docsLlms) lines.push(bullet('Base documentation index', r.docsLlms, 'Every Base documentation page with titles and summaries. Go here for implementation detail.'));
  if (r.docsLlmsFull) lines.push(bullet('Base documentation full context', r.docsLlmsFull, 'Full static documentation bundle for long-context runs.'));
  if (r.docsAgents) lines.push(bullet('Base docs AGENTS.md', r.docsAgents, 'Compact directory-grouped index of Base documentation.'));
  if (r.docsMcp) lines.push(bullet('Base docs MCP', r.docsMcp, 'Model Context Protocol endpoint for querying Base documentation directly.'));
  if (r.websiteAgents) lines.push(bullet('Base website AGENTS.md', r.websiteAgents, 'Product, ecosystem, and use-case routing for base.org.'));
  lines.push(bullet(`${config.site.title} routing rules`, absoluteUrl(config.origin, '/AGENTS.md'), 'Full agent routing document for this site, including freshness and volatility guidance.'));
  if (includeFull) {
    lines.push(bullet('Full context', absoluteUrl(config.origin, '/llms-full.txt'), 'This index plus hand-written network and freshness guides.'));
  }
  return section('Optional', lines);
}

/** Build llms.txt. */
export function renderLlmsTxt(ctx) {
  const { config, groups } = ctx;
  const intro = (config.intro ?? []).map(collapseWhitespace).filter(Boolean);

  return joinBlocks([
    `# ${config.site.title}`,
    blockquote(config.site.summary),
    ...intro,
    renderFreshness(config),
    ...renderRouteSections(groups, config),
    renderEndpoints(config),
    renderNetworkReference(config),
    renderOptional(config),
  ]);
}

/**
 * Build llms-full.txt.
 *
 * The hand-written EXTRAS region is read back off disk and re-emitted verbatim.
 * Anything else would mean the hook silently destroys someone's prose on the
 * next commit that happens to mention llms.txt.
 */
export function renderLlmsFullTxt(ctx, existing) {
  const { config, groups } = ctx;
  const extras = extractExtras(existing);

  const annotated = groups.map((group) => ({
    ...group,
    routes: group.routes.map((page) => {
      const cadence = config.freshness?.[page.urlPath];
      const description = cadence
        ? `${page.description} (changes ${cadence}; re-fetch before relying on it)`
        : page.description;
      return { ...page, description };
    }),
  }));

  const autogen = [
    ...renderRouteSections(annotated, config),
    renderEndpoints(config),
    renderNetworkReference(config),
    renderOptional(config, { includeFull: false }),
  ]
    .filter(Boolean)
    .join('\n\n');

  return joinBlocks([
    `# ${config.site.fullTitle}`,
    blockquote(config.site.fullSummary),
    extrasRegion(extras),
    autogenRegion(autogen),
    driftComment(ctx.drift),
  ]);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = args.root ? path.resolve(args.root) : findRepoRoot(process.cwd());

  if (args['bootstrap-config']) {
    const ctx = await buildContext(repoRoot);
    process.stdout.write(await bootstrapConfig(ctx));
    return 0;
  }

  const ctx = await buildContext(repoRoot);
  const llmsPath = path.join(repoRoot, ctx.config.outputs.llms);
  const fullPath = path.join(repoRoot, ctx.config.outputs.llmsFull);

  const llmsText = renderLlmsTxt(ctx);
  const existingFull = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : null;
  const fullText = renderLlmsFullTxt(ctx, existingFull);

  const validation = validateLlmsTxt(normalizeOutput(llmsText), {
    originHost: ctx.config.originHost,
    allowedHosts: ctx.config.allowedHosts,
    maxDescriptionChars: ctx.config.maxDescriptionChars,
    expectedPaths: ctx.pages.map((p) => p.urlPath),
    routeSectionTitles: ctx.groups.map((g) => g.title),
    allowDynamic: ctx.config.dynamicRoutes === 'template',
  });

  if (args.status) {
    return reportStatus('llms', ctx, [ctx.config.outputs.llms, ctx.config.outputs.llmsFull]);
  }

  if (args.check) {
    return reportCheck('llms', ctx, [
      { file: ctx.config.outputs.llms, check: wouldChange(llmsPath, llmsText), validation },
      { file: ctx.config.outputs.llmsFull, check: wouldChange(fullPath, fullText), validation: null },
    ]);
  }

  // Refuse to write output that does not satisfy the spec. Shipping a broken
  // llms.txt is worse than shipping none — agents will parse it anyway.
  if (!validation.ok) {
    process.stderr.write(`llms.txt failed validation, nothing written:\n`);
    for (const err of validation.errors) process.stderr.write(`  ${err}\n`);
    return 1;
  }

  const a = writeIfChanged(llmsPath, llmsText);
  const b = writeIfChanged(fullPath, fullText);

  const rel = path.relative(repoRoot, llmsPath);
  const relFull = path.relative(repoRoot, fullPath);
  process.stdout.write(
    `${rel}       ${formatBytes(a.bytes).padStart(8)}  ${a.changed ? 'updated' : 'unchanged'}\n` +
    `${relFull}  ${formatBytes(b.bytes).padStart(8)}  ${b.changed ? 'updated' : 'unchanged'}\n` +
    `${ctx.pages.length} routes, ${validation.stats.links} links\n`,
  );

  for (const warning of ctx.warnings) process.stderr.write(`  warning: ${warning}\n`);
  if (a.changed || b.changed) {
    process.stdout.write(`Review changes with: git diff ${rel} ${relFull}\n`);
  }
  return 0;
}

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
  main()
    .then((code) => { process.exitCode = code; })
    .catch((err) => {
      process.stderr.write(`llms.mjs: ${err.message}\n`);
      process.exitCode = 1;
    });
}
