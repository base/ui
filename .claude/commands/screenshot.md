---
description: Screenshot the routes affected by the current PR's diff and upload them for the PR body
---

# PR Preview Screenshots

Take screenshots of pages affected by the current PR's changes using `agent-browser`.

## Instructions

1. **Identify affected routes** by looking at the diff against the base branch:

   ```bash
   git merge-base HEAD origin/main
   git diff $(git merge-base HEAD origin/main)...HEAD --name-only
   ```

   | Changed files | Routes to screenshot |
   |---|---|
   | `app/page.tsx` | `/` |
   | `app/snapshots/**` | `/snapshots` |
   | `app/upgrades/**` (not `changelog/`) | `/upgrades` |
   | `app/upgrades/changelog/**` | `/upgrades/changelog` |
   | `app/vibenet/demos/**` | `/vibenet/demos/account`, `/vibenet/demos/b20`, `/vibenet/demos/validity` |
   | `app/vibenet/**` (not `demos/`) | `/vibenet`, `/vibenet/explorer` |
   | `app/internal-explorer/**` (internal-only, see below) | `/internal-explorer`, `/internal-explorer/txs`, `/internal-explorer/blocks` |
   | `app/benchmark/**` (internal-only, see below) | `/benchmark`, `/benchmark/run`, `/benchmark/load-tests` |
   | `app/components/**`, `app/globals.css`, `tailwind.config.ts` | One representative external route (`/`) plus whichever of the above sections the component is actually used in — check imports, don't screenshot everything |
   | `app/api/**`, `app/analytics/**`, `lib/**`-equivalents (data/hooks with no UI) | No screenshots needed (backend-only) |

   If no visual files changed, say so and skip screenshots.

2. **Start the dev server** if one isn't already running. `internal-explorer` and
   `benchmark` are internal-only surfaces (see `deploy.config.mjs`) — they 404 on
   the plain dev server, so use `npm run dev:internal` if any affected route falls
   under either prefix; otherwise `npm run dev` is enough:
   ```bash
   npm run dev &        # or: npm run dev:internal &
   ```
   Wait for it to be ready by polling `http://localhost:3000` with `agent-browser`.
   Do NOT run `npm run build` while the dev server is up — it 500s a running
   `next dev` (see project memory `next-build-clobbers-dev-server`).

3. **Take screenshots** using `agent-browser`. For each affected route:
   ```bash
   mkdir -p screenshots
   agent-browser open http://localhost:3000/<route> && agent-browser wait --load networkidle && agent-browser screenshot --full screenshots/<name>.png
   ```

   Use descriptive filenames, e.g. `home.png`, `vibenet-explorer.png`,
   `internal-explorer-txs.png`, `benchmark-run.png`.

4. **Close the browser** when done:
   ```bash
   agent-browser close
   ```

5. **Review screenshots**: Read each screenshot file to visually inspect the
   pages. Describe what you see and confirm the visual changes look correct.

6. **Upload screenshots** to GitHub as draft release assets so they can be
   embedded in the PR (use the PR number):
   ```bash
   gh release create screenshots-pr-<N> --draft --title "PR #<N> Screenshots" --notes "Screenshots for PR review" screenshots/*.png
   gh release view screenshots-pr-<N> --json assets --jq '.assets[] | "\(.name): \(.url)"'
   ```

7. **Report results**: Return the image markdown for each screenshot so it can
   be added to the PR body's **Screenshots** section, using the URLs from step 6.

## Notes

- Screenshots are saved locally (gitignored) — do NOT commit them to the repo.
  They're uploaded via draft GitHub releases instead.
- Use `agent-browser set viewport 1280 800` before capturing for consistent
  dimensions.
- If the dev server is already running, skip starting a new one — but check
  whether it needs to be the `:internal` variant for the routes you need.
- After a PR is merged (or closed), clean up its draft release:
  `gh release delete screenshots-pr-<N> --yes`.
