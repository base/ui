// Unified data service that works with both static files and API servers
// Since the API now emulates the static file structure, we only need one service
import {
  BenchmarkRuns,
  LoadTestEntry,
  LoadTestResult,
  MetricData,
} from "../types";

// Load-test endpoints live under the versioned API prefix, unlike benchmark
// data which uses the legacy unversioned `output/` paths. Centralized here so
// the call sites stay clean and a future migration is one constant change.
const LOAD_TEST_API_PREFIX = "api/v1/load-tests";

export interface DataServiceConfig {
  baseUrl: string; // Base URL for both static and API modes
}

// Unified data service that works with both static files and API servers
export class DataService {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async getMetadata(): Promise<BenchmarkRuns> {
    const response = await fetch(`${this.baseUrl}output/metadata.json`);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch metadata: ${response.status} ${response.statusText}`,
      );
    }

    return await response.json();
  }

  async getMetrics(outputDir: string, nodeType: string): Promise<MetricData[]> {
    const metricsPath = `${this.baseUrl}output/${outputDir}/metrics-${nodeType}.json`;
    const response = await fetch(metricsPath);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch metrics: ${response.status} ${response.statusText}`,
      );
    }

    return await response.json();
  }

  async getLoadTestList(network: string): Promise<LoadTestEntry[]> {
    const response = await fetch(
      `${this.baseUrl}${LOAD_TEST_API_PREFIX}/${encodeURIComponent(network)}`,
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch load test list: ${response.status} ${response.statusText}`,
      );
    }

    return await response.json();
  }

  async getLoadTestResult(
    network: string,
    timestamp: string,
  ): Promise<LoadTestResult> {
    const response = await fetch(
      `${this.baseUrl}${LOAD_TEST_API_PREFIX}/${encodeURIComponent(network)}/${encodeURIComponent(timestamp)}`,
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch load test result: ${response.status} ${response.statusText}`,
      );
    }

    return await response.json();
  }
}

// Configuration helper to determine base URL from environment
export function getDataSourceConfig(): DataServiceConfig {
  // Upstream (base/benchmark) is served from the same origin as its data, so it
  // could fall back to a relative base URL. Here the report is one section of
  // omni-ui and the data lives on the report-api, so the base URL is required
  // and comes from the environment. It must be read as a literal
  // `process.env.NEXT_PUBLIC_*` member expression — that is what Next inlines at
  // build time; a dynamic lookup would come back undefined in the browser.
  const apiBaseUrl = process.env.NEXT_PUBLIC_BENCHMARK_API_BASE_URL;

  if (!apiBaseUrl) {
    throw new Error(
      "Benchmark data source is not configured. Set NEXT_PUBLIC_BENCHMARK_API_BASE_URL to the report-api base URL.",
    );
  }

  // Normalize to exactly one trailing slash; callers append relative paths.
  return { baseUrl: apiBaseUrl.replace(/\/$/, "") + "/" };
}

// Global data service instance
let dataServiceInstance: DataService | null = null;

export function getDataService(): DataService {
  if (!dataServiceInstance) {
    const config = getDataSourceConfig();
    dataServiceInstance = new DataService(config.baseUrl);
  }
  return dataServiceInstance;
}

// Allow resetting the service instance (useful for testing)
export function resetDataService(): void {
  dataServiceInstance = null;
}
