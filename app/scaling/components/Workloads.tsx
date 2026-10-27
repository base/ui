import { Text } from '../../components/ui/Text';
import { runHref, type ProvenCapacity, type Workload } from '../proven/capacity';
import { times, type Limit } from './Bottlenecks';
import { REPLAY_BLOCKS_PER_SECOND } from './Guardrails';
import { Tag } from './Tag';

const CARDS: [Workload, string][] = [['payment', 'Payments (B20)'], ['swap', 'Swaps (Uniswap v3)'], ['mix', 'Mainnet mix']];
const compact = (v: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v).toLowerCase();
const TD = 'py-1 text-[12px]';

// Each workload's validators and proof node kept up at its proven rate, so DA breaks first when its
// ceiling is below that rate.
export function Workloads({ current, limits }: { current: ProvenCapacity['current'] | undefined; limits: Limit[] }) {
  return (
    <section className="flex flex-col gap-3">
      <Text as="h2" variant="headline">By workload</Text>
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
        {CARDS.map(([w, label]) => {
          const proven = current?.[w] ?? null;
          const run = proven?.run;
          const da = limits.find((l) => l.id === `da-${w}`)!;
          const breaksFirst = proven !== null && da.value! < proven.mgas;
          const proofs = run?.proofNode?.proofs;
          const execute = proofs?.methods.debug_executePayload?.latency.p99Ms;
          return (
            <div key={w} className="flex flex-col gap-1 rounded-lg border border-bds-gray-10 px-3.5 py-3 dark:border-white/10">
              <span className="text-[16px] font-[600]">{label}</span>
              {proven ? (
                <a className="text-[24px] font-[600] leading-[1.1] tabular-nums text-base-blue" href={runHref(proven.run)}>
                  {proven.atTop ? '≥ ' : ''}{compact(proven.run.tps)}<span className="text-[13px] font-[500]">{w === 'mix' ? ' tx/s' : '/s'}</span>
                  {w === 'mix' ? <span className="ml-1 text-[13px] font-[500] text-bds-gray-60">bench mix</span> : null}
                </a>
              ) : (
                <span className="text-[24px] font-[600] leading-[1.1] text-bds-gray-60">pending</span>
              )}
              <table className="mt-1 w-full border-collapse">
                <tbody>
                  <tr className="border-b border-bds-gray-10 text-bds-red-60 dark:border-white/10">
                    <td className={TD}>DA</td>
                    <td className={`${TD} text-right tabular-nums`}>{da.ceiling.split(' ≈ ')[0]}{breaksFirst ? ' · breaks first' : <> <Tag tag={da.tag!} /></>}</td>
                  </tr>
                  <tr className="border-b border-bds-gray-10 dark:border-white/10">
                    <td className={TD}>Validators</td>
                    <td className={`${TD} text-right tabular-nums`}>{run?.replay ? times(run.replay.blocksPerSecond / REPLAY_BLOCKS_PER_SECOND) : '—'}</td>
                  </tr>
                  <tr>
                    <td className={TD}>Proof node</td>
                    <td className={`${TD} text-right tabular-nums`}>{proofs ? `lag ${proofs.headLagBlocks.p99}${execute === undefined ? '' : ` · ${Math.round(execute)} ms`}` : '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </section>
  );
}
