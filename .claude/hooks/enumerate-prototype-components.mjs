#!/usr/bin/env node
// enumerate-prototype-components.mjs — render a page (prototype OR built app)
// over the Chrome DevTools Protocol and emit the set of design-system
// components present in the RENDERED DOM, in document order.
//
// This is the ground-truth coverage source for the per-component design-
// fidelity review: whole-screen eyeballing can no longer pass, because every
// component this enumerates on a screen MUST appear in the evidence manifest
// with its own diff + interaction-state captures (see shared/design-fidelity-
// web.md and verify-design-fidelity-manifest.mjs).
//
// Classification (one canonical type vocabulary, ds-component-vocabulary.mjs):
//   - build side   → the mandated `data-ds="<type>"` attribute.
//   - prototype side → MWS design-system root class tokens (`.btn`, `.stepper`…).
// The SAME hook runs against both URLs; prototype↔build matching is by
// (type, ordinal) — never by selector (the build's CSS-Module classes are
// hashed). The per-page `selector` each row carries is for re-targeting THAT
// page with render-states.mjs, not for cross-side matching.
//
// Interactive elements (button/link/input/[role]/[tabindex]) that classify to
// no known type are emitted as UNKNOWN-INTERACTIVE so an unrecognized class
// surfaces as a blocking signal rather than hiding.
//
// Usage:
//   node enumerate-prototype-components.mjs --url <url> [--width 1280] [--height 800]
//
// Output (stdout): one COMPONENTS summary line, then a TSV row per component,
// then a TSV row per unknown-interactive element:
//   COMPONENTS: <count>
//   COMPONENT\t<type>\t<ordinal>\t<selector>
//   UNKNOWN-INTERACTIVE\t<selector>
// Exit: 0 on success; 1 and "COMPONENTS: ERROR <reason>" on any failure (no
// browser, navigation failure, evaluate failure) — the review treats a
// non-zero exit as a blocking #render-failed, never a skip.

import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { findBrowser, freePort, sleep, getJson, cdpConnect } from './cdp.mjs';
import { DS_ATTR, DS_TYPE_BY_ROOT_CLASS, INTERACTIVE_SELECTOR } from './ds-component-vocabulary.mjs';

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
const WIDTH = Number(args.width || 1280);
const HEIGHT = Number(args.height || 800);
// Optional: click a nav element whose visible text matches --nav before enumerating.
// Single-file prototypes (e.g. Claude Design DCLogic) switch screens by click, not by URL;
// this drives the runtime to the target screen so non-home screens are reachable.
const NAV = typeof args.nav === 'string' ? args.nav : null;

function fail(reason) {
  process.stderr.write(`COMPONENTS: ERROR ${reason}\n`);
  process.exit(1);
}
if (!URL_) fail('usage: --url <url> [--width 1280] [--height 800]');

// The in-page enumeration. Serialized and run in the browser via
// Runtime.evaluate; receives the type map + interactive selector by injection.
function buildPageScript() {
  return `(() => {
    const TYPE_BY_CLASS = ${JSON.stringify(DS_TYPE_BY_ROOT_CLASS)};
    const DS_ATTR = ${JSON.stringify(DS_ATTR)};
    const INTERACTIVE = ${JSON.stringify(INTERACTIVE_SELECTOR)};

    function classify(el) {
      const tag = el.getAttribute(DS_ATTR);
      if (tag) return tag;
      for (const token of el.classList) {
        if (Object.prototype.hasOwnProperty.call(TYPE_BY_CLASS, token)) return TYPE_BY_CLASS[token];
      }
      return null;
    }

    // Unique CSS path for re-targeting this same page (nth-of-type at each level).
    function cssPath(el) {
      if (el.id) return '#' + CSS.escape(el.id);
      const parts = [];
      let node = el;
      while (node && node.nodeType === 1 && node !== document.documentElement) {
        let sel = node.tagName.toLowerCase();
        const parent = node.parentNode;
        if (parent && parent.children) {
          const sameTag = Array.prototype.filter.call(parent.children, (c) => c.tagName === node.tagName);
          if (sameTag.length > 1) sel += ':nth-of-type(' + (sameTag.indexOf(node) + 1) + ')';
        }
        parts.unshift(sel);
        node = node.parentNode;
      }
      return 'html > ' + parts.join(' > ');
    }

    const all = document.querySelectorAll('*');
    const ordinals = {};
    const components = [];
    const classified = new Set();
    for (const el of all) {
      const type = classify(el);
      if (!type) continue;
      classified.add(el);
      ordinals[type] = (ordinals[type] || 0) + 1;
      components.push({ type, ordinal: ordinals[type], selector: cssPath(el) });
    }

    // Interactive elements that classified to nothing AND sit inside no
    // classified component → genuinely unrecognized. Flag, don't hide.
    const unknown = [];
    for (const el of document.querySelectorAll(INTERACTIVE)) {
      if (classify(el)) continue;
      let inside = false;
      for (let p = el.parentElement; p; p = p.parentElement) {
        if (classified.has(p)) { inside = true; break; }
      }
      if (!inside) unknown.push(cssPath(el));
    }

    return { components, unknown };
  })()`;
}

