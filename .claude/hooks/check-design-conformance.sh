#!/usr/bin/env bash
# check-design-conformance.sh — design analogue of the OWASP pass for /review.
# Enforces the MWS "tokens only" non-negotiable (application design rules):
# every colour and radius in component styles must trace to a design token
# (var(--...)). Raw colours and off-spec radii in component styles are the
# drift that yields an off-design UI.
#
# Allowed radius values per the published rule (_core-requirements.md): 2px
# (--radius) or 999px (--radius-pill), "nothing in between". The check also
# accepts 0 / 0px (no radius) — the one practical add; it is not "in between".
# 50% is NOT accepted (the published rule does not allow it); a circular avatar
# must use --radius-pill / a token.
#
# Token-definition sheets (where the custom properties + vendor design CSS
# live) are exempt — the EXEMPT regex below is anchored to specific paths
# rather than substring-matching so component-level styles.css /
# design-tokens-demo.css are NOT silently skipped.
#
# ── Exit-code semantics (a SKIP is NOT a pass) ───────────────────────────────
#   0  PASS  — scanned ≥1 file, every colour/radius traces to a token.
#   1  FAIL  — blocking. Either off-token violations were found, OR web was
#              asserted in scope (--web-required / REVIEW_WEB_IN_SCOPE=1) but
#              web/src is absent, OR web/src is present but zero scannable
#              style-bearing files were matched (a glob that matches nothing
#              must never read as a pass).
#   2  SKIP  — non-blocking. No web/src and web was NOT asserted in scope
#              (e.g. a docs-only review). Distinct from PASS so callers can
#              branch: treat SKIP as blocking whenever web IS in scope.
# The first stdout token is PASS / FAIL / SKIP for easy branching, and the
# final line is machine-readable:
#   DESIGN-CONFORMANCE-RESULT: verdict=<PASS|FAIL|SKIP> files_scanned=<n> violations=<n>
#
# ── Scan-root resolution (self-locating; do not rely on the caller alone) ────
#   1. Explicit [project-root] argument, if provided (callers can override).
#   2. Else `git rev-parse --show-toplevel` — when invoked with cwd INSIDE a
#      git worktree this returns the WORKTREE root, so $ROOT/web/src resolves
#      to the uncommitted code under review, not the main checkout.
#   3. Else $(pwd).
#   git-toplevel only points at the worktree when cwd is inside it, so
#   self-location is necessary but not sufficient — pair it with --web-required
#   (the caller passes it whenever web is in the review's source scope) so a
#   resolved root that still has no web/src FAILS loud instead of skipping.
#
# Usage:
#   bash check-design-conformance.sh [project-root] [--web-required]
#   REVIEW_WEB_IN_SCOPE=1 bash check-design-conformance.sh [project-root]
#   (flag and positional may appear in any order)
#
# ── Coverage ─────────────────────────────────────────────────────────────────
#   CSS / SCSS (*.css, *.scss):
#     - Raw colours in value position: hex (3/4/6/8-digit), and the function
#       forms rgb()/rgba()/hsl()/hsla()/hwb()/oklch()/oklab()/lab()/lch()/color().
#     - Named CSS colours (red, white, …) in the value of a colour-bearing
#       property (color, background*, border*-color, outline*, fill, stroke,
#       box-shadow, *-color, gradients). Restricted to colour properties so
#       non-colour keywords (cursor: pointer, display: none) don't false-positive.
#       Allowlisted keywords are never flagged: transparent, currentColor,
#       inherit, initial, unset, revert, none.
#     - Radius: shorthand border-radius AND the corner-specific / logical forms
#       (border-top-left-radius … border-end-end-radius). Each value token must
#       be a var(--…) call or one of 0 / 0px / 2px / 999px.
#   TSX / JSX (*.tsx, *.jsx) — CONSERVATIVE regex heuristic (no JS parsing):
#     - On lines that reference styling (style=, styled, css`, or a
#       colour/border/shadow/radius key), flags raw colour literals (hex + the
#       function forms above) and numeric/px borderRadius literals that aren't a
#       token or an allowed value. It does NOT parse JS: it misses computed
#       values, values behind variables, template interpolation, and styling
#       split across lines, and may over-flag a hex used as non-style data on a
#       styling-keyword line. Prefer tokens everywhere to keep this quiet.
#
# Pure bash + grep/sed/awk. No runtime dependencies.

set -uo pipefail

