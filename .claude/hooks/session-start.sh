#!/bin/bash
set -euo pipefail

# Only needed in Claude Code on the web containers.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Dependencies, so npm test works immediately.
npm install --no-audit --no-fund

# Web containers clone the repo when the session is CREATED, which can be
# well before work starts — and main may have moved on since (this is how
# the split-tile styling and new Oma days once got silently reverted).
# Fetch main and warn straight into the session context if we're behind.
if ! git fetch origin main --quiet; then
  echo "WARNING: could not fetch origin/main - verify the checkout is current before editing."
  exit 0
fi

BEHIND=$(git rev-list --count HEAD..origin/main)
if [ "$BEHIND" -gt 0 ]; then
  echo "WARNING - STALE CHECKOUT: this working copy is $BEHIND commit(s) behind origin/main."
  echo "Do NOT edit anything until the branch is rebuilt on the latest main:"
  echo "  git checkout -B <session-branch> origin/main    # branch has no work yet"
  echo "  git rebase origin/main                          # branch already has commits to keep"
  echo "Changes made from a stale base will revert other people's recent work."
else
  echo "Checkout is up to date with origin/main."
fi
