// Per-chain server config for the Internal Explorer API. One deployment serves all chains, so
// the RPC/audit URLs are resolved per ExplorerChain from TIPS_<CHAIN>_* env vars.
// Server-only: never import from client.
import type { ExplorerChain } from '../../internal-explorer/chains';
import type { ExplorerHostMap } from '../../internal-explorer/hosts';

// Env var infix for each chain: TIPS_MAINNET_*, TIPS_SEPOLIA_*, TIPS_ZERONET_*.
const ENV_PREFIX: Record<ExplorerChain, string> = {
  mainnet: 'MAINNET',
  sepolia: 'SEPOLIA',
  zeronet: 'ZERONET',
};

function envValue(names: string[]): string | undefined {
  return names.map((name) => process.env[name]).find(Boolean);
}

export function getRpcUrl(chain: ExplorerChain): string {
  return envValue([`TIPS_${ENV_PREFIX[chain]}_RPC_URL`]) ?? 'http://localhost:8545';
}

// Audit events JSON-RPC endpoint (Postgres-backed) for a chain. Unlike the
// execution RPC there is no default: audit is opt-in per chain via
// TIPS_<CHAIN>_AUDIT_RPC_URL. When unset, the audit source is treated as
// disabled: bundle/rejected views are empty and block/txn views show chain data only.
export function getAuditRpcUrl(chain: ExplorerChain): string | undefined {
  return envValue([`TIPS_${ENV_PREFIX[chain]}_AUDIT_RPC_URL`]);
}

export function getShadowMetricsUrl(chain: ExplorerChain): string | undefined {
  return envValue([`TIPS_${ENV_PREFIX[chain]}_SHADOW_METRICS_URL`]);
}

export function isAuditConfigured(chain: ExplorerChain): boolean {
  return Boolean(getAuditRpcUrl(chain));
}

// Public origin that serves observability for a chain. Unset locally so the
// client stays on the current origin with no host-switch prompt. Set at runtime
// (not NEXT_PUBLIC_*) so the same image can default zeronet on aws-dev and
// mainnet on aws prod. Helm: BASE_UI_<CHAIN>_HOST.
export function getExplorerHost(chain: ExplorerChain): string | undefined {
  const value = envValue([`BASE_UI_${ENV_PREFIX[chain]}_HOST`])?.trim();
  return value || undefined;
}

export function getExplorerHosts(): ExplorerHostMap {
  const hosts: ExplorerHostMap = {};
  for (const chain of ['mainnet', 'sepolia', 'zeronet'] as const) {
    const host = getExplorerHost(chain);
    if (host) hosts[chain] = host;
  }
  return hosts;
}
