import { Button } from '../../../components/ui/Button';
import { Card, LinkCard } from '../../../components/ui/Card';
import { AnimatedArrowIcon } from '../../../components/ui/icons';
import { Text } from '../../../components/ui/Text';
import { DemoHeader } from '../_components/DemoHeader';
import { demoForPath } from '../catalogue';

const LIMIT_ORDERS_PATH = '/vibenet/demos/validity/limit-orders';

export default function ValidityTransactionsPage() {
  const limitOrders = demoForPath(LIMIT_ORDERS_PATH);
  if (!limitOrders) return null;

  return (
    <div className="animate-in flex min-w-0 flex-1 flex-col gap-12 pb-16 text-foreground">
      <DemoHeader
        eyebrow="Vibenet · EIP-8130"
        title="Transactions that wait for the right moment."
        description="Validity conditions let a signed transaction stay pending until onchain state enters an acceptable range. The sequencer evaluates those conditions before inclusion, so applications can express execution intent without deploying a keeper or a bespoke settlement contract."
      />

      <section className="flex flex-col gap-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <Text variant="caption" tone="muted">Interactive demo</Text>
            <Text as="h2" variant="title2" className="mt-2">Start with a limit order</Text>
          </div>
          <Text variant="footnote" tone="muted">1 demo</Text>
        </div>

        <LinkCard
          href={limitOrders.href}
          className="group grid min-h-[360px] overflow-hidden bg-background lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,1.1fr)] dark:bg-white/5"
        >
          <div className="flex flex-col p-6 sm:p-8">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-base-blue" aria-hidden="true" />
              <Text variant="caption" className="text-base-blue dark:text-white">Live on Vibenet</Text>
            </div>
            <Text as="h3" variant="title1" className="mt-7">{limitOrders.title}</Text>
            <Text variant="body" tone="muted" className="mt-4 max-w-lg">
              {limitOrders.summary}
            </Text>
            <ul className="mt-8 flex flex-col gap-3 border-t border-bds-gray-10 pt-6 dark:border-white/10">
              {limitOrders.points.map((point) => (
                <li key={point} className="flex items-start gap-3">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-sm bg-bds-gray-30" aria-hidden="true" />
                  <Text as="span" variant="label.regular" tone="muted">{point}</Text>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex items-center gap-2 text-[14px] text-base-blue dark:text-white">
              Open Limit Orders
              <AnimatedArrowIcon className="transition-transform duration-200 ease-out group-hover:translate-x-[3px]" />
            </div>
          </div>

          <div className="relative flex min-h-[300px] flex-col justify-between overflow-hidden bg-[#090b12] p-6 text-white sm:p-8 lg:min-h-full">
            <div
              className="pointer-events-none absolute inset-0 opacity-30"
              aria-hidden="true"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px)',
                backgroundSize: '32px 32px',
              }}
            />
            <div className="relative flex flex-wrap gap-2">
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 font-mono text-[11px] text-white/80">
                price ≤ $0.99
              </span>
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 font-mono text-[11px] text-white/80">
                block ≤ 18,422,105
              </span>
            </div>

            <div className="relative my-12">
              <div className="absolute left-3 right-3 top-3 h-px bg-gradient-to-r from-white/25 via-base-blue to-white/25" />
              <div className="relative flex items-start justify-between">
                <TimelinePoint label="Signed" detail="now" />
                <TimelinePoint label="Pending" detail="conditions checked" active />
                <TimelinePoint label="Included" detail="when valid" />
              </div>
            </div>

            <div className="relative rounded-xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Text variant="caption" className="text-white/45">Order status</Text>
                  <Text variant="headline" className="mt-1 text-white">Waiting for price</Text>
                </div>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-base-blue opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-base-blue" />
                </span>
              </div>
            </div>
          </div>
        </LinkCard>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <PrincipleCard
          index="01"
          title="State-aware"
          description="Predicates read contract storage and block context immediately before inclusion."
        />
        <PrincipleCard
          index="02"
          title="Account-native"
          description="The application submits a signed account transaction, not an order to a separate protocol."
        />
        <PrincipleCard
          index="03"
          title="Bounded"
          description="Expiry conditions make the execution window explicit and keep stale intent from landing."
        />
      </section>

      <Card className="flex flex-col items-start justify-between gap-5 bg-bds-blue-0 p-6 sm:flex-row sm:items-center dark:bg-white/5">
        <div>
          <Text variant="headline">See validity in motion</Text>
          <Text variant="label.regular" tone="muted" className="mt-1 max-w-xl">
            Fund an account, place an order away from the market, and watch the transaction move from pending to filled or expired.
          </Text>
        </div>
        <Button href={LIMIT_ORDERS_PATH} arrow>Launch Limit Orders</Button>
      </Card>
    </div>
  );
}

function TimelinePoint({ label, detail, active = false }: { label: string; detail: string; active?: boolean }) {
  return (
    <div className="flex w-24 flex-col items-center text-center">
      <span
        className={active
          ? 'z-10 h-6 w-6 rounded-full border-[7px] border-base-blue bg-white shadow-[0_0_0_5px_rgba(0,82,255,0.2)]'
          : 'z-10 h-6 w-6 rounded-full border-[7px] border-white/25 bg-[#090b12]'}
        aria-hidden="true"
      />
      <Text variant="label" className="mt-3 text-white">{label}</Text>
      <Text variant="footnote" className="mt-0.5 text-white/45">{detail}</Text>
    </div>
  );
}

function PrincipleCard({ index, title, description }: { index: string; title: string; description: string }) {
  return (
    <Card className="flex min-h-44 flex-col bg-background p-5 dark:bg-white/5">
      <Text variant="caption" className="font-mono text-base-blue dark:text-white">{index}</Text>
      <Text as="h3" variant="headline" className="mt-auto pt-8">{title}</Text>
      <Text variant="label.regular" tone="muted" className="mt-2">{description}</Text>
    </Card>
  );
}
