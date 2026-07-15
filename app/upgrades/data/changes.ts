import { buildChangeSpecUrl } from '../library/specUrls';
import type { Change } from '../library/types';

function eipUrl(n: string) {
  return `https://eips.ethereum.org/EIPS/eip-${n}`;
}
function azulExecUrl(anchor: string) {
  return `https://docs.base.org/base-chain/specs/upgrades/azul/exec-engine#${anchor}`;
}
function azulProofsUrl(anchor = '') {
  return `https://docs.base.org/base-chain/specs/upgrades/azul/proofs${anchor ? `#${anchor}` : ''}`;
}

export const changes: Change[] = [
  {
    kind: 'eip',
    id: 'eip-7823',
    slug: 'upper-bound-modexp',
    eipNumber: '7823',
    relatedEips: ['EIP-198'],
    upstreamUrl: eipUrl('7823'),
    ethereumFork: 'Fusaka',
    title: 'Upper-Bound MODEXP',
    category: 'execution',
    upgrade: 'azul',
    summary:
      'Caps MODEXP precompile inputs to a maximum of 1024 bytes per field. Calls with larger inputs are rejected.',
    migrationNotes:
      'RSA-style verifiers and pairing libraries should add explicit length guards. Update unit tests to cover the new gas profile so regressions surface early.',
    lastUpdated: '2026-04-21',
    relatedRepos: [],
    githubIssues: [],
    specUrl: azulExecUrl('upper-bound-modexp'),
  },
  {
    kind: 'eip',
    id: 'eip-7825',
    slug: 'transaction-gas-limit-cap',
    eipNumber: '7825',
    relatedEips: [],
    upstreamUrl: eipUrl('7825'),
    ethereumFork: 'Fusaka',
    title: 'Transaction Gas Limit Cap',
    category: 'execution',
    upgrade: 'azul',
    summary:
      'Introduces a protocol-level maximum gas limit of 16,777,216 (2^24) per transaction. Transactions above this cap are rejected during validation, and Base adopts the same cap as L1 to maximize Ethereum equivalence. Deposit transactions will be exempt from the transaction gas limit cap. They are already limited to 20,000,000 gas as that is the most gas that can be included in an L1 block.',
    migrationNotes:
      "App developers with very large gas transactions may need to make adjustments to their contracts to ensure they don't exceed the gas limit. Wallet developers should enforce the cap at transaction creation.",
    lastUpdated: '2026-04-22',
    relatedRepos: [],
    githubIssues: [],
    specUrl: azulExecUrl('transaction-gas-limit-cap'),
  },
  {
    kind: 'eip',
    id: 'eip-7883',
    slug: 'modexp-gas-cost-increase',
    eipNumber: '7883',
    relatedEips: ['EIP-2565'],
    upstreamUrl: eipUrl('7883'),
    ethereumFork: 'Fusaka',
    title: 'MODEXP Gas Cost Increase',
    category: 'execution',
    upgrade: 'azul',
    summary:
      'Raises the MODEXP precompile minimum gas cost from 200 to 500 and triples the general cost calculation.',
    migrationNotes:
      'Tooling and infrastructure for gas cost estimation and optimization should be updated to reflect the new gas cost.',
    lastUpdated: '2026-04-21',
    relatedRepos: [],
    githubIssues: [],
    specUrl: azulExecUrl('modexp-gas-cost-increase'),
  },
  {
    kind: 'eip',
    id: 'eip-7939',
    slug: 'clz-opcode',
    eipNumber: '7939',
    relatedEips: [],
    upstreamUrl: eipUrl('7939'),
    ethereumFork: 'Fusaka',
    title: 'CLZ Opcode',
    category: 'execution',
    upgrade: 'azul',
    summary:
      'Adds a new CLZ opcode that counts the number of leading zero bits in a 256-bit word, returning 256 if the input is zero.',
    migrationNotes:
      'This opcode will enable more efficient implementations of certain cryptographic and mathematical operations onchain.',
    lastUpdated: '2026-04-19',
    relatedRepos: [],
    githubIssues: [],
    specUrl: azulExecUrl('clz-opcode'),
  },
  {
    kind: 'eip',
    id: 'eip-7951',
    slug: 'secp256r1-precompile-gas-cost',
    eipNumber: '7951',
    relatedEips: [],
    upstreamUrl: eipUrl('7951'),
    ethereumFork: 'Fusaka',
    title: 'secp256r1 Precompile',
    category: 'execution',
    upgrade: 'azul',
    summary:
      'Specifies the secp256r1 precompile at address 0x100. From Azul, the gas cost increases to 6,900 to match the L1 gas cost specified in EIP-7951.',
    migrationNotes:
      'App and wallet developers can support native signing from secp256r1 enabled devices to provide better user experience.',
    lastUpdated: '2026-04-18',
    relatedRepos: [],
    githubIssues: [],
    specUrl: azulExecUrl('secp256r1-precompile-gas-cost'),
  },
  {
    kind: 'eip',
    id: 'eip-7642',
    slug: 'eth-69',
    eipNumber: '7642',
    relatedEips: [],
    upstreamUrl: eipUrl('7642'),
    ethereumFork: 'Fusaka',
    title: 'eth/69',
    category: 'networking',
    upgrade: 'azul',
    summary:
      'Updates the Ethereum wire protocol to version 69, removing legacy fields from the Status message and simplifying the handshake.',
    migrationNotes: '',
    lastUpdated: '2026-04-17',
    relatedRepos: [],
    githubIssues: [],
    specUrl: azulExecUrl('eth69'),
  },
  {
    kind: 'eip',
    id: 'eip-7910',
    slug: 'eth-config-rpc-method',
    eipNumber: '7910',
    relatedEips: [],
    upstreamUrl: eipUrl('7910'),
    ethereumFork: 'Fusaka',
    title: 'eth_config RPC Method',
    category: 'rpc',
    upgrade: 'azul',
    summary:
      'Introduces the <code>eth_config</code> JSON-RPC method, which returns chain configuration parameters such as fork activation timestamps.',
    migrationNotes:
      "After the Azul upgrade, Base will expose <code>eth_config</code> using the standard EIP-7910 response schema. For Base-specific behavior, please reference our <a class='text-blue-600 hover:underline' href='https://docs.base.org/base-chain/specs/upgrades/azul/exec-engine#eth_config-rpc-method' target='_blank' rel='noopener noreferrer'>docs site</a>.",
    lastUpdated: '2026-04-23',
    relatedRepos: [],
    githubIssues: [],
    specUrl: azulExecUrl('eth_config-rpc-method'),
  },
  {
    kind: 'base',
    id: 'base-0001',
    slug: 'proof-system',
    baseNumber: '0001',
    owner: 'Proofs team',
    title: 'Proof System',
    category: 'proofs',
    upgrade: 'azul',
    summary:
      'Introduces a multi-proof system for L2 checkpoints, where AggregateVerifier can verify one or two proofs for the same proposal before withdrawals rely on it.',
    migrationNotes:
      'Update withdrawal monitors and bridge backends to track AggregateVerifier games and their proof-backed settlement path.',
    lastUpdated: '2026-04-12',
    relatedRepos: [],
    githubIssues: [],
    specUrl: azulProofsUrl(),
  },
  {
    kind: 'base',
    id: 'base-0002',
    slug: 'new-changed-onchain-components',
    baseNumber: '0002',
    owner: 'Proofs team',
    title: 'New/Changed Onchain Components',
    category: 'proofs',
    upgrade: 'azul',
    summary:
      'Adds AggregateVerifier plus proof-specific verifier contracts, reduces DelayedWETH to a 1-day withdrawal delay, and moves legacy finality timing out of OptimismPortal2 and AnchorStateRegistry.',
    migrationNotes:
      'Read proof game timing from AggregateVerifier and remove assumptions that OptimismPortal2 or AnchorStateRegistry add a separate 3.5-day delay.',
    lastUpdated: '2026-04-10',
    relatedRepos: [],
    githubIssues: [],
    specUrl: azulProofsUrl('newchanged-onchain-components'),
  },
  {
    kind: 'base',
    id: 'base-0003',
    slug: 'proposer',
    baseNumber: '0003',
    owner: 'Proofs team',
    title: 'Proposer',
    category: 'proofs',
    upgrade: 'azul',
    summary:
      'Turns safe or finalized Base L2 checkpoints into L1 AggregateVerifier games by requesting TEE proofs, verifying output roots, and submitting proposals with the required bond.',
    migrationNotes:
      'Monitor proposal creation against canonical L2 checkpoint ranges and track the required AggregateVerifier game bond.',
    lastUpdated: '2026-04-09',
    relatedRepos: [],
    githubIssues: [],
    specUrl: azulProofsUrl('proposer'),
  },
  {
    kind: 'base',
    id: 'base-0004',
    slug: 'challenger',
    baseNumber: '0004',
    owner: 'Proofs team',
    title: 'Challenger',
    category: 'proofs',
    upgrade: 'azul',
    summary:
      'Checks in-progress AggregateVerifier games against canonical L2 state and disputes incorrect claims through the permissionless ZK proof challenge path.',
    migrationNotes:
      'Run or monitor challenger coverage for in-progress games and alert on disputes that identify invalid checkpoint claims.',
    lastUpdated: '2026-04-08',
    relatedRepos: [],
    githubIssues: [],
    specUrl: azulProofsUrl('challenger'),
  },
  {
    kind: 'base',
    id: 'base-0005',
    slug: 'tee-provers',
    baseNumber: '0005',
    owner: 'Proofs team',
    title: 'TEE Provers',
    category: 'proofs',
    upgrade: 'azul',
    summary:
      'Adds AWS Nitro Enclave-backed TEE provers for the common proposal path. The enclave re-executes requested L2 block ranges and signs resulting checkpoint outputs.',
    migrationNotes:
      'Document that TEE-backed proposals follow the common path and still use the long settlement window unless matched by ZK proof support.',
    lastUpdated: '2026-04-07',
    relatedRepos: [],
    githubIssues: [],
    specUrl: azulProofsUrl('tee-provers'),
  },
  {
    kind: 'base',
    id: 'base-0006',
    slug: 'remove-account-balances-receipts',
    baseNumber: '0006',
    owner: 'Flashblocks team',
    title: 'Remove Account Balances & Receipts',
    category: 'networking',
    upgrade: 'azul',
    summary:
      'Simplifies the FlashblocksMetadata payload by removing new_account_balances and receipts from the Flashblocks WebSocket format.',
    migrationNotes:
      'Hydrate balances and receipts from canonical RPC instead of Flashblocks WebSocket payloads. The access_list field remains but is not populated in Azul.',
    lastUpdated: '2026-04-17',
    relatedRepos: [],
    githubIssues: [],
    specUrl: azulExecUrl('remove-account-balances--receipts'),
  },
  {
    kind: 'base',
    id: 'base-0007',
    slug: 'basev0-protocol-id-discv5',
    baseNumber: '0007',
    owner: 'Node team',
    title: 'Use basev0 protocol ID for discv5',
    category: 'networking',
    upgrade: 'azul',
    summary:
      'Updates execution-layer discovery to use basev0 as the protocol ID so Base nodes can find each other more quickly, especially on smaller networks like Sepolia.',
    migrationNotes:
      'Upgrade node clients before Azul activation so discovery uses the Base-specific basev0 protocol ID.',
    lastUpdated: '2026-04-17',
    relatedRepos: [],
    githubIssues: [],
    specUrl: azulExecUrl('discovery-protocol-now-uses-basev0-protocol-id'),
  },
  {
    kind: 'base',
    id: 'base-0008',
    slug: 'zk-provers',
    baseNumber: '0008',
    owner: 'Proofs team',
    title: 'ZK Provers',
    category: 'proofs',
    upgrade: 'azul',
    summary:
      'Adds permissionless ZK provers for dispute verification, especially to challenge invalid TEE-backed proposals or invalidate bad ZK claims.',
    migrationNotes:
      'Surface proof status carefully: ZK proofs provide the permissionless override path, while normal proposal creation does not depend on ZK provers in Azul.',
    lastUpdated: '2026-04-12',
    relatedRepos: [],
    githubIssues: [],
    specUrl: azulProofsUrl('zk-provers'),
  },
  {
    kind: 'base',
    id: 'base-0009',
    slug: 'prover-registrar',
    baseNumber: '0009',
    owner: 'Proofs team',
    title: 'Prover Registrar',
    category: 'proofs',
    upgrade: 'azul',
    summary:
      'Keeps the onchain TEEProverRegistry in sync with the live set of Nitro prover signers, attesting active signer identities and removing orphaned signers.',
    migrationNotes:
      'Use the registry as the source of accepted TEE signer identities instead of hard-coding Nitro prover signers.',
    lastUpdated: '2026-04-12',
    relatedRepos: [],
    githubIssues: [],
    specUrl: azulProofsUrl('prover-registrar'),
  },
  {
    kind: 'base',
    id: 'base-0010',
    slug: 'engine-api-usage',
    baseNumber: '0010',
    owner: 'Node team',
    title: 'Engine API Usage',
    category: 'rpc',
    upgrade: 'azul',
    summary:
      "At and after Azul activation, block production and import use the following Engine API methods: <ul class='my-2 flex flex-col gap-1 list-disc pl-5'><li><code>engine_forkchoiceUpdatedV3</code> for starting block builds and forkchoice synchronization.</li><li><code>engine_getPayloadV5</code> for fetching built payloads.</li><li><code>engine_newPayloadV4</code> for importing payloads into the execution engine.</li></ul><code>engine_getPayloadV5</code> returns a V5 envelope, but the contained execution payload is still V4-shaped. As a result, payload insertion continues through <code>engine_newPayloadV4</code> (there is no <code>engine_newPayloadV5</code> path used by Base Azul clients).<p class='mt-2'>Azul constraints for this flow:</p><ul class='mt-2 flex flex-col gap-1 list-disc pl-5'><li>Blob-related Engine API inputs are constrained to empty values:</li><ul class='mt-2 flex flex-col gap-1 list-disc pl-5'><li><code>expectedBlobVersionedHashes</code> MUST be an empty array.</li><li><code>blobsBundle</code> in <code>engine_getPayloadV5</code> responses is expected to be empty.</li></ul><li><code>executionRequests</code> in <code>engine_newPayloadV4</code> MUST be an empty array.</li></ul>",
    migrationNotes:
      'Use the registry as the source of accepted TEE signer identities instead of hard-coding Nitro prover signers.',
    lastUpdated: '2026-04-12',
    relatedRepos: [],
    githubIssues: [],
    specUrl: azulExecUrl('engine-api-usage'),
  },
  {
    kind: 'base',
    id: 'base-0011',
    slug: 'b20',
    baseNumber: '0011',
    owner: 'Protocol team',
    title: 'B20',
    category: 'precompile',
    upgrade: 'beryl',
    // Sepolia activates with Beryl (inherited); Mainnet is turned on after the
    // upgrade goes live.
    activation: {
      mainnet: { timestamp: '2026-07-08T18:00:00Z' },
    },
    summary:
      "B20 implements the ERC-20 specification, making it interoperable with all existing systems built on ERC-20 like wallets, exchanges, data indexers, and onchain protocols. What's different is how it runs. Rather than a conventional smart contract, a B20 is a precompiled contract: its logic runs natively in the node software, written in Rust and executed directly instead of as onchain EVM bytecode. <br/><br/>Issuers can deploy and configure tokens of all kinds: stablecoins, real-world assets, and onchain-native tokens. When deploying new tokens, we've consistently seen issuers rebuild compliance features from scratch, slowing their speed to market and introducing the risk of missteps. To accelerate issuing new high-quality assets, B20 comes with an Issuer Toolkit purpose-built for teams facing these requirements.",
    migrationNotes:
      'For new Base tokens, choose the Asset or Stablecoin variant and configure policy scopes, supply caps, pause controls, memos, ERC-2612 permit, and ERC-7572 contract metadata during bootstrap. Existing ERC-20 tooling can continue to use the standard ERC-20 selector surface.',
    lastUpdated: '2026-06-09',
    relatedRepos: ['https://github.com/base/base-std/blob/main/docs/B20'],
    githubIssues: [],
    specUrl: 'https://github.com/base/base-std/blob/main/docs/B20/README.md',
  },
  {
    kind: 'base',
    id: 'base-0012',
    slug: 'reducing-canonical-withdrawal-delay',
    baseNumber: '0012',
    owner: 'Bridge team',
    title: 'Reducing Canonical Withdrawal Delay',
    category: 'bridging',
    upgrade: 'beryl',
    summary:
      'The single-proof dispute game finalization window is reduced from 7 days to 5 days. The dual-proof fast path (TEE + ZK) introduced in Azul remains at 1 day. <br/><br/>Shortening the single-proof window frees capital for fast-bridge liquidity providers sooner, reducing fees and improving reliability for users who bridge through third-party partners.',
    migrationNotes:
      'Update any bridge monitoring dashboards or user-facing copy that references the 7-day withdrawal period.',
    lastUpdated: '2026-05-28',
    relatedRepos: [],
    githubIssues: [],
    specUrl: buildChangeSpecUrl('beryl', 'reducing-canonical-withdrawal-delay'),
  },
  {
    kind: 'base',
    id: 'base-0013',
    slug: 'reth-2-2',
    baseNumber: '0013',
    owner: 'Node team',
    title: 'Reth V2',
    category: 'execution',
    upgrade: 'beryl',
    summary:
      'Ships Reth V2 as the reference execution client for Base nodes, delivering significant sync speed and throughput improvements.',
    migrationNotes:
      'Node operators should upgrade to the Reth V2 binary before Beryl activation. No application-level changes are required.',
    lastUpdated: '2026-05-28',
    relatedRepos: [],
    githubIssues: [],
    specUrl: buildChangeSpecUrl('beryl', 'reth-2-2'),
  },
  {
    kind: 'eip',
    id: 'eip-8130',
    slug: 'account-abstraction-by-account-configuration',
    eipNumber: '8130',
    relatedEips: ['EIP-170', 'EIP-2718'],
    upstreamUrl: eipUrl('8130'),
    ethereumFork: 'Not scheduled',
    title: 'Account Abstraction by Account Configuration',
    category: 'wallet',
    summary:
      'Enables account abstraction feature set through onchain account configurations and a new transaction type.',
    migrationNotes:
      'Audit any meta-transaction relayer, batch executor, or paymaster that constructs large transactions; enforce the new ceiling client-side to avoid wasted RPC round trips.',
    lastUpdated: '2026-04-22',
    relatedRepos: [],
    githubIssues: [],
    specUrl: eipUrl('8130'),
  },
];

export function getChangeById(id: string): Change | undefined {
  return changes.find((c) => c.id.toLowerCase() === id.toLowerCase());
}

export function getChangeBySlug(slug: string): Change | undefined {
  return changes.find((c) => c.slug.toLowerCase() === slug.toLowerCase());
}
