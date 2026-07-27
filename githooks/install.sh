#!/bin/sh
# Install llms-kit's git hooks for THIS CLONE ONLY.
#
# Scope: --local. This never touches your global or system git config, and never
# writes to $HOME. Verify for yourself after running:
#     git config --global --get core.hooksPath    # should print nothing
#
# Usage: ./githooks/install.sh
set -e

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

# Record any pre-existing hooksPath so uninstall.sh can put it back exactly.
# Husky sets this to .husky; lefthook to .lefthook. Replacing one silently
# would break someone's whole pre-commit setup with no trace of what happened.
PREV=$(git config --local --get core.hooksPath 2>/dev/null || true)
if [ -n "$PREV" ] && [ "$PREV" != "githooks" ]; then
  echo "WARNING: core.hooksPath was already set to '$PREV'."
  case "$PREV" in
    .husky*)   echo "         That looks like husky. Its hooks will stop running." ;;
    .lefthook*) echo "         That looks like lefthook. Its hooks will stop running." ;;
    *)         echo "         Those hooks will stop running." ;;
  esac
  echo "         The previous value is saved; ./githooks/uninstall.sh restores it."
  echo
  # Only record on first install, so re-running never overwrites the real value
  # with 'githooks'.
  if [ -z "$(git config --local --get llmskit.previousHooksPath 2>/dev/null || true)" ]; then
    git config --local llmskit.previousHooksPath "$PREV"
  fi
fi

git config --local core.hooksPath githooks
chmod +x githooks/post-commit githooks/post-merge githooks/install.sh githooks/uninstall.sh

# Seed a repo-root AGENTS.md if and only if there isn't one. This file is for
# coding agents working IN the repo (the agents.md spec) and is hand-written —
# it is deliberately absent from every generator's `outputs`, so the hook can
# never overwrite it. The generated, public-facing AGENTS.md is a different
# file and lives in public/.
if [ ! -f AGENTS.md ] && [ -f githooks/templates/AGENTS.root.template.md ]; then
  cp githooks/templates/AGENTS.root.template.md AGENTS.md
  SEEDED_AGENTS=1
else
  SEEDED_AGENTS=0
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "Note: 'jq' is not installed — hooks will use built-in defaults instead of"
  echo "      githooks/config.json. Everything still works; edits to config.json"
  echo "      just won't be picked up. Install with: brew install jq"
  echo
fi

echo "Installed llms-kit hooks for this clone (scope: --local):"
echo "  core.hooksPath = $(git config --local --get core.hooksPath)"
if [ "$SEEDED_AGENTS" = "1" ]; then
  echo "  created AGENTS.md from template (hand-written; never generated)"
fi
echo
echo "Add these to package.json if they aren't there yet:"
echo '  "llms":   "node scripts/llms.mjs",'
echo '  "agents": "node scripts/agents.mjs"'
echo
echo "Day-to-day use — mention a keyword in your commit message:"
echo "  git commit -m \"feat: add snapshots page; updates llms.txt\""
echo "  git commit -m \"docs: refresh agents.md\""
echo "The hook regenerates and creates one follow-up commit."
echo
echo "Verify in 60 seconds:"
echo "  git commit --allow-empty -m \"chore: refresh llms.txt\""
echo "  git log --oneline -2"
echo
echo "Bypass once:   SKIP_DOCS_HOOK=1 git commit ...   (or put [skip-docs] in the message)"
echo "Check scope:   git config --global --get core.hooksPath   -> should print nothing"
echo "Uninstall:     ./githooks/uninstall.sh"
