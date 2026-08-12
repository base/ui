// Whether the Benchmark section is included in this build. Derived from the
// deployment matrix (deploy.config.mjs) — Benchmark ships to the internal target
// only. Consumers import this named constant; the matrix is the source of truth.
//
// The target is fixed for a given build, so when Benchmark is disabled it is
// unreachable in that build: the nav entry is dropped and middleware 404s
// /benchmark and its subtree. There is no API guard because the section talks to
// the report API directly from the browser (NEXT_PUBLIC_BENCHMARK_API_BASE_URL)
// rather than through a route handler in this app.
import { surfaceEnabled } from '../../deploy.config.mjs';

export const BENCHMARK_ENABLED: boolean = surfaceEnabled('benchmark');
