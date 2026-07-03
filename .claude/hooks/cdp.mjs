// cdp.mjs — minimal Chrome DevTools Protocol primitives shared by the
// design-fidelity render hooks (render-states.mjs, enumerate-prototype-
// components.mjs). No runtime dependency: speaks CDP over Node's built-in
// global WebSocket (requires Node 22+) and the browser's /json HTTP endpoint.
//
// Scope is deliberately the LOW-LEVEL client only (browser discovery, a free
// port, a tiny request/event CDP client). Each hook keeps its own higher-level
// flow (target creation, navigation, screenshot vs. enumerate) because those
// differ — only the plumbing below is identical.

import fs from 'node:fs';
import net from 'node:net';

// Locate a Chromium-family browser across platforms (CHROME_BIN overrides).
export function findBrowser() {
  const candidates = [
    process.env.CHROME_BIN,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const assignedPort = srv.address().port;
      srv.close(() => resolve(assignedPort));
    });
  });
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Poll up to ~15s (150 × 100ms). Generous because a contended CI box launching
// several headless browsers in parallel can be slow to bring the endpoint up;
// each hook's own watchdog still bounds total runtime.
export async function getJson(url, tries = 150) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {
      /* not up yet */
    }
    await sleep(100);
  }
  throw new Error('devtools endpoint did not come up');
}

// Minimal CDP client over the flat session protocol. Resolves to
// { ws, send(method, params, sessionId), waitEvent(method, sessionId, timeoutMs) }.
export function cdpConnect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const eventWaiters = [];
    ws.addEventListener('open', () => {
      const send = (method, params = {}, sessionId) =>
        new Promise((res, rej) => {
          const msgId = ++id;
          pending.set(msgId, { res, rej });
          ws.send(JSON.stringify({ id: msgId, method, params, ...(sessionId ? { sessionId } : {}) }));
        });
      const waitEvent = (method, sessionId, timeoutMs = 15000) =>
        new Promise((res, rej) => {
          const timer = setTimeout(() => {
            const idx = eventWaiters.indexOf(waiter);
            if (idx >= 0) eventWaiters.splice(idx, 1);
            rej(new Error(`timed out waiting for ${method}`));
          }, timeoutMs);
          const waiter = { method, sessionId, res: (value) => { clearTimeout(timer); res(value); } };
          eventWaiters.push(waiter);
        });
      resolve({ ws, send, waitEvent });
    });
    ws.addEventListener('error', () => reject(new Error('CDP websocket error')));
    ws.addEventListener('message', (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message || 'CDP error'));
        else res(msg.result);
      } else if (msg.method) {
        for (let i = eventWaiters.length - 1; i >= 0; i--) {
          const waiter = eventWaiters[i];
          if (waiter.method === msg.method && (!waiter.sessionId || waiter.sessionId === msg.sessionId)) {
            eventWaiters.splice(i, 1);
            waiter.res(msg.params);
          }
        }
      }
    });
  });
}
