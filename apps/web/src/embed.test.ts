import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM, requestInterceptor } from 'jsdom';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(fileURLToPath(new URL('../public/ghostpay-embed-v1.js', import.meta.url)), 'utf8');
const APP = 'https://app.test';
const GOOD = `${APP}/#gpi=v1.abc_DEF-123`;

const loader = {
  interceptors: [
    requestInterceptor((request) =>
      request.url === `${APP}/ghostpay-embed-v1.js` ? new Response(SRC, { headers: { 'Content-Type': 'application/javascript' } }) : undefined,
    ),
  ],
};

async function page(buttons: string): Promise<{ dom: JSDOM; opened: { url: string; target: string; features: string }[] }> {
  const dom = new JSDOM(`<!doctype html><body>${buttons}<script src="${APP}/ghostpay-embed-v1.js"></script></body>`, {
    url: 'https://merchant.test/',
    runScripts: 'dangerously',
    resources: loader,
  });
  const opened: { url: string; target: string; features: string }[] = [];
  (dom.window as unknown as { open: unknown }).open = (url: string, target: string, features: string): null => {
    opened.push({ url, target, features });
    return null;
  };
  await new Promise<void>((resolve) => {
    dom.window.addEventListener('load', () => {
      resolve();
    });
  });
  return { dom, opened };
}

describe('ghostpay-embed-v1.js (popup mode only)', () => {
  it('opens the checkout in a noopener popup for a same-origin v1 invoice link', async () => {
    const { dom, opened } = await page(`<button id="b" data-ghostpay data-invoice="${GOOD}"></button>`);
    const b = dom.window.document.getElementById('b')!;
    expect(b.textContent).toBe('Pay with GhostPay');
    expect(b.hasAttribute('disabled')).toBe(false);
    b.click();
    expect(opened).toEqual([{ url: GOOD, target: '_blank', features: 'popup,noopener,noreferrer' }]);
  });

  it.each([
    ['another origin', 'https://evil.test/#gpi=v1.abc'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['no invoice fragment', `${APP}/`],
    ['an empty invoice fragment', `${APP}/#gpi=v1.`],
    ['a wrong fragment version', `${APP}/#gpi=v2.abc`],
    ['embedded credentials', 'https://user:pw@app.test/#gpi=v1.abc'],
    ['plain http', 'http://app.test/#gpi=v1.abc'],
    ['an oversized link', `${APP}/#gpi=v1.${'a'.repeat(23_000)}`],
    ['garbage', 'not a url'],
  ])('disables the button for %s', async (_n, link) => {
    const { dom, opened } = await page(`<button id="b" data-ghostpay data-invoice="${link.replace(/"/g, '&quot;')}">Pay</button>`);
    const b = dom.window.document.getElementById('b')!;
    expect(b.hasAttribute('disabled')).toBe(true);
    expect(b.getAttribute('title')).toBe('Invalid GhostPay invoice link');
    b.click();
    expect(opened).toEqual([]);
  });

  it('disables a button with no invoice attribute and never renders attribute text as markup', async () => {
    const { dom } = await page(`<button id="a" data-ghostpay></button><button id="b" data-ghostpay data-invoice="${GOOD}">&lt;img src=x onerror=alert(1)&gt;</button>`);
    expect(dom.window.document.getElementById('a')!.hasAttribute('disabled')).toBe(true);
    expect(dom.window.document.querySelector('img')).toBeNull();
  });

  it('is dependency free: no network APIs, no HTML injection, no dynamic code, no globals', () => {
    const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|eval|importScripts|postMessage)\b|innerHTML|outerHTML|insertAdjacentHTML|document\.write|new Function/);
    expect(SRC.length).toBeLessThan(4000);
  });
});
