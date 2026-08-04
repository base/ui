/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained server bundle (.next/standalone/server.js) so the
  // internal Docker image (cb/ui) can run the app without node_modules. Vercel
  // ignores this and uses its own runtime, so it's a no-op there.
  output: 'standalone',

  // Demos moved from /vibenet/demos to the top-level /demos. Both old paths
  // were in the published sitemap and /vibenet/demos/account is linked from the
  // site-wide announcement banner, so they are permanently redirected rather
  // than left to 404 for existing links and search results.
  async redirects() {
    return [
      { source: '/vibenet/demos', destination: '/demos', permanent: true },
      { source: '/vibenet/demos/:path*', destination: '/demos/:path*', permanent: true },
    ];
  },
};

export default nextConfig;
