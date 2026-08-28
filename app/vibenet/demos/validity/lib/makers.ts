import type { StoredAccount } from '../../account/library/model';

export const MAKER_LABELS = ['Validity maker A', 'Validity maker B'] as const;

export function rootAccount(account: StoredAccount, accounts: StoredAccount[]): StoredAccount {
  let current = account;
  const seen = new Set<string>([current.id]);
  while (current.parentId) {
    const parent = accounts.find((item) => item.id === current.parentId);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    current = parent;
  }
  return current;
}

type CreateSub = (
  label: string,
  opts?: { withSpareKey?: boolean; parent?: StoredAccount },
) => { account: StoredAccount } | null;

/** Find or create the two delegated maker subaccounts under `parent`. */
export function ensureMakers(
  parent: StoredAccount,
  accounts: StoredAccount[],
  existingIds: [string, string] | undefined,
  create: CreateSub,
): [StoredAccount, StoredAccount] {
  const found: StoredAccount[] = [];
  for (const id of existingIds ?? []) {
    const match = accounts.find((item) => item.id === id);
    if (match) found.push(match);
  }
  for (const label of MAKER_LABELS) {
    if (found.length >= 2) break;
    const existing = accounts.find(
      (item) => item.parentId === parent.id && item.label === label && !found.some((row) => row.id === item.id),
    );
    if (existing) found.push(existing);
  }
  while (found.length < 2) {
    const label = MAKER_LABELS[found.length] ?? `Validity maker ${found.length + 1}`;
    const created = create(label, { withSpareKey: true, parent });
    if (!created) throw new Error('Could not create a maker subaccount.');
    found.push(created.account);
  }
  return [found[0], found[1]];
}