# ── Parse args: any --flag is a flag; first non-flag is the project root ─────
ROOT_ARG=""
WEB_REQUIRED="${REVIEW_WEB_IN_SCOPE:-0}"
[ "$WEB_REQUIRED" = "1" ] && WEB_REQUIRED=1 || WEB_REQUIRED=0
for arg in "$@"; do
  case "$arg" in
    --web-required) WEB_REQUIRED=1 ;;
    --*) ;; # ignore unknown flags (forward-compat)
    *) [ -z "$ROOT_ARG" ] && ROOT_ARG="$arg" ;;
  esac
done

# ── Resolve the scan root ────────────────────────────────────────────────────
if [ -n "$ROOT_ARG" ]; then
  ROOT="$ROOT_ARG"
elif ROOT_TOP="$(git rev-parse --show-toplevel 2>/dev/null)" && [ -n "$ROOT_TOP" ]; then
  ROOT="$ROOT_TOP"
else
  ROOT="$(pwd)"
fi
WEB="$ROOT/web/src"

# Emit the machine-readable tail + exit. $1=verdict $2=files_scanned $3=violations
emit() {
  echo "DESIGN-CONFORMANCE-RESULT: verdict=$1 files_scanned=$2 violations=$3"
  case "$1" in
    PASS) exit 0 ;;
    FAIL) exit 1 ;;
    SKIP) exit 2 ;;
  esac
}

# ── web/src presence × web-required ──────────────────────────────────────────
if [ ! -d "$WEB" ]; then
  if [ "$WEB_REQUIRED" = "1" ]; then
    echo "DESIGN-CONFORMANCE: FAIL — web asserted in scope but $WEB not found."
    echo "  (resolved scan root: $ROOT). Pass the worktree root as the first"
    echo "  argument so \$ROOT/web/src resolves to the code under review."
    emit FAIL 0 1
  fi
  echo "DESIGN-CONFORMANCE: SKIP (no web/src at $WEB; web not in scope)"
  emit SKIP 0 0
fi

# Token-sheet exemptions — anchored so only canonical token-definition files are
# skipped. Component-level files with the same basename are still scanned.
EXEMPT='((^|/)mws/|(^|/)colors_and_type\.css$|(^|/)tokens\.css$|/web/src/styles\.css$)'

is_exempt() { echo "$1" | grep -Eq "$EXEMPT"; }

# grep -n output is FILE:LINE:CONTENT. Extract via the :LINE: anchor rather
# than the first colon — Windows paths contain a drive-letter colon (C:\...)
# that would otherwise be mistaken for the field separator and break
# file-level exemption.
hit_file()    { printf '%s' "$1" | sed -E 's/(.*):[0-9]+:.*/\1/'; }
hit_content() { printf '%s' "$1" | sed -E 's/^.*:[0-9]+:(.*)$/\1/'; }

# Count style-bearing files the globs match, and how many are NON-EXEMPT — the
# latter are the real scan targets (exempt token sheets are matched but never
# conformance-checked, so they can't surface a violation). The "nothing to scan"
# guard keys on the non-exempt count: a web/src whose only style files are token
# sheets has nothing the gate could verify, so under --web-required it must FAIL
# rather than read green.
files_scanned=0
while IFS= read -r _f; do
  is_exempt "$_f" && continue
  files_scanned=$((files_scanned + 1))
done < <(grep -rIl --include='*.css' --include='*.scss' --include='*.tsx' --include='*.jsx' -e '' "$WEB" 2>/dev/null)

if [ "$files_scanned" -eq 0 ]; then
  if [ "$WEB_REQUIRED" = "1" ]; then
    echo "DESIGN-CONFORMANCE: FAIL — $WEB has no non-exempt style files to scan"
    echo "  (only token sheets, or no *.css/*.scss/*.tsx/*.jsx at all). Web is"
    echo "  asserted in scope but nothing could be conformance-checked — not a pass."
    emit FAIL 0 1
  fi
  echo "DESIGN-CONFORMANCE: SKIP ($WEB has no non-exempt style files; web not in scope)"
  emit SKIP 0 0
fi

echo "DESIGN-CONFORMANCE: scanning $WEB ($files_scanned non-exempt file(s): *.css, *.scss, *.tsx, *.jsx)"
violations=0

