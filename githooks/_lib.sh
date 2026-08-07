# shellcheck shell=sh
# Shared loader for the llms-kit hooks. Sourced by post-commit and post-merge.
#
# Reads githooks/config.json (via jq) and exposes:
#   SKIP_TOKEN       literal string that, in a commit message, skips the hook
#   GENERATORS_TSV   one line per generator: name<TAB>trigger<TAB>script<TAB>outputs
#                    (outputs is a space-separated list)
#   EXCLUDE_REGEX    ERE matching any generator output, used to exclude generated
#                    files from structural-change detection
#   ALL_OUTPUTS      space-separated list of every output across all generators
#   WATCH_GLOBS      space-separated pathspecs whose A/D/R auto-triggers a regen
#
# Falls back to built-in defaults if jq is missing or config.json is absent or
# malformed, so the hook never breaks just because someone uninstalled jq.
#
# IMPORTANT: _use_defaults() below duplicates config.json. That duplication is
# deliberate (it is what makes the no-jq path work) but it can drift. The test
# suite parses both and asserts they agree — see tests/hook-trigger.test.mjs.

_lib_log() { [ -n "$DEBUG_DOCS_HOOK" ] && echo "[hooks-lib] $*" >&2; }

_use_defaults() {
  SKIP_TOKEN='[skip-docs]'
  GENERATORS_TSV=$(printf '%s\n%s\n' \
    'agents	agents.md	scripts/agents.mjs	public/AGENTS.md' \
    'llms	llms.txt	scripts/llms.mjs	public/llms.txt public/llms-full.txt')
  EXCLUDE_REGEX='^public/AGENTS\.md$|^public/llms\.txt$|^public/llms-full\.txt$'
  ALL_OUTPUTS='public/AGENTS.md public/llms.txt public/llms-full.txt'
  WATCH_GLOBS='app/**/page.tsx app/**/page.jsx app/**/page.js app/**/page.mdx app/**/layout.tsx app/sitemap.ts src/app/**/page.tsx src/app/**/page.jsx src/app/**/page.js src/app/**/page.mdx src/app/**/layout.tsx src/app/sitemap.ts llms.config.mjs'
}

load_hooks_config() {
  CONFIG_FILE="${REPO_ROOT:-$(git rev-parse --show-toplevel)}/githooks/config.json"

  if ! command -v jq >/dev/null 2>&1; then
    _lib_log "jq not installed; using built-in defaults"
    _use_defaults
    return
  fi
  if [ ! -f "$CONFIG_FILE" ]; then
    _lib_log "$CONFIG_FILE missing; using built-in defaults"
    _use_defaults
    return
  fi
  if ! jq empty "$CONFIG_FILE" >/dev/null 2>&1; then
    echo "[hooks-lib] WARN: $CONFIG_FILE is not valid JSON; falling back to defaults" >&2
    _use_defaults
    return
  fi

  SKIP_TOKEN=$(jq -r '.skipToken // "[skip-docs]"' "$CONFIG_FILE")

  GENERATORS_TSV=$(jq -r '.generators[]
    | [(.name // "?"), (.trigger // ""), (.script // ""), (.outputs // [] | join(" "))]
    | @tsv' "$CONFIG_FILE")

  ALL_OUTPUTS=$(jq -r '[.generators[].outputs[]] | join(" ")' "$CONFIG_FILE")

  WATCH_GLOBS=$(jq -r '(.watchGlobs // []) | join(" ")' "$CONFIG_FILE")

  # ERE matching any output path exactly. Escapes '.' — the only regex
  # metacharacter likely to appear in a real output path.
  EXCLUDE_REGEX=$(jq -r '
    [.generators[].outputs[]
      | gsub("\\."; "\\.")
      | "^" + . + "$"
    ] | join("|")
  ' "$CONFIG_FILE")

  if [ -z "$GENERATORS_TSV" ]; then
    echo "[hooks-lib] WARN: $CONFIG_FILE has no generators; falling back to defaults" >&2
    _use_defaults
    return
  fi

  if [ -z "$WATCH_GLOBS" ]; then
    _lib_log "config has no watchGlobs; auto-trigger disabled (keyword opt-in still works)"
  fi

  _lib_log "loaded $(echo "$GENERATORS_TSV" | wc -l | tr -d ' ') generator(s) from config"
}

# Filter `git diff --name-status` output down to real structural changes.
#
# Reads on stdin, writes matching lines to stdout.
#
# PORT FIX (b): the upstream version in base/docs tested $2, which for a rename
# line ("R100<TAB>old<TAB>new") is the OLD path. Renaming a generated output
# therefore slipped past the exclusion and auto-fired the hook. $NF is the new
# path, which is the one that matters.
filter_structural() {
  awk -v excl="$EXCLUDE_REGEX" '
    excl == "" { print; next }
    $NF !~ excl && $2 !~ excl { print }
  '
}
