import type { Hex } from 'viem';

export type DeploymentOperation =
  | { data: Hex; kind: 'role'; role: string }
  | { data: Hex; kind: 'cap'; amount: string; symbol: string }
  | { data: Hex; kind: 'metadata' }
  | { data: Hex; kind: 'mint'; amount: string; symbol: string; memo: string }
  | { data: Hex; kind: 'policy'; id: bigint; scope: string };

export function chunkDeploymentOperations(
  operations: DeploymentOperation[],
  size = 6,
): DeploymentOperation[][] {
  const chunks: DeploymentOperation[][] = [];
  for (let index = 0; index < operations.length; index += size) {
    chunks.push(operations.slice(index, index + size));
  }
  return chunks;
}

// Stablecoin creation is split across several transactions in this demo.
// Keep the description derived from the calls in each transaction so the UI
// never claims that a setting has been applied in a different batch.
export function describeStablecoinOperations(operations: DeploymentOperation[]): string {
  const clauses: string[] = [];
  const roles = operations.filter((operation) => operation.kind === 'role').map((operation) => operation.role);
  if (roles.length) {
    clauses.push(`Grant ${roles.join(', ')} to the EIP-8130 account`);
  }
  for (const operation of operations) {
    switch (operation.kind) {
      case 'cap':
        clauses.push(`set the supply cap to ${operation.amount} ${operation.symbol}`);
        break;
      case 'metadata':
        clauses.push('save the token information link');
        break;
      case 'mint':
        clauses.push(
          `mint ${operation.amount} ${operation.symbol} to the EIP-8130 account with the “${operation.memo}” memo`,
        );
        break;
      case 'policy':
        clauses.push(`attach policy ${operation.id.toString()} to ${operation.scope}`);
        break;
      case 'role':
        break;
    }
  }
  if (!clauses.length) return '';
  return `${clauses.join('; ')}.`;
}
