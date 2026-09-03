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

// --- Account (EIP-8130) demo ---

// Fired when a user invokes one of the account demo's features (transact,
// sponsorship, batched calls, gas-in-token, modify owners, …).
export function trackAccountAction(name: string): void {
  track('account_action', { name });
}

// --- B20 issuer demo ---

export function trackB20ModuleSelect(module: string): void {
  track('b20_module_select', { module });
}

export function trackB20Action(
  module: string,
  action: string,
  status: 'submitted' | 'success' | 'error',
): void {
  track('b20_action', { module, action, status });
}

// Fired when a developer copies a ready-made AI prompt for a B20 read flow.
export function trackB20PromptCopy(module: string, prompt: string): void {
  track('b20_prompt_copy', { module, prompt });
}

// --- Internal Explorer: chain selection ---

// Fired when the user switches the Internal Explorer chain (Mainnet / Sepolia / Zeronet).
export function trackExplorerChainSelect(chain: string): void {
  track('explorer_chain_select', { chain });
}

export function trackExplorerActiveBlockJump(chain: string, jump: 'latest' | 'previous'): void {
  track('explorer_active_block_jump', { chain, jump });
}

export function trackValidityOrder(
  side: string,
  status: 'submitted' | 'filled' | 'expired' | 'replaced' | 'error',
): void {
  track('validity_order', { side, status });
}

export function trackValidityRace(
  attempt: 'validity' | 'manual' | 'agent',
  status: 'started' | 'submitted' | 'success' | 'reverted' | 'expired' | 'stopped' | 'error',
): void {
  track('validity_race', { attempt, status });
// --- Performance: swaps vs transfers load-test summary ---
}
export type PerformanceTestType = 'swaps' | 'transfers';

export function trackPerformanceTestTypeSelect(kind: PerformanceTestType): void {
  track('performance_test_type_select', { kind });
}
