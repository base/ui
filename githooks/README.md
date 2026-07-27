# llms-kit

Generates `llms.txt`, `llms-full.txt`, and a public `AGENTS.md` from a Next.js
App Router route tree, and keeps them fresh with a git hook.

Zero dependencies. Plain Node 20+, `fs` and `path` only. Works with npm, pnpm,
and bun. No build step, no lockfile assumptions.

## Install

```sh
./githooks/install.sh
```

That is the whole install. It sets `core.hooksPath` **for this clone only** —
never your global or system git config. Verify for yourself:

```sh
git config --global --get core.hooksPath   # prints nothing
```

Then add these to `package.json` (install.sh prints them for you):

```json
"llms":   "node scripts/llms.mjs",
"agents": "node scripts/agents.mjs"
```

## Verify in 60 seconds

```sh
git commit --allow-empty -m "chore: refresh llms.txt"
git log --oneline -2      # your commit, plus a "chore: regenerate ..." follow-up
git show --stat HEAD      # the files it wrote
npx serve public          # open /llms.txt and /AGENTS.md
```

## Day-to-day use

Mention a keyword in your commit message:

```sh
git commit -m "feat: add snapshots page; updates llms.txt"
```

The hook regenerates and creates **one follow-up commit**. That is post-commit
rather than pre-commit on purpose: the hook never silently mutates the commit
you just wrote, and the generated diff stays reviewable on its own.

| Trigger | Effect |
| --- | --- |
| `llms.txt` in the commit message | regenerates `public/llms.txt` + `public/llms-full.txt` |
| `agents.md` in the commit message | regenerates `public/AGENTS.md` |
| A watched file **added, deleted, or renamed** | regenerates everything |
| A watched file **modified** | nothing — use the keyword |

Matching is case-insensitive and substring-based, so "updates llms.txt" and
"LLMS.TXT refresh" both work.

Modifications deliberately do not auto-trigger: editing a page's body does not
change the site's shape, and firing on every content edit would make the hook
something people disable.

### Bypasses

| How | When you want it |
| --- | --- |
| `SKIP_DOCS_HOOK=1 git commit ...` | one-off, from the shell |
| `[skip-docs]` in the message | one-off, recorded in history |
| `DEBUG_DOCS_HOOK=1 git commit ...` | see exactly what the hook decided |

The classic case for `[skip-docs]`: `fix: correct the broken link to agents.md
[skip-docs]` — you mentioned a keyword in prose and don't want a regen.

### Uninstall

```sh
./githooks/uninstall.sh
```

Restores whatever `core.hooksPath` was before (husky, lefthook, or nothing).

## Commands

```sh
npm run llms                       # write llms.txt + llms-full.txt
npm run llms -- --check            # write nothing; exit 1 if stale or invalid
npm run llms -- --status           # write nothing; always exit 0
npm run llms -- --bootstrap-config # scrape the live site, print a config skeleton
npm run agents                     # write public/AGENTS.md
npm run agents -- --check
```

`--check` is what you want in CI. It reports where every route got its metadata
and fails on stale output, spec violations, or sitemap drift.

## The two AGENTS.md files

They are different artifacts and the distinction matters:

