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
                <th className={TH}>TPS / actual Mgas/s</th>
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
                    <td className={`${TD} whitespace-nowrap tabular-nums`}>{tps(run)} / {rate(run)}</td>
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

/** Shows the latest Glamsterdam and Main jobs in separate side-by-side lists. */
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
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <RunTable title="Glamsterdam jobs" runs={glamsterdamRuns!} />
            <RunTable title="Main jobs" runs={mainRuns!} />
          </div>
        </>
      )}
    </section>
  );
}
