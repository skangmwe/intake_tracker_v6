// jsdom polyfills and Jest setup. Add polyfills here rather than inline in
// individual test files (web-testing.md). Runs via setupFilesAfterEnv so the
// matcher-extending imports below see an initialised `expect`.

import { TextEncoder, TextDecoder } from 'node:util';

import '@testing-library/jest-dom';
import 'jest-axe/extend-expect';

// jsdom does not provide TextEncoder/TextDecoder; react-router v7 reads them at
// module load. Polyfill from Node's util before any router import runs.
if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;
}
if (typeof globalThis.TextDecoder === 'undefined') {
  globalThis.TextDecoder = TextDecoder as unknown as typeof globalThis.TextDecoder;
}

// jsdom does not expose PromiseRejectionEvent; the deploy-recovery backstop reads
// `event instanceof PromiseRejectionEvent` (a real global in every target browser).
if (typeof globalThis.PromiseRejectionEvent === 'undefined') {
  class PromiseRejectionEventPolyfill extends Event {
    readonly promise: Promise<unknown>;
    readonly reason: unknown;
    constructor(type: string, init: { promise: Promise<unknown>; reason?: unknown }) {
      super(type);
      this.promise = init.promise;
      this.reason = init.reason;
    }
  }
  (globalThis as { PromiseRejectionEvent: typeof PromiseRejectionEvent }).PromiseRejectionEvent =
    PromiseRejectionEventPolyfill as unknown as typeof PromiseRejectionEvent;
}

// jsdom has no layout engine, so HTMLElement.offsetParent always returns null.
// The focus trap uses `offsetParent !== null` as a visibility filter; emulate
// browser semantics (non-null for a connected, displayed element) so the trap
// and any Escape/Tab behaviour that depends on it are exercisable under jsdom.
Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
  configurable: true,
  get(this: HTMLElement): Element | null {
    if (!this.isConnected) return null;
    if (this.style?.display === 'none') return null;
    return this.parentElement;
  },
});

// jsdom does not implement matchMedia; the theme hook and reduced-motion checks read it.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// Polyfill fetch when jsdom doesn't provide it — tests that exercise fetch mock it per test.
if (typeof globalThis.fetch === 'undefined') {
  globalThis.fetch = (() =>
    Promise.reject(new Error('fetch not mocked in this test'))) as unknown as typeof fetch;
}

// jsdom's Blob/File lack async text(); the CSV import wizard reads a chosen file via file.text().
if (typeof Blob !== 'undefined' && typeof Blob.prototype.text !== 'function') {
  Blob.prototype.text = function text(): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'));
      reader.readAsText(this);
    });
  };
}

// jsdom's crypto lacks randomUUID; client-side id generation (web-component-architecture.md) uses it.
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = {} as Crypto;
}
if (typeof globalThis.crypto.randomUUID !== 'function') {
  let counter = 0;
  (
    globalThis.crypto as { randomUUID: () => `${string}-${string}-${string}-${string}-${string}` }
  ).randomUUID = () => {
    counter += 1;
    const suffix = counter.toString(16).padStart(12, '0');
    return `00000000-0000-4000-8000-${suffix}` as `${string}-${string}-${string}-${string}-${string}`;
  };
}
