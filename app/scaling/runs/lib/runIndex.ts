import { getDataService } from './dataService';
import { getTestRunsWithStatus } from './types';
import { toUnifiedRun } from './unified';

// report-api has no endpoint listing load-test networks.
export const NETWORK = 'sepolia';
// One request per load-test result; nightly runs grow without bound.
export const LOAD_LIMIT = 30;

export async function loadRuns() {
  const api = getDataService();
  const [metadata, entries] = await Promise.all([api.getMetadata(), api.getLoadTestList(NETWORK)]);
  const recent = entries.slice(0, LOAD_LIMIT);
  // A missing result leaves that row's metrics unknown instead of failing the whole index.
  const results = await Promise.all(recent.map((e) => api.getLoadTestResult(e.network, e.timestamp).catch(() => undefined)));
  const runs = [...getTestRunsWithStatus(metadata), ...recent.map((e, i) => ({ ...e, result: results[i] }))].map(toUnifiedRun);
  runs.sort((a, b) => b.timestamp - a.timestamp);
  return { runs, loadTotal: entries.length };
}
