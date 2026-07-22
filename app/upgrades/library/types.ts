export type LifecycleState = 'live' | 'scheduled' | 'planning';

export type LifecycleStatusEntry = {
  timestamp?: string;
};

export type Lifecycle = {
  sepolia: LifecycleStatusEntry;
  mainnet: LifecycleStatusEntry;
};

/**
 * Human-readable launch estimate per network (e.g. "Q3 2026", "September 2026").
 * Display-only: it intentionally carries no parseable instant, so it never
 * affects lifecycle state (an upgrade with only an estimate stays "planning")
 * and gives date-scrapers nothing to mistake for a confirmed launch time.
 */
export type LifecycleEstimate = {
  sepolia?: string;
  mainnet?: string;
};

export type UpgradeStatus = 'live' | 'shipping' | 'scheduled' | 'planning';

export type ChangeCategory =
  | 'execution'
  | 'proofs'
  | 'networking'
  | 'rpc'
  | 'flashblocks'
  | 'wallet'
  | 'precompile'
  | 'bridging';

export type ChangeKind = 'eip' | 'base';

export type GithubIssueRef = {
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  url: string;
};

type ChangeBase = {
  id: string;
  slug: string;
  title: string;
  category: ChangeCategory;
  upgrade?: string;
  /**
   * Per-network activation override for features that are turned on after their
   * upgrade has gone live. A network entry here is authoritative for that
   * network (even an empty `{}`, which reads as "planning"), letting a change
   * stay scheduled/planning while its upgrade is already live. Omitted networks
   * inherit the upgrade's lifecycle.
   */
  activation?: Partial<Lifecycle>;
  summary: string;
  migrationNotes: string;
  lastUpdated: string;
  githubIssues: GithubIssueRef[];
  relatedRepos?: string[];
  specUrl?: string;
  image?: string;
};

export type EipChange = ChangeBase & {
  kind: 'eip';
  eipNumber: string;
  relatedEips: string[];
  upstreamUrl: string;
  ethereumFork?: string;
};

export type BaseChange = ChangeBase & {
  kind: 'base';
  baseNumber: string;
  owner?: string;
};

export type Change = EipChange | BaseChange;

export type UpgradeCategoryGroup = {
  category: ChangeCategory;
  changeIds: string[];
};

export type Upgrade = {
  id: string;
  name: string;
  summary: string;
  lifecycle: Lifecycle;
  /** Optional coarse launch estimate shown wherever an exact date is absent. */
  estimate?: LifecycleEstimate;
  categories: UpgradeCategoryGroup[];
  migrationGuide: string[];
  specUrl: string;
  blog?: string;
};
