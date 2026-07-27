/**
 * Small pure string helpers shared by both generators.
 *
 * No I/O, no dependencies. Everything here must be deterministic — the
 * determinism tests compare two runs byte-for-byte.
 */

/**
 * Acronyms that should keep their capitalisation when a URL segment is turned
 * into a human title. Ported from base/docs scripts/lib/docs-utils.js and
 * extended for a chain/tooling site.
 */
export const ACRONYMS = new Set([
  'AI', 'API', 'SDK', 'MCP', 'RPC', 'EVM', 'NFT', 'DAO', 'P2P',
  'L1', 'L2', 'ETH', 'USDC', 'EIP', 'ERC', 'BCP', 'JSON', 'HTTP', 'HTTPS',
  'CLI', 'UI', 'FAQ', 'TVL', 'VM',
]);

/**
 * Turn a URL segment into a display title.
 *
 *   'network-fees'  -> 'Network Fees'
 *   'rpc-overview'  -> 'RPC Overview'
 *   '01-quickstart' -> 'Quickstart'
 *   'eip-8130'      -> 'EIP 8130'
 */
export function humanize(segment) {
  if (!segment) return '';
  return String(segment)
    .replace(/^\d+-/, '') // strip ordering prefix
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => {
      const upper = word.toUpperCase();
      if (ACRONYMS.has(upper)) return upper;
      // Leave things like '8130' or 'v2' alone rather than title-casing digits.
      if (/^\d+$/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/** Collapse all whitespace (including newlines) to single spaces and trim. */
export function collapseWhitespace(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Render one llms.txt list item.
 *
 * Per llmstxt.org the description is optional, so we omit the `: ` entirely
 * rather than emitting a dangling colon.
 */
export function bullet(title, url, description) {
  const desc = collapseWhitespace(description);
  const base = `- [${collapseWhitespace(title)}](${url})`;
  return desc ? `${base}: ${desc}` : base;
}

/** Render an `## Section` followed by its bullets. */
export function section(title, lines) {
  if (!lines || lines.length === 0) return null;
  return [`## ${title}`, ...lines].join('\n');
}

/**
 * Join top-level blocks with exactly one blank line between them and exactly
 * one trailing newline. Nulls are dropped so callers can conditionally build
 * sections without filtering at every call site.
 */
export function joinBlocks(blocks) {
  return `${blocks.filter(Boolean).join('\n\n')}\n`;
}

/**
 * Wrap prose as a markdown blockquote. llmstxt.org wants the summary as a
 * blockquote immediately after the H1; multi-line quotes need `> ` on every
 * line or the second line reads as a new paragraph.
 */
export function blockquote(text, width = 88) {
  const words = collapseWhitespace(text).split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    // width - 2 leaves room for the '> ' prefix.
    if (current && `${current} ${word}`.length > width - 2) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines.map((line) => `> ${line}`).join('\n');
}

// ---------------------------------------------------------------------------
// Marker regions
//
// llms-full.txt interleaves hand-written guides with a generated index. The
// hand-written region must survive regeneration byte-for-byte, otherwise the
// hook silently destroys someone's work on the next commit.
// ---------------------------------------------------------------------------

export const EXTRAS_START = '<!-- LLMS_EXTRAS_START -->';
export const EXTRAS_END = '<!-- LLMS_EXTRAS_END -->';
export const AUTOGEN_START = '<!-- LLMS_AUTOGEN_START -->';
export const AUTOGEN_END = '<!-- LLMS_AUTOGEN_END -->';

export const EXTRAS_PLACEHOLDER =
  '<!-- Add hand-written cross-cutting guides here. This region is preserved on regeneration. -->';

/**
 * Pull the hand-written region out of an existing llms-full.txt.
 *
 * Three cases, in order:
 *   1. Markers present  -> return exactly what is between them.
 *   2. No markers, but the file exists -> first-run migration. Everything after
 *      the opening blockquote (and before any autogen marker) is assumed to be
 *      hand-written and is preserved. This is what stops `install.sh` on a repo
 *      with a pre-existing hand-edited file from nuking it.
 *   3. No file -> the placeholder.
 *
 * @param {string|null} existing raw contents of llms-full.txt, or null
 * @returns {string}
 */
export function extractExtras(existing) {
  if (!existing) return EXTRAS_PLACEHOLDER;

  const startIdx = existing.indexOf(EXTRAS_START);
  const endIdx = existing.indexOf(EXTRAS_END);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return existing.slice(startIdx + EXTRAS_START.length, endIdx).trim() || EXTRAS_PLACEHOLDER;
  }

  // First-run migration.
  const lines = existing.split('\n');
  let cursor = 0;
  // Skip the H1 and any blank lines before the blockquote.
  while (cursor < lines.length && !lines[cursor].startsWith('>')) cursor += 1;
  // Skip the blockquote itself.
  while (cursor < lines.length && lines[cursor].startsWith('>')) cursor += 1;

  const rest = lines.slice(cursor);
  const autogenIdx = rest.findIndex((line) => line.includes(AUTOGEN_START));
  const migrated = (autogenIdx === -1 ? rest : rest.slice(0, autogenIdx)).join('\n').trim();

  return migrated || EXTRAS_PLACEHOLDER;
}

/** Wrap content in the extras markers. */
export function extrasRegion(content) {
  return [EXTRAS_START, '', content, '', EXTRAS_END].join('\n');
}

/** Wrap content in the autogen markers. */
export function autogenRegion(content) {
  return [AUTOGEN_START, '', content, '', AUTOGEN_END].join('\n');
}

/**
 * Normalise generated output before it is written or compared.
 *
 * Strips trailing whitespace per line, normalises CRLF, and guarantees exactly
 * one final newline. Both the determinism test and the hook's "did anything
 * change" check depend on this being applied uniformly.
 */
export function normalizeOutput(text) {
  return `${text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '')}\n`;
}

/** Absolute URL from an origin and a route path. */
export function absoluteUrl(origin, urlPath) {
  const base = String(origin).replace(/\/+$/, '');
  if (!urlPath || urlPath === '/') return `${base}/`;
  return `${base}/${String(urlPath).replace(/^\/+/, '')}`;
}

/** Human-readable byte size, stable across platforms (no locale formatting). */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
