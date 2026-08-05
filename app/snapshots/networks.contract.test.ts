import fs from 'node:fs';
import path from 'node:path';

import { isNetworkVisibleInUi, NETWORK_CONFIGS, NETWORK_IDS } from './r2';

/**
 * Contract for the snapshots API surface.
 *
 * The regression this exists to prevent: #14 "Cobalt and fixes" wanted zeronet
 * off the snapshots *page* and deleted its chain descriptor to get there. That
 * descriptor is also what /api/snapshots enumerates, so ?network=zeronet started
 * answering 400 and zeronet nodes could no longer sync from a snapshot. The page
 * looked right, nothing failed, and it went unnoticed.
 *
 * Every network listed here must keep being served. Hiding one from the UI is a
 * `hiddenFromUi` flag, never a deletion.
 *
 * Adding a network? Add it to EXPECTED_NETWORKS in the same change. Removing one
 * is intentional and rare: delete it here too, and make sure no node still syncs
 * from that bucket first.
 */
const EXPECTED_NETWORKS = ['mainnet', 'sepolia', 'zeronet'] as const;

/** Networks deliberately absent from the snapshots page but still served. */
const EXPECTED_HIDDEN_FROM_UI = ['zeronet'] as const;

describe('snapshots API network contract', () => {
  it.each(EXPECTED_NETWORKS)('serves %s from the API', (id) => {
    expect(NETWORK_IDS).toContain(id);
  });

  it('serves exactly the expected networks — no silent additions or removals', () => {
    expect([...NETWORK_IDS].sort()).toEqual([...EXPECTED_NETWORKS].sort());
  });

  it.each(EXPECTED_HIDDEN_FROM_UI)('hides %s from the page but keeps serving it', (id) => {
    expect(NETWORK_IDS).toContain(id);
    expect(isNetworkVisibleInUi(id)).toBe(false);
  });

  it('leaves every other network visible', () => {
    const hidden = new Set<string>(EXPECTED_HIDDEN_FROM_UI);
    for (const id of NETWORK_IDS) {
      if (!hidden.has(id)) expect(isNetworkVisibleInUi(id)).toBe(true);
    }
  });

  it('gives every network the config the loader needs', () => {
    for (const network of NETWORK_CONFIGS) {
      expect(network.chainName, `${network.id} chainName`).toBeTruthy();
      expect(network.bucket, `${network.id} bucket`).toBeTruthy();
      expect(network.envPrefix, `${network.id} envPrefix`).toBeTruthy();
      expect(network.publicBaseUrl, `${network.id} publicBaseUrl`).toMatch(/^https:\/\//);
    }
  });

  it('keeps ids, buckets, and env prefixes unique', () => {
    for (const key of ['id', 'bucket', 'envPrefix'] as const) {
      const values = NETWORK_CONFIGS.map((n) => n[key]);
      expect(new Set(values).size, `duplicate ${key}`).toBe(values.length);
    }
  });

  // loadSnapshots throws if ANY network fails, so a network whose R2 credentials
  // were never provisioned 502s the whole endpoint — every network with it. This
  // catches the config half of that at PR time; the credentials themselves live
  // in Vercel and cannot be checked from here.
  it('documents every network\'s R2 credentials in .env.example', () => {
    const envExample = fs.readFileSync(
      path.join(process.cwd(), '.env.example'),
      'utf8',
    );
    for (const network of NETWORK_CONFIGS) {
      expect(
        envExample.includes(`${network.envPrefix}_`),
        `${network.id}: .env.example never mentions ${network.envPrefix}_*, so whoever ` +
          `deploys this has no signal that its R2 credentials must be set. Without them ` +
          `/api/snapshots returns 502 for every network, not just this one.`,
      ).toBe(true);
    }
  });
});
