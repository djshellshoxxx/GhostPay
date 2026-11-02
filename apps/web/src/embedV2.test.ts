import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM, requestInterceptor } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { parseEmbedMessage } from './lib/embedProtocol';

const SRC = readFileSync(fileURLToPath(new URL('../public/ghostpay-embed-v2.js', import.meta.url)), 'utf8');
const APP = 'https://app.test';
const GOOD = `${APP}/#gpi=v1.abc_DEF-123`;
const TX = `0x${'e'.repeat(64)}`;

const loader = {
  interceptors: [
    requestInterceptor((request) => {
      if (request.url === `${APP}/ghostpay-embed-v2.js`) return new Response(SRC, { headers: { 'Content-Type': 'application/javascript' } });
      if (request.url.startsWith(`${APP}/`)) return new Response('<!doctype html><title>x</title>', { headers: { 'Content-Type': 'text/html' } });
      return undefined;
    }),
  ],
};

interface Harness {
  dom: JSDOM;
  opened: { url: string; features: string }[];
  timers: (() => void)[];
  btn: HTMLElement;
  frame: () => HTMLIFrameElement | null;
  posted: { data: unknown; origin: string }[];
  send: (data: unknown, o?: { origin?: string; source?: unknown }) => void;
  events: CustomEvent[];
}

// Structured cloning gives the receiver objects of its own realm; mimic that for the jsdom window.
function realm(dom: JSDOM, v: unknown): unknown {
  if (v === undefined) return undefined;
  return (dom.window as unknown as { JSON: JSON }).JSON.parse(JSON.stringify(v));
}

async function page(attrs: string): Promise<Harness> {
  const dom = new JSDOM(`<!doctype html><body><div><button id="b" data-ghostpay ${attrs}></button></div><script src="${APP}/ghostpay-embed-v2.js"></script></body>`, {
    url: 'https://merchant.test/',
    runScripts: 'dangerously',
    resources: loader,
  });
  const w = dom.window as unknown as { open: unknown; setTimeout: unknown };
  const opened: Harness['opened'] = [];
  const timers: (() => void)[] = [];
  w.open = (url: string, _t: string, features: string): null => {
    opened.push({ url, features });
    return null;
  };
  w.setTimeout = (fn: () => void): number => timers.push(fn);
  await new Promise<void>((resolve) => {
    dom.window.addEventListener('load', () => {
      resolve();
    });
  });
  const doc = dom.window.document;
  const btn = doc.getElementById('b')!;
  const frame = (): HTMLIFrameElement | null => doc.querySelector('iframe');
  const posted: Harness['posted'] = [];
  const events: CustomEvent[] = [];
  btn.addEventListener('ghostpay:done', (e) => events.push(e as CustomEvent));
  const send: Harness['send'] = (data, o = {}) => {
    const f = frame();
    const source = 'source' in o ? o.source : f?.contentWindow;
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: realm(dom, data), origin: o.origin ?? APP, source: source as never }));
  };
  return { dom, opened, timers, btn, frame, posted, send, events };
}

async function framed(extra = ''): Promise<{ h: Harness; nonce: string }> {
  const h = await page(`data-invoice="${GOOD}" data-mode="iframe" ${extra}`);
  h.btn.click();
  const f = h.frame()!;
  expect(f).not.toBeNull();
  // Capture the hello the SDK posts to the iframe window.
  const w = f.contentWindow as unknown as { postMessage: (d: unknown, o: string) => void };
  w.postMessage = (data, origin) => h.posted.push({ data, origin });
  f.dispatchEvent(new h.dom.window.Event('load'));
  expect(h.posted).toHaveLength(1);
  const hello = h.posted[0]!;
  expect(hello.origin).toBe(APP);
  const nonce = (hello.data as { n: string }).n;
  expect(nonce).toMatch(/^[0-9a-f]{32}$/);
  return { h, nonce };
}
const done = (n: string, data: unknown = { status: 'submitted', chainId: 8453, txHash: TX }): unknown => ({ t: 'gp:done', n, v: 1, data });

describe('ghostpay-embed-v2.js popup mode (default)', () => {
  it('opens a noopener popup and never an iframe', async () => {
    const h = await page(`data-invoice="${GOOD}"`);
    h.btn.click();
    expect(h.opened).toEqual([{ url: GOOD, features: 'popup,noopener,noreferrer' }]);
    expect(h.frame()).toBeNull();
  });

  it('passes a bounded profile and template as query parameters only', async () => {
    const h = await page(`data-invoice="${GOOD}" data-profile="abc_-123" data-template="t1"`);
    h.btn.click();
    expect(h.opened[0]!.url).toBe(`${APP}/?gpm=abc_-123&gpt=t1#gpi=v1.abc_DEF-123`);
  });

  it.each([
    ['another origin', 'data-invoice="https://evil.test/#gpi=v1.abc"'],
    ['javascript url', 'data-invoice="javascript:alert(1)"'],
    ['no invoice', ''],
    ['unknown mode', `data-invoice="${GOOD}" data-mode="top"`],
    ['markup in profile', `data-invoice="${GOOD}" data-profile="&lt;img&gt;"`],
    ['oversize profile', `data-invoice="${GOOD}" data-profile="${'a'.repeat(11001)}"`],
    ['bad template', `data-invoice="${GOOD}" data-template="A B"`],
    ['credentials', 'data-invoice="https://u:p@app.test/#gpi=v1.abc"'],
  ])('disables the button for %s', async (_n, attrs) => {
    const h = await page(attrs);
    expect(h.btn.hasAttribute('disabled')).toBe(true);
    h.btn.click();
    expect(h.opened).toEqual([]);
    expect(h.frame()).toBeNull();
  });
});

