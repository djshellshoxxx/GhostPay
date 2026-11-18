// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// SEC-42 / E-19: React's default root error reporting logs caught render errors with their message and component
// stack, which may carry input snippets. main.tsx passes handlers that log only a sanitized error class name.
const created: { options?: Record<string, unknown> | undefined } = {};
vi.mock('react-dom/client', () => ({
  createRoot: (_el: Element, options?: Record<string, unknown>) => {
    created.options = options;
    return { render: () => undefined, unmount: () => undefined };
  },
}));
vi.mock('./App', () => ({ App: () => null }));

describe('main.tsx root error handlers (SEC-42)', () => {
  let logged: unknown[][];
  beforeEach(() => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.replaceChildren(root);
    logged = [];
    for (const level of ['error', 'warn', 'log', 'info', 'debug'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { logged.push(args); });
    }
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('passes onCaughtError, onUncaughtError and onRecoverableError to createRoot', async () => {
    await import('./main');
    for (const name of ['onCaughtError', 'onUncaughtError', 'onRecoverableError']) {
      expect(typeof created.options?.[name], name).toBe('function');
    }
  });

  it('never logs the message, stack, component stack or any value of the error', async () => {
    await import('./main');
    const secret = 'seed 0x' + 'ab'.repeat(32) + ' passphrase hunter2';
    const err = new TypeError(`Cannot read ${secret}`);
    err.stack = `TypeError: ${secret}\n    at Secret (${secret})`;
    const info = { componentStack: `\n    in Input (value=${secret})`, errorBoundary: {} };
    for (const name of ['onCaughtError', 'onUncaughtError', 'onRecoverableError']) {
      (created.options?.[name] as (e: unknown, i: unknown) => void)(err, info);
    }
    (created.options?.['onCaughtError'] as (e: unknown, i: unknown) => void)({ toString: () => secret }, info);
    (created.options?.['onCaughtError'] as (e: unknown, i: unknown) => void)(secret, info);
    const forged = new Error('x');
    forged.name = `Evil ${secret}`;
    (created.options?.['onUncaughtError'] as (e: unknown, i: unknown) => void)(forged, info);
    expect(logged.length).toBeGreaterThan(0);
    const text = logged.map((args) => args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a) ?? String(a))).join(' ')).join('\n');
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('abab');
    expect(text).not.toContain('Secret');
    expect(text).toContain('TypeError');
    for (const args of logged) for (const a of args) expect(typeof a).toBe('string');
  });
});
