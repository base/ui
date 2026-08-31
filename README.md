# Base Chain Dashboard

One UI for Base network dashboards and stats: snapshots and the Vibenet devnet
explorer/faucet, under a single shell.

A standalone Next.js (App Router) app, deployed on Vercel. Migrated out of the
internal Nx template so it builds and ships with the standard Next toolchain.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in values as needed
npm run dev                  # http://localhost:3000  (external — public site)
npm run dev:internal         # http://localhost:3000  (internal — includes Internal Explorer)
```

`npm run dev` runs the **external** build (what ships to Vercel); internal-only
sections like Internal Explorer are absent (their routes/API 404). Use `npm run dev:internal`
to run the **internal** build locally with those sections visible. See
[Deployment targets](#deployment-targets).

## Scripts

- `npm run dev` — dev server (external target)
- `npm run dev:internal` — dev server with internal-only sections (e.g. Internal Explorer)
- `npm run build` — production build (external target)
- `npm run build:internal` — production build with internal-only sections
- `npm run start` — serve the production build
- `npm run lint` — eslint (next/core-web-vitals)
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — vitest
- `npm run test:e2e` — playwright end-to-end tests (builds and serves the app first)
- `npm run llms` / `npm run agents` — regenerate the agent index files
- `npm run docs:check` — verify the agent index is current

## CI

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`:

- **typecheck** — `tsc --noEmit`
- **lint** — eslint
- **test** — vitest. Includes `app/snapshots/networks.contract.test.ts`, which
  asserts every expected network stays served by `/api/snapshots`. Nodes sync
  from those buckets, so a network must never be dropped just to take it off the
  page — hide it with `hiddenFromUi` instead.
- **docs (generated agent index)** — fails if the committed `public/llms.txt`,
  `llms-full.txt`, or `AGENTS.md` are stale relative to the route tree. Fix with
  `npm run llms && npm run agents`.
- **public build excludes internal-only surfaces** — builds the default
  (external) target and asserts that internal-only routes 404 and never appear
  in the nav or sitemap, so the deployment matrix can't silently regress
- **e2e (non-blocking)** — playwright smoke tests against a production build.
  `continue-on-error`, so failures show up without blocking merges while the
  suite is still being built out.

CodeQL, StepSecurity, Heimdall, and the Vercel preview build are configured
outside this repo at the org/platform level.

## Structure

- `app/` — App Router routes and API handlers
  - `snapshots/` — Reth v2 snapshot browser (`/api/snapshots` reads Cloudflare R2)
  - `vibenet/` — devnet explorer and faucet
  - `components/` — shared shell and UI primitives
  - `theme.ts` / `spectrum.ts` / `globals.css` — BDS design tokens
- `public/` — Google Sans Flex, Doto, and images

## Environment

See `.env.example`. `NEXT_PUBLIC_VIBENET_*` are public URLs. The snapshots API
needs Cloudflare R2 credentials (`BASE_*_R2_*`), which are secrets set in the
Vercel project settings.

## Agent index (llms.txt / AGENTS.md)

`public/llms.txt`, `public/llms-full.txt`, and `public/AGENTS.md` are generated
from the route tree by the scripts in `scripts/`. A `post-commit` git hook keeps
them fresh: mention `llms.txt` or `agents.md` in a commit message (or add/rename
a route file) and the hook regenerates them in a follow-up commit.

The hook is off until you enable it in your clone — `core.hooksPath` is a local
git setting and can't be committed, so each clone opts in once:

```bash
./githooks/install.sh   # scope: --local; never touches global/system git config
```

Bypass a single commit with `SKIP_DOCS_HOOK=1 git commit …` or a `[skip-docs]`
message. To disable: `./githooks/uninstall.sh`. See `githooks/README.md` for
details.

## Deployment targets

The same source builds two deployables, chosen by the build/dev script:

- `npm run build` / `npm run dev` — **external**: the public site on Vercel
  (default).
- `npm run build:internal` / `npm run dev:internal` — **internal**: a separate
  internal deployment, which includes internal-only sections.

`deploy.config.mjs` declares which sections ship to which target (the `SURFACES`
map). The scripts set `NEXT_PUBLIC_DEPLOY_TARGET`. A section not included in a
target is **unreachable** there: its routes and API return 404, and it's dropped
from the nav, sitemap, and llms files. (Its client chunks may still be built —
this repo is public, so the guarantee is unreachability, not omission from the
bundle.) **Internal Explorer** (`/internal-explorer`) is internal-only today,
and CI enforces its absence from the public build.

To run the other variant locally you can either use the `*:internal` scripts or
set `NEXT_PUBLIC_DEPLOY_TARGET` in `.env.local` to pin a default. The scripts take
precedence over `.env.local`, so a pinned value never locks you out of either
variant. Vercel sets no value, so the public deploy is always external.

To add an environment-specific page, add one `SURFACES` entry (middleware and the
llms generator pick it up automatically) and gate its nav entry / layout / API
guard on `surfaceEnabled(...)`. `deploy.config.test.mjs` covers the matrix logic.

## Deployment

Deployed on Vercel (external target). Push to the default branch to ship; pull
requests get preview deployments. The internal target is built and deployed
separately by an internal deployment repo.

## License

MIT — see [LICENSE](LICENSE), with the exceptions in [NOTICE](NOTICE). The Base
Sans brand typefaces under `public/fonts/` are **not** MIT licensed and may not
be reused outside this project; `NOTICE` also carries third-party attribution
for the bundled code in `vendor/aa/`.
