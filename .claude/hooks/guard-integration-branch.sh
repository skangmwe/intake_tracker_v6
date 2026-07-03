#!/usr/bin/env bash
# guard-integration-branch.sh — PreToolUse hook for Edit / Write /
# NotebookEdit. Blocks mutations whose target file lives on the
# integration branch (`dev`, `main`, or `master`), forcing the work into
# a slice or fix worktree first.
#
# How the catch works:
#   - PreToolUse receives a JSON payload on stdin describing the tool
#     call. For Edit, Write, and NotebookEdit, the file path is in
#     `.tool_input.file_path` (or `.tool_input.notebook_path` for
#     NotebookEdit).
#   - We resolve the file's parent directory and ask git which branch
#     that directory is on — git's notion of branch is per-worktree, so
#     a file inside `.claude/worktrees/abc/` reports `slice/abc`, while
#     a file under the primary worktree reports `dev`.
#   - If the answer is `dev`, `main`, or `master`, we block with a
#     plain-instructions message telling Claude to run
#     `bash .claude/hooks/begin-change.sh <short-name>` first and then
#     retry the operation using the new worktree's path.
#
# A fast-path skip: anything already inside `.claude/worktrees/` is
# allowed without invoking git. That handles the common case
# (mid-slice edits) with no overhead.
#
# Bash and other tool calls are not gated by this hook — only Edit,
# Write, and NotebookEdit.

set -eo pipefail

INPUT="$(cat)"

extract_field() {
  # Simple regex-based JSON field extraction, matching the pattern used
  # by block-git-commit.sh so we don't take a jq dependency.
  local field="$1"
  echo "$INPUT" \
    | grep -o "\"$field\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" \
    | head -1 \
    | sed "s/.*\"$field\"[[:space:]]*:[[:space:]]*\"//;s/\"$//"
}

FILE_PATH="$(extract_field file_path)"
if [ -z "$FILE_PATH" ]; then
  FILE_PATH="$(extract_field notebook_path)"
fi

# If there's no file path in this call, we have nothing to evaluate.
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Fast path: anything under `.claude/worktrees/` is always allowed.
case "$FILE_PATH" in
  */.claude/worktrees/*) exit 0 ;;
esac

# Resolve the directory we need to ask git about. If the file doesn't
# exist yet (Write of a new file), walk up until we hit an existing
# directory.
TARGET_DIR="$(dirname "$FILE_PATH")"
while [ -n "$TARGET_DIR" ] && [ "$TARGET_DIR" != "/" ] && [ ! -d "$TARGET_DIR" ]; do
  TARGET_DIR="$(dirname "$TARGET_DIR")"
done

if [ -z "$TARGET_DIR" ] || [ ! -d "$TARGET_DIR" ]; then
  # Path is somewhere we can't reason about — allow.
  exit 0
fi

TARGET_BRANCH="$(git -C "$TARGET_DIR" branch --show-current 2>/dev/null || true)"

# Not a git repo, or detached HEAD — allow.
if [ -z "$TARGET_BRANCH" ]; then
  exit 0
fi

case "$TARGET_BRANCH" in
  dev|main|master) ;;
  *) exit 0 ;;
esac

# Block. The recovery instruction differs by role:
#   - analyst (Tier 1): the flow runs in a session worktree off `dev` that only
#     the Claude Code app can create — Claude can't relocate a running session.
#     So there is no silent self-fix: STOP and tell the user (flow-agnostically)
#     to reopen as a worktree session. Never points at begin-change (Tier 1
#     doesn't use it).
#   - everyone else (dev / Tier 3): per-slice worktrees via begin-change —
#     Claude self-recovers silently. Unchanged behavior.
ROOT="$(git -C "$TARGET_DIR" rev-parse --show-toplevel 2>/dev/null || true)"
ROLE="$(grep -o '"role"[[:space:]]*:[[:space:]]*"[^"]*"' "$ROOT/.claude/profile.json" 2>/dev/null | sed 's/.*"\([^"]*\)"$/\1/')"

if [ "$ROLE" = "analyst" ]; then
  cat <<'BLOCK'
{"decision":"block","reason":"This session is on the integration branch (dev/main/master), and I can't move it into a workspace on my own. STOP and tell the user, in plain English: \"This session is on the integration branch, so I can't make changes here. Please reopen the project as a worktree session off `dev` — turn on the worktree option and pick `dev` as the base when you open the session — then pick up where we left off. Nothing is lost.\" Do not retry the edit, and do not run begin-change.sh (the Tier 1 flow does not use it)."}
BLOCK
  exit 0
fi

# dev / Tier 3 — unchanged: tell Claude exactly what to do.
cat <<'BLOCK'
{"decision":"block","reason":"Refusing to mutate a file on the integration branch (dev/main/master). Spin up a workspace first:\n\n1. Pick a short kebab-case name from the user's current request (2-4 words, e.g. \"login-button-fix\" or \"export-pdf\").\n2. Run: bash .claude/hooks/begin-change.sh <name>\n   (For /dev-build-application slices, add --type slice before the name.)\n3. The script prints the new workspace path on stdout.\n4. Re-issue the Edit/Write using a path inside that workspace. Use `git -C <workspace>` for any git operations.\n\nDo not surface this block to the user — they don't see worktrees. Just say something like \"starting work on <feature>\" in plain English and proceed."}
BLOCK
