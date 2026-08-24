import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TARGET } from './deploy.config.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep tracing rooted at this checkout so a git worktree inside the repo
  // is not mistaken for a nested package of the parent lockfile.
  outputFileTracingRoot: dir,
  // Emit a self-contained server bundle (.next/standalone/server.js) so the
  // internal Docker image can run the app without node_modules. Vercel
  // ignores this and uses its own runtime, so it's a no-op there.
  output: 'standalone',

  // Demos moved from /vibenet/demos to the top-level /demos. Both old paths
  // were in the published sitemap and /vibenet/demos/account is linked from the
  // site-wide announcement banner, so they are permanently redirected rather
  // than left to 404 for existing links and search results.
  //
  // Internal Explorer moved from /tips to /internal-explorer. Legacy redirects
  // are internal-only: the public build 404s both prefixes via middleware so
  // it never advertises the internal surface.
  async redirects() {
    return [
      { source: '/vibenet/demos', destination: '/demos', permanent: true },
      { source: '/vibenet/demos/:path*', destination: '/demos/:path*', permanent: true },
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
