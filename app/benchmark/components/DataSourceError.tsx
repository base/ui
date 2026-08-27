/**
 * Upstream (base/benchmark) served the report from the same origin as its data,
 * so it could not be misconfigured and never rendered a metadata-level error —
 * a failed fetch just left an empty run list. Here the API base URL is an
 * environment variable, so a wrong or missing value is a real possibility and
 * needs to say so rather than render an empty page.
 */
export const DataSourceError = ({ error }: { error: unknown }) => (
  <div className="border border-red-200 bg-red-50 text-red-800 rounded-lg p-4 text-sm">
    <p className="font-medium">Failed to load benchmark runs</p>
    <p className="mt-1 text-red-700">
      {error instanceof Error ? error.message : String(error)}
    </p>
  </div>
);

export default DataSourceError;
