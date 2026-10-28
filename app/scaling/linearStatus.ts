import { unstable_cache } from 'next/cache';

import type { WorkItem } from './snapshot.mjs';

// Server-only: reads LINEAR_API_KEY, which must never reach the client or a log line.
const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';
const TIMEOUT_MS = 5_000;
const REVALIDATE_SECONDS = 600;
// https://linear.app/<org>/project/<slug>-<slugId>; the slugId identifies the project.
const PROJECT_URL = /^https:\/\/linear\.app\/[^/]+\/project\/(?:[\w-]+-)?([0-9a-f]{8,})\/?$/;

type Status = 'in-progress' | 'planned' | 'done';
export type LiveStatus = { name: string; progress: number; at: string };
// A work row as the work log renders it: live rows carry Linear's status name, progress and fetch time.
export type WorkRow = WorkItem & { live?: LiveStatus };
type Project = { name: string; status: { name: string; type: string }; progress: number; url: string };

// Linear status types map onto the log's statuses; canceled projects drop out, other types keep the snapshot's.
const STATUS_OF: Record<string, Status | 'canceled'> = {
  started: 'in-progress', planned: 'planned', backlog: 'planned', unstarted: 'planned', completed: 'done', canceled: 'canceled',
};

export const projectIdOf = (w: WorkItem): string | null => {
  for (const l of w.links ?? []) {
    const match = PROJECT_URL.exec(l.url);
    if (match) return match[1];
  }
  return null;
};

const isProject = (p: unknown): p is Project => {
  if (typeof p !== 'object' || p === null) return false;
  const { name, status, progress, url } = p as Record<string, unknown>;
  const s = status as Record<string, unknown> | null;
  return typeof name === 'string' && typeof url === 'string' && typeof progress === 'number' && progress >= 0 && progress <= 1
    && typeof s === 'object' && s !== null && typeof s.name === 'string' && typeof s.type === 'string';
};

// One request for every project, one alias each. Unknown projects and malformed entries come back missing.
// Throws on transport failure so a failed fetch is not cached.
export async function fetchLinearProjects(ids: string[], key: string, fetchImpl: typeof fetch = fetch): Promise<Record<string, Project>> {
  const fields = 'name status { name type } progress lead { name } url';
  const query = `query { ${ids.map((id, i) => `p${i}: project(id: ${JSON.stringify(id)}) { ${fields} }`).join(' ')} }`;
  const res = await fetchImpl(LINEAR_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: key },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Linear GraphQL: ${res.status}`);
  const body = (await res.json()) as { data?: Record<string, unknown> | null };
  if (typeof body?.data !== 'object' || body.data === null) throw new Error('Linear GraphQL: no data');
  const projects: Record<string, Project> = {};
  ids.forEach((id, i) => {
    const p = body.data![`p${i}`];
    if (isProject(p)) projects[id] = p;
  });
  return projects;
}

const fetchCached = unstable_cache(
  async (ids: string[]) => ({ projects: await fetchLinearProjects(ids, process.env.LINEAR_API_KEY!), at: new Date().toISOString() }),
  ['scaling-linear-projects'],
  { revalidate: REVALIDATE_SECONDS },
);

// Rows whose Linear project resolves take its status; the rest keep the snapshot's. Any failure keeps the snapshot.
export function applyLinear(work: WorkItem[], projects: Record<string, Project>, at: string): WorkRow[] {
  return work.flatMap((w): WorkRow[] => {
    const id = projectIdOf(w);
    const p = id ? projects[id] : undefined;
    const status = p ? STATUS_OF[p.status.type] : undefined;
    if (!p || !status) return [w];
    if (status === 'canceled') return [];
    return [{ ...w, status, live: { name: p.status.name, progress: p.progress, at } }];
  });
}

export async function loadLiveWork(work: WorkItem[], load = fetchCached): Promise<WorkRow[]> {
  if (!process.env.LINEAR_API_KEY) return work;
  const ids = [...new Set(work.map(projectIdOf).filter((id) => id !== null))].sort();
  if (!ids.length) return work;
  try {
    const { projects, at } = await load(ids);
    return applyLinear(work, projects, at);
  } catch (error) {
    // The message names the status or timeout only, never the key.
    console.warn('[scaling] Linear status unavailable, using the snapshot:', error instanceof Error ? error.message : 'unknown error');
    return work;
  }
}
