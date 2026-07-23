import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Metadata } from 'next';

import { Button } from '../../../../components/ui/Button';
import { LinkCard } from '../../../../components/ui/Card';
import { Text } from '../../../../components/ui/Text';
import { DemoHeader } from '../../_components/DemoHeader';

import { CodeBlock } from './CodeBlock';
import { SkillActions } from './SkillActions';

export const metadata: Metadata = {
  title: 'Build on EIP-8130 · Vibenet',
  description:
    "Start building on Base's native account abstraction (EIP-8130) with viem: create smart accounts, authorize session-key policies, batch calls, and sponsor gas.",
};

const SKILL_FILENAME = 'build-with-viem-eip8130.SKILL.md';

// Read the bundled Cursor skill at build time so devs can copy/download the
// full EIP-8130 + payer API guide straight from the UI. The file lives next to
// this page, so the content is baked into the static output (no runtime fs).
function loadSkill(): string {
  try {
    return readFileSync(
      join(process.cwd(), 'app/vibenet/demos/account/build', SKILL_FILENAME),
      'utf8',
    );
  } catch {
    return '';
  }
}

const VIEM_BRANCH = 'https://github.com/chunter-cb/viem/tree/feat/eip-8130';
const VIEM_8130_DOCS = `${VIEM_BRANCH}/site/pages/experimental/eip8130`;
const EIP_8130 = 'https://eip.tools/eip/8130';
const ERC_8168 = 'https://eip.tools/eip/8168';
const CONTRACTS_REPO = 'https://github.com/base/eip-8130';

const INSTALL_CODE = `# Use the viem fork branch that ships the experimental module:
bun add "viem@github:chunter-cb/viem#feat/eip-8130"

# Then import from the experimental entrypoints:
import { newSmartAccount8130, sendCalls8130 } from "viem/experimental/eip8130";
import { createPayerClient } from "viem/experimental/eip8168";`;

const QUICKSTART_CODE = `import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import {
  createPublicClient, http, parseEther, toHex,
  newSmartAccount8130, sendCalls8130, estimateGas8130, encodeWalletCalls,
  waitForTransactionReceipt8130, allPhasesSucceeded,
} from "viem/experimental/eip8130";

const client = createPublicClient({
  chain: {
    id: 84538453, // vibenet devnet (Base Sepolia = 84532)
    name: "vibenet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["https://rpc.vibes.base.org"] } },
  },
  transport: http(),
});

// 1) Signer = LocalAccount (NOT key.k1 — that builds an actor identity).
const signer = privateKeyToAccount(generatePrivateKey());

// 2) Deterministic account — its address exists before any tx.
const account = newSmartAccount8130({ signer });

// 3) Fund account.address (faucet), then estimate + send. The FIRST tx
//    deploys the account AND runs the batch atomically.
const calls = [{ to: "0x…recipient", value: parseEther("0.001") }];
const wire = encodeWalletCalls({ account: account.address, calls: [calls] });
const gas = await estimateGas8130(client, {
  sender: account.address,
  accountChanges: [account.createChange],
  calls: wire,
});
const hash = await sendCalls8130(client, {
  account,
  accountChanges: [account.createChange], // omit on subsequent txs
  calls,
  dataSuffix: toHex("invoice #4242"),
  gas: (gas * 120n) / 100n,
});

// 4) Wait and verify every phase (create + each call) succeeded.
const receipt = await waitForTransactionReceipt8130(client, { hash });
if (!allPhasesSucceeded(receipt)) throw new Error("a phase reverted");`;

type ResourceLink = {
  title: string;
  desc: string;
  href: string;
};

const DOCS: ResourceLink[] = [
  {
    title: 'EIP-8130 spec',
    desc: 'The native account abstraction proposal.',
    href: EIP_8130,
  },
  {
    title: 'viem — EIP-8130 docs',
    desc: 'Creating accounts, sending txs, session keys, batching, and more.',
    href: VIEM_8130_DOCS,
  },
  {
    title: 'ERC-8168 payer service',
    desc: 'The gas sponsorship / payer standard used by 8130.',
    href: ERC_8168,
  },
  {
    title: 'EIP-8130 contracts',
    desc: 'The reference AccountConfiguration + example policy contracts.',
    href: CONTRACTS_REPO,
  },
];

