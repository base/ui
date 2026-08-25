import { NextRequest, NextResponse } from 'next/server';

import { disabledRoutePrefixes } from './deploy.config.mjs';

export function middleware(req: NextRequest) {
  // Surfaces not shipped to this build target (deploy.config.mjs) 404 at the
  // edge. This is the authoritative status block: a disabled section's page may
  // be statically prerendered, so its layout notFound() serves 404 content with
  // a 200 status — enforcing the real 404 here, before the static asset is
  // served. Prefixes are build-time constant (target is inlined).
  const { pathname } = req.nextUrl;
  for (const prefix of disabledRoutePrefixes()) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return new NextResponse('Not Found', { status: 404 });
    }
  }

  return NextResponse.next();
}

// Match everything except the public API, Next internals, and static assets.
export const config = {
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
