// Custom analytics events for omni-ui, sent to Vercel Web Analytics via track().
//
// These name the key conversion steps so journeys and dropoff are visible in the
// Vercel Analytics Events panel. Enterprise allows up to 8 properties per event;
// values must be strings/numbers/booleans/null (no nesting, <=255 chars each).
//
// Prefer these named helpers over calling track() inline so event names and
// property shapes stay consistent.
//
// These emit only when a component calls them, so keep the call sites wired when
// refactoring a surface. The call sites are listed in AGENTS.md ("Analytics").

import { track } from '@vercel/analytics';

// Side-nav navigation between the consolidated surfaces.
export function trackNavClick(destination: string): void {
  track('nav_click', { destination });
}

// --- Snapshots download funnel: network -> preset -> copy command ---

export function trackSnapshotNetworkSelect(network: string): void {
  track('snapshot_network_select', { network });
}

export function trackSnapshotPresetSelect(preset: string): void {
  track('snapshot_preset_select', { preset });
}

// The funnel's conversion step: copying the generated download command.
export function trackSnapshotCommandCopy(network: string, preset: string | null): void {
  track('snapshot_command_copy', { network, preset: preset ?? 'custom' });
}

// --- Faucet request funnel: submitted -> success | error ---

export type FaucetStatus = 'submitted' | 'success' | 'error';

export function trackFaucetRequest(token: string, status: FaucetStatus): void {
  track('faucet_request', { token, status });
}

// --- B20 issuer demo ---

export function trackB20ModuleSelect(module: string): void {
  track('b20_module_select', { module });
}

export function trackB20WalletConnection(status: 'started' | 'success' | 'error'): void {
  track('b20_wallet_connection', { status });
}

export function trackB20Action(
  module: string,
  action: string,
  status: 'submitted' | 'success' | 'error',
): void {
  track('b20_action', { module, action, status });
}

// --- TIPS: chain selection ---

// Fired when the user switches the TIPS chain (Mainnet / Sepolia / Zeronet).
export function trackTipsChainSelect(chain: string): void {
  track('tips_chain_select', { chain });
}
