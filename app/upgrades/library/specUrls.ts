export function buildChangeSpecUrl(upgradeId: string, anchor: string): string {
  return `https://docs.base.org/base-chain/specs/upgrades/${upgradeId}/#${anchor.replace(/^#/, '')}`;
}
