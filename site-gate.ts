/**
 * Shared constants and Web Crypto helpers for the temporary site gate.
 *
 * The cookie contains a short-lived HMAC token instead of the configured
 * password, so a cookie inspection cannot disclose the deployment secret.
 */
export const GATE_COOKIE = 'site_gate';
export const GATE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const TOKEN_VERSION = 'v1';
const TOKEN_ALGORITHM = { name: 'HMAC', hash: 'SHA-256' } as const;

function encodeBase64Url(bytes: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function importGateKey(password: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    TOKEN_ALGORITHM,
    false,
    ['sign', 'verify'],
  );
}

async function signPayload(payload: string, password: string): Promise<string> {
  const key = await importGateKey(password);
  const signature = await crypto.subtle.sign(
    TOKEN_ALGORITHM.name,
    key,
    new TextEncoder().encode(payload),
  );
  return encodeBase64Url(signature);
}

/** Create a signed, expiring gate token for the configured password. */
export async function createGateToken(
  password: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  const expiresAt = nowSeconds + GATE_MAX_AGE_SECONDS;
  const payload = `${TOKEN_VERSION}.${expiresAt}`;
  return `${payload}.${await signPayload(payload, password)}`;
}

/** Validate a gate token without exposing or comparing the password in a cookie. */
export async function isValidGateToken(
  token: string | undefined,
  password: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!token) return false;

  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return false;

  const expiresAt = Number(parts[1]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= nowSeconds) return false;

  try {
    const payload = `${TOKEN_VERSION}.${parts[1]}`;
    const key = await importGateKey(password);
    return await crypto.subtle.verify(
      TOKEN_ALGORITHM.name,
      key,
      decodeBase64Url(parts[2]),
      new TextEncoder().encode(payload),
    );
  } catch {
    // Treat malformed or unverifiable cookies as unauthenticated requests.
    return false;
  }
}