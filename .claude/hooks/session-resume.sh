#!/usr/bin/env bash
# session-resume.sh — SessionStart hook for Claude Code.
#
# Runs at the start of every Claude Code session. Two jobs:
#   1. Silent sweep of any slice/fix worktrees that are already merged
#      into `dev` and clean (via cleanup-merged-worktrees.sh --silent).
#   2. If any slice or fix worktrees remain, emit a <session-resume>
#      block to stdout so Claude can surface the pending work to the
#      user in plain English on the first turn.
#
# Emits nothing when there's no pending work — keeps the common case
# (clean session) quiet.

set -eo pipefail

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 1. Silent cleanup pass. Best-effort; never fail the hook on cleanup error.
if [ -f "$SCRIPT_DIR/cleanup-merged-worktrees.sh" ]; then
  bash "$SCRIPT_DIR/cleanup-merged-worktrees.sh" --silent 2>/dev/null || true
fi

# 1b. Analyst (Tier 1) integration-branch warning — must run BEFORE the
# "≤ 1 worktree → exit" below, because being on `dev` with no session worktree
# is exactly the state we want to catch. The Tier 1 flow runs in a worktree off
# `dev`; if this session is on the integration branch, every build-flow edit
# (new app, feature, or bug fix) will be blocked by the integration-branch
# guard. Warn up front so the analyst can reopen correctly. Analyst projects only.
RESUME_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
RESUME_ROLE="$(grep -o '"role"[[:space:]]*:[[:space:]]*"[^"]*"' "$RESUME_ROOT/.claude/profile.json" 2>/dev/null | sed 's/.*"\([^"]*\)"$/\1/')"
RESUME_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
if [ "$RESUME_ROLE" = "analyst" ]; then
  case "$RESUME_BRANCH" in
    dev|main|master)
      cat <<'WARN'
<session-resume>
This session is on the integration branch (dev/main/master), not a worktree session. The Tier 1 build flow runs in a workspace branched off `dev`, so any change here — new app, feature, or bug fix — will be blocked.

On the first turn, tell the user in plain English: "Heads-up before we start — this session is on the integration branch, so I can't make changes here. Please close it and reopen the project as a worktree session off `dev` (turn on the worktree option and pick `dev` as the base when you open it), then go ahead as usual. I can't move the session into a workspace myself."
</session-resume>
WARN
      ;;
  esac
fi

# 2. Enumerate remaining slice/fix worktrees.

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

if [ "${#WT_PATHS[@]}" -le 1 ]; then
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

is_merged() {
  local needle="$1"
  [ -z "$MERGED_RAW" ] && return 1
  while IFS= read -r entry; do
    [ "$entry" = "$needle" ] && return 0
  done <<< "$MERGED_RAW"
  return 1
}

# Collect entries first; only emit the wrapping block if there's at least one.
declare -a ENTRIES=()

for i in "${!WT_PATHS[@]}"; do
  wt="${WT_PATHS[$i]}"
  br="${WT_BRANCHES[$i]}"

  [ "$wt" = "$PRIMARY" ] && continue
  [ -z "$br" ] && continue
  case "$br" in
    dev|main|master) continue ;;
  esac

  # Derive a display name: strip slice/ or fix/ prefix, replace - with space.
  display="$br"
  display="${display#slice/}"
  display="${display#fix/}"
  display="${display//-/ }"

  # Last activity, relative.
  last_activity="$(git -C "$wt" log -1 --pretty=%cr 2>/dev/null || echo "unknown")"

  # Dirty?
  if [ -n "$(git -C "$wt" status --porcelain 2>/dev/null)" ]; then
    dirty="true"
  else
    dirty="false"
  fi

  # Uncommitted work is never safely in dev, regardless of branch ancestry.
  # An empty branch (no commits of its own) is technically "merged" because it
  # has nothing dev is missing — but if the worktree is dirty, the real work is
  # uncommitted and NOT in dev. Dirty overrides the ancestry check so the status
  # can never falsely claim "merged" over work that was never committed.
  if [ "$dirty" = "true" ]; then
    merged="false"
  elif is_merged "$br"; then
    merged="true"
  else
    merged="false"
  fi

  # Single unambiguous, human-readable status line so the reader never has to
  # reconcile dirty + merged_into_dev (which can otherwise appear to contradict).
  if [ "$dirty" = "true" ]; then
    state="UNCOMMITTED — not saved to dev; would be lost if this workspace is removed"
  elif [ "$merged" = "true" ]; then
    state="merged into dev — safe to clean up"
  else
    state="committed, not yet merged into dev"
  fi

  if [ "$CWD_REAL" = "$wt" ] || [[ "$CWD_REAL" == "$wt"/* ]]; then
    current="true"
  else
    current="false"
  fi

  ENTRIES+=("- name: \"$display\"
  branch: $br
  worktree: $wt
  last_activity: \"$last_activity\"
  status: $state
  dirty: $dirty
  merged_into_dev: $merged
  is_current_cwd: $current")
done

if [ "${#ENTRIES[@]}" -eq 0 ]; then
  exit 0
fi

# Emit the block. The CLAUDE.md session-start section tells Claude how to
# react when this block is in context.
echo "<session-resume>"
echo "PENDING_WORK"
for entry in "${ENTRIES[@]}"; do
  echo "$entry"
done
echo "</session-resume>"

exit 0
