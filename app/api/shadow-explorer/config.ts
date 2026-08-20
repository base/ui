// Server-only config registry for Shadow Explorer. Each network can serve 1:N
// shadow chains, declared in a single JSON env var per network:
//
//   SHADOW_<NET>_CHAINS = [
//     { "id": "canary", "label": "Canary (latest RC)", "purpose": "…", "url": "http://…" },
//     { "id": "experimental", "label": "Experimental", "purpose": "…", "url": "http://…" }
//   ]
//
// where <NET> is MAINNET | SEPOLIA | ZERONET. `url` is the shadow-metrics HTTP
// API base for that chain and never leaves the server; listShadowChains strips it
// before the client sees the list. Malformed JSON or entries missing id/url are
// skipped rather than throwing, so one bad entry can't take the section down.
import type { ShadowChainInfo, ShadowNetwork } from '../../shadow-explorer/networks';

const ENV_PREFIX: Record<ShadowNetwork, string> = {
  mainnet: 'MAINNET',
  sepolia: 'SEPOLIA',
  zeronet: 'ZERONET',
};

interface ShadowChainConfig extends ShadowChainInfo {
  url: string;
}

function parseChains(network: ShadowNetwork): ShadowChainConfig[] {
  const raw = process.env[`SHADOW_${ENV_PREFIX[network]}_CHAINS`];
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const { id, label, url, purpose } = entry as Record<string, unknown>;
    if (typeof id !== 'string' || typeof url !== 'string') return [];
    return [
      {
        id,
        label: typeof label === 'string' && label.length > 0 ? label : id,
        purpose: typeof purpose === 'string' ? purpose : undefined,
        url,
      },
    ];
  });
}

export function listShadowChains(network: ShadowNetwork): ShadowChainInfo[] {
  return parseChains(network).map(({ id, label, purpose }) => ({ id, label, purpose }));
}

export function resolveShadowChainUrl(network: ShadowNetwork, chainId: string): string | undefined {
  return parseChains(network).find((chain) => chain.id === chainId)?.url;
}
