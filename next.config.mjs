import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TARGET } from './deploy.config.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // This repo hand-maintains AGENTS.md (see its own header); don't let
  // `next dev` append its generated agent-rules block to it.
  agentRules: false,
  // Keep tracing rooted at this checkout so a git worktree inside the repo
  // is not mistaken for a nested package of the parent lockfile.
  outputFileTracingRoot: dir,
  turbopack: {
    root: dir,
  },
  // Emit a self-contained server bundle (.next/standalone/server.js) so the
  // internal Docker image can run the app without node_modules. Vercel's
  // runtime never uses this output, and generating it there has been
  // failing the build outright (ENOENT on next-server.js.nft.json during
  // Next 16's Turbopack file-tracing step) — so only opt into it for the
  // internal build target that actually needs the standalone bundle.
  ...(TARGET === 'internal' ? { output: 'standalone' } : {}),

  // Demos live under /vibenet/demos. They briefly sat at the top-level /demos,
  // whose paths were published in the sitemap and linked externally, so those
  // old paths are permanently redirected rather than left to 404 for existing
  // links and search results.
  //
  // Internal Explorer moved from /tips to /internal-explorer. Legacy redirects
  // are internal-only: the public build 404s both prefixes via middleware so
  // it never advertises the internal surface.
  async redirects() {
    return [
      // The old demos index merged into the Vibenet overview; deep demo links
      // map straight to their new home under /vibenet/demos.
      { source: '/demos', destination: '/vibenet', permanent: true },
      { source: '/demos/:path*', destination: '/vibenet/demos/:path*', permanent: true },
      // /vibenet/demos has no index page — the demo list lives on the Vibenet
      // overview, so send the bare path there.
      { source: '/vibenet/demos', destination: '/vibenet', permanent: true },
      ...(TARGET === 'internal'
        ? [
            { source: '/tips', destination: '/internal-explorer', permanent: true },
            { source: '/tips/:path*', destination: '/internal-explorer/:path*', permanent: true },
            { source: '/api/tips', destination: '/api/internal-explorer', permanent: true },
            {
              source: '/api/tips/:path*',
              destination: '/api/internal-explorer/:path*',
              permanent: true,
            },
          ]
        : []),
    ];
  },
};

export default nextConfig;
