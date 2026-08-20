export function canUseTokenForGas(
  variant: 'asset' | 'stablecoin' | undefined,
  isAdmin: boolean,
  isOperator: boolean,
): boolean {
  return variant === 'stablecoin' && (isAdmin || isOperator);
}
