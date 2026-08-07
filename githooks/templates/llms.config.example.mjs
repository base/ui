// llms.config.mjs — copy to the repo root and edit.
//
// EVERY KEY IS OPTIONAL. Delete anything you don't need; defaults in
// scripts/lib/config.mjs fill the gaps, and appDir is auto-detected.
//
// After editing:  npm run llms -- --check

export default {
  // ---------------------------------------------------------------- basics --
  origin: 'https://chain.base.org',
  appDir: 'src/app',   // omit to auto-detect (src/app wins over app)
  outDir: 'public',    // served at /llms.txt, /llms-full.txt, /AGENTS.md

  // 'exclude' drops [slug] routes; 'template' emits the literal Next pattern.
  dynamicRoutes: 'exclude',

  site: {
    title: 'Base Chain',
    summary: 'One or two sentences. Becomes the llms.txt blockquote.',
    fullTitle: 'Base Chain — Full Context',
    fullSummary: 'Becomes the llms-full.txt blockquote.',
    // Hard-capped at agentsDescriptionMaxChars (200). Generation THROWS if
    // this is longer — it is the first thing an agent reads.
    agentsSummary: 'One sentence, under 200 characters.',
  },

  // Free markdown between the blockquote and the first H2. No headings — the
  // llms.txt spec forbids them there.
  intro: [
    'When to use this site versus the docs site. What never to infer.',
  ],

  // ------------------------------------------------------------- ordering --
  // Sections render in this order, and routes render in the order their
  // patterns are listed — so the file reads like the site's nav rather than
  // like an alphabetical dump. Unmatched routes land in a trailing "Other".
  //
  // NOTE: '/vibenet/**' matches '/vibenet' itself too. Use '/vibenet/*' for
  // children only.
  sections: [
    { id: 'network-state', title: 'Network state',
      match: ['/', '/upgrades', '/upgrades/**', '/snapshots'] },
    { id: 'vibenet', title: 'Vibenet developer network',
      match: ['/vibenet', '/vibenet/**'] },
  ],

  // Highest-precedence metadata; beats anything parsed from source. Use this
  // for pages whose SEO description is too terse to help an agent, and for
  // pages using generateMetadata() (which cannot be read statically).
  routes: {
    // '/vibenet/demos/account': {
    //   title: 'EIP-8130 Account Demo',
    //   description: 'Longer, agent-oriented description.',
    // },
  },

  exclude: [],  // e.g. ['/internal/**']

  // ------------------------------------------------- agentic-experience --
  // JSON an agent should call instead of scraping HTML. This is usually the
  // single highest-value thing in the whole file.
  endpoints: [
    { url: '/api/health', title: 'Chain health',
      description: 'JSON liveness probe. Call this instead of parsing the homepage.',
      shape: '{"status":"ok"}' },
  ],

  // An entry must be fully specified, OR flagged ephemeral with a note saying
  // where to read the live values. Config validation rejects anything else —
  // a blank chain ID reads to an agent as "no chain ID exists".
  networks: [
    { name: 'Base Mainnet', chainId: 8453,
      rpc: 'https://mainnet.base.org', explorer: 'https://basescan.org' },
    { name: 'Vibenet (ephemeral devnet)', ephemeral: true,
      explorer: 'https://chain.base.org/vibenet/explorer',
      note: 'Chain ID and RPC are not stable. Read them from /vibenet at request time.' },
  ],

  // How fast each path goes stale. Entries pointing at routes that no longer
  // exist are dropped automatically, with a warning.
  freshness: {
    '/snapshots': 'daily',
    '/upgrades': 'per release',
  },

  // Rendered into the ## Optional section, whose URLs an agent may skip when
  // it needs a shorter context. Point at neighbouring indexes so this file
  // composes with them instead of duplicating them.
  related: {
    docsLlms: 'https://docs.base.org/llms.txt',
    docsAgents: 'https://docs.base.org/AGENTS.md',
  },

  // Hosts named anywhere in `networks` or `related` are allowlisted
  // automatically; this is only for extra ones.
  allowedHosts: [],

  maxDescriptionChars: 400,
  agentsDescriptionMaxChars: 200,
};
