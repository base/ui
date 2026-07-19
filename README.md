# Base Chain Dashboard

One UI for Base network dashboards and stats: snapshots, network upgrades, and
the Vibenet devnet explorer/faucet, under a single shell.

A standalone Next.js (App Router) app, deployed on Vercel. Migrated out of the
internal Nx template so it builds and ships with the standard Next toolchain.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in values as needed
npm run dev                  # http://localhost:3000
```

## Scripts

- `npm run dev` — dev server
- `npm run build` — production build
- `npm run start` — serve the production build
- `npm run lint` — eslint (next/core-web-vitals)
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — vitest

## Structure

- `app/` — App Router routes and API handlers
  - `snapshots/` — Reth v2 snapshot browser (`/api/snapshots` reads Cloudflare R2)
  - `upgrades/` — network upgrade schedule, changelog, per-fork detail
  - `vibenet/` — devnet explorer and faucet
  - `components/` — shared shell and UI primitives
  - `theme.ts` / `spectrum.ts` / `globals.css` — BDS design tokens
- `public/` — Base Sans fonts and images

## Environment

See `.env.example`. `NEXT_PUBLIC_VIBENET_*` are public URLs. The snapshots API
needs Cloudflare R2 credentials (`BASE_*_R2_*`), which are secrets set in the
Vercel project settings.

## Deployment

Deployed on Vercel. Push to the default branch to ship; pull requests get
preview deployments.
