import { type Address, type Hex, type PublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import type { WalletSigner } from '../../account/shared';
import { padFees, type FeeFields } from './fees';
import { VIBENET_CHAIN } from './rpc';

const FALLBACK_FEES: FeeFields = {
  maxFeePerGas: 1_000_000_000n,
  maxPriorityFeePerGas: 1_000_000n,
};

type Eip1559Call = { to: Address; data: Hex };

async function estimateFees(client: PublicClient): Promise<FeeFields> {
  const estimated = await client.estimateFeesPerGas().catch(() => null);
  return estimated?.maxFeePerGas !== undefined && estimated.maxPriorityFeePerGas !== undefined
    ? padFees(estimated)
    : FALLBACK_FEES;
}

export async function signK1Eip1559Call(args: {
  client: PublicClient;
  signer: WalletSigner | null;
  call: Eip1559Call;
  gas: bigint;
  nonce?: number;
  fees?: FeeFields;
}): Promise<Hex> {
  const { client, signer, call, gas } = args;
  if (signer?.kind !== 'k1' || !signer.privateKey || !signer.address) {
    throw new Error('A K1 owner is required to sign EIP-1559 transactions.');
  }
  const [nonce, fees] = await Promise.all([
    args.nonce ?? client.getTransactionCount({ address: signer.address, blockTag: 'latest' }),
    args.fees ?? estimateFees(client),
  ]);
  return privateKeyToAccount(signer.privateKey).signTransaction({
    chainId: VIBENET_CHAIN.id,
    type: 'eip1559',
    nonce,
    to: call.to,
    data: call.data,
    value: 0n,
    gas,
    ...fees,
  });
}
