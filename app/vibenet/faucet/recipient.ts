import type { StoredAccount } from '../demos/account/library/model';

/** Prefer the account currently selected in the demos, then any saved account. */
export function defaultFaucetRecipient(
  accounts: Pick<StoredAccount, 'id' | 'address'>[],
  activeAccountId: string | null,
): string | null {
  return accounts.find((account) => account.id === activeAccountId)?.address ?? accounts[0]?.address ?? null;
}
