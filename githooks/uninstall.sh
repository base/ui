#!/bin/sh
# Remove llms-kit's git hooks from this clone, restoring whatever core.hooksPath
# was set to beforehand (husky, lefthook, or nothing at all).
#
# Idempotent: running it twice is harmless.
#
# Usage: ./githooks/uninstall.sh
set -e

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

CURRENT=$(git config --local --get core.hooksPath 2>/dev/null || true)
PREV=$(git config --local --get llmskit.previousHooksPath 2>/dev/null || true)

if [ "$CURRENT" != "githooks" ] && [ -n "$CURRENT" ]; then
  echo "core.hooksPath is '$CURRENT', not 'githooks' — llms-kit does not appear"
  echo "to be installed. Leaving it alone."
  exit 0
fi

if [ -n "$PREV" ]; then
  git config --local core.hooksPath "$PREV"
  git config --local --unset llmskit.previousHooksPath 2>/dev/null || true
  echo "Restored core.hooksPath = $PREV"
else
  git config --local --unset core.hooksPath 2>/dev/null || true
  echo "Unset core.hooksPath (it was not set before llms-kit was installed)."
fi

echo
echo "Generated files were left in place. Remove them by hand if you want them gone:"
echo "  git rm public/llms.txt public/llms-full.txt public/AGENTS.md"
