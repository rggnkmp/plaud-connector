#!/usr/bin/env bash
# Push current branch to the GitHub fork URL that has the real "forked from" relation.
# Does NOT delete anything. Refuses to run if the working tree is dirty (protect your local state).
set -euo pipefail

FORK_URL="${1:-}"
if [[ -z "$FORK_URL" ]]; then
  echo "Usage: $0 <https://github.com/USER/REPO.git>"
  echo "Example after creating fork on GitHub:"
  echo "  $0 https://github.com/rggnkmp/plaud.git"
  exit 1
fi

if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
  echo "Working tree is not clean. Commit or stash first so nothing is lost."
  git status -sb
  exit 1
fi

BRANCH="$(git branch --show-current)"
echo "Remote to add temporarily: fork-official -> $FORK_URL"
git remote get-url fork-official >/dev/null 2>&1 && git remote remove fork-official
git remote add fork-official "$FORK_URL"
echo "Pushing branch '$BRANCH' to fork-official..."
git push -u fork-official "$BRANCH"
echo "Done. Set origin permanently if this is your canonical repo:"
echo "  git remote set-url origin $FORK_URL"
echo "  git remote remove fork-official   # optional cleanup"
