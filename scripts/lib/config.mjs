/**
 * Config loading, defaults, and validation.
 *
 * Every key is optional. A repo with no llms.config.mjs at all still produces
 * usable output from defaults + auto-detection — that is what makes the
 * toolkit drop-in.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Defaults are deliberately Base-flavoured. A different site overrides them in
 * llms.config.mjs; nothing here is load-bearing for correctness.
 */
export const DEFAULTS = {
  origin: 'https://chain.base.org',
  appDir: null, // auto-detected: src/app, else app
  outDir: 'public',
  dynamicRoutes: 'exclude', // 'exclude' | 'template'

  site: {
    title: 'Base Chain',
    summary:
      'Monitor and test Base, all in one place. chain.base.org is the live-state surface for Base Chain: the network upgrade schedule, the protocol changelog, node snapshots, and Vibenet, an ephemeral developer network for testing in-flight features such as EIP-8130 native account abstraction.',
    fullTitle: 'Base Chain — Full Context',
    fullSummary:
      'Full context for agents working with Base Chain. Hand-written network, freshness, and routing guides sit above an exhaustive per-route index.',
    agentsSummary:
      'chain.base.org is the live-state surface for Base Chain: upgrade schedule, protocol changelog, node snapshots, and the Vibenet developer network.',
  },

  /**
   * Prose that sits between the blockquote and the first H2. llmstxt.org
   * allows any markdown here except headings.
   */
  intro: [
    'Use this site for current network state. Use https://docs.base.org for implementation detail: how to write, deploy, and debug code. If the two disagree on an activation date, an upgrade status, or a snapshot URL, this site is authoritative; for API shapes, contract addresses, and code, docs.base.org is authoritative. Do not infer Base chain IDs or RPC URLs from third-party chain lists or from model memory — use the network reference below.',
  ],

  sections: [
    {
      id: 'network-state',
      title: 'Network state',
      match: ['/', '/upgrades', '/upgrades/**', '/snapshots'],
    },
    { id: 'vibenet', title: 'Vibenet developer network', match: ['/vibenet', '/vibenet/**'] },
  ],

  /** Highest-precedence metadata, keyed by URL path. */
  routes: {},

  /** Glob patterns of URL paths to drop entirely. */
  exclude: [],

  /**
   * Machine-readable endpoints an agent should call instead of scraping HTML.
   * Rendered into both llms.txt and AGENTS.md.
   */
  endpoints: [
    {
      url: '/api/health',
      title: 'Chain health',
      description:
        'JSON liveness probe for the chain.base.org service. Call this instead of parsing the homepage.',
      shape: '{"status":"ok"}',
    },
    {
      url: '/api/snapshots',
      title: 'Snapshots manifest',
      description:
        'JSON array of the latest node snapshots per chain: chainId, chainName, block height, timestamp, client version, profile, total byte size, and a per-component breakdown. Call this instead of scraping /snapshots.',
      shape:
        'Array<{chainId, chainName, network, block, timestamp, date, rethVersion, image, profile, size, isModular, components[]}>',
    },
  ],

  /**
   * Vibenet deliberately carries no chainId/rpc. Neither vibenet.base.org nor
   * rpc.vibenet.base.org resolves, and the network is ephemeral — publishing a
   * chain ID that gets wiped is worse than publishing none. validateNetworks()
   * enforces that an entry either has full details or is flagged ephemeral.
   */
  networks: [
    {
      name: 'Base Mainnet',
      chainId: 8453,
      rpc: 'https://mainnet.base.org',
      explorer: 'https://basescan.org',
      guide: 'https://docs.base.org/base-chain/quickstart/connecting-to-base',
    },
    {
      name: 'Base Sepolia',
      chainId: 84532,
      rpc: 'https://sepolia.base.org',
      explorer: 'https://sepolia.basescan.org',
      guide: 'https://docs.base.org/base-chain/quickstart/connecting-to-base',
      faucet: 'https://docs.base.org/base-chain/network-information/network-faucets',
    },
    {
      name: 'Vibenet (ephemeral devnet)',
      ephemeral: true,
      chainId: null,
      rpc: null,
      explorer: 'https://chain.base.org/vibenet/explorer',
      faucet: 'https://chain.base.org/vibenet/faucet',
      guide: 'https://chain.base.org/vibenet',
      note: 'Chain ID and RPC are not stable and are deliberately not listed here. Read them from https://chain.base.org/vibenet at request time. State may be wiped without notice.',
    },
  ],

  /** Volatility hints. Seeded from sitemap changefreq where available. */
  freshness: {
    '/snapshots': 'daily',
    '/vibenet/explorer': 'daily',
    '/upgrades': 'per release',
    '/upgrades/changelog': 'per release',
    '/vibenet/faucet': 'monthly',
  },

  /** Cross-links so this file composes with the wider Base agent surface. */
  related: {
    docsLlms: 'https://docs.base.org/llms.txt',
    docsLlmsFull: 'https://docs.base.org/llms-full.txt',
    docsAgents: 'https://docs.base.org/AGENTS.md',
    docsMcp: 'https://docs.base.org/mcp',
    websiteAgents: 'https://www.base.org/AGENTS.md',
  },

  /** Extra hosts allowed to appear in generated links, beyond the origin. */
  allowedHosts: ['docs.base.org', 'www.base.org', 'base.org', 'blog.base.org'],

  maxDescriptionChars: 400,
  agentsDescriptionMaxChars: 200,
};

