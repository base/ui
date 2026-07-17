import { NextResponse } from 'next/server';

// Verifies the temporary site password (see middleware.ts) and, on success,
// sets an httpOnly cookie that the middleware checks. Reads the password from
// SITE_PASSWORD; nothing is hardcoded.

export const runtime = 'nodejs';

const COOKIE = 'site_gate';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export async function POST(request: Request) {
  const password = process.env.SITE_PASSWORD;

  // Gate disabled (no password configured) -> nothing to verify.
  if (!password) {
    return NextResponse.json({ ok: true });
  }

  let provided = '';
  try {
    const body: unknown = await request.json();
    if (body && typeof body === 'object' && 'password' in body) {
      provided = String((body as { password: unknown }).password);
    }
  } catch {
    provided = '';
  }

  if (provided !== password) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, password, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
  return res;
}
