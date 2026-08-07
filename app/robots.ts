import type { MetadataRoute } from 'next';

// Served by Next at /robots.txt. Kept in sync with BASE_URL in app/sitemap.ts.
const BASE_URL = 'https://chain.base.org';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // API routes serve data, not indexable pages.
      disallow: '/api/',
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