describe('ghostpay-embed-v2.js iframe mode', () => {
  it('opens a sandboxed no-referrer iframe on the checkout origin and posts hello to that exact origin', async () => {
    const { h } = await framed();
    const f = h.frame()!;
    expect(f.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-popups');
    expect(f.getAttribute('sandbox')).not.toMatch(/top-navigation|downloads|forms/);
    expect(f.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(f.getAttribute('src')).toBe(GOOD);
    expect(f.getAttribute('title')).toBeTruthy();
    expect(h.opened).toEqual([]);
    // The hello matches the host-side schema.
    expect(parseEmbedMessage(JSON.parse(JSON.stringify(h.posted[0]!.data)))?.t).toBe('gp:hello');
  });

  it('delivers a valid completion once, as text and a CustomEvent with only the documented fields', async () => {
    const { h, nonce } = await framed();
    h.send({ t: 'gp:init', n: nonce, v: 1, data: {} });
    h.send(done(nonce));
    expect(h.events).toHaveLength(1);
    expect(h.events[0]!.detail).toEqual({ status: 'submitted', chainId: 8453, txHash: TX });
    expect(h.dom.window.document.querySelector('[data-ghostpay-status]')!.textContent).toBe(`Payment submitted. Transaction ${TX}`);
    // Replayed nonce is ignored.
    h.send(done(nonce));
    expect(h.events).toHaveLength(1);
  });

  it('ignores messages from the wrong origin, wrong source, wrong nonce, and bad schemas', async () => {
    const { h, nonce } = await framed();
    h.send(done(nonce), { origin: 'https://evil.test' });
    h.send(done(nonce), { origin: 'null' });
    h.send(done(nonce), { source: h.dom.window });
    h.send(done(nonce), { source: null });
    h.send(done('0'.repeat(32)));
    h.send(done(nonce, { status: 'submitted', chainId: 8453, txHash: TX, secret: 'k' }));
    h.send(done(nonce, { status: 'submitted', chainId: 8453 }));
    h.send(done(nonce, { status: 'submitted', chainId: 8453, txHash: '0x1' }));
    h.send({ ...(done(nonce) as object), extra: 1 });
    h.send({ t: 'gp:done', n: nonce, v: 1, data: { status: 'submitted', chainId: 8453, txHash: TX, pad: 'x'.repeat(3000) } });
    h.send('gp:done');
    h.send(null);
    expect(h.events).toHaveLength(0);
    h.send(done(nonce)); // a legitimate one still works afterwards
    expect(h.events).toHaveLength(1);
  });

  it('never renders message content as markup', async () => {
    const { h, nonce } = await framed();
    h.send({ t: 'gp:status', n: nonce, v: 1, data: { phase: '<img src=x onerror=alert(1)>' } });
    h.send(done(nonce, { status: 'failed', chainId: 1 }));
    expect(h.dom.window.document.querySelector('img')).toBeNull();
    expect(h.dom.window.document.querySelector('[data-ghostpay-status]')!.textContent).toBe('Payment failed.');
  });

  it('falls back to the popup when the checkout never answers the handshake', async () => {
    const { h } = await framed();
    expect(h.timers).toHaveLength(1);
    h.timers[0]!();
    expect(h.frame()).toBeNull();
    expect(h.opened).toEqual([{ url: GOOD, features: 'popup,noopener,noreferrer' }]);
    expect(h.btn.getAttribute('title')).toMatch(/Popup blocked/);
  });

  it('does not fall back once the checkout answered, and stops listening after close', async () => {
    const { h, nonce } = await framed();
    h.send({ t: 'gp:init', n: nonce, v: 1, data: {} });
    h.dom.window.document.querySelector('button + iframe')!.previousElementSibling!.dispatchEvent(new h.dom.window.Event('click'));
    expect(h.frame()).toBeNull();
    expect(h.opened).toEqual([]);
    h.send(done(nonce));
    expect(h.events).toHaveLength(0);
  });
});

describe('ghostpay-embed-v2.js hygiene', () => {
  it('has no network APIs, HTML injection, dynamic code, wildcard postMessage targets or globals', () => {
    const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|eval|importScripts)\b|innerHTML|outerHTML|insertAdjacentHTML|document\.write|new Function/);
    expect(code).not.toMatch(/postMessage\([^)]*['"]\*['"]/);
    expect(code).not.toMatch(/localStorage|sessionStorage|document\.cookie|location\.href/);
  });

  it('fuzz: random attribute values never throw, and only valid links enable the button', async () => {
    let s = 4242;
    const rnd = (): number => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const alphabet = 'ab#:/.?&=%<>"\' \u0000‮javascript:httpsXY-_0';
    const rand = (): string => Array.from({ length: Math.floor(rnd() * 40) }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join('');
    for (let i = 0; i < 30; i++) {
      const inv = rnd() < 0.5 ? `${APP}/#gpi=v1.${rand()}` : rand();
      const attrs = `data-invoice="${inv.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}" data-template="${rand().replace(/["&<]/g, '')}" data-mode="${rnd() < 0.5 ? 'iframe' : rand().replace(/["&<]/g, '')}"`;
      const h = await page(attrs);
      h.btn.click();
      if (!h.btn.hasAttribute('disabled')) expect(h.opened.length + (h.frame() === null ? 0 : 1)).toBe(1);
      h.dom.window.close();
    }
  });
});
