#!/usr/bin/env bash
# detect-design-handoff.sh — deterministic detector for a Claude Design handoff
# bundle. Replaces the eyeball check in /plan that an agent can shortcut.
#
# A bundle is "present" when artifacts/docs/design/ holds ANYTHING beyond the
# known non-bundle artifacts: the CLI-shipped baseline
# (mws-design-system-showcase.html + .gitkeep) plus the /design-foundation
# outputs (full-design-blueprint.md + HANDOFF-design-brief.md). When present,
# /plan MUST implement against it — it is a hard error to record "no handoff"
# while this prints PRESENT.
#
# Usage: bash .claude/hooks/detect-design-handoff.sh [project-root]
# Output: a "DESIGN-HANDOFF: PRESENT|ABSENT" verdict line (string-checkable)
#         plus, when present, the non-baseline entries. Always exits 0.
#
# Enforcement model: this hook makes the verdict deterministic — the agent
# can't "glance at one file and conclude no design." Compliance, however,
# still rests on the calling skill (skills-analyst/plan/SKILL.md) honoring
# the verdict line; nothing in the bash exit code stops a skill that ignores
# it. To upgrade to a hard machine gate, change this hook to exit non-zero
# on PRESENT *and* update the calling skill to branch on $? — both halves
# are required, exit codes alone don't enforce when the consumer is an LLM.

set -uo pipefail

ROOT="${1:-$(pwd)}"
DIR="$ROOT/artifacts/docs/design"

if [ ! -d "$DIR" ]; then
  echo "DESIGN-HANDOFF: ABSENT (no $DIR)"
  exit 0
fi

shopt -s nullglob dotglob
extra=()
for entry in "$DIR"/*; do
  base="$(basename "$entry")"
  case "$base" in
    mws-design-system-showcase.html|.gitkeep) continue ;;
    full-design-blueprint.md|HANDOFF-design-brief.md) continue ;;
  esac
  extra+=("$base")
done
shopt -u nullglob dotglob

if [ "${#extra[@]}" -gt 0 ]; then
  echo "DESIGN-HANDOFF: PRESENT"
  echo "A Claude Design bundle is in artifacts/docs/design/. You MUST implement against it:"
  echo "read .claude/rules/design/README.md, then the project folder + token CSS — do NOT free-build,"
  echo "and do NOT record 'no handoff present' in plan.md. Non-baseline entries:"
  for entry in "${extra[@]}"; do echo "  - $entry"; done
  exit 0
fi

echo "DESIGN-HANDOFF: ABSENT (only the CLI baseline is present)"
exit 0
