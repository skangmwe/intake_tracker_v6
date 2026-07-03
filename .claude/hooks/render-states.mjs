#!/usr/bin/env node
// render-states.mjs — capture a screenshot of a URL with an interaction state
// (:hover / :focus-visible / :active) deterministically FORCED on a target
// element, AND read that element's layout-significant computed style, for the
// per-component design-fidelity render-and-compare review.
//
// Static screenshots only capture the default paint, so hover/focus/active drift
// slips through; and a screenshot alone misses geometry drift (a stepper that is
// flex:1 evenly-distributed vs. packed-left can look "close enough"). This hook
// drives a real headless browser over the Chrome DevTools Protocol: it uses
// CSS.forcePseudoState to force the state before capturing, and reads
// getComputedStyle for a curated property set so the validator can diff measured
// layout — not just pixels. With no --state (or --state default) it captures the
// default paint, so it also covers the plain case.
//
// No runtime dependency: it speaks CDP over Node's built-in global WebSocket
// (requires Node 22+) and the browser's /json HTTP endpoint, via ./cdp.mjs.
// Auto-detects Chrome/Edge across platforms (CHROME_BIN overrides).
//
// Usage (single capture):
//   node render-states.mjs --url <url> --out <png> [--selector <css>]
//        [--state hover|focus-visible|active|default] [--width 1280] [--height 800]
//
// Usage (batch — all states for one component in ONE browser session, the
// efficient path for the per-component review; one launch instead of one/state):
//   node render-states.mjs --url <url> --selector <css> \
//        --states hover,focus-visible,active --out-dir <dir> [--width] [--height]
//   → writes <dir>/<state>.png per state; prints a RENDER-STATE: OK line and a
//     "COMPUTED <state>: <json>" line per state.
//
//   --selector  element to force the state on (and to clip the shot to, and to
//               read the computed style of). Omit (single mode) for a full-page
//               default capture. Required in batch mode.
//   --state     interaction state to force (single mode; default = no forced state).
//   --states    comma-separated states to capture in one session (batch mode).
//
// Exit: 0 and "RENDER-STATE: OK <out> (<state>)" on success; when --selector is
//       given, also a "COMPUTED: <json>" line with the property set (default
//       state is the authoritative geometry read).
//       1 and "RENDER-STATE: ERROR <reason>" on any failure (no browser,
//       navigation failure, selector not found, capture failure) — the review
//       treats a non-zero exit as a blocking #render-failed, never a skip.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { findBrowser, freePort, sleep, getJson, cdpConnect } from './cdp.mjs';
import { COMPUTED_STYLE_PROPS } from './ds-component-vocabulary.mjs';

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag.startsWith('--')) parsed[flag.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return parsed;
}
const args = parseArgs(process.argv.slice(2));
const URL_ = args.url;
const OUT = args.out;
const OUT_DIR = typeof args['out-dir'] === 'string' ? args['out-dir'] : '';
const SELECTOR = typeof args.selector === 'string' ? args.selector : '';
const STATE = (typeof args.state === 'string' ? args.state : 'default').toLowerCase();
// Multi-state batch mode: capture several states for ONE selector in a SINGLE
// browser session (one launch instead of one per state). Requires --selector
// and --out-dir; each state is written to <out-dir>/<state>.png.
const STATES = typeof args.states === 'string'
  ? args.states.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  : null;
const WIDTH = Number(args.width || 1280);
const HEIGHT = Number(args.height || 800);

function fail(reason) {
  process.stderr.write(`RENDER-STATE: ERROR ${reason}\n`);
  process.exit(1);
}

// state → forced pseudo-classes (force both focus + focus-visible so :focus rules also apply).
const STATE_MAP = {
  default: [],
  hover: ['hover'],
  'focus-visible': ['focus', 'focus-visible'],
  focus: ['focus', 'focus-visible'],
  active: ['active'],
};

if (!URL_) fail('usage: --url <url> ( --out <png> [--state <s>] | --states <s,s,…> --out-dir <dir> ) [--selector <css>]');
if (STATES) {
  if (!SELECTOR || !OUT_DIR) fail('--states requires --selector and --out-dir (each state is written to <out-dir>/<state>.png)');
  for (const s of STATES) if (!(s in STATE_MAP)) fail(`unknown state "${s}" in --states (hover | focus-visible | active | default)`);
} else {
  if (!OUT) fail('usage: --url <url> --out <png> [--selector <css>] [--state hover|focus-visible|active|default]');
  if (!(STATE in STATE_MAP)) fail(`unknown --state "${STATE}" (hover | focus-visible | active | default)`);
}

