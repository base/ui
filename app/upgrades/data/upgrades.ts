import { CATEGORY_ORDER } from '../library/display';
import type { Change, ChangeCategory, Lifecycle, Upgrade } from '../library/types';

import { changes } from './changes';

export function categoryGroupsForUpgrade(upgradeId: string): Upgrade['categories'] {
  return CATEGORY_ORDER.map((category: ChangeCategory) => ({
    category,
    changeIds: changes
      .filter((c) => c.upgrade === upgradeId && c.category === category)
      .map((c) => c.id),
  }));
}

export const upgrades: Upgrade[] = [
  {
    id: 'azul',
    name: 'Azul',
    summary:
      "Azul is Base's first independent network upgrade. It focuses on increasing security and decentralization, accelerating the path to 1 gigagas/s, and improving developer experience.",
    lifecycle: {
      sepolia: { timestamp: '2026-04-20T18:00:00Z' },
      mainnet: { timestamp: '2026-05-28T18:00:00Z' },
    },
    categories: categoryGroupsForUpgrade('azul'),
    migrationGuide: [],
    specUrl: 'https://docs.base.org/base-chain/specs/upgrades/azul/',
    blog: 'https://blog.base.dev/introducing-base-azul',
  },
  {
    id: 'beryl',
    name: 'Beryl',
    summary:
      'Beryl makes Base a first-class issuance platform with B20 tokens, more capital efficient with reduced withdrawal delays, and more scalable with Reth V2.',
    lifecycle: {
      sepolia: { timestamp: '2026-06-18T18:00:00Z' },
      mainnet: { timestamp: '2026-06-25T18:00:00Z' },
    },
    categories: categoryGroupsForUpgrade('beryl'),
    migrationGuide: [],
    specUrl: 'https://docs.base.org/base-chain/specs/upgrades/beryl/',
    blog: '',
  },
  {
    id: 'cobalt',
    name: 'Cobalt',
    summary:
      'Cobalt adds native account abstraction with EIP-8130 and makes improvements to the B20 token standard.',
    lifecycle: {
      sepolia: {},
      mainnet: {},
    },
    categories: categoryGroupsForUpgrade('cobalt'),
    migrationGuide: [],
    specUrl: '',
    blog: '',
  },
];

let reversedUpgrades: Upgrade[] | null = null;

export function getUpgradesReversed(): Upgrade[] {
  if (!reversedUpgrades) {
    reversedUpgrades = [...upgrades].reverse();
  }
  return [...reversedUpgrades];
}

export function getUpgradeById(id: string): Upgrade | undefined {
  return upgrades.find((u) => u.id.toLowerCase() === id.toLowerCase());
}

export function getUpgradeForChange(change: Change): Upgrade | undefined {
  return change.upgrade ? upgrades.find((u) => u.id === change.upgrade) : undefined;
}

export function getLifecycleForChange(change: Change): Lifecycle | undefined {
  const upgradeLifecycle = getUpgradeForChange(change)?.lifecycle;
  if (!upgradeLifecycle) return undefined;

  const override = change.activation;
  if (!override) return upgradeLifecycle;

  // A network override is authoritative for that network (even an empty `{}`,
  // which reads as "planning"). Omitted networks inherit the upgrade's date.
  return {
    sepolia: override.sepolia ?? upgradeLifecycle.sepolia,
    mainnet: override.mainnet ?? upgradeLifecycle.mainnet,
  };
}