// Click a nav element by visible text (exact match preferred, else substring). Dispatches a real
// click so a single-file runtime's document-level click delegate handles the screen switch.
function buildNavScript(navText) {
  return `(() => {
    const want = ${JSON.stringify(navText)}.trim().toLowerCase();
    const candidates = [...document.querySelectorAll('.mws-nav-item, a, button, [role="tab"], [role="menuitem"], [data-screen-nav]')];
    const norm = (e) => (e.textContent || '').trim().toLowerCase();
    const el = candidates.find((e) => norm(e) === want) || candidates.find((e) => norm(e).includes(want));
    if (!el) return { clicked: false, reason: 'no clickable element with text "' + want + '"' };
    el.click();
    return { clicked: true, tag: el.tagName.toLowerCase(), text: (el.textContent || '').trim().slice(0, 40) };
  })()`;
}

async function main() {
  const watchdog = setTimeout(() => fail('enumeration timed out (no response within 45s)'), 45000);
  if (typeof WebSocket === 'undefined') {
    fail('this hook needs Node 22+ (the built-in global WebSocket is used for the CDP transport) — upgrade Node.');
  }

  const browser = findBrowser();
  if (!browser) fail('no Chrome/Edge found — set CHROME_BIN to a Chromium-family browser.');

  const port = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'enum-components-'));
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

    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Page.enable', {}, sessionId);
    await send('Runtime.enable', {}, sessionId);
    await send('Emulation.setDeviceMetricsOverride',
      { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false }, sessionId);

    const loaded = waitEvent('Page.loadEventFired', sessionId, 20000).catch(() => null);
    await send('Page.navigate', { url: URL_ }, sessionId);
    await loaded;
    await sleep(600); // settle: fonts, async render

    // Optional click-navigation for single-file (URL-static) prototypes.
    if (NAV) {
      const navEval = await send('Runtime.evaluate',
        { expression: buildNavScript(NAV), returnByValue: true }, sessionId);
      if (navEval.exceptionDetails) fail(`nav evaluation failed: ${navEval.exceptionDetails.text || 'unknown'}`);
      const nav = navEval.result.value;
      if (!nav || !nav.clicked) fail(`nav click failed: ${(nav && nav.reason) || 'unknown'}`);
      await sleep(900); // settle the re-render after the screen switch
    }

    const evalResult = await send('Runtime.evaluate',
      { expression: buildPageScript(), returnByValue: true, awaitPromise: false }, sessionId);
    if (evalResult.exceptionDetails) {
      fail(`page evaluation failed: ${evalResult.exceptionDetails.text || 'unknown'}`);
    }
    const { components, unknown } = evalResult.result.value;

    clearTimeout(watchdog);
    const lines = [`COMPONENTS: ${components.length}`];
    for (const c of components) lines.push(`COMPONENT\t${c.type}\t${c.ordinal}\t${c.selector}`);
    for (const sel of unknown) lines.push(`UNKNOWN-INTERACTIVE\t${sel}`);
    process.stdout.write(lines.join('\n') + '\n');
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
