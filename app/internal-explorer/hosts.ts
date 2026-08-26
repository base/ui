// Host-aware helpers for Internal Explorer. Client-safe: the host map is
// injected at runtime (layout prop / request Host), never via NEXT_PUBLIC_*.
//
// Each chain may be served from a different origin (aws-dev vs aws prod). Same
// origin keeps `?chain=` in place; a different origin requires a confirm-and-
// navigate hop so aws-dev never silently talks to prod audit.

import type { ExplorerChain } from './chains';

export type ExplorerHostMap = Partial<Record<ExplorerChain, string>>;

export const SKIP_HOST_SWITCH_PROMPT_KEY = 'explorer:skip-host-switch-prompt';

export type HostSwitchPlan = 'replace' | 'prompt' | 'navigate';

function parseOrigin(value: string): { hostname: string; port: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = /:\/\//.test(trimmed) ? new URL(trimmed) : new URL(`https://${trimmed}`);
    let port = url.port;
    if (
      (url.protocol === 'https:' && port === '443') ||
      (url.protocol === 'http:' && port === '80')
    ) {
      port = '';
    }
    return { hostname: url.hostname.toLowerCase(), port };
  } catch {
    return null;
  }
}

/** Compare a Host header, `window.location.origin`, or `BASE_UI_*_HOST` URL. */
export function originsEqual(left: string, right: string): boolean {
  const a = parseOrigin(left);
  const b = parseOrigin(right);
  if (!a || !b) return false;
  return a.hostname === b.hostname && a.port === b.port;
}

export function originFromHostHeader(
  host: string | null | undefined,
  forwardedHost?: string | null,
): string {
  const raw = forwardedHost || host || '';
  return raw.split(',')[0]?.trim() ?? '';
}

export function defaultExplorerChainForOrigin(
  origin: string,
  hosts: ExplorerHostMap,
): ExplorerChain {
  if (hosts.zeronet && originsEqual(origin, hosts.zeronet)) {
    return 'zeronet';
  }
  if (
    (hosts.mainnet && originsEqual(origin, hosts.mainnet)) ||
    (hosts.sepolia && originsEqual(origin, hosts.sepolia))
  ) {
    return 'mainnet';
  }
  // No hosts configured (local `npm run dev`), or an origin that matches none of
  // them: mainnet, matching DEFAULT_EXPLORER_CHAIN.
  return 'mainnet';
}

export function planHostSwitch(
  currentOrigin: string,
  nextChain: ExplorerChain,
  hosts: ExplorerHostMap,
  skipPrompt: boolean,
): HostSwitchPlan {
  const nextHost = hosts[nextChain];
  if (!nextHost || originsEqual(currentOrigin, nextHost)) {
    return 'replace';
  }
  return skipPrompt ? 'navigate' : 'prompt';
}

/** Origin of a configured `BASE_UI_*_HOST` (scheme + host, no trailing slash). */
export function configuredHostOrigin(host: string): string {
  const trimmed = host.trim();
  try {
    return (/:\/\//.test(trimmed) ? new URL(trimmed) : new URL(`https://${trimmed}`)).origin;
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
}

export function explorerHostSwitchHref(
  destinationHost: string,
  pathname: string,
  search: string | URLSearchParams,
  nextChain: ExplorerChain,
): string {
  const params = new URLSearchParams(search.toString());
  params.set('chain', nextChain);
  const origin = configuredHostOrigin(destinationHost);
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const qs = params.toString();
  return `${origin}${path}${qs ? `?${qs}` : ''}`;
}

export function explorerHostLabel(host: string): string {
  const parsed = parseOrigin(host);
  if (!parsed) return host.trim();
  return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
}

export function explorerHostEnvironment(
  destinationHost: string,
  hosts: ExplorerHostMap,
): 'development' | 'production' {
  if (hosts.zeronet && originsEqual(destinationHost, hosts.zeronet)) {
    return 'development';
  }
  return 'production';
}

export function readSkipHostSwitchPrompt(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(SKIP_HOST_SWITCH_PROMPT_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeSkipHostSwitchPrompt(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(SKIP_HOST_SWITCH_PROMPT_KEY, 'true');
  } catch {
    // Private mode can throw; the prompt will reappear next time.
  }
}
