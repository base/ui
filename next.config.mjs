/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained server bundle (.next/standalone/server.js) so the
  // internal Docker image (cb/ui) can run the app without node_modules. Vercel
  // ignores this and uses its own runtime, so it's a no-op there.
  output: 'standalone',
};

export default nextConfig;
