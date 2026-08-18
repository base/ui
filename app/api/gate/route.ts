import { NextResponse } from 'next/server';
import { createGateToken, GATE_COOKIE, GATE_MAX_AGE_SECONDS } from '../../../site-gate';

// Verifies the temporary site password (see middleware.ts) and, on success,
// sets an httpOnly cookie that the middleware checks. Reads the password from
// SITE_PASSWORD; nothing is hardcoded.

export const runtime = 'nodejs';

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

  const token = await createGateToken(password);
  const res = NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
  
  // Security Fix: Set secure, httpOnly cookie with strict sameSite enforcement
  res.cookies.set(GATE_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: GATE_MAX_AGE_SECONDS,
  });
  return res;
}