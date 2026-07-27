/**
 * Metadata extraction from Next.js source files, by text analysis only.
 *
 * WHY NOT JUST IMPORT THE MODULE?
 * Because it cannot work. Importing a `page.tsx` executes module scope:
 * `next/font/google` calls, `@/` path aliases, `import './globals.css'`,
 * `server-only`. All of those throw outside a real Next build.
 * `node --experimental-strip-types` solves the syntax problem and leaves the
 * resolution problem completely untouched. This is a dead end — please do not
 * relitigate it.
 *
 * So we read source as text and parse conservatively. The rule throughout:
 * when a value is not an unambiguous string literal, we do NOT guess. We record
 * it as unresolved and fall through to the next layer of precedence. A wrong
 * title is worse than a missing one, because a missing one is reported.
 */

import fs from 'node:fs';
import path from 'node:path';
import { humanize, collapseWhitespace } from './markdown.mjs';

/** Where a resolved value came from, in descending precedence. */
export const SOURCES = ['config', 'page', 'layout', 'fallback'];

/**
 * Scan forward from `start` (which must index an opening bracket) and return
 * the index of its matching close, or -1.
 *
 * Aware of: single/double/backtick strings, escapes, line comments, block
 * comments, and nested template-literal `${...}` expressions. Without this a
 * description like "use } carefully // ok" truncates the object mid-parse.
 */
export function findMatchingBracket(src, start) {
  const open = src[start];
  const close = { '{': '}', '[': ']', '(': ')' }[open];
  if (!close) return -1;

  let depth = 0;
  let i = start;
  // Stack of template-literal depths so nested `${ }` interpolation nests right.
  const templateStack = [];

  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];

    // Line comment
    if (ch === '/' && next === '/') {
      const nl = src.indexOf('\n', i);
      i = nl === -1 ? src.length : nl;
      continue;
    }
    // Block comment
    if (ch === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    // Quoted string
    if (ch === '"' || ch === "'") {
      i += 1;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === ch) break;
        if (src[i] === '\n') break; // unterminated; bail rather than run away
        i += 1;
      }
      i += 1;
      continue;
    }
    // Template literal
    if (ch === '`') {
      i += 1;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '`') break;
        if (src[i] === '$' && src[i + 1] === '{') {
          const inner = findMatchingBracket(src, i + 1);
          if (inner === -1) return -1;
          i = inner + 1;
          continue;
        }
        i += 1;
      }
      i += 1;
      continue;
    }

    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return -1;
}

/**
 * Find `export const <name> = { ... }` and return the raw object literal text.
 *
 * Tolerates `: Metadata`, `satisfies Metadata`, and `as const`. Returns
 * found:false when the initialiser is not a plain object literal (a call, an
 * identifier, a spread of something imported) — those are unresolvable by text
 * analysis and must fall through.
 */
export function extractExportedObject(src, name) {
  const declRe = new RegExp(`export\\s+const\\s+${name}\\b`, 'g');
  let match;
  while ((match = declRe.exec(src)) !== null) {
    let i = match.index + match[0].length;
    // Skip a type annotation up to the '='. Guard against '=>' and '=='.
    let eq = -1;
    while (i < src.length) {
      if (src[i] === '=' && src[i + 1] !== '=' && src[i + 1] !== '>') { eq = i; break; }
      if (src[i] === ';' || src[i] === '\n' && src.slice(match.index, i).includes(';')) break;
      i += 1;
    }
    if (eq === -1) continue;

    // Skip whitespace and comments between '=' and the value.
    let j = eq + 1;
    while (j < src.length) {
      if (/\s/.test(src[j])) { j += 1; continue; }
      if (src[j] === '/' && src[j + 1] === '/') {
        const nl = src.indexOf('\n', j);
        j = nl === -1 ? src.length : nl;
        continue;
      }
      if (src[j] === '/' && src[j + 1] === '*') {
        const end = src.indexOf('*/', j + 2);
        j = end === -1 ? src.length : end + 2;
        continue;
      }
      break;
    }

    if (src[j] !== '{') return { raw: '', found: false, reason: 'not-object-literal' };
    const end = findMatchingBracket(src, j);
    if (end === -1) return { raw: '', found: false, reason: 'unbalanced' };
    return { raw: src.slice(j, end + 1), found: true, reason: null };
  }
  return { raw: '', found: false, reason: 'not-declared' };
}

