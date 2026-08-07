import type { Lifecycle, LifecycleState, LifecycleStatusEntry, UpgradeStatus } from './types';

export function getLifecycleState(
  entry: LifecycleStatusEntry,
  nowMs: number = Date.now(),
): LifecycleState {
  if (!entry.timestamp) return 'planning';
  return Date.parse(entry.timestamp) <= nowMs ? 'live' : 'scheduled';
}

export function getUpgradeStatus(lifecycle: Lifecycle, nowMs: number = Date.now()): UpgradeStatus {
  const mainnetState = getLifecycleState(lifecycle.mainnet, nowMs);
  const sepoliaState = getLifecycleState(lifecycle.sepolia, nowMs);

  if (mainnetState === 'live') return 'live';
  if (sepoliaState === 'live') return 'shipping';
  if (mainnetState === 'scheduled' || sepoliaState === 'scheduled') {
    return 'scheduled';
  }
  return 'planning';
}