# NOTE: the patterns below use \b (word boundary). It is not POSIX ERE, but is
# supported by every grep this hook targets — GNU grep (Git Bash on Windows,
# Linux) and the BSD/macOS grep -E. If a future target lacks it, replace \b with
# an explicit class such as ([^0-9a-fA-F]|$).
#
# Keyword allowlist — CSS-wide keywords that are not colours to tokenize.
ALLOW_KW_RE='^(transparent|currentColor|currentcolor|inherit|initial|unset|revert|revert-layer|none)$'
# Raw colour function forms (any of these in a component value is off-token).
COLOR_FN_RE='\b(rgba?|hsla?|hwb|oklch|oklab|lab|lch|color)\('
# Hex in value position (preceded by ":" — excludes id selectors / url(#frag)).
HEX_RE=':[[:space:]]*#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b'
# Colour-bearing properties whose value is scanned for NAMED colours.
COLOR_PROP_RE='(^|[;{[:space:]])(color|background|background-color|background-image|border|border-color|border-top|border-right|border-bottom|border-left|border-top-color|border-right-color|border-bottom-color|border-left-color|border-block-color|border-inline-color|outline|outline-color|fill|stroke|box-shadow|text-shadow|caret-color|accent-color|column-rule|column-rule-color|text-decoration-color|stop-color|flood-color|lighting-color)[[:space:]]*:'
# CSS named colours (CSS Color Level 4). Whole-word matched within colour-prop values.
NAMED_COLORS='aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgrey|darkgreen|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|grey|green|greenyellow|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgrey|lightgreen|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen'
# Allowed radius value tokens.
ALLOWED_RADIUS_RE='^(0|0px|2px|999px)$'

# ── Check 1 — raw hex colours (CSS/SCSS), value position ─────────────────────
while IFS= read -r hit; do
  file=$(hit_file "$hit")
  is_exempt "$file" && continue
  # Strip block comments and re-test, so a hex that lives only inside /* … */
  # isn't flagged (consistency with Checks 3 & 4, which strip comments too).
  content=$(hit_content "$hit"); content="${content%$'\r'}"
  printf '%s' "$content" | sed -E 's#/\*([^*]|\*+[^*/])*\*+/##g' | grep -Eq "$HEX_RE" || continue
  echo "  [raw-hex]    $hit"
  violations=$((violations + 1))
done < <(grep -rEn "$HEX_RE" "$WEB" --include='*.css' --include='*.scss' 2>/dev/null)

# ── Check 2 — raw colour functions rgb()/hsl()/oklch()/… (CSS/SCSS) ──────────
while IFS= read -r hit; do
  file=$(hit_file "$hit")
  is_exempt "$file" && continue
  content=$(hit_content "$hit"); content="${content%$'\r'}"
  printf '%s' "$content" | sed -E 's#/\*([^*]|\*+[^*/])*\*+/##g' | grep -Eiq "$COLOR_FN_RE" || continue
  echo "  [raw-color-fn] $hit"
  violations=$((violations + 1))
done < <(grep -rEin "$COLOR_FN_RE" "$WEB" --include='*.css' --include='*.scss' 2>/dev/null)

# ── Check 3 — named colours in colour-bearing property values (CSS/SCSS) ─────
while IFS= read -r hit; do
  file=$(hit_file "$hit")
  is_exempt "$file" && continue
  content=$(hit_content "$hit"); content="${content%$'\r'}"
  # Strip block comments, then take everything after the first ':' (the value).
  stripped=$(printf '%s' "$content" | sed -E 's#/\*([^*]|\*+[^*/])*\*+/##g')
  value=$(printf '%s' "$stripped" | sed -nE 's/^[^:]*:[[:space:]]*(.*)$/\1/p')
  [ -z "$value" ] && continue
  # Walk whitespace/paren/comma-separated tokens; flag a bare named colour
  # that isn't allowlisted. var(...) tokens and numbers pass.
  flagged=0
  for tok in $(printf '%s' "$value" | tr '(),/;{}' '       '); do
    low=$(printf '%s' "$tok" | tr 'A-Z' 'a-z')
    printf '%s' "$tok" | grep -Eq "$ALLOW_KW_RE" && continue
    if printf '%s' "$low" | grep -Eq "^($NAMED_COLORS)$"; then
      flagged=1; break
    fi
  done
  if [ "$flagged" -eq 1 ]; then
    echo "  [named-color] $hit"
    violations=$((violations + 1))
  fi
done < <(grep -rEin "$COLOR_PROP_RE" "$WEB" --include='*.css' --include='*.scss' 2>/dev/null)

