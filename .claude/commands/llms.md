---
description: Regenerate llms.txt and llms-full.txt, or check whether they are stale
---

Manage the generated `public/llms.txt` and `public/llms-full.txt`.

Argument: `$ARGUMENTS` — one of `check`, `status`, `install`, or empty.

## Normally you do not need this

`githooks/post-commit` runs `scripts/llms.mjs` automatically when a commit
message contains `llms.txt` (case-insensitive), and when a route file is added,
deleted, or renamed. So the day-to-day flow is just:

```sh
git commit -m "feat: add a snapshots page; updates llms.txt"
```

Use `/llms` when you want to preview output before committing, regenerate
without committing, or set the hook up on a fresh clone.

## What to do

**No argument** — regenerate and show what changed:

```sh
node scripts/llms.mjs
git diff --stat public/llms.txt public/llms-full.txt
```

Report which files changed and summarise the diff. If nothing changed, say so
plainly rather than implying work happened.

**`check`** — report staleness without writing. Exit 1 means stale, invalid, or
sitemap drift:

```sh
node scripts/llms.mjs --check
```

Relay the metadata-source breakdown. Any count under `metadata fallback` means
those routes have no usable `export const metadata` and are being listed with a
humanized slug — name them and suggest either adding metadata to the page or a
`routes` override in `llms.config.mjs`.

**`status`** — sizes, mtimes, config, route count, drift. Never fails:

```sh
node scripts/llms.mjs --status
```

**`install`** — set up the hook on this clone:

```sh
./githooks/install.sh
```

Then confirm it is repo-scoped: `git config --global --get core.hooksPath`
should print nothing.

## Do not

- Edit `public/llms.txt` or the autogen region of `public/llms-full.txt` by
  hand. Change the page's `export const metadata` or `llms.config.mjs` instead.
- Touch the `<!-- LLMS_EXTRAS_START -->` … `<!-- LLMS_EXTRAS_END -->` region
  unless the user asked for a prose change. That region is hand-written and
  preserved verbatim across regenerations.
- Confuse `public/AGENTS.md` (generated) with `/AGENTS.md` at the repo root
  (hand-written, never generated).
