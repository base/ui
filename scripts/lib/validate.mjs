/**
 * llms.txt grammar validation, per https://llmstxt.org/
 *
 * This module is shared by the CLI `--check` and by the test suite on purpose:
 * there is exactly one definition of "valid", so what gates CI is the same code
 * an engineer runs locally.
 *
 * Spec, in order:
 *   1. H1 title (the only required element)
 *   2. blockquote summary
 *   3. zero or more markdown blocks, no headings
 *   4. zero or more H2 sections of `- [name](url): notes`
 *   5. `## Optional`, if present, means "safe to skip for shorter context"
 */

const BULLET_RE = /^- \[([^\]]+)\]\((https:\/\/[^)\s]+)\)(?:: (.+))?$/;

/**
 * @param {string} text
 * @param {object} opts
 * @param {string} opts.originHost
 * @param {string[]} [opts.allowedHosts]
 * @param {number} [opts.maxDescriptionChars]
 * @param {string[]} [opts.expectedPaths] every path that must appear exactly once
 * @param {string[]} [opts.routeSectionTitles] H2s whose bullets are route listings.
 *   Uniqueness is scoped to these sections only — a route may legitimately be
 *   cross-referenced again under "Network reference" or "Optional", and treating
 *   that as a duplicate would forbid exactly the cross-linking we want.
 * @param {boolean} [opts.allowDynamic] permit `[...]` segments in URLs
 * @returns {{ok: boolean, errors: string[], warnings: string[], stats: object}}
 */