// Small section wrapper — heading + optional lede + body, matching the vertical
// rhythm used across the Vibenet demo surfaces.
function Section({
  title,
  lede,
  children,
}: {
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Text variant="title2">{title}</Text>
        {lede ? (
          <Text variant="body" tone="muted" className="max-w-2xl">
            {lede}
          </Text>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export default function BuildPage() {
  const skill = loadSkill();

  return (
    <div className="flex flex-col gap-12 pb-4 text-black dark:text-white">
      <DemoHeader
        eyebrow="EIP-8130"
        title="Build on EIP-8130"
        description="Native account abstraction with viem. Create portable smart accounts, authorize scoped session-key policies, batch calls atomically, and sponsor gas with a payer."
      />

      <Section
        title="Grab the skill"
        lede="A ready-made skill file that teaches your AI coding agent the full EIP-8130 + payer API — accounts, session-key policies, batching, and gas sponsorship. Grab it and drop it into your project to scaffold 8130 flows on demand."
      >
        {skill ? (
          <div className="flex flex-col gap-3">
            <SkillActions content={skill} filename={SKILL_FILENAME} />
            <details className="group">
              <summary className="w-fit cursor-pointer select-none text-[14px] text-bds-gray-60 hover:text-black dark:text-bds-gray-40 dark:hover:text-white">
                View the skill
              </summary>
              <div className="mt-3">
                <CodeBlock code={skill} label={SKILL_FILENAME} />
              </div>
            </details>
          </div>
        ) : (
          <Text variant="body" tone="muted">
            Skill file unavailable in this build — see{' '}
            <code className="font-mono text-[13px]">
              app/vibenet/demos/account/build/{SKILL_FILENAME}
            </code>{' '}
            in the repo.
          </Text>
        )}
      </Section>

      <Section
        title="1. Get the tooling"
        lede="The EIP-8130 support lives in a viem fork branch. Install it and import from the experimental entrypoints."
      >
        <CodeBlock code={INSTALL_CODE} label="Shell" />
      </Section>

      <Section
        title="2. Create an account and send a batch"
        lede="The account address is deterministic — fund it first, then the first transaction deploys it and runs your calls in one atomic batch."
      >
        <CodeBlock code={QUICKSTART_CODE} label="TypeScript" />
        <Text variant="body" tone="muted" className="max-w-2xl">
          Next steps: authorize a policy-gated session actor (
          <code className="font-mono text-[13px]">authorizeActor</code> +{' '}
          <code className="font-mono text-[13px]">defineSessionPolicy</code>), sponsor gas (
          <code className="font-mono text-[13px]">createPayerClient</code> +{' '}
          <code className="font-mono text-[13px]">sendSponsoredCalls</code>), and read state (
          <code className="font-mono text-[13px]">getActorConfig8130</code>,{' '}
          <code className="font-mono text-[13px]">getPolicy8130</code>,{' '}
          <code className="font-mono text-[13px]">getLockStatus8130</code>).
        </Text>
      </Section>

      <Section title="Docs">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {DOCS.map((doc) => (
            <LinkCard
              key={doc.href}
              href={doc.href}
              target="_blank"
              rel="noopener"
              className="flex flex-col gap-1.5 bg-white p-5 dark:bg-white/5"
            >
              <Text variant="label">
                {doc.title} ↗
              </Text>
              <Text variant="footnote" tone="muted">
                {doc.desc}
              </Text>
            </LinkCard>
          ))}
        </div>
        <div className="mt-2">
          <Button href="/vibenet/demos/account" variant="secondary" size="sm" arrow>
            Try it in the demo
          </Button>
        </div>
      </Section>
    </div>
  );
}
