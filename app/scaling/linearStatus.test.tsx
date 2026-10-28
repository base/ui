import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';

import { Work } from './components/Work';
import { applyLinear, fetchLinearProjects, loadLiveWork, projectIdOf } from './linearStatus';
import type { WorkItem } from './snapshot.mjs';

// Synthetic projects and slugs only.
const row = (title: string, slugId: string | null, status = 'planned'): WorkItem => ({
  title, status, category: 'Execution',
  links: slugId ? [{ label: 'Doc', url: 'https://example.com/doc' }, { label: 'Linear', url: `https://linear.app/example/project/synthetic-${slugId}` }] : [],
});
const project = (type: string, name = type, progress = 0.25) => ({ name: `Project ${name}`, status: { name, type }, progress, lead: { name: 'Synthetic lead' }, url: 'https://linear.app/example/project/x' });
const AT = '2026-01-02T03:04:00.000Z';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it('finds the project slug id in a linear.app project link', () => {
  expect(projectIdOf(row('a', 'a1b2c3d4e5f6'))).toBe('a1b2c3d4e5f6');
  expect(projectIdOf({ title: 'b', status: 'planned', links: [{ label: 'Linear', url: 'https://linear.app/example/issue/ABC-1' }] })).toBeNull();
  expect(projectIdOf(row('c', null))).toBeNull();
});

it('maps Linear status types onto the log, hides canceled projects and keeps the snapshot otherwise', () => {
  const work = ['started', 'planned', 'backlog', 'unstarted', 'completed', 'canceled', 'paused'].map((t, i) => row(t, `${i}`.repeat(12), 'in-progress'));
  const projects = Object.fromEntries(work.map((w) => [projectIdOf(w)!, project(w.title, `${w.title} name`)]));
  const rows = applyLinear([...work, row('no project', null, 'planned'), row('unknown', 'ffffffffffff', 'done')], projects, AT);
  expect(rows.map((r) => [r.title, r.status, r.live?.name ?? null])).toEqual([
    ['started', 'in-progress', 'started name'],
    ['planned', 'planned', 'planned name'],
    ['backlog', 'planned', 'backlog name'],
    ['unstarted', 'planned', 'unstarted name'],
    ['completed', 'done', 'completed name'],
    // canceled is gone; paused is not a type the log maps, so the snapshot's status stays.
    ['paused', 'in-progress', null],
    ['no project', 'planned', null],
    ['unknown', 'done', null],
  ]);
});

it('asks for every project in one request with aliases, sending the key only as the Authorization header', async () => {
  const fetchImpl = vi.fn(async () => Response.json({ data: { p0: project('started'), p1: null, p2: { name: 'bad shape' } } }));
  const projects = await fetchLinearProjects(['aaaaaaaaaaaa', 'bbbbbbbbbbbb', 'cccccccccccc'], 'synthetic-key', fetchImpl as unknown as typeof fetch);
  expect(Object.keys(projects)).toEqual(['aaaaaaaaaaaa']);
  expect(fetchImpl).toHaveBeenCalledOnce();
  const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('https://api.linear.app/graphql');
  expect(init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'synthetic-key' });
  expect(init.signal).toBeInstanceOf(AbortSignal);
  const { query } = JSON.parse(init.body as string);
  expect(query).toContain('p0: project(id: "aaaaaaaaaaaa") { name status { name type } progress lead { name } url }');
  expect(query).toContain('p2: project(id: "cccccccccccc")');
  await expect(fetchLinearProjects(['a'], 'k', (async () => new Response('', { status: 401 })) as typeof fetch)).rejects.toThrow('Linear GraphQL: 401');
  await expect(fetchLinearProjects(['a'], 'k', (async () => Response.json({ errors: [{ message: 'x' }] })) as typeof fetch)).rejects.toThrow('no data');
});

it('keeps the snapshot without a key, without project links, or when Linear fails, logging no key', async () => {
  const work = [row('a', 'aaaaaaaaaaaa')];
  const load = vi.fn(async () => ({ projects: { aaaaaaaaaaaa: project('completed', 'Completed') }, at: AT }));
  vi.stubEnv('LINEAR_API_KEY', '');
  expect(await loadLiveWork(work, load)).toBe(work);
  expect(load).not.toHaveBeenCalled();

  vi.stubEnv('LINEAR_API_KEY', 'synthetic-secret');
  expect(await loadLiveWork([row('b', null)], load)).toEqual([row('b', null)]);
  expect(load).not.toHaveBeenCalled();
  expect((await loadLiveWork(work, load))[0]).toMatchObject({ status: 'done', live: { name: 'Completed', progress: 0.25, at: AT } });
  expect(load).toHaveBeenCalledWith(['aaaaaaaaaaaa']);

  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(await loadLiveWork(work, async () => Promise.reject(new DOMException('timed out', 'TimeoutError')))).toBe(work);
  expect(JSON.stringify(warn.mock.calls)).not.toContain('synthetic-secret');
});

it('labels live rows with Linear’s status name, progress and fetch time, and snapshot rows as such', () => {
  const [live] = applyLinear([row('Live work', 'aaaaaaaaaaaa')], { aaaaaaaaaaaa: project('started', 'In Progress', 0.4) }, AT);
  const html = renderToStaticMarkup(<Work work={[live, row('Snapshot work', null)]} />);
  expect(html).toContain('title="Live from Linear, 2026-01-02 03:04 UTC">In Progress</span>');
  expect(html).toContain('>40%</span>');
  expect(html).toContain('title="From snapshot">Planned</span>');
});