export function validateLlmsTxt(text, opts = {}) {
  const errors = [];
  const warnings = [];
  const {
    originHost,
    allowedHosts = [],
    maxDescriptionChars = 400,
    expectedPaths = null,
    routeSectionTitles = null,
    allowDynamic = false,
  } = opts;

  const lines = text.split('\n');

  // --- structure -----------------------------------------------------------
  if (!/^# \S.*/.test(lines[0] ?? '')) {
    errors.push('line 1 must be an H1 title (`# Something`)');
  }

  let i = 1;
  while (i < lines.length && lines[i].trim() === '') i += 1;
  if (!/^> \S/.test(lines[i] ?? '')) {
    errors.push('the H1 must be followed by a blockquote summary (`> ...`)');
  }

  const h1s = lines.filter((l) => /^# /.test(l));
  if (h1s.length > 1) errors.push(`expected exactly 1 H1, found ${h1s.length}`);

  const deepHeadings = lines
    .map((l, n) => ({ l, n }))
    .filter(({ l }) => /^#{3,} /.test(l));
  for (const { l, n } of deepHeadings) {
    errors.push(`line ${n + 1}: llms.txt allows only H1 and H2 headings, found "${l.trim()}"`);
  }

  const h2s = lines
    .map((l, n) => ({ title: l.replace(/^## /, '').trim(), n, isH2: /^## /.test(l) }))
    .filter((x) => x.isH2);

  const optionalIdx = h2s.findIndex((h) => h.title.toLowerCase() === 'optional');
  if (optionalIdx !== -1 && optionalIdx !== h2s.length - 1) {
    errors.push('`## Optional` must be the last H2 section');
  }

  // --- bullets -------------------------------------------------------------
  const urls = [];
  const paths = [];
  const titledLinks = [];
  let currentH2 = null;
  lines.forEach((line, n) => {
    if (/^## /.test(line)) currentH2 = line.replace(/^## /, '').trim();
    if (!line.startsWith('- ')) return;
    const m = BULLET_RE.exec(line);
    if (!m) {
      errors.push(`line ${n + 1}: malformed list item, expected "- [Title](https://url): description"\n    ${line}`);
      return;
    }
    const [, title, url, description] = m;

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      errors.push(`line ${n + 1}: unparseable URL ${url}`);
      return;
    }
    if (parsed.protocol !== 'https:') {
      errors.push(`line ${n + 1}: URL must be https, got ${parsed.protocol}//`);
    }
    if (originHost && parsed.host !== originHost && !allowedHosts.includes(parsed.host)) {
      errors.push(`line ${n + 1}: host ${parsed.host} is neither the origin (${originHost}) nor allowlisted`);
    }
    if (!allowDynamic && /[[\]]/.test(parsed.pathname)) {
      errors.push(`line ${n + 1}: dynamic segment leaked into output: ${parsed.pathname}`);
    }
    if (title.includes('[') || title.includes(']')) {
      errors.push(`line ${n + 1}: brackets in link title would break markdown: ${title}`);
    }
    if (!description) {
      warnings.push(`line ${n + 1}: no description for "${title}"`);
    } else if (description.length > maxDescriptionChars) {
      errors.push(`line ${n + 1}: description is ${description.length} chars (max ${maxDescriptionChars})`);
    }

    urls.push(url);
    titledLinks.push({ title, h2: currentH2 });
    const inRouteSection = routeSectionTitles === null || routeSectionTitles.includes(currentH2);
    if (parsed.host === originHost && inRouteSection) {
      paths.push(parsed.pathname.length > 1 ? parsed.pathname.replace(/\/+$/, '') : '/');
    }
  });

  // --- distinctness --------------------------------------------------------
  // Three links all called "Base Chain" give an agent nothing to choose
  // between. This is a warning rather than an error because it usually means a
  // page inherited its title from a layout, which is valid Next behaviour.
  const titleCounts = new Map();
  for (const { title, h2 } of titledLinks) {
    if (routeSectionTitles !== null && !routeSectionTitles.includes(h2)) continue;
    titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1);
  }
  for (const [title, count] of titleCounts) {
    if (count > 1) {
      warnings.push(
        `${count} routes share the link title "${title}" — add distinct metadata or a config override`,
      );
    }
  }

  // --- coverage ------------------------------------------------------------
  if (expectedPaths) {
    const counts = new Map();
    for (const p of paths) counts.set(p, (counts.get(p) ?? 0) + 1);
    for (const expected of expectedPaths) {
      const norm = expected.length > 1 ? expected.replace(/\/+$/, '') : '/';
      const count = counts.get(norm) ?? 0;
      if (count === 0) errors.push(`route ${expected} is missing from the output`);
      else if (count > 1) errors.push(`route ${expected} appears ${count} times, expected exactly 1`);
    }
  }

  // --- hygiene -------------------------------------------------------------
  if (text.includes('\r')) errors.push('output contains CR characters; expected LF only');
  lines.forEach((line, n) => {
    if (/[ \t]+$/.test(line)) errors.push(`line ${n + 1}: trailing whitespace`);
  });
  if (!text.endsWith('\n')) errors.push('output must end with a newline');
  if (/\n\n$/.test(text)) errors.push('output must end with exactly one newline');

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: { headings: h2s.length, links: urls.length, bytes: Buffer.byteLength(text) },
  };
}

/**
 * Structural checks for the generated public AGENTS.md.
 *
 * Beyond shape, this asserts the chain IDs are paired with the right RPC hosts.
 * A transposed 8453/84532 would be the single most damaging thing this file
 * could ship — an agent would sign a mainnet transaction against testnet
 * assumptions — and it is exactly the kind of error that reads fine.
 */
export function validateAgentsMd(text, opts = {}) {
  const errors = [];
  const warnings = [];
  const { requiredSections = [], networks = [], descriptionMaxChars = 200 } = opts;

  if (!/^<!--.*generated.*-->/im.test(text)) {
    errors.push('missing the "generated, do not edit" banner');
  }

  const headings = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
  let cursor = -1;
  for (const required of requiredSections) {
    const idx = headings.indexOf(required);
    if (idx === -1) {
      errors.push(`missing required section: ## ${required}`);
      continue;
    }
    if (idx < cursor) errors.push(`section "## ${required}" is out of order`);
    cursor = idx;
  }

  const quote = /^> (.+)$/m.exec(text);
  if (!quote) errors.push('missing the blockquote summary');
  else if (quote[1].length > descriptionMaxChars) {
    errors.push(`summary is ${quote[1].length} chars (max ${descriptionMaxChars})`);
  }

  for (const net of networks) {
    if (net.ephemeral) {
      if (!text.includes(net.note)) errors.push(`ephemeral network "${net.name}" is missing its note`);
      continue;
    }
    if (!text.includes(String(net.chainId))) {
      errors.push(`network "${net.name}" chain ID ${net.chainId} is missing`);
      continue;
    }
    // Chain ID and its RPC must appear in the same section block.
    const block = text.split(/^### /m).find((b) => b.startsWith(net.name));
    if (!block) {
      errors.push(`no "### ${net.name}" block found`);
      continue;
    }
    if (!block.includes(String(net.chainId))) {
      errors.push(`"${net.name}" block does not contain chain ID ${net.chainId}`);
    }
    if (!block.includes(net.rpc)) {
      errors.push(`"${net.name}" block does not contain RPC ${net.rpc} — chain ID/RPC may be transposed`);
    }
  }

  if (text.includes('\r')) errors.push('output contains CR characters; expected LF only');
  if (!text.endsWith('\n')) errors.push('output must end with a newline');

  return { ok: errors.length === 0, errors, warnings };
}
