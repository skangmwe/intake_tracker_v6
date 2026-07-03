#!/usr/bin/env bash
# begin-change.sh — create (or resume) a slice or fix worktree branched
# off the latest `dev`, and print its absolute path on stdout. Idempotent.
#
# Usage:
#   bash .claude/hooks/begin-change.sh [--type slice|fix] <short-name>
#
# Examples:
#   bash .claude/hooks/begin-change.sh fix-login-button
#   bash .claude/hooks/begin-change.sh --type slice conversations-crud
#
# Behavior:
#   - --type defaults to `fix` (ad-hoc / bug-fix workspaces).
#     Use --type slice when called from /dev-build-application's
#     per-slice loop. Use --type build for the shared workspace used
#     across /dev-build-architecture, /dev-build-scaffold, and
#     /dev-build-application (they all pass the same name and continue
#     in the same workspace until the analyst ships at the end).
#   - Slugifies the name (lowercase, [^a-z0-9-] → '-', collapses '--',
#     strips leading/trailing '-').
#   - Branch name: <type>/<slug>.
#   - Worktree path: <primary-worktree>/.claude/worktrees/<slug>.
#   - If the worktree already exists, just print its path (idempotent).
#   - Always refreshes `dev` (fetch + reset to origin/dev) before
#     creating the worktree.
#   - On success, the absolute worktree path is printed to stdout (and
#     only that — diagnostics go to stderr).

set -eo pipefail

TYPE="fix"
if [ "${1:-}" = "--type" ]; then
  TYPE="${2:-}"
  if [ -z "$TYPE" ]; then
    echo "begin-change: --type requires an argument (slice, fix, or build)" >&2
    exit 2
  fi
  case "$TYPE" in
    slice|fix|build) ;;
    *) echo "begin-change: --type must be slice, fix, or build (got: $TYPE)" >&2; exit 2 ;;
  esac
  shift 2
fi

RAW_NAME="${1:-}"
if [ -z "$RAW_NAME" ]; then
  echo "begin-change: name required" >&2
  echo "usage: bash .claude/hooks/begin-change.sh [--type slice|fix] <short-name>" >&2
  exit 2
fi

# Slugify: lowercase, non-alphanumeric → '-', collapse '--', strip edges.
SLUG="$(
  printf '%s' "$RAW_NAME" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -e 's/[^a-z0-9-]/-/g' -e 's/--*/-/g' -e 's/^-//' -e 's/-$//'
)"
if [ -z "$SLUG" ]; then
  echo "begin-change: name slugified to empty string (got: $RAW_NAME)" >&2
  exit 2
fi

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "begin-change: not inside a git repository" >&2
  exit 2
fi

PRIMARY="$(git worktree list --porcelain | awk '
  /^worktree / { p=$2 }
  /^branch refs\/heads\/dev$/ { print p; exit }
')"

if [ -z "$PRIMARY" ]; then
  echo "begin-change: project is missing the dev branch (setup problem, not user error)" >&2
  exit 2
fi

BR="$TYPE/$SLUG"
WT_PATH="$PRIMARY/.claude/worktrees/$SLUG"

# Idempotent: if the worktree already exists, just print its path.
if [ -d "$WT_PATH" ]; then
  # Sanity-check: it should still be registered with git.
  if git -C "$PRIMARY" worktree list --porcelain | grep -Fxq "worktree $WT_PATH"; then
    echo "$WT_PATH"
    exit 0
  fi
  # Directory exists but isn't a registered worktree — stale leftover.
  # Refuse to clobber; surface for human attention.
  echo "begin-change: $WT_PATH exists on disk but is not a registered worktree — please remove it manually" >&2
  exit 2
fi

# Refresh dev to origin/dev before branching.
git -C "$PRIMARY" fetch origin dev >&2
git -C "$PRIMARY" checkout dev >&2

# Don't reset if the dev worktree has uncommitted changes (would lose work).
if [ -n "$(git -C "$PRIMARY" status --porcelain 2>/dev/null)" ]; then
  echo "begin-change: dev has uncommitted changes — please resolve before starting new work" >&2
  exit 2
fi

git -C "$PRIMARY" reset --hard origin/dev >&2

# Create the worktree.
mkdir -p "$PRIMARY/.claude/worktrees"

if git -C "$PRIMARY" show-ref --verify --quiet "refs/heads/$BR"; then
  # Branch exists already (e.g. resuming) — attach worktree to it.
  git -C "$PRIMARY" worktree add "$WT_PATH" "$BR" >&2
else
  git -C "$PRIMARY" worktree add -b "$BR" "$WT_PATH" dev >&2
fi

echo "$WT_PATH"
exit 0
