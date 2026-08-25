import { changes, getChangeById, getChangeBySlug } from '../data/changes';
import {
  categoryGroupsForUpgrade,
  getLifecycleForChange,
  getUpgradeById,
  getUpgradeForChange,
} from '../data/upgrades';
import { getVibenetChangeById, getVibenetChanges } from '../data/vibenet';

import { UPGRADE_NETWORKS } from './display';
import { getLifecycleState, getUpgradeStatus } from './lifecycle';

// NOTE (migration from the upstream app): several assertions in the source test were
// stale relative to data/changes.ts (renumbered base-000X ids, a "network" vs
// "networking" category typo, and an empty-Vibenet expectation that no longer
// matched the data). They have been corrected here to match the migrated data,
// which is the source of truth.
describe('upgrades route helpers', () => {
  const beforeBeryl = Date.parse('2026-06-20T12:00:00Z');
  const afterBeryl = Date.parse('2026-06-26T12:00:00Z');

  it('evaluates lifecycle state with a fixed nowMs', () => {
    expect(getLifecycleState({ timestamp: '2026-06-18T18:00:00Z' }, beforeBeryl)).toBe('live');
    expect(getLifecycleState({ timestamp: '2026-06-25T18:00:00Z' }, beforeBeryl)).toBe('scheduled');
    expect(getLifecycleState({}, beforeBeryl)).toBe('planning');
  });

  it('evaluates upgrade status with a fixed nowMs', () => {
    const beryl = getUpgradeById('beryl');
    expect(beryl).toBeDefined();
    if (!beryl) throw new Error('beryl not found');
    expect(getUpgradeStatus(beryl.lifecycle, beforeBeryl)).toBe('shipping');
    expect(getUpgradeStatus(beryl.lifecycle, afterBeryl)).toBe('live');
  });

  it('looks up upgrades case-insensitively', () => {
    expect(getUpgradeById('AZUL')?.id).toBe('azul');
    expect(getUpgradeById('missing')).toBeUndefined();
  });

  it('includes Denim with its November 2026 estimate', () => {
    const denim = getUpgradeById('denim');
    expect(denim?.estimate).toEqual({
      sepolia: 'November 2026',
      mainnet: 'November 2026',
    });
    expect(denim?.lifecycle).toEqual({ sepolia: {}, mainnet: {} });
  });

  it('lists 200ms Blocks as a Denim execution feature', () => {
    const change = getChangeBySlug('200ms-blocks');
    expect(change).toMatchObject({
      id: 'base-0010',
      title: '200ms Blocks',
      category: 'execution',
      upgrade: 'denim',
    });

    const execution = categoryGroupsForUpgrade('denim').find(
      (group) => group.category === 'execution',
    );
    expect(execution?.changeIds).toEqual(['base-0010']);
  });

  it('looks up changelog entries by slug', () => {
    const change = getChangeBySlug('native-account-abstraction');
    expect(change?.id).toBe('eip-8130');
    expect(getChangeBySlug('missing')).toBeUndefined();
  });

  it('groups upgrade changes by category', () => {
    const groups = categoryGroupsForUpgrade('azul');
    const execution = groups.find((group) => group.category === 'execution');
    const networking = groups.find((group) => group.category === 'networking');
    const flashblocks = groups.find((group) => group.category === 'flashblocks');
    const rpc = groups.find((group) => group.category === 'rpc');
    const proofs = groups.find((group) => group.category === 'proofs');
    expect(execution?.changeIds).toEqual([
      'eip-7823',
      'eip-7825',
      'eip-7883',
      'eip-7939',
      'eip-7951',
    ]);
    expect(networking?.changeIds).toEqual(['eip-7642', 'base-0002', 'base-0003']);
    expect(flashblocks?.changeIds).toEqual([]);
    expect(rpc?.changeIds).toEqual(['eip-7910', 'base-0004']);
    // The Azul proofs changes are consolidated into a single "Multiproofs" entry.
    expect(proofs?.changeIds).toEqual(['base-0001']);
  });

  it('matches the Azul overview execution and proofs titles', () => {
    const azulChanges = categoryGroupsForUpgrade('azul').flatMap((group) =>
      group.changeIds.map((id) => getChangeById(id)),
    );
    const titlesById = Object.fromEntries(
      azulChanges.filter(Boolean).map((change) => {
        if (!change) throw new Error('change not found');
        return [change.id, change.title];
      }),
    );

    expect([
      titlesById['eip-7823'],
      titlesById['eip-7825'],
      titlesById['eip-7883'],
      titlesById['eip-7939'],
      titlesById['eip-7951'],
      titlesById['eip-7642'],
      titlesById['eip-7910'],
      titlesById['base-0002'],
      titlesById['base-0003'],
    ]).toEqual([
      'Upper-Bound MODEXP',
      'Transaction Gas Limit Cap',
      'MODEXP Gas Cost Increase',
      'CLZ Opcode',
      'secp256r1 Precompile',
      'eth/69',
      'eth_config RPC Method',
      'Remove Account Balances & Receipts',
      'Use basev0 protocol ID for discv5',
    ]);

    expect(titlesById['base-0001']).toBe('Multiproofs');
  });

  it('applies a per-change activation override without affecting other networks', () => {
    const b20 = getChangeById('base-0005');
    const beryl = getUpgradeById('beryl');
    if (!b20) throw new Error('base-0005 not found');
    if (!beryl) throw new Error('beryl not found');
    const lifecycle = getLifecycleForChange(b20);
    // Mainnet is turned on after Beryl; Sepolia inherits the upgrade date.
    expect(lifecycle?.mainnet.timestamp).toBe('2026-07-08T18:00:00Z');
    expect(lifecycle?.sepolia.timestamp).toBe(beryl.lifecycle.sepolia.timestamp);
  });

  it('keeps upgrade-inherited lifecycle for changes without an override', () => {
    const rethV2 = getChangeById('base-0007');
    const beryl = getUpgradeById('beryl');
    if (!rethV2) throw new Error('base-0007 not found');
    if (!beryl) throw new Error('beryl not found');
    expect(getLifecycleForChange(rethV2)).toEqual(beryl.lifecycle);
  });

  it('never activates a change before its upgrade', () => {
    const activatedChanges = changes.filter((change) => change.activation);
    const missingUpgradeLifecycles = activatedChanges.filter(
      (change) => getUpgradeForChange(change)?.lifecycle === undefined,
    );
    expect(missingUpgradeLifecycles).toEqual([]);

    const earlyActivations = activatedChanges.flatMap((change) => {
      const upgradeLifecycle = getUpgradeForChange(change)?.lifecycle;
      return UPGRADE_NETWORKS.flatMap((network) => {
        const changeTs = change.activation?.[network]?.timestamp;
        const upgradeTs = upgradeLifecycle?.[network].timestamp;
        if (!changeTs || !upgradeTs) return [];
        return Date.parse(changeTs) < Date.parse(upgradeTs)
          ? [{ id: change.id, network, changeTs, upgradeTs }]
          : [];
      });
    });
    expect(earlyActivations).toEqual([]);
  });

  it('exposes the featured Vibenet change', () => {
    const vibenetChanges = getVibenetChanges();
    expect(vibenetChanges).toHaveLength(2);

    const change = getVibenetChangeById('eip-8130');
    expect(change).toBeDefined();
    expect(change?.vibenet.featured).toBe(true);
    expect(change?.vibenet.status).toBe('live');
  });

  it('links the B20 changelog entry to its Vibenet demo', () => {
    const b20 = getVibenetChangeById('base-0005');
    expect(b20?.vibenet.status).toBe('live');
    expect(b20?.vibenet.demo).toBe('/vibenet/demos/b20');
    // Not featured — the demo link surfaces on the changelog entry, not the
    // featured-changes rail.
    expect(b20?.vibenet.featured).toBe(false);
  });
});