# ── Check 4 — radius: shorthand + corner-specific + logical (CSS/SCSS) ───────
while IFS= read -r hit; do
  file=$(hit_file "$hit")
  is_exempt "$file" && continue
  content=$(hit_content "$hit"); content="${content%$'\r'}"
  stripped=$(printf '%s' "$content" | sed -E 's#/\*([^*]|\*+[^*/])*\*+/##g')
  # Check EACH *-radius declaration on the line independently. Splitting on ; and
  # } first means a token-based declaration can't mask a raw-literal one earlier
  # on the same physical line (e.g. minified `.a{border-radius:13px}.b{...:var()}`).
  bad=0
  while IFS= read -r decl; do
    printf '%s' "$decl" | grep -Eq 'border[a-z-]*radius[[:space:]]*:' || continue
    value=$(printf '%s' "$decl" | sed -nE 's/.*border[a-z-]*radius[[:space:]]*:[[:space:]]*(.*)$/\1/p')
    [ -z "$value" ] && continue
    # Collapse var(...) / calc(...) sub-expressions — both are token-based by
    # definition, so `calc(var(--radius) + 2px)` or `var(--radius, 4px)` must not
    # be flagged. Iterate to dissolve one level of nesting at a time. Known
    # limitation: a raw literal buried inside a calc()/var() fallback is not
    # caught — the conservative direction (no false positive on legitimate use).
    prev=""
    while [ "$value" != "$prev" ]; do
      prev="$value"
      value=$(printf '%s' "$value" | sed -E 's/(var|calc)\([^()]*\)//g')
    done
    for tok in $value; do
      if ! printf '%s' "$tok" | grep -Eq "$ALLOWED_RADIUS_RE"; then bad=1; break; fi
    done
    [ "$bad" -eq 1 ] && break
  done < <(printf '%s' "$stripped" | tr ';}' '\n\n')
  if [ "$bad" -eq 1 ]; then
    echo "  [radius]     $hit"
    violations=$((violations + 1))
  fi
done < <(grep -rEin 'border[a-z-]*radius[[:space:]]*:' "$WEB" --include='*.css' --include='*.scss' 2>/dev/null)

# ── Check 5 — TSX/JSX conservative inline-style / CSS-in-JS scan ─────────────
# Only on lines that reference styling, to limit false positives.
STYLE_LINE_RE='(style[[:space:]]*=|styled|css`|[Bb]orderRadius|[Bb]ackground|[Cc]olor|[Bb]oxShadow|[Tt]extShadow|[Bb]order|[Ff]ill|[Ss]troke)'
# Color literal on a styling line: hex or a colour function form.
TSX_COLOR_RE='(#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|'"$COLOR_FN_RE"')'
while IFS= read -r hit; do
  file=$(hit_file "$hit")
  is_exempt "$file" && continue
  echo "  [tsx-color]  $hit"
  violations=$((violations + 1))
done < <(grep -rEn "$STYLE_LINE_RE" "$WEB" --include='*.tsx' --include='*.jsx' 2>/dev/null | grep -E "$TSX_COLOR_RE")

# borderRadius numeric/px literal that isn't an allowed value (e.g. borderRadius: 13).
while IFS= read -r hit; do
  file=$(hit_file "$hit")
  is_exempt "$file" && continue
  content=$(hit_content "$hit"); content="${content%$'\r'}"
  # Pull the value after `borderRadius:` (JSX object) or `border-radius:` (template).
  value=$(printf '%s' "$content" | sed -nE 's/.*[Bb]order-?[Rr]adius[[:space:]]*:[[:space:]]*([^,;}]*).*/\1/p')
  [ -z "$value" ] && continue
  # Normalise quotes; pull the first token.
  radius=$(printf '%s' "$value" | tr -d "\"'" | awk '{print $1}')
  case "$radius" in
    var\(*|''|*'{'*|*'`'*) continue ;;   # token, empty, or interpolation → skip
  esac
  # Allowed bare/px/string radius values in JSX: 0, 2, 999 (px implied) or with px.
  if ! printf '%s' "$radius" | grep -Eq '^(0|2|999)(px)?$'; then
    echo "  [tsx-radius] $hit"
    violations=$((violations + 1))
  fi
done < <(grep -rEn '[Bb]order-?[Rr]adius[[:space:]]*:' "$WEB" --include='*.tsx' --include='*.jsx' 2>/dev/null)

# ── Verdict ──────────────────────────────────────────────────────────────────
if [ "$violations" -gt 0 ]; then
  echo ""
  echo "DESIGN-CONFORMANCE: FAIL — $violations off-token value(s). Replace raw colours"
  echo "with var(--color-*) / var(--bg-*) and use var(--radius) / var(--radius-pill)."
  echo "If a value genuinely has no token, add it to the design token sheet and"
  echo "reference it — do not inline 'close enough' values (application design rules)."
  emit FAIL "$files_scanned" "$violations"
fi

echo "DESIGN-CONFORMANCE: PASS — all colours/radii in $files_scanned scanned file(s) trace to design tokens."
emit PASS "$files_scanned" 0
