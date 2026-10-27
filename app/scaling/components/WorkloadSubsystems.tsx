import { Card } from '../../components/ui/Card';
import { cn } from '../../components/ui/cn';
import { Text } from '../../components/ui/Text';
import type { ProvenCapacity, Run, Workload } from '../proven/capacity';
import { growth, times } from './Bottlenecks';
import { REPLAY_BLOCKS_PER_SECOND } from './Guardrails';

const COLUMNS: [Workload, string][] = [['payment', 'Payments'], ['swap', 'Swaps'], ['mix', 'Mainnet mix (bench run)']];
const TH = 'px-3 py-2 text-left text-[11px] font-[600] uppercase tracking-wide text-bds-gray-60';
const TD = 'px-3 py-2 whitespace-nowrap';

// Each value comes from that workload's own proven run.
const ROWS: [string, (run: Run) => string | null][] = [
  ['Validators', (r) => (r.replay ? `${times(r.replay.blocksPerSecond / REPLAY_BLOCKS_PER_SECOND)} replay headroom` : null)],
  ['Proof node', (r) => {
    const proofs = r.proofNode?.proofs;
    const execute = proofs?.methods.debug_executePayload?.latency.p99Ms;
    return proofs ? `lag p99 ${proofs.headLagBlocks.p99}${execute === undefined ? '' : ` · executePayload p99 ${Math.round(execute)} ms`}` : null;
  }],
  ['Disk · archive', (r) => (r.storage ? `${growth(r.storage.archive)} at ${r.mgas} Mgas/s` : null)],
];

export function WorkloadSubsystems({ current }: { current: ProvenCapacity['current'] | undefined }) {
  return (
    <section className="flex flex-col gap-3">
      <Text as="h2" variant="headline">Subsystems by workload</Text>
      <Card className="overflow-x-auto bg-background dark:bg-white/5">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-bds-gray-10 dark:border-white/10">
              <th className={TH} />
              {COLUMNS.map(([w, label]) => <th key={w} className={TH}>{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([label, value]) => (
              <tr key={label} className="border-b border-bds-gray-10 last:border-0 dark:border-white/10">
                <td className={TD}>{label}</td>
                {COLUMNS.map(([w]) => {
                  const run = current?.[w]?.run;
                  const v = run ? value(run) : null;
                  return <td key={w} className={cn(TD, 'tabular-nums', v === null && 'text-bds-gray-60')}>{v ?? '—'}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
}
