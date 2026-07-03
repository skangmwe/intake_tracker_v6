#!/usr/bin/env bash
# block-git-commit.sh — PreToolUse hook for Claude Code
# Blocks raw "git commit" unless /dev-ship has unlocked it by creating
# .claude/.commit-allowed in the project root.

# Read the tool input JSON from stdin
INPUT=$(cat)

# Extract the command field from the JSON payload
COMMAND=$(echo "$INPUT" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"command"[[:space:]]*:[[:space:]]*"//;s/"$//')

# Allow anything that is not a git commit
if ! echo "$COMMAND" | grep -qE '\bgit\s+commit\b'; then
  exit 0
fi

# git commit detected — check for the unlock file (one-shot token).
# /dev-ship creates this file before committing. We delete it on read so the
# token is consumed exactly once, even if the model crashes or compaction
# happens before /dev-ship's own cleanup runs.
if [ -f ".claude/.commit-allowed" ]; then
  rm -f ".claude/.commit-allowed"
  exit 0
fi

# Block the commit
cat <<'BLOCK'
{"decision":"block","reason":"Direct git commit is blocked. Use /dev-ship to ship a slice or fix — it runs the test gate, commits, merges into dev, and pushes. /dev-ship is the only authorised path to a commit in this workflow."}
BLOCK
