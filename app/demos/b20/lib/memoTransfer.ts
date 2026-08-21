export function shouldUseDelegatedMemoTransfer(
  variant: 'asset' | 'stablecoin',
  batchApprove: boolean,
  hasWallet: boolean,
): boolean {
  return variant === 'asset' && batchApprove && hasWallet;
}
