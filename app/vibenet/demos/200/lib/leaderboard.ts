// Block Runner's onchain high-score board. No names: a score belongs to the
// wallet address that submitted it, and only your best is kept. Each browser
// gets a throwaway devnet key (localStorage); the first submission funds it
// from the vibenet faucet. The contract keeps the top ten sorted, so reading
// is one call.
//
// Vibenet is regenesised periodically. When the board vanishes, redeploy with
// contract/deploy.mjs and update SCORES_ADDRESS below.
import { createPublicClient, createWalletClient, http, type Address, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import { VIBENET_RPC_URL } from '../../../library/config';
import { vibenetApi } from '../../../library/client';
import artifact from '../contract/BlockRunnerScores.json';

export const SCORES_ADDRESS: Address = '0x24411613aab0b4f551942f50af090941bd57e07d';

const KEY_STORAGE = 'block-runner:pk';

const chain = {
  id: 84538453,
  name: 'Vibenet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [VIBENET_RPC_URL] } },
} as const;

export type BoardEntry = { player: Address; score: number };

const ZERO: Address = '0x0000000000000000000000000000000000000000';

/** Drop empty slots and normalize the fixed-size board the contract returns. */
export function parseBoard(raw: readonly { player: Address; score: bigint }[]): BoardEntry[] {
  return raw
    .filter((e) => e.player !== ZERO && e.score > 0n)
    .map((e) => ({ player: e.player, score: Number(e.score) }));
}

/** `0x1234…abcd` — the whole identity on the board. */
export function shortAddr(a: Address): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function pub() {
  return createPublicClient({ chain, transport: http(VIBENET_RPC_URL) });
}

/** The browser's throwaway score wallet (created on first use). */
export function scoreWallet(): { address: Address; pk: Hex } {
  let pk: Hex | null = null;
  try {
    pk = window.localStorage.getItem(KEY_STORAGE) as Hex | null;
  } catch {
    pk = null;
  }
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    pk = generatePrivateKey();
    try {
      window.localStorage.setItem(KEY_STORAGE, pk);
    } catch {
      /* Ephemeral key: scores just will not persist across reloads. */
    }
  }
  return { address: privateKeyToAccount(pk).address, pk };
}

export async function fetchBoard(): Promise<BoardEntry[]> {
  const raw = (await pub().readContract({
    address: SCORES_ADDRESS,
    abi: artifact.abi,
    functionName: 'top',
  })) as readonly { player: Address; score: bigint }[];
  return parseBoard(raw);
}

export async function fetchBest(address: Address): Promise<number> {
  const raw = (await pub().readContract({
    address: SCORES_ADDRESS,
    abi: artifact.abi,
    functionName: 'best',
    args: [address],
  })) as bigint;
  return Number(raw);
}

/**
 * Submit a score from the browser's throwaway wallet. Funds it from the
 * faucet on first use. Resolves to the tx hash once mined.
 */
export async function submitScore(score: number, onStatus?: (s: 'funding' | 'submitting' | 'confirming') => void): Promise<Hex> {
  const { pk } = scoreWallet();
  const account = privateKeyToAccount(pk);
  const client = pub();
  if ((await client.getBalance({ address: account.address })) === 0n) {
    onStatus?.('funding');
    await vibenetApi.faucet.drip({ address: account.address });
    const until = Date.now() + 20_000;
    while ((await client.getBalance({ address: account.address })) === 0n) {
      if (Date.now() > until) throw new Error('The faucet did not fund the score wallet in time.');
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  onStatus?.('submitting');
  const wallet = createWalletClient({ account, chain, transport: http(VIBENET_RPC_URL) });
  const hash = await wallet.writeContract({
    address: SCORES_ADDRESS,
    abi: artifact.abi,
    functionName: 'submit',
    args: [BigInt(score)],
  });
  onStatus?.('confirming');
  await client.waitForTransactionReceipt({ hash, pollingInterval: 200, timeout: 30_000 });
  return hash;
}
