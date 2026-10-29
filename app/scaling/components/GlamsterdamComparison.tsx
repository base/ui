import { Text } from '../../components/ui/Text';
import { DA_WORKLOADS } from '../da/workloads';
import { runHref, successfulTps, type Run } from '../proven/capacity';

type Props = {
  configured: boolean;
  glamsterdamRuns?: Run[];
  mainRuns?: Run[];
  glamsterdamErrors?: number;
  error?: unknown;
};

const TH = 'px-3 py-2 text-left font-[600] text-bds-gray-60';
const TD = 'border-t border-bds-gray-10 px-3 py-2 align-top dark:border-white/10';
const tps = (run: Run) => successfulTps(run).toLocaleString('en-US', { maximumFractionDigits: 1 });
const rate = (run: Run) => (run.gps / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 });

/** Highlights the newest eligible mix run without matching it to the other branch. */
function LatestRun({ title, runs, accent = false }: { title: string; runs: Run[]; accent?: boolean }) {
  const latest = runs.filter((run) => run.workload === 'mix').reduce<Run | undefined>(
    (newest, run) => !newest || run.createdAt > newest.createdAt ? run : newest, undefined,
  );
  return (
    <div className="min-w-0 rounded-lg border border-bds-gray-10 p-5 dark:border-white/10">
      <h3 className="text-[10px] uppercase tracking-[0.09em] text-bds-gray-60">{title}</h3>
      {latest ? (
        <>
          <div className="my-2 flex flex-wrap items-baseline gap-x-2 tabular-nums">
            <span className={`text-[32px] leading-tight tracking-[-1px] ${accent ? 'text-brand-blue' : ''}`}>{rate(latest)}</span>
            <span className="text-xs text-bds-gray-60">Mgas/s actual</span>
          </div>
          <p className="text-xs leading-relaxed text-bds-gray-60">
            Target {latest.mgas.toLocaleString('en-US')} Mgas/s · {tps(latest)} successful TPS ·{' '}
            <a className="text-brand-blue underline underline-offset-4" href={runHref(latest)}>View job ↗</a>
          </p>
        </>
      ) : <Text variant="label.regular" tone="muted">No eligible mix jobs in the last 14 days.</Text>}
    </div>
  );
}

/** Lists independent measured runs across all workloads and targets. */
function RunTable({ title, runs }: { title: string; runs: Run[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Text as="h3" variant="label.regular">
        {title}
      </Text>
      {runs.length === 0 ? (
        <Text variant="label.regular" tone="muted">No eligible jobs in the last 14 days.</Text>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-bds-gray-10 dark:border-white/10">
          <table className="w-full min-w-[480px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-bds-gray-10 dark:border-white/10">
                <th className={TH}>Workload</th>
                <th className={TH}>Target</th>
                <th className={TH}>Job</th>
                <th className={TH}>Actual Mgas/s</th>
                <th className={TH}>Successful TPS</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const workload = DA_WORKLOADS.find((item) => item.payload === run.workload)?.label ?? run.workload;
                return (
                  <tr key={run.outputDir}>
                    <td className={TD}>{workload}</td>
                    <td className={`${TD} whitespace-nowrap tabular-nums`}>{run.mgas.toLocaleString('en-US')} Mgas/s</td>
                    <td className={TD}>
                      <a className="break-all underline" href={runHref(run)}>
                        {run.id}
                      </a>
                    </td>
                    <td className={`${TD} whitespace-nowrap tabular-nums`}>{rate(run)}</td>
                    <td className={`${TD} whitespace-nowrap tabular-nums`}>{tps(run)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Shows latest mix results above separate Glamsterdam and Main run inventories. */
export function GlamsterdamComparisonSection({
  configured,
  glamsterdamRuns,
  mainRuns,
  glamsterdamErrors = 0,
  error,
}: Props) {
  const message = !configured
    ? 'Benchmark source is not configured.'
    : error
      ? 'Could not load benchmark data.'
      : !glamsterdamRuns || !mainRuns
        ? 'Loading benchmark runs…'
        : null;

  return (
    <section aria-label="Glamsterdam jobs" className="flex flex-col gap-3">
      <Text as="h2" variant="headline">
        Glamsterdam
      </Text>
      <Text variant="label.regular" tone="muted">
        Latest run per workload and target in the last 14 days. TPS excludes reverted transactions; gas throughput is measured.
      </Text>
      {message ? (
        <Text variant="label.regular" tone="muted">
          {message}
        </Text>
      ) : (
        <>
          {glamsterdamErrors > 0 ? (
            <Text variant="label.regular" tone="muted">
              {glamsterdamErrors} latest Glamsterdam job{glamsterdamErrors === 1 ? '' : 's'} could not be loaded.
            </Text>
          ) : null}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <LatestRun title="Latest Glamsterdam mix run" runs={glamsterdamRuns!} accent />
            <LatestRun title="Latest Main mix run" runs={mainRuns!} />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-6 border-t border-bds-gray-10 pt-6 dark:border-white/10 xl:grid-cols-2">
            <RunTable title="All Glamsterdam targets" runs={glamsterdamRuns!} />
            <RunTable title="All Main targets" runs={mainRuns!} />
          </div>
        </>
      )}
    </section>
  );
}
