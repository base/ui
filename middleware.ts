import { NextRequest, NextResponse } from 'next/server';

import { TIPS_ENABLED } from './app/tips/flag';

// TEMPORARY site-wide password gate.
//
// Active only when SITE_PASSWORD is set. Set it in Vercel's Production
// environment so the gate shows on production only; leave it unset for local
// dev and preview. The password itself is never committed — it lives in the
// env var.
//
// The gate covers UI pages only. /api/* is intentionally left public so the
// snapshots API stays reachable by external consumers.
//
// To remove the gate later: delete this file and app/api/gate/route.ts, and
// unset SITE_PASSWORD in Vercel.

const COOKIE = 'site_gate';

export function middleware(req: NextRequest) {
  // TIPS is internal-only. In the public build (flag off) 404 the whole /tips
  // subtree at the edge. This is the authoritative status block: /tips is
  // statically prerendered, so the layout's notFound() serves 404 content but a
  // 200 status — enforcing the real 404 here, before the static asset is served.
  if (!TIPS_ENABLED) {
    const { pathname } = req.nextUrl;
    if (pathname === '/tips' || pathname.startsWith('/tips/')) {
      return new NextResponse('Not Found', { status: 404 });
    }
  }

  const password = process.env.SITE_PASSWORD;

  // No password configured (local dev / preview) -> no gate.
  if (!password || process.env.NODE_ENV === 'development') {
    return NextResponse.next();
  }

  if (req.cookies.get(COOKIE)?.value === password) {
    return NextResponse.next();
  }

  return new NextResponse(gateHtml(), {
    status: 401,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

// Match everything except the public API, Next internals, and static assets.
export const config = {
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};

// Self-contained gate screen (no app layout / external assets), posts the
// password to /api/gate and reloads on success.
function gateHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Base Chain</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; background:#0000ff; }
  .card { background:#fff; padding:32px; border-radius:14px; width:100%; max-width:340px;
          box-shadow:0 10px 40px rgba(0,0,0,.25); }
  h1 { font-size:16px; margin:0 0 4px; color:#111; }
  p { font-size:13px; color:#666; margin:0 0 20px; }
  input { width:100%; padding:10px 12px; font-size:14px; border:1px solid #ddd; border-radius:8px;
          outline:none; color:#111; }
  input:focus { border-color:#0000ff; }
  button { width:100%; margin-top:12px; padding:10px 12px; font-size:14px; font-weight:500;
           color:#fff; background:#0000ff; border:none; border-radius:8px; cursor:pointer; }
  .err { color:#c00; font-size:12px; margin-top:10px; min-height:16px; }
</style>
</head>
<body>
  <form class="card" id="gate">
    <h1>Base Chain</h1>
    <p>Coming soon: tools and dashboards for Base Chain</p>
    <input id="pw" type="password" placeholder="Password" autocomplete="current-password" autofocus />
    <button type="submit">Enter</button>
    <div class="err" id="err"></div>
  </form>
  <script>
    var f = document.getElementById('gate');
    var pw = document.getElementById('pw');
    var err = document.getElementById('err');
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      err.textContent = '';
      fetch('/api/gate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: pw.value }),
      }).then(function (r) {
        if (r.ok) { location.reload(); }
        else { err.textContent = 'Incorrect password'; pw.value = ''; pw.focus(); }
      }).catch(function () { err.textContent = 'Something went wrong. Try again.'; });
    });
  </script>
</body>
</html>`;
}
