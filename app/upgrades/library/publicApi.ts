import { changes } from '../data/changes';
import { getLifecycleForChange, upgrades } from '../data/upgrades';
import { getVibenetChangeById } from '../data/vibenet';

import { UPGRADE_NETWORKS } from './display';
import { toPlainText } from './format';
import { getLifecycleState, getUpgradeStatus } from './lifecycle';
import type {
  Change,
  ChangeCategory,
  ChangeKind,
  GithubIssueRef,
  Lifecycle,
  LifecycleEstimate,
  LifecycleState,
  UpgradeStatus,
} from './types';

// Kept in sync with metadataBase in app/layout.tsx (same convention as
// sitemap.ts and robots.ts).
const BASE_URL = 'https://chain.base.org';

/**
 * Public serialization of the upgrades + changes data set, shared by
 * /api/upgrades. Deliberately decoupled from the internal `Change`/`Upgrade`
 * types: those are free to churn, this shape is a contract with external
 * consumers.
 *
 * Three things it resolves that the raw modules do not:
 *   - `lifecycle` per change runs through getLifecycleForChange, so `activation`
 *     overrides are already applied and a consumer never has to know the
 *     inheritance rule.
 *   - `state` / `status` are computed against a single `nowMs`, so every entry
 *     in one response is evaluated at the same instant.
 *   - `summary` / `migrationNotes` are flattened to plain text. In the source
 *     modules they are rich text carrying our Tailwind classes; publishing that
 *     would leak presentation into the contract and freeze our markup. If a
 *     consumer ever needs the markup, add a `summaryHtml` alongside — additive
 *     and non-breaking, where removing it later would not be.
 */

export type PublicLifecycleEntry = {
  /** ISO 8601, or null when no date is committed yet. */
  timestamp: string | null;
  state: LifecycleState;
  /** Coarse human estimate ("September 2026"), only when there is no timestamp. */
  estimate?: string;
};

export type PublicLifecycle = Record<(typeof UPGRADE_NETWORKS)[number], PublicLifecycleEntry>;

export type PublicVibenet = {
  status: LifecycleState;
  timestamp: string | null;
  featured: boolean;
  /** Absolute URL to the live demo, when one exists. */
  demo: string | null;
};

type PublicChangeBase = {
  id: string;
  slug: string;
  kind: ChangeKind;
  title: string;
  category: ChangeCategory;
  upgrade: string | null;
  /** Plain text — rich-text markup is stripped, see the module comment. */
  summary: string;
  /** Plain text, and empty when the change has no migration guidance. */
  migrationNotes: string;
  lastUpdated: string;
  /** Canonical human-readable page for this change. */
  url: string;
  /** Resolved per-network activation. Null when the change has no upgrade yet. */
  lifecycle: PublicLifecycle | null;
  specUrl: string | null;
  relatedRepos: string[];
  githubIssues: GithubIssueRef[];
  vibenet?: PublicVibenet;
};

export type PublicChange = PublicChangeBase &
  (
    | {
        kind: 'eip';
        eipNumber: string;
        relatedEips: string[];
        upstreamUrl: string;
        ethereumFork: string | null;
      }
    | { kind: 'base'; baseNumber: string; owner: string | null }
  );

export type PublicUpgrade = {
  id: string;
  name: string;
  summary: string;
  status: UpgradeStatus;
  lifecycle: PublicLifecycle;
  url: string;
  specUrl: string | null;
  blog: string | null;
  changeCount: number;
  changes: PublicChange[];
};

export type UpgradesPayload = {
  /** When this response was computed — the instant every `state` is relative to. */
  generatedAt: string;
  upgradeCount: number;
  changeCount: number;
  /** Chronological: oldest upgrade first. */
  upgrades: PublicUpgrade[];
};

function publicLifecycle(
  lifecycle: Lifecycle,
  nowMs: number,
  estimate?: LifecycleEstimate,
): PublicLifecycle {
  return Object.fromEntries(
    UPGRADE_NETWORKS.map((network) => {
      const entry = lifecycle[network];
      const timestamp = entry.timestamp ?? null;
      return [
        network,
        {
          timestamp,
          state: getLifecycleState(entry, nowMs),
          // An estimate is only meaningful while a real date is missing.
          ...(!timestamp && estimate?.[network] ? { estimate: estimate[network] } : {}),
        },
      ];
    }),
  ) as PublicLifecycle;
}

function publicChange(change: Change, nowMs: number): PublicChange {
  const lifecycle = getLifecycleForChange(change);
  const vibenet = getVibenetChangeById(change.id)?.vibenet;

  const base: PublicChangeBase = {
    id: change.id,
    slug: change.slug,
    kind: change.kind,
    title: change.title,
    category: change.category,
    upgrade: change.upgrade ?? null,
    summary: toPlainText(change.summary),
    migrationNotes: toPlainText(change.migrationNotes),
    lastUpdated: change.lastUpdated,
    url: `${BASE_URL}/upgrades/changelog/${change.slug}`,
    lifecycle: lifecycle ? publicLifecycle(lifecycle, nowMs) : null,
    specUrl: change.specUrl || null,
    relatedRepos: change.relatedRepos ?? [],
    githubIssues: change.githubIssues,
    ...(vibenet
      ? {
          vibenet: {
            status: vibenet.status,
            timestamp: vibenet.timestamp ?? null,
            featured: vibenet.featured,
            demo: vibenet.demo ? `${BASE_URL}${vibenet.demo}` : null,
          },
        }
      : {}),
  };

  return change.kind === 'eip'
    ? {
        ...base,
        kind: 'eip',
        eipNumber: change.eipNumber,
        relatedEips: change.relatedEips,
        upstreamUrl: change.upstreamUrl,
        ethereumFork: change.ethereumFork ?? null,
      }
    : {
        ...base,
        kind: 'base',
        baseNumber: change.baseNumber,
        owner: change.owner ?? null,
      };
}

export function buildUpgradesPayload(nowMs: number = Date.now()): UpgradesPayload {
  const byId = new Map(changes.map((change) => [change.id, change]));

  const serialized: PublicUpgrade[] = upgrades.map((upgrade) => {
    // `categories` is already ordered by CATEGORY_ORDER, so flattening it keeps
    // API order identical to the order the UI renders.
    const upgradeChanges = upgrade.categories
      .flatMap((group) => group.changeIds)
      .map((id) => byId.get(id))
      .filter((change): change is Change => Boolean(change))
      .map((change) => publicChange(change, nowMs));

    return {
      id: upgrade.id,
      name: upgrade.name,
      // Plain today, but flattened for the same reason change summaries are:
      // the contract should not depend on an editor keeping markup out.
      summary: toPlainText(upgrade.summary),
      status: getUpgradeStatus(upgrade.lifecycle, nowMs),
      lifecycle: publicLifecycle(upgrade.lifecycle, nowMs, upgrade.estimate),
      url: `${BASE_URL}/upgrades/upgrade/${upgrade.id}`,
      specUrl: upgrade.specUrl || null,
      blog: upgrade.blog || null,
      changeCount: upgradeChanges.length,
      changes: upgradeChanges,
    };
  });

  return {
    generatedAt: new Date(nowMs).toISOString(),
    upgradeCount: serialized.length,
    changeCount: serialized.reduce((total, upgrade) => total + upgrade.changeCount, 0),
    upgrades: serialized,
  };
}
