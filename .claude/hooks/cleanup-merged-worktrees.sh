#!/usr/bin/env bash
# cleanup-merged-worktrees.sh — silent helper that removes any slice or fix
# worktree whose branch is already merged into `dev` and whose working tree
# is clean. Idempotent. Safe to run anytime.
#
# Usage:
#   bash .claude/hooks/cleanup-merged-worktrees.sh [--silent]
#
# Called from:
#   - /dev-ship (top of run, silent sweep of leftovers from previous ships).
#   - .claude/hooks/session-resume.sh (silent sweep at session start).
#
# In --silent mode, emits nothing to stdout. Errors still go to stderr.
# In default mode, prints one summary line per worktree (kept or removed).
#
# A worktree is kept (not removed) if any of these apply:
#   - It's the primary worktree, or its branch is dev/main/master.
#   - The user's current working directory is inside it.
#   - It has uncommitted changes.
#   - Its branch is not merged into `dev`.
#   - Its branch name appears in <primary>/.claude/.undo-keepalive.
#
# Otherwise: `git worktree remove <path>` + `git branch -d <branch>`.

set -eo pipefail

SILENT=0
for arg in "$@"; do
  case "$arg" in
    --silent) SILENT=1 ;;
    *) echo "cleanup-merged-worktrees: unknown arg: $arg" >&2; exit 2 ;;
  esac
done

say() {
  [ "$SILENT" -eq 1 ] && return 0
  echo "$@"
}

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  exit 0
fi

CWD_REAL="$(cd "$PWD" && pwd -P)"

declare -a WT_PATHS=()
declare -a WT_BRANCHES=()
cur_path=""
cur_branch=""

while IFS= read -r line || [ -n "$line" ]; do
  if [ -z "$line" ]; then
    if [ -n "$cur_path" ]; then
      WT_PATHS+=("$cur_path")
      WT_BRANCHES+=("$cur_branch")
    fi
    cur_path=""
    cur_branch=""
    continue
  fi
  case "$line" in
    worktree\ *) cur_path="${line#worktree }" ;;
    branch\ *)   cur_branch="${line#branch refs/heads/}" ;;
    detached)    cur_branch="" ;;
  esac
done < <(git worktree list --porcelain)

if [ -n "$cur_path" ]; then
  WT_PATHS+=("$cur_path")
  WT_BRANCHES+=("$cur_branch")
fi

if [ "${#WT_PATHS[@]}" -eq 0 ]; then
  exit 0
fi

PRIMARY=""
for i in "${!WT_PATHS[@]}"; do
  if [ "${WT_BRANCHES[$i]}" = "dev" ]; then
    PRIMARY="${WT_PATHS[$i]}"
    break
  fi
done
if [ -z "$PRIMARY" ]; then
  PRIMARY="${WT_PATHS[0]}"
fi

MERGED_RAW=""
if git -C "$PRIMARY" show-ref --verify --quiet refs/heads/dev; then
  MERGED_RAW="$(git -C "$PRIMARY" for-each-ref --merged=refs/heads/dev refs/heads/ --format='%(refname:short)' 2>/dev/null || true)"
fi

KEEPALIVE_FILE="$PRIMARY/.claude/.undo-keepalive"
KEEPALIVE_RAW=""
if [ -f "$KEEPALIVE_FILE" ]; then
  KEEPALIVE_RAW="$(cat "$KEEPALIVE_FILE")"
fi

in_set() {
  local needle="$1"
  local haystack="$2"
  [ -z "$haystack" ] && return 1
  while IFS= read -r entry; do
    [ "$entry" = "$needle" ] && return 0
  done <<< "$haystack"
  return 1
}

REMOVED=0
KEPT=0

for i in "${!WT_PATHS[@]}"; do
  wt="${WT_PATHS[$i]}"
  br="${WT_BRANCHES[$i]}"

  [ "$wt" = "$PRIMARY" ] && continue
  [ -z "$br" ] && continue

  case "$br" in
    dev|main|master) continue ;;
  esac

  WT_REAL="$(cd "$wt" 2>/dev/null && pwd -P || echo "$wt")"
  if [ "$CWD_REAL" = "$WT_REAL" ] || [[ "$CWD_REAL" == "$WT_REAL"/* ]]; then
    say "kept: $br (you're working here)"
    KEPT=$((KEPT+1))
    continue
  fi

  if [ -n "$(git -C "$wt" status --porcelain 2>/dev/null)" ]; then
    say "kept: $br (uncommitted work)"
    KEPT=$((KEPT+1))
    continue
  fi

  if ! in_set "$br" "$MERGED_RAW"; then
    say "kept: $br (not merged into dev)"
    KEPT=$((KEPT+1))
    continue
  fi

  if in_set "$br" "$KEEPALIVE_RAW"; then
    say "kept: $br (marked keepalive)"
    KEPT=$((KEPT+1))
    continue
  fi

  if git worktree remove "$wt" 2>/dev/null; then
    if git -C "$PRIMARY" branch -d "$br" 2>/dev/null; then
      say "removed: $br ($wt)"
      REMOVED=$((REMOVED+1))
    else
      say "kept: $br (could not delete branch)"
      KEPT=$((KEPT+1))
    fi
  else
    say "kept: $br (could not remove worktree)"
    KEPT=$((KEPT+1))
  fi
done

git worktree prune 2>/dev/null || true

if [ "$SILENT" -eq 0 ] && { [ "$REMOVED" -gt 0 ] || [ "$KEPT" -gt 0 ]; }; then
  echo "cleanup: removed $REMOVED, kept $KEPT"
fi

exit 0