const OUTPUT_NAMES = {
  llms: 'llms.txt',
  llmsFull: 'llms-full.txt',
  agents: 'AGENTS.md',
};

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Free-form maps whose keys are data, not config names. Two consequences:
 * recursing into them would report every route as an "unknown config key", and
 * merging them would make a default impossible to remove. They replace
 * wholesale, exactly like arrays — what you write is what you get.
 */
const OPAQUE_KEYS = new Set(['routes', 'freshness', 'related']);

/**
 * Deep-merge user config over defaults. Arrays replace wholesale rather than
 * concatenating: a site that lists two sections means two, not two plus ours.
 */
function deepMerge(base, override, keyPath, warnings) {
  if (!isPlainObject(override)) return override;
  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const here = keyPath ? `${keyPath}.${key}` : key;
    if (OPAQUE_KEYS.has(key) && !keyPath) {
      out[key] = value;
      continue;
    }
    if (!(key in base)) {
      warnings.push(`unknown config key: ${here}`);
      out[key] = value;
      continue;
    }
    out[key] =
      isPlainObject(base[key]) && isPlainObject(value)
        ? deepMerge(base[key], value, here, warnings)
        : value;
  }
  return out;
}

function fail(keyPath, expected, actual) {
  throw new Error(
    `llms.config.mjs: ${keyPath} must be ${expected}, got ${JSON.stringify(actual)}`,
  );
}

function validate(config) {
  if (typeof config.origin !== 'string' || !/^https?:\/\//.test(config.origin)) {
    fail('origin', 'an absolute http(s) URL', config.origin);
  }
  try {
    new URL(config.origin);
  } catch {
    fail('origin', 'a parseable URL', config.origin);
  }
  if (typeof config.outDir !== 'string' || !config.outDir) {
    fail('outDir', 'a non-empty string', config.outDir);
  }
  if (!['exclude', 'template'].includes(config.dynamicRoutes)) {
    fail('dynamicRoutes', "'exclude' or 'template'", config.dynamicRoutes);
  }
  if (!Array.isArray(config.sections)) fail('sections', 'an array', config.sections);
  config.sections.forEach((s, i) => {
    if (!isPlainObject(s)) fail(`sections[${i}]`, 'an object', s);
    if (typeof s.title !== 'string') fail(`sections[${i}].title`, 'a string', s.title);
    if (!Array.isArray(s.match)) fail(`sections[${i}].match`, 'an array', s.match);
  });
  if (!isPlainObject(config.routes)) fail('routes', 'an object', config.routes);
  if (!Array.isArray(config.exclude)) fail('exclude', 'an array', config.exclude);
  if (!Array.isArray(config.endpoints)) fail('endpoints', 'an array', config.endpoints);
  if (!Array.isArray(config.networks)) fail('networks', 'an array', config.networks);
  if (!Number.isFinite(config.maxDescriptionChars) || config.maxDescriptionChars <= 0) {
    fail('maxDescriptionChars', 'a positive number', config.maxDescriptionChars);
  }
  if (!Number.isFinite(config.agentsDescriptionMaxChars) || config.agentsDescriptionMaxChars <= 0) {
    fail('agentsDescriptionMaxChars', 'a positive number', config.agentsDescriptionMaxChars);
  }
  validateNetworks(config.networks);
  return config;
}

/**
 * A network entry must be fully specified, or explicitly flagged ephemeral
 * with a note explaining where to get the real values. Without this, a missing
 * chain ID ships as a blank and an agent reads it as "no chain ID exists".
 */
export function validateNetworks(networks) {
  networks.forEach((net, i) => {
    const at = `networks[${i}] (${net?.name ?? 'unnamed'})`;
    if (!isPlainObject(net)) fail(at, 'an object', net);
    if (typeof net.name !== 'string' || !net.name) fail(`${at}.name`, 'a non-empty string', net.name);
    if (net.ephemeral) {
      if (typeof net.note !== 'string' || !net.note.trim()) {
        throw new Error(
          `llms.config.mjs: ${at} is ephemeral, so it must carry a 'note' explaining where to read the live chain ID and RPC.`,
        );
      }
      return;
    }
    if (!Number.isInteger(net.chainId)) fail(`${at}.chainId`, 'an integer', net.chainId);
    if (typeof net.rpc !== 'string' || !net.rpc) fail(`${at}.rpc`, 'a URL string', net.rpc);
    if (typeof net.explorer !== 'string' || !net.explorer) {
      fail(`${at}.explorer`, 'a URL string', net.explorer);
    }
  });
  return networks;
}