/** True if the file declares `export async function generateMetadata`. */
export function hasGenerateMetadata(src) {
  return /export\s+(async\s+)?function\s+generateMetadata\b/.test(src) ||
    /export\s+const\s+generateMetadata\b/.test(src);
}

/**
 * Read a string literal starting at `i`. Returns null for anything that is not
 * an unambiguous literal — identifiers, calls, concatenations, and template
 * literals containing `${}`.
 */
function readStringLiteral(src, i) {
  while (i < src.length && /\s/.test(src[i])) i += 1;
  const quote = src[i];
  if (quote !== '"' && quote !== "'" && quote !== '`') return null;

  let out = '';
  let j = i + 1;
  while (j < src.length) {
    const ch = src[j];
    if (ch === '\\') {
      const esc = src[j + 1];
      out += { n: '\n', t: '\t', r: '\r' }[esc] ?? esc;
      j += 2;
      continue;
    }
    if (ch === quote) {
      // A template literal with interpolation is not a static value.
      if (quote === '`' && /\$\{/.test(src.slice(i + 1, j))) return null;
      // Reject concatenation: `'a' + b` is not a literal.
      let k = j + 1;
      while (k < src.length && /\s/.test(src[k])) k += 1;
      if (src[k] === '+') return null;
      return { value: out, end: j };
    }
    if (quote !== '`' && ch === '\n') return null; // unterminated
    out += ch;
    j += 1;
  }
  return null;
}

/**
 * Extract `title` and `description` from a raw object-literal string.
 *
 * Only top-level keys are considered, so a `title` nested inside `openGraph`
 * does not shadow the real one. `title: { default, template }` resolves to
 * `default`, which is what Next itself renders for the page.
 */
export function parseMetadataObject(raw) {
  const result = { unresolved: [] };
  if (!raw) return result;

  const inner = raw.slice(1, -1);
  // Offsets of top-level keys only — walk the string tracking depth.
  let depth = 0;
  let i = 0;
  const topLevel = [];

  while (i < inner.length) {
    const ch = inner[i];
    if (ch === '/' && inner[i + 1] === '/') {
      const nl = inner.indexOf('\n', i);
      i = nl === -1 ? inner.length : nl;
      continue;
    }
    if (ch === '/' && inner[i + 1] === '*') {
      const end = inner.indexOf('*/', i + 2);
      i = end === -1 ? inner.length : end + 2;
      continue;
    }
    // Test for a top-level key BEFORE treating a quote as a string to skip
    // over — otherwise a quoted key like `'title': 'Q'` is consumed as a
    // string literal and the key is never seen. The backreference on the quote
    // group is what stops a VALUE such as `description: 'title: foo'` from
    // false-matching: it would need a closing quote before the colon.
    if (depth === 0) {
      const m = /^(['"`]?)(title|description)\1\s*:/.exec(inner.slice(i));
      if (m && (i === 0 || /[\s,{]/.test(inner[i - 1]))) {
        topLevel.push({ key: m[2], valueAt: i + m[0].length });
        i += m[0].length;
        continue;
      }
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      const lit = readStringLiteral(inner, i);
      if (lit) { i = lit.end + 1; continue; }
      // Unparseable literal — skip past the quote to avoid an infinite loop.
      i += 1;
      continue;
    }
    if (ch === '{' || ch === '[' || ch === '(') { depth += 1; i += 1; continue; }
    if (ch === '}' || ch === ']' || ch === ')') { depth -= 1; i += 1; continue; }

    i += 1;
  }

  for (const { key, valueAt } of topLevel) {
    if (key in result) continue; // first wins
    let v = valueAt;
    while (v < inner.length && /\s/.test(inner[v])) v += 1;

    // title: { default: '...', template: '...' }
    if (key === 'title' && inner[v] === '{') {
      const end = findMatchingBracket(inner, v);
      if (end === -1) { result.unresolved.push(key); continue; }
      const nested = inner.slice(v, end + 1);
      const dm = /(['"`]?)default\1\s*:/.exec(nested);
      if (!dm) { result.unresolved.push(key); continue; }
      const lit = readStringLiteral(nested, dm.index + dm[0].length);
      if (lit) result.title = collapseWhitespace(lit.value);
      else result.unresolved.push(key);
      continue;
    }

    const lit = readStringLiteral(inner, v);
    if (lit) result[key] = collapseWhitespace(lit.value);
    else result.unresolved.push(key);
  }

  return result;
}

function readFileSafe(abs) {
  try {
    return fs.readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Parse one source file for metadata, never throwing.
 * @returns {{title?, description?, unresolved: string[], warnings: string[]}}
 */
export function metadataFromFile(repoRoot, relPath) {
  const warnings = [];
  const src = readFileSafe(path.join(repoRoot, relPath));
  if (src === null) return { unresolved: [], warnings: [`could not read ${relPath}`] };

  try {
    const { raw, found, reason } = extractExportedObject(src, 'metadata');
    if (!found) {
      if (reason === 'unbalanced') warnings.push(`${relPath}: unbalanced braces in metadata, skipped`);
      else if (reason === 'not-object-literal') {
        warnings.push(`${relPath}: metadata is not an object literal, skipped`);
      }
      if (hasGenerateMetadata(src)) {
        warnings.push(`${relPath}: uses generateMetadata() — set this route in llms.config.mjs`);
      }
      return { unresolved: [], warnings };
    }
    const parsed = parseMetadataObject(raw);
    for (const key of parsed.unresolved) {
      warnings.push(`${relPath}: ${key} is not a static string literal, skipped`);
    }
    return { ...parsed, warnings };
  } catch (err) {
    // A parse bug must never take down the whole run.
    return { unresolved: [], warnings: [`${relPath}: parse failed (${err.message})`] };
  }
}

/**
 * Resolve a route's title and description through the precedence chain.
 *
 *   config override -> page.tsx metadata -> nearest ancestor layout -> humanize
 *
 * The layout step is what rescues `'use client'` pages, which cannot export
 * metadata at all. `title` and `description` resolve independently, so a page
 * that exports only a title still inherits a description from its layout.
 */
export function resolveRouteMetadata(repoRoot, route, config) {
  const warnings = [];
  const override = config.routes?.[route.urlPath] ?? {};
  const resolved = { title: undefined, description: undefined };
  const sources = { title: null, description: null };

  const take = (values, source) => {
    for (const key of ['title', 'description']) {
      if (resolved[key] === undefined && typeof values[key] === 'string' && values[key]) {
        resolved[key] = values[key];
        sources[key] = source;
      }
    }
  };

  take(override, 'config');

  if (resolved.title === undefined || resolved.description === undefined) {
    const fromPage = metadataFromFile(repoRoot, route.filePath);
    warnings.push(...fromPage.warnings);
    take(fromPage, 'page');
  }

  // Nearest ancestor first: layoutChain is root-first, so walk it backwards.
  for (let i = route.layoutChain.length - 1; i >= 0; i -= 1) {
    if (resolved.title !== undefined && resolved.description !== undefined) break;
    const fromLayout = metadataFromFile(repoRoot, route.layoutChain[i]);
    // Layout warnings are noisy and repeat per route; only surface read failures.
    warnings.push(...fromLayout.warnings.filter((w) => w.includes('could not read')));
    take(fromLayout, 'layout');
  }

  if (resolved.title === undefined) {
    const last = route.segments[route.segments.length - 1];
    resolved.title = route.urlPath === '/' ? config.site.title : humanize(last);
    sources.title = 'fallback';
    warnings.push(`${route.urlPath}: no title found, using "${resolved.title}"`);
  }
  if (resolved.description === undefined) {
    resolved.description = '';
    sources.description = 'fallback';
    warnings.push(`${route.urlPath}: no description found`);
  }

  if (resolved.description.length > config.maxDescriptionChars) {
    warnings.push(
      `${route.urlPath}: description is ${resolved.description.length} chars (max ${config.maxDescriptionChars})`,
    );
  }

  // The route's overall source is its weakest link — that is what --check gates on.
  const rank = (s) => SOURCES.indexOf(s);
  const source = rank(sources.title) >= rank(sources.description) ? sources.title : sources.description;

  return { ...resolved, source, sources, warnings };
}
