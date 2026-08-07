import { humanizeKey, isAddress } from '../library/format';
import type { ContractMeta, ResolvedContract } from '../library/types';

// Known contract keys -> display metadata. This registry only *enhances* the
// raw `contracts.json` the API returns:
//   - unknown keys still render, labeled via `humanizeKey`, so new public
//     deployments appear here with no code change;
//   - `hidden` keeps internal/demo deployments out of the public list;
//   - `watch` adds an "add to wallet" affordance for tokens.
export const CONTRACT_REGISTRY: Record<string, ContractMeta> = {
  baseTime: { label: 'BaseTime (predeploy)' },
  usdv: { label: 'USDV (ERC-20)', watch: { type: 'ERC20', symbol: 'USDV', decimals: 6 } },
  nfv: { label: 'NFV (ERC-721)' },
  // Internal/demo deployments intentionally omitted from the public list.
  faucetAddress: { label: 'Faucet', hidden: true },
  vibecheck: { label: 'Vibecheck', hidden: true },
};

const BASE_TIME_ADDRESS = '0x4200000000000000000000000000000000000030';

// Turn the raw contracts map into a display list: keep only real addresses,
// drop hidden entries, and layer on registry metadata (or a humanized label).
// Returns null while the contracts payload hasn't loaded yet.
export function resolveContracts(
  contracts: Record<string, unknown> | null,
): ResolvedContract[] | null {
  if (!contracts) return null;
  return Object.entries({ ...contracts, baseTime: BASE_TIME_ADDRESS })
    .filter((entry): entry is [string, string] => isAddress(entry[1]))
    .filter(([key]) => !CONTRACT_REGISTRY[key]?.hidden)
    .map(([key, address]) => {
      const meta = CONTRACT_REGISTRY[key];
      return {
        key,
        address,
        label: meta?.label ?? humanizeKey(key),
        watch: meta?.watch,
      };
    });
}
