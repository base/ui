import type { MetadataRoute } from 'next';

// Served by Next at /sitemap.xml. Sitemap entries need absolute URLs, so paths
// are joined onto BASE_URL (kept in sync with metadataBase in app/layout.tsx).
//
// Static, publicly indexable routes only. Dynamic routes
// (upgrades/changelog/[slug], upgrades/upgrade/[fork], vibenet/explorer/*)
// are omitted because their URLs depend on runtime data; add a data-driven
// entry per record if/when those pages should be indexed.
const BASE_URL = 'https://chain.base.org';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const routes: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }> = [
    { path: '/', priority: 1.0, changeFrequency: 'weekly' },
    { path: '/upgrades', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/upgrades/changelog', priority: 0.7, changeFrequency: 'weekly' },
    { path: '/snapshots', priority: 0.7, changeFrequency: 'daily' },
    { path: '/vibenet', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/vibenet/explorer', priority: 0.6, changeFrequency: 'daily' },
    { path: '/vibenet/faucet', priority: 0.5, changeFrequency: 'monthly' },
    { path: '/vibenet/demos', priority: 0.6, changeFrequency: 'weekly' },
    { path: '/vibenet/demos/account', priority: 0.5, changeFrequency: 'weekly' },
  ];

  return routes.map(({ path, priority, changeFrequency }) => ({
    url: `${BASE_URL}${path === '/' ? '' : path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
