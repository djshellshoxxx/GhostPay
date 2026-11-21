import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const sdk = readFileSync(new URL('../../public/ghostpay-embed-v2.js', import.meta.url), 'utf8');
const CHECKOUT = 'https://pay.example/#gpi=v1.AAAA';

function clickCheckout(openResult: unknown): { opened: string[]; title: string | null } {
  const attrs = new Map<string, string>([['data-invoice', CHECKOUT]]);
  let click: ((event: { preventDefault(): void }) => void) | undefined;
  let opened: string[] = [];

  const button = {
    textContent: 'Pay with GhostPay',
    getAttribute: (name: string): string | null => attrs.get(name) ?? null,
    setAttribute: (name: string, value: string): void => { attrs.set(name, value); },
    addEventListener: (name: string, handler: (event: { preventDefault(): void }) => void): void => {
      if (name === 'click') click = handler;
    },
  };
  runInNewContext(sdk, {
    document: {
      currentScript: { src: 'https://pay.example/ghostpay-embed-v2.js' },
      readyState: 'complete',
      querySelectorAll: () => [button],
    },
    window: {
      open: (...args: string[]): unknown => {
        opened = args;
        return openResult;
      },
    },
    URL,
  });
  if (!click) throw new Error('GhostPay popup click handler was not registered');
  click({ preventDefault: () => undefined });
  return { opened, title: attrs.get('title') ?? null };
}

describe('embed v2 popup with noopener', () => {
  it('does not falsely report a successful no-opener navigation as blocked when window.open returns null', () => {
    const result = clickCheckout(null);
    expect(result.opened).toEqual([CHECKOUT, '_blank', 'popup,noopener,noreferrer']);
    expect(result.title).toBeNull();
  });

  it('preserves the same privacy flags and does not report a false warning for a window handle', () => {
    const result = clickCheckout({});
    expect(result.opened).toEqual([CHECKOUT, '_blank', 'popup,noopener,noreferrer']);
    expect(result.title).toBeNull();
  });
});