// In-page read of the curated computed-style property set for a selector.
function computedStyleScript(selector) {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const cs = getComputedStyle(el);
    const props = ${JSON.stringify(COMPUTED_STYLE_PROPS)};
    const out = {};
    for (const p of props) out[p] = cs.getPropertyValue(p).trim();
    return out;
  })()`;
}

async function main() {
  // Watchdog — a hung CDP command must never hang the caller (the review). Fail
  // closed after a bound so the review gets a #render-failed, not a stuck run.
  const watchdog = setTimeout(() => fail('render timed out (no response within 45s)'), 45000);

  // The CDP transport uses the global WebSocket, stable since Node 22.4.0. Fail
  // with a clear message on older Node rather than a cryptic ReferenceError.
  if (typeof WebSocket === 'undefined') {
    fail('this hook needs Node 22+ (the built-in global WebSocket is used for the CDP transport) — upgrade Node.');
  }

  const browser = findBrowser();
  if (!browser) fail('no Chrome/Edge found — set CHROME_BIN to a Chromium-family browser.');

  const port = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'render-states-'));
  const proc = spawn(
    browser,
    [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars',
      '--allow-file-access-from-files',
      `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`,
      '--remote-allow-origins=*', 'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let conn;
  try {
    const version = await getJson(`http://127.0.0.1:${port}/json/version`);
    conn = await cdpConnect(version.webSocketDebuggerUrl);
    const { send, waitEvent } = conn;

    // New page target via the browser session, attach flat.
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });

    await send('Page.enable', {}, sessionId);
    await send('DOM.enable', {}, sessionId);
    await send('CSS.enable', {}, sessionId);
    await send('Runtime.enable', {}, sessionId);
    await send('Emulation.setDeviceMetricsOverride',
      { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false }, sessionId);

    const loaded = waitEvent('Page.loadEventFired', sessionId, 20000).catch(() => null);
    await send('Page.navigate', { url: URL_ }, sessionId);
    await loaded;
    await sleep(600); // settle: fonts, async render

    // Capture one forced state of the selected element: (re)force the pseudo set
    // (passing [] clears a prior state, so iterating states in one session is
    // clean) → clip from the padded border box → screenshot → computed read.
    // Returns the computed-style object (or null). Resolve the node ONCE per
    // session and reuse it across states.
    const captureOne = async (nodeId, state, outPath) => {
      await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: STATE_MAP[state] }, sessionId);
      await sleep(120); // let the forced-state transition settle
      // Padded by a margin so a focus ring / box-shadow rendered OUTSIDE the
      // border box (outline-offset, etc.) is captured. Clamp to the viewport.
      const { model } = await send('DOM.getBoxModel', { nodeId }, sessionId);
      const border = model.border; // [x1,y1,x2,y2,x3,y3,x4,y4]
      const xs = [border[0], border[2], border[4], border[6]];
      const ys = [border[1], border[3], border[5], border[7]];
      const boxX = Math.min(...xs), boxY = Math.min(...ys);
      const boxWidth = Math.max(...xs) - boxX, boxHeight = Math.max(...ys) - boxY;
      const MARGIN = 16;
      const clipX = Math.max(0, boxX - MARGIN), clipY = Math.max(0, boxY - MARGIN);
      const clip = {
        x: clipX, y: clipY,
        width: Math.min(boxWidth + 2 * MARGIN, WIDTH - clipX),
        height: Math.min(boxHeight + 2 * MARGIN, HEIGHT - clipY),
        scale: 1,
      };
      const shot = await send('Page.captureScreenshot', { format: 'png', clip }, sessionId);
      fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
      if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) fail(`screenshot not written: ${outPath}`);
      const styleEval = await send('Runtime.evaluate',
        { expression: computedStyleScript(SELECTOR), returnByValue: true }, sessionId);
      return (!styleEval.exceptionDetails && styleEval.result && styleEval.result.value) ? styleEval.result.value : null;
    };

    const resolveNode = async () => {
      const { root } = await send('DOM.getDocument', { depth: 0 }, sessionId);
      const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: SELECTOR }, sessionId);
      if (!nodeId) fail(`selector not found: ${SELECTOR}`);
      return nodeId;
    };

    if (STATES) {
      // Batch: one session, one browser launch, every state for the selector.
      const outDirAbs = path.isAbsolute(OUT_DIR) ? OUT_DIR : path.resolve(process.cwd(), OUT_DIR);
      fs.mkdirSync(outDirAbs, { recursive: true });
      const nodeId = await resolveNode();
      clearTimeout(watchdog);
      for (const state of STATES) {
        const outPath = path.join(outDirAbs, `${state}.png`);
        const computed = await captureOne(nodeId, state, outPath);
        process.stdout.write(`RENDER-STATE: OK ${outPath} (${state} @ ${SELECTOR})\n`);
        if (computed) process.stdout.write(`COMPUTED ${state}: ${JSON.stringify(computed)}\n`);
      }
    } else {
      // Single capture (selector optional; no selector → full-page default shot).
      const outAbs = path.isAbsolute(OUT) ? OUT : path.resolve(process.cwd(), OUT);
      fs.mkdirSync(path.dirname(outAbs), { recursive: true });
      let computed = null;
      if (SELECTOR) {
        computed = await captureOne(await resolveNode(), STATE, outAbs);
      } else {
        const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sessionId);
        fs.writeFileSync(outAbs, Buffer.from(shot.data, 'base64'));
        if (!fs.existsSync(outAbs) || fs.statSync(outAbs).size === 0) fail('screenshot not written');
      }
      clearTimeout(watchdog);
      process.stdout.write(`RENDER-STATE: OK ${outAbs} (${STATE}${SELECTOR ? ` @ ${SELECTOR}` : ''})\n`);
      if (computed) process.stdout.write(`COMPUTED: ${JSON.stringify(computed)}\n`);
    }
  } catch (err) {
    fail(String(err && err.message ? err.message : err));
  } finally {
    try { conn && conn.ws.close(); } catch { /* ignore */ }
    try { proc.kill(); } catch { /* ignore */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  process.exit(0);
}

main().catch((err) => fail(String(err && err.message ? err.message : err)));
