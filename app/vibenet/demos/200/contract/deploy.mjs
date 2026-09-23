// Deploy BlockRunnerScores to vibenet and print the address.
//
//   node app/vibenet/demos/200/contract/deploy.mjs
//
// Uses DEPLOYER_PK if set; otherwise generates a throwaway key and funds it
// from the vibenet faucet. After a vibenet regenesis, run this again and put
// the printed address into app/vibenet/demos/200/lib/leaderboard.ts.
import { readFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, http } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const RPC = process.env.VIBENET_RPC_URL || 'https://rpc.vibes.base.org';
const FAUCET = 'https://api.vibes.base.org/api/vibenet/faucet/drip';
const chain = { id: 84538453, name: 'Vibenet', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const artifact = JSON.parse(readFileSync(new URL('./BlockRunnerScores.json', import.meta.url), 'utf8'));

const pk = process.env.DEPLOYER_PK ?? generatePrivateKey();
const account = privateKeyToAccount(pk);
const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = createWalletClient({ account, chain, transport: http(RPC) });

if ((await pub.getBalance({ address: account.address })) === 0n) {
  console.log('funding deployer', account.address, 'from faucet…');
  const res = await fetch(FAUCET, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: account.address }) });
  if (!res.ok) throw new Error(`faucet: ${res.status} ${await res.text()}`);
  while ((await pub.getBalance({ address: account.address })) === 0n) await new Promise((r) => setTimeout(r, 500));
}

const hash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode });
const receipt = await pub.waitForTransactionReceipt({ hash, pollingInterval: 200 });
console.log('BlockRunnerScores deployed at:', receipt.contractAddress);