| File | Written by | Audience |
| --- | --- | --- |
| `/AGENTS.md` (repo root) | **you**, by hand | coding agents working *in* this repo — setup commands, conventions. Follows [agents.md](https://agents.md/). |
| `/public/AGENTS.md` | `scripts/agents.mjs` | external developers' agents, served at `<origin>/AGENTS.md`. Routing rules, network reference, freshness. Modeled on [base.org/AGENTS.md](https://www.base.org/AGENTS.md). |

`install.sh` seeds the root one from a template only if it does not already
exist. It appears in no generator's `outputs`, so the hook can never overwrite
it — there is a test asserting exactly that.

## Where the content comes from

**Page titles and descriptions** come from each route's `export const metadata`
— the same field Next uses for SEO, so there is one source of truth rather than
two. Resolution order, highest precedence first:

1. `llms.config.mjs` → `routes['/path']`
2. `export const metadata` in the route's own `page.tsx`
3. `export const metadata` in the nearest ancestor `layout.tsx`
4. A humanized slug — this is a **warning**, and `--check` fails on it

Step 3 is what rescues `'use client'` pages, which cannot export metadata at all.

Anything that is not an unambiguous string literal — an identifier, a helper
call, a template with `${}` — is not guessed at. It falls through to the next
step. A wrong title is worse than a missing one, because a missing one gets
reported.

### If your pages use `generateMetadata()`

Text analysis cannot read it — the value only exists at request time. Bootstrap
from the deployed site instead:

```sh
node scripts/llms.mjs --bootstrap-config > llms.config.mjs
```

That scrapes `<title>` and `<meta name="description">` from each route and
prints a config skeleton. It never writes and never runs inside the hook.
**Review the descriptions** — a page title is usually written for a browser tab,
not for an agent.

### Why not just import the page and read its metadata?

Because it cannot work, not merely because it would be slow. Importing a
`page.tsx` executes module scope: `next/font/google`, `@/` path aliases,
`import './globals.css'`, `server-only`. All of those throw outside a real Next
build. `node --experimental-strip-types` fixes the syntax problem and leaves the
resolution problem entirely untouched. This is a dead end; please don't
relitigate it.

## Configuration

`githooks/config.json` — triggers, watched paths, outputs. Add a generator:

```json
{ "name": "myindex", "trigger": "myindex.txt",
  "script": "scripts/myindex.mjs", "outputs": ["public/myindex.txt"] }
```

`outputs` does double duty: it detects a real diff against `HEAD`, and it
excludes those files from structural-change detection so hand-editing a
generated file never auto-fires a regen.

> If you edit `config.json`, mirror the change in `_use_defaults()` in
> `githooks/_lib.sh`. That function is the fallback for when `jq` is missing.
> A test parses both and fails if they drift.

`llms.config.mjs` (optional, repo root) — everything about the *content*:
`origin`, `sections`, per-route overrides, `endpoints`, `networks`, `freshness`,
`related`. See `githooks/templates/llms.config.example.mjs`. All keys are
optional; with no config at all the defaults plus auto-detection still produce
valid output.

One glob semantic worth knowing: `/vibenet/**` matches `/vibenet` itself as well
as everything beneath it. Use `/vibenet/*` for children only.

## Why `public/` and not a route handler

The files are written to `public/`, so Vercel serves them at `/llms.txt` and
`/AGENTS.md` with no route code and no build step.

This diverges from `robots.txt` and `sitemap.xml`, which this site generates from
`app/`. That is intentional, not an oversight: a sitemap needs a live `lastmod`,
while `llms.txt` needs to be **static and committed** so the generated diff is
reviewable in a PR. A route handler computing it at request time would be
invisible to review. Please don't "fix" it.

The generator hard-errors if `app/llms.txt/route.ts` exists — two producers for
one path is a miserable thing to debug.

## What makes the output good for agents

Beyond listing routes, the generated files carry the things an agent cannot
infer:

- **Machine-readable endpoints** — `/api/health` and `/api/snapshots` return
  JSON. Telling an agent to call those instead of scraping `/snapshots` is worth
  more than any amount of prose.
- **A freshness table** — which pages go stale and how fast, so an agent knows
  when it may reuse an earlier fetch. Entries pointing at routes that no longer
  exist are dropped automatically.
- **Explicit routing rules** — chain.base.org for live network state,
  docs.base.org for implementation detail, and never infer chain IDs from
  third-party lists.
- **A network reference** with chain IDs paired to their own RPC hosts. A
  transposed `8453` / `84532` is the most damaging error this file could ship
  and it reads perfectly fine, so there is a test asserting the pairing.
- **Ephemeral networks publish a note, not a fabricated chain ID.** Vibenet's
  chain ID is not stable, so the file says where to read it at request time
  instead of inventing one. Config validation rejects an ephemeral network with
  no explanatory note.
- **Cross-links** to docs.base.org's own `llms.txt` indexes, in the `## Optional`
  section, so this file composes with the wider Base agent surface rather than
  duplicating it.

## Tests

```sh
node --test tests/*.test.mjs                      # offline, ~17s
LLMS_LIVE=1 node --test tests/*.test.mjs          # + liveness against the real site
UPDATE_GOLDEN=1 node --test tests/golden.test.mjs # re-record golden output
```

Node's built-in runner only — no framework, no config file, no dependency.

Coverage worth knowing about: install never touches global git config (asserted
against a real temp `GIT_CONFIG_GLOBAL`); the hook still works with `jq` absent
and still lets your commit succeed with `node` absent (both tested under a
hand-built minimal `PATH`, not stubs); output is byte-identical across runs and
independent of filesystem enumeration order; and the hand-written region of
`llms-full.txt` survives regeneration byte-for-byte.

## Notes on the port

This is ported from `base/docs`'s `githooks/`, so the workflow is the one those
engineers already know. Five deliberate differences:

1. **`git add --intent-to-add` before the diff.** Upstream's
   `git diff HEAD -- <untracked>` prints nothing, so on a fresh install the hook
   concluded "nothing changed" and silently never committed the first
   generation. Upstream never hit this because its outputs were already tracked.
2. **The rename filter tests `$NF`, not `$2`.** On a `R100<TAB>old<TAB>new`
   line, `$2` is the *old* path — so renaming a generated output slipped past
   the exclusion and auto-fired a regen.
3. **`set -f` around the pathspec expansion.** Unquoted globs were being
   expanded by the shell against the working tree before git saw them, which
   silently broke *deletion* detection: a just-removed file no longer exists on
   disk, so it expanded to nothing. Additions happened to work, which is exactly
   what makes this the kind of bug that ships.
4. **`watchGlobs` moved into config.** Upstream hardcoded `docs/**` pathspecs
   inside the hook; `app/` vs `src/app/` varies per repo, so it has to be data.
5. **`seq` replaced with a `while` counter.** `seq` is not POSIX and is absent
   from the minimal `PATH` the degraded-environment tests build.

Each of 1, 2, and 3 has a named regression test in `tests/hook-trigger.test.mjs`.
