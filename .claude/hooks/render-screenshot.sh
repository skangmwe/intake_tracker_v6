#!/usr/bin/env bash
# render-screenshot.sh — capture a PNG of a URL (or a file:// prototype page)
# with a headless Chromium-family browser, for the design-fidelity render-and-
# compare review (shared/design-fidelity-web.md § The render mechanism).
#
# Why a hook and not ad-hoc browser flags: the recipe is finicky and the review
# must run it reliably every time. A fresh --user-data-dir per call is REQUIRED
# (the default profile is locked and the call fails without it); the new
# headless mode + a virtual-time budget let an SPA settle before the capture.
#
# Usage: bash render-screenshot.sh <url> <out.png> [width] [height]
#   url      http(s):// or file:// URL to render
#   out.png  path for the PNG (parent dirs are created)
#   width    viewport width  (default 1280)
#   height   viewport height (default 800)
#
# Browser: auto-detects Chrome or Edge across Windows/macOS/Linux. Override with
# CHROME_BIN=/path/to/chromium.
#
# Exit: 0 = a non-empty PNG was written (prints "RENDER: OK <path> (WxH)").
#       1 = no browser found, or the screenshot was not produced — the review
#           treats this as a BLOCKING failure (it cannot compare what it cannot
#           render), so the message goes to stderr with a clear reason.

set -uo pipefail

URL="${1:-}"
OUT="${2:-}"
WIDTH="${3:-1280}"
HEIGHT="${4:-800}"

if [ -z "$URL" ] || [ -z "$OUT" ]; then
  echo "RENDER: ERROR usage: render-screenshot.sh <url> <out.png> [width] [height]" >&2
  exit 1
fi

CHROME_BIN="${CHROME_BIN:-}"

# Locate a Chromium-family browser across platforms.
find_browser() {
  local candidate name browser_path
  for candidate in \
    "$CHROME_BIN" \
    "/c/Program Files/Google/Chrome/Application/chrome.exe" \
    "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" \
    "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
    "/c/Program Files/Microsoft/Edge/Application/msedge.exe" \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium" \
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"; do
    [ -n "$candidate" ] && [ -x "$candidate" ] && { printf '%s' "$candidate"; return 0; }
  done
  for name in google-chrome google-chrome-stable chromium chromium-browser microsoft-edge msedge; do
    browser_path="$(command -v "$name" 2>/dev/null)" && [ -n "$browser_path" ] && { printf '%s' "$browser_path"; return 0; }
  done
  return 1
}

BROWSER="$(find_browser)" || {
  echo "RENDER: ERROR no Chrome/Edge found — set CHROME_BIN to a Chromium-family browser." >&2
  exit 1
}

PROFILE="$(mktemp -d 2>/dev/null || echo "${TMPDIR:-/tmp}/render-$$")"
mkdir -p "$PROFILE" 2>/dev/null

# Resolve OUT to an ABSOLUTE path. The browser resolves a relative --screenshot
# path against its OWN working directory, not the shell's — on Windows that's an
# unwritable system dir, so a relative path fails with "Access is denied".
case "$OUT" in
  /* | ?:[\\/]*) ;;                 # already absolute (POSIX or drive-letter)
  *) OUT="$(pwd)/$OUT" ;;
esac
OUTDIR="$(dirname "$OUT")"
[ -n "$OUTDIR" ] && mkdir -p "$OUTDIR" 2>/dev/null

# On MSYS/Cygwin (Git Bash) the browser is a native Windows program and needs a
# Windows-form path/URL. `cygpath -m` yields a forward-slash drive path
# (C:/dir/file) that works for both --screenshot and file:// URLs. Elsewhere the
# POSIX paths pass through unchanged.
OUT_ARG="$OUT"
URL_ARG="$URL"
if command -v cygpath >/dev/null 2>&1; then
  OUT_ARG="$(cygpath -m "$OUT" 2>/dev/null || printf '%s' "$OUT")"
  case "$URL" in
    file://*) URL_ARG="file:///$(cygpath -m "${URL#file://}" 2>/dev/null || printf '%s' "${URL#file://}")" ;;
  esac
fi

# Fresh profile (default is locked), new headless, virtual-time budget so JS/SPA
# content settles before the capture.
#
# Watchdog: --virtual-time-budget bounds the PAGE clock, not the PROCESS. A
# locked profile, GPU-init hang, or network deadlock can wedge Chrome itself and
# stall the review's render→compare loop. Bound the whole browser call so the
# hook fails closed (a killed render writes no PNG → the `[ -s "$OUT" ]` check
# below turns it into RENDER: ERROR) instead of hanging. Pure bash, no `timeout`
# dependency — `timeout` is absent by default on macOS and ambiguous on Windows
# (System32\timeout.exe is a different command). Override with RENDER_TIMEOUT.
RENDER_TIMEOUT="${RENDER_TIMEOUT:-60}"
"$BROWSER" --headless=new --disable-gpu --no-sandbox --disable-dev-shm-usage --hide-scrollbars \
  --user-data-dir="$PROFILE" --window-size="${WIDTH},${HEIGHT}" \
  --virtual-time-budget=2500 --screenshot="$OUT_ARG" "$URL_ARG" >/dev/null 2>&1 &
browser_pid=$!
# Watchdog: poll once a second; stop the instant the browser exits on its own,
# or hard-kill it if it overruns RENDER_TIMEOUT. Its stdio is detached to
# /dev/null so it NEVER holds the caller's stdout/stderr pipe open — otherwise a
# successful render would block the caller until the watchdog's own sleep ended.
(
  waited=0
  while [ "$waited" -lt "$RENDER_TIMEOUT" ]; do
    sleep 1
    kill -0 "$browser_pid" 2>/dev/null || exit 0   # browser gone → stop watching
    waited=$((waited + 1))
  done
  kill -KILL "$browser_pid" 2>/dev/null              # overran the bound → kill it
) >/dev/null 2>&1 &
wait "$browser_pid" 2>/dev/null

rm -rf "$PROFILE" 2>/dev/null

if [ -s "$OUT" ]; then
  echo "RENDER: OK $OUT (${WIDTH}x${HEIGHT})"
  exit 0
fi
echo "RENDER: ERROR screenshot not produced for $URL (browser: $BROWSER)" >&2
exit 1