/** Pull every parseable http(s) host out of a nested config value. */
function collectHosts(value, out = []) {
  if (typeof value === 'string') {
    if (/^https?:\/\//.test(value)) {
      try { out.push(new URL(value).host); } catch { /* not a URL, ignore */ }
    }
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectHosts(item, out);
    return out;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectHosts(item, out);
  }
  return out;
}

/** Locate the app directory: src/app wins over app, matching Next's own rule. */
export function detectAppDir(repoRoot) {
  for (const candidate of ['src/app', 'app']) {
    if (fs.existsSync(path.join(repoRoot, candidate))) return candidate;
  }
  return null;
}

/**
 * Load and merge config.
 *
 * @param {string} repoRoot
 * @returns {Promise<{config: object, configPath: string|null, warnings: string[]}>}
 */
export async function loadConfig(repoRoot) {
  const warnings = [];
  const configPath = path.join(repoRoot, 'llms.config.mjs');
  let userConfig = {};
  let found = null;

  if (fs.existsSync(configPath)) {
    found = configPath;
    // Cache-bust so repeated loads in one test process see edits on disk.
    const mod = await import(`${pathToFileURL(configPath).href}?t=${fs.statSync(configPath).mtimeMs}`);
    userConfig = mod.default ?? mod.config ?? {};
    if (!isPlainObject(userConfig)) {
      throw new Error('llms.config.mjs must default-export an object');
    }
  }

  const merged = deepMerge(DEFAULTS, userConfig, '', warnings);

  if (!merged.appDir) {
    merged.appDir = detectAppDir(repoRoot);
    if (!merged.appDir) {
      throw new Error(
        `No Next.js app directory found under ${repoRoot}. Looked for src/app and app. Set appDir in llms.config.mjs.`,
      );
    }
  }

  validate(merged);

  merged.outputs = {
    llms: path.join(merged.outDir, OUTPUT_NAMES.llms),
    llmsFull: path.join(merged.outDir, OUTPUT_NAMES.llmsFull),
    agents: path.join(merged.outDir, OUTPUT_NAMES.agents),
  };
  merged.originHost = new URL(merged.origin).host;

  // Any host the config deliberately points at is allowed to appear in the
  // output. Without this, adding an explorer or a docs link to config would
  // fail validation on a host the user themselves configured — a footgun that
  // reads as a bug in the tool.
  merged.allowedHosts = [
    ...new Set([
      ...merged.allowedHosts,
      ...collectHosts(merged.networks),
      ...collectHosts(Object.values(merged.related ?? {})),
    ]),
  ].filter((h) => h && h !== merged.originHost);

  return { config: merged, configPath: found, warnings };
}

/**
 * A route handler and a static file cannot both own `/llms.txt`. Next would
 * serve one and silently ignore the other, which is a miserable thing to debug.
 */
export function assertNoRouteCollision(repoRoot, config) {
  const appDir = path.join(repoRoot, config.appDir);
  const collisions = [];
  for (const name of Object.values(OUTPUT_NAMES)) {
    for (const ext of ['ts', 'js', 'tsx']) {
      const candidate = path.join(appDir, name, `route.${ext}`);
      if (fs.existsSync(candidate)) collisions.push(path.relative(repoRoot, candidate));
    }
  }
  if (collisions.length > 0) {
    throw new Error(
      `Route handler(s) already serve these paths:\n  ${collisions.join('\n  ')}\n` +
        `They would conflict with the generated files in ${config.outDir}/. ` +
        `Delete the route handler(s), or point outDir somewhere else.`,
    );
  }
}

/**
 * Minimal glob matcher for URL paths. Supports a trailing `/**` (any depth) and
 * a single `*` (one segment). Enough for section matching without a dependency.
 *
 * SEMANTIC WORTH KNOWING: `/vibenet/**` matches `/vibenet` itself as well as
 * everything beneath it. That is what you almost always want for `sections`
 * and `exclude` — "this subtree" normally includes its own root. To match only
 * the descendants, use `/vibenet/*` (one level) or list paths explicitly.
 */
export function matchesPattern(urlPath, pattern) {
  if (pattern === urlPath) return true;
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\/\*\*/g, '(?:/.*)?')
    .replace(/(?<!\.)\*/g, '[^/]*');
  return new RegExp(`^${escaped}$`).test(urlPath);
}

export function matchesAny(urlPath, patterns) {
  return (patterns ?? []).some((p) => matchesPattern(urlPath, p));
}
