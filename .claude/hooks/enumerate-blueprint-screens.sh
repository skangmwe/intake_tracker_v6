#!/usr/bin/env bash
# enumerate-blueprint-screens.sh — read the screen-map table from
# artifacts/docs/design/full-design-blueprint.md and emit one machine-readable
# row per screen (tab-separated: ID, Name, Tag, Connects-to). Used by the
# review skills' Step 4.5 (design fidelity matrix) — the reviewer must produce
# exactly one Screen Coverage Matrix row per screen this hook prints.
#
# Tolerant of column-order variation: identifies columns from the markdown
# table header rather than assuming positions. The right table is identified
# by a header row containing both an "ID" column and a "Tag" column (or a
# "Prototype/Deferred" / "Prototype/Save-for-/build" column — both tag
# vocabularies are accepted, since design-code-handoff renames the
# non-prototype tag to "Save-for-/build" during reconciliation).
#
# Usage: bash .claude/hooks/enumerate-blueprint-screens.sh [project-root]
#
# Output (stdout):
#   first line:    "BLUEPRINT-SCREENS: <count>"  on success
#                  "BLUEPRINT-SCREENS: ABSENT (reason)"  if nothing usable
#   following:     "<ID>\t<Name>\t<Tag>\t<Connects-to>" — one per screen
#
# Always exits 0. Reviewers consume the verdict line; nothing branches on $?.
#
# Notes / known limitations:
#   - The "Connects-to" column is informational only — it is emitted for
#     downstream consumers that want to display the navigation graph, but
#     is NOT cross-validated against the enumerated screen ID set. A
#     "Connects-to" entry that references a screen ID not present in the
#     table is passed through as written; the manifest validator only
#     cares about the ID column.
#   - Markdown table parsing assumes pipe (|) is the column delimiter and
#     that cells do not contain literal unescaped pipes. A cell containing
#     a literal "|" will mis-align the row; quote or escape such cells in
#     the blueprint if they occur.
#   - awk is run with the locale-default encoding. UTF-8 cells (e.g.
#     screen names with accented characters) pass through as bytes; this
#     is fine on UTF-8 systems but may produce mojibake on locales that
#     re-interpret the bytes.

set -uo pipefail

ROOT="${1:-$(pwd)}"
BLUEPRINT="$ROOT/artifacts/docs/design/full-design-blueprint.md"

if [ ! -f "$BLUEPRINT" ]; then
  echo "BLUEPRINT-SCREENS: ABSENT (no $BLUEPRINT)"
  exit 0
fi

awk '
  function trim(s)  { sub(/^[[:space:]]+/, "", s); sub(/[[:space:]]+$/, "", s); return s }
  function key(s) {
    s = tolower(trim(s))
    gsub(/[^a-z0-9]+/, " ", s)
    return trim(s)
  }
  BEGIN {
    state = "seek"   # seek -> sep -> data
    count = 0
  }
  /^[[:space:]]*$/ { state = "seek"; next }
  /^[[:space:]]*\|/ {
    # Parse cells; drop the leading/trailing empties produced by outer pipes.
    n = split($0, raw, /\|/)
    cn = 0
    delete cells
    for (i = 1; i <= n; i++) {
      if (i == 1 && raw[i] ~ /^[[:space:]]*$/) continue
      if (i == n && raw[i] ~ /^[[:space:]]*$/) continue
      cn++
      cells[cn] = trim(raw[i])
    }
    if (state == "seek") {
      has_id = 0; has_tag = 0
      for (i = 1; i <= cn; i++) {
        h = key(cells[i])
        if (h == "id") has_id = 1
        if (h == "tag" || h == "prototype deferred" || h == "prototype save for build") has_tag = 1
      }
      if (has_id && has_tag) {
        delete col
        for (i = 1; i <= cn; i++) col[key(cells[i])] = i
        state = "sep"
      }
      next
    }
    if (state == "sep") {
      # Skip the markdown separator row (|---|---|...).
      state = "data"
      next
    }
    if (state == "data") {
      id    = ("id"   in col) ? cells[col["id"]]   : ""
      name  = ("name" in col) ? cells[col["name"]] : ""
      tag_i = ("tag"  in col) ? col["tag"] : (("prototype deferred" in col) ? col["prototype deferred"] : (("prototype save for build" in col) ? col["prototype save for build"] : 0))
      tag   = tag_i ? cells[tag_i] : ""
      con_i = ("connects to" in col) ? col["connects to"] : (("connects" in col) ? col["connects"] : (("connections" in col) ? col["connections"] : 0))
      conn  = con_i ? cells[con_i] : ""
      if (id != "" && tag != "") {
        count++
        rows[count] = id "\t" name "\t" tag "\t" conn
      }
      next
    }
  }
  END {
    if (count > 0) {
      print "BLUEPRINT-SCREENS: " count
      for (i = 1; i <= count; i++) print rows[i]
    } else {
      print "BLUEPRINT-SCREENS: ABSENT (no screen-map table found in blueprint)"
    }
  }
' "$BLUEPRINT"
