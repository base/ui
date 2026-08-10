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
    slug: 'multiproofs',
    baseNumber: '0001',
    owner: 'Proofs team',
    title: 'Multiproofs',
    category: 'proofs',
    upgrade: 'azul',
    summary:
      "<p class='font-bold'>Proof System</p><p class='mt-2 pb-4'>Introduces a multi-proof system for L2 checkpoints, where AggregateVerifier can verify one or two proofs for the same proposal before withdrawals rely on it.</p><p class='font-bold'>New/Changed Onchain Components</p><p class='mt-2 pb-4'>Adds AggregateVerifier plus proof-specific verifier contracts, reduces DelayedWETH to a 1-day withdrawal delay, and moves legacy finality timing out of OptimismPortal2 and AnchorStateRegistry.</p><p class='font-bold'>Proposer</p><p class='mt-2 pb-4'>Turns safe or finalized Base L2 checkpoints into L1 AggregateVerifier games by requesting TEE proofs, verifying output roots, and submitting proposals with the required bond.</p><p class='font-bold'>Challenger</p><p class='mt-2 pb-4'>Checks in-progress AggregateVerifier games against canonical L2 state and disputes incorrect claims through the permissionless ZK proof challenge path.</p><p class='font-bold'>TEE Provers</p><p class='mt-2 pb-4'>Adds AWS Nitro Enclave-backed TEE provers for the common proposal path. The enclave re-executes requested L2 block ranges and signs resulting checkpoint outputs.</p><p class='font-bold'>ZK Provers</p><p class='mt-2 pb-4'>Adds permissionless ZK provers for dispute verification, especially to challenge invalid TEE-backed proposals or invalidate bad ZK claims.</p><p class='font-bold'>Prover Registrar</p><p class='mt-2 pb-4'>Keeps the onchain TEEProverRegistry in sync with the live set of Nitro prover signers, attesting active signer identities and removing orphaned signers.</p>",
    migrationNotes:
      'Refer to our docs site for full details on the proofs system migration.',
    lastUpdated: '2026-04-12',
    relatedRepos: [],
    githubIssues: [],
    specUrl: azulProofsUrl(),
  },
  {
    kind: 'base',
    id: 'base-0002',
    slug: 'remove-account-balances-receipts',
    baseNumber: '0002',
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
    id: 'base-0003',
    slug: 'basev0-protocol-id-discv5',
    baseNumber: '0003',
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
    id: 'base-0004',
    slug: 'engine-api-usage',
    baseNumber: '0004',
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
    id: 'base-0005',
    slug: 'b20',
    baseNumber: '0005',
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
    id: 'base-0006',
    slug: 'reducing-canonical-withdrawal-delay',
    baseNumber: '0006',
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
    id: 'base-0007',
    slug: 'reth-2-2',
    baseNumber: '0007',
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
    slug: 'native-account-abstraction',
    eipNumber: '8130',
    relatedEips: ['EIP-170', 'EIP-2718'],
    upstreamUrl: eipUrl('8130'),
    ethereumFork: 'Not scheduled',
    title: 'Native Account Abstraction',
    category: 'accounts',
    upgrade: 'cobalt',
    summary:
      "<p class='pb-4'>EIP-8130 will bring Native Account Abstraction to Base and allow us to keep transactions opinionated and optimizable. Compared to the previous generation of Smart Accounts, we’ve been able to dramatically reduce the per transaction cost to end users by over 2x, while not compromising on our scaling goals. <br/><br/>Native Account Abstraction makes the following features native to the chain:</p><p class='mt-2 pb-4'><strong>Batch calls:</strong> Group multiple actions into a single transaction</p><p class='mt-2 pb-4'><strong>Sponsorship:</strong> Applications can pay for their users’ gas fees or allow them to pay in any token.</p><p class='mt-2 pb-4'><strong>Portability:</strong> Use the same account on any chain, even those that don’t support Native AA.</p><p class='mt-2 pb-4'><strong>Quantum Ready:</strong> Key rotation and multiple authentication schemes allow users to upgrade to post quantum authentication.</p><p class='mt-2 pb-4'><strong>High-throughput:</strong> Parallel nonces and large sender limits unlock high levels of concurrency.</p><p class='mt-2 pb-4'><strong>Session keys:</strong> Applications can act on your behalf with bounded and revocable permissions or create</p><p class='mt-2 pb-4'><strong>Sub-accounts:</strong> Fully isolated account owned by you and controllable by an application.</p><p class='mt-2'><strong>Metadata:</strong> Add memos and attributions to your transactions.</p>",
    migrationNotes:
      "<p><strong>Users</strong></p><p class='mt-2 pb-4'>If you’re using a standard (EOA) account, your account can automatically leverage new features such as gas sponsorship and batching. If you are using a smart (ERC-4337) account, there’s a one-time upgrade step that’ll allow you to benefit from lower gas costs and faster transaction inclusion.</p><p class='mt-2 pb-4'>Native Account Abstraction doesn’t lock you into Base. You can take your accounts to any other chain, even those that don’t currently support Native AA.</p><p class='mt-2'><strong>Application Developers</strong></p><p class='mt-2 pb-4'>Applications will continue to work the same without any changes (e.g. wallet_sendCalls will work for Native AA). You’ll also be able to leverage new features such as memos (to provide attribution) and better account management (via session keys and sub-accounts).</p><p class='mt-2'><strong>Wallets</strong></p><p class='mt-2 pb-4'>Wallets will continue to work the same way they do today without any changes. By adding support for Native AA, you can unlock new revenue opportunities via subscriptions and ERC-8168 payer services.</p><p class='mt-2'><strong>Node Operators</strong></p><p class='mt-2'>The only action required is to update your nodes to support Base Cobalt and allow access to several new RPC methods.</p>",
    lastUpdated: '2026-07-21',
    relatedRepos: ['https://github.com/base/eip-8130'],
    githubIssues: [],
    specUrl: '',
  },
  {
    kind: 'base',
    id: 'base-0008',
    slug: 'b20-improvements-cobalt',
    baseNumber: '0008',
    owner: 'Protocol team',
    title: 'B20 Improvements (Cobalt)',
    category: 'precompile',
    upgrade: 'cobalt',
    summary:
      "<p class='pb-4'>Cobalt will bring the following improvements to the B20 token standard:</p><p class='mt-2 pb-4'><strong>Pay transaction fees in B20s:</strong> as part of our rollout of EIP-8130, users will be able to pay transaction fees in B20s.</p><p class='mt-2 pb-4'><strong>Schedule Multiplier Updates:</strong> allows issuers to schedule (and optionally cancel) a multiplier to tokens. This allows for onchain representation of splits, without needing to mint or burn tokens. Only available on the Asset variant of B20.</p><p class='mt-2 pb-4'><strong>Transfer blocked:</strong> simplifies the current freeze and seize model by reducing the <code>burnBlocked</code> + <code>mint</code> steps into a new <code>transferFromBlocked</code> action.</p><p class='mt-2'><strong>New Policies - Union (||) &amp; Intersect (&amp;&amp;):</strong> the Union policy allows asset issuers managing many tokens the ability to share policies by default with the ability to enable overrides per token. The Intersect policy allows asset issuers the ability to compose allowlist behaviors with commonly-needed blocklists.</p>",
    migrationNotes:
      'Asset issuers can optionally adopt any of the new functionality provided in Cobalt.',
    lastUpdated: '2026-07-21',
    relatedRepos: ['https://github.com/base/base-std/blob/main/docs/B20'],
    githubIssues: [],
    specUrl: '',
  },
  {
    kind: 'base',
    id: 'base-0009',
    slug: 'dynamic-upgrades',
    baseNumber: '0009',
    owner: 'Node team',
    title: 'Dynamic Upgrades',
    category: 'rpc',
    upgrade: 'cobalt',
    summary:
      'Dynamic Upgrades introduces an Ethereum smart contract that stores upgrade timestamps for Base nodes, allowing nodes to query the contract and apply changes live. <br/><br/>The EL and CL each run an upgrade-signal poller that reads the contract over L1 RPC, saves the schedule into the client\'s activation overrides, and applies them wherever the schedule is used. Forks activate at the scheduled time with no restart. <br/><br/>We expect the decoupling of node releases and upgrade timestamps to reduce the number of node releases operators need to run. <br/><br/><strong>NOTE:</strong> This change will be rolled out in metrics-only mode for Cobalt, as we collect data to validate that the upgrades work smoothly.',
    migrationNotes:
      'This change will be baked into the node release for Cobalt, so no action is required for node operators.',
    lastUpdated: '2026-07-21',
    relatedRepos: [],
    githubIssues: [],
    specUrl: '',
  },
  {
    kind: 'base',
    id: 'base-0010',
    slug: '200ms-blocks',
    baseNumber: '0010',
    owner: 'Protocol team',
    title: '200ms Blocks',
    category: 'execution',
    upgrade: 'denim',
    summary:
      '<p>Base will produce native L2 blocks at a 200ms cadence. Each block has its own number, hash, state root, receipts, and unsafe-to-finalized lifecycle.</p><p class="mt-4">Unlike Flashblocks, which expose sub-second updates while building one block, this change runs the full rollup block lifecycle every 200ms.</p><div class="mt-4 rounded-lg border border-bds-orange-20 border-l-4 border-l-bds-orange-50 bg-bds-orange-5 px-4 py-3"><p class="text-[11px] font-semibold uppercase tracking-wide text-bds-orange-70">Deprecation Notice</p><p class="mt-1"><strong>Flashblocks will be deprecated as part of this release.</strong> Because native 200ms blocks deliver the same sub-second confirmation experience directly on the canonical chain, the Flashblocks WebSocket stream is no longer needed and will be removed. Migrate off the Flashblocks WebSocket stream before Denim activation.</p></div><p class="mt-4">Ethereum block headers and <code>block.timestamp</code> remain in whole seconds. The BaseTime predeploy records the sub-second component before user transactions, while optional <code>timestampMs</code> and <code>blockTimestampMs</code> RPC fields expose the complete millisecond timestamp to applications and infrastructure.</p>',
    migrationNotes:
      '<p><strong>Application developers</strong></p><p class="mt-2 pb-4">Existing contracts and applications remain compatible. Use the BaseTime <code>timestampMs()</code> getter when contracts need same-block millisecond precision; continue using <code>block.timestamp</code> when second-level precision is sufficient.</p><p><strong>RPC and indexing providers</strong></p><p class="mt-2 pb-4">Support the optional <code>timestampMs</code> block and header field and <code>blockTimestampMs</code> on mined transactions and logs. Do not infer millisecond timestamps from the whole-second header value.</p><p><strong>Node operators</strong></p><p class="mt-2">Upgrade to a Denim-compatible release before activation. Plan capacity for the higher native block rate across execution, storage, RPC events, and peer-to-peer propagation.</p>',
    lastUpdated: '2026-08-10',
    relatedRepos: [
      'https://github.com/base/base',
      'https://github.com/base/contracts/blob/4848ec70d8f1062fec59470d6e731e13ece8a728/src/L2/BaseTime.sol',
    ],
    githubIssues: [],
    specUrl: '',
  },
];

export function getChangeById(id: string): Change | undefined {
  return changes.find((c) => c.id.toLowerCase() === id.toLowerCase());
}

export function getChangeBySlug(slug: string): Change | undefined {
  return changes.find((c) => c.slug.toLowerCase() === slug.toLowerCase());
}
