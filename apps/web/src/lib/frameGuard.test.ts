// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { CORE_ORDER } from '../AppShell';
import { FRAME_SAFE_VIEWS, currentOriginCheck, declaredOrigin, embedModeEnabled, frameRefusesView, isFramed, originMismatch } from './frameGuard';

afterEach(() => { document.body.replaceChildren(); });

// SEC-18 / D-13, E-11: GitHub Pages cannot send frame-ancestors; the page itself refuses key views when framed.
describe('frame guard', () => {
  it('detects a real framed browsing context (jsdom iframe) and the top-level one', () => {
    expect(isFramed(window)).toBe(false);
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const inner = frame.contentWindow;
    expect(inner).not.toBeNull();
    if (inner !== null) expect(isFramed(inner)).toBe(true);
  });

  it('fails closed when top cannot be read', () => {
    const hostile = { self: {}, get top(): unknown { throw new DOMException('blocked', 'SecurityError'); } };
    expect(isFramed(hostile)).toBe(true);
  });

  it('embed mode needs the full profile and the explicit build flag', () => {
    expect(embedModeEnabled({ VITE_EMBED_IFRAME: '1' }, 'full')).toBe(true);
    expect(embedModeEnabled({ VITE_EMBED_IFRAME: '1' }, 'lean')).toBe(false);
    expect(embedModeEnabled({}, 'full')).toBe(false);
    expect(embedModeEnabled({ VITE_EMBED_IFRAME: 'true' }, 'full')).toBe(false);
  });

  it('refuses every seller, key, sweep, scan, registry and settings view while framed outside embed mode', () => {
    expect([...FRAME_SAFE_VIEWS].sort()).toEqual(['about', 'home', 'pay']);
    for (const v of ['seller', 'create', 'scan', 'sweep', 'registry', 'settings', 'btc', 'solana', 'tron'] as const) {
      expect(frameRefusesView(v, true, false), v).toBe(true);
      expect(frameRefusesView(v, false, false), v).toBe(false);
      expect(frameRefusesView(v, true, true), v).toBe(false);
    }
    for (const v of FRAME_SAFE_VIEWS) expect(frameRefusesView(v, true, false)).toBe(false);
    expect(CORE_ORDER.filter((v) => !frameRefusesView(v, true, false))).toEqual(['home', 'pay', 'about']);
  });
});

// SEC-09 / E-03: the build knows the origin it was declared for; any other serving origin fails closed.
describe('declared-origin guard', () => {
  it('reads the declared origin from the build env', () => {
    expect(declaredOrigin({ VITE_GHOSTPAY_PAGES_ORIGIN: 'https://pay.example' })).toBe('https://pay.example');
    expect(declaredOrigin({})).toBeUndefined();
    expect(declaredOrigin({ VITE_GHOSTPAY_PAGES_ORIGIN: '' })).toBeUndefined();
    expect(declaredOrigin({ VITE_GHOSTPAY_PAGES_ORIGIN: 5 })).toBeUndefined();
  });
  it('flags any other serving origin, and a malformed declaration, as a mismatch', () => {
    expect(originMismatch(undefined, 'https://anything.example')).toBe(false);
    expect(originMismatch('https://pay.example', 'https://pay.example')).toBe(false);
    expect(originMismatch('http://localhost:4175', 'http://localhost:4175')).toBe(false);
    expect(originMismatch('https://pay.example', 'https://djshellshoxxx.github.io')).toBe(true);
    expect(originMismatch('https://pay.example', 'https://pay.example:8443')).toBe(true);
    expect(originMismatch('https://pay.example', 'http://pay.example')).toBe(true);
    expect(originMismatch('https://pay.example', 'null')).toBe(true);
    for (const bad of ['pay.example', 'https://pay.example/GhostPay/', 'https://user@pay.example', 'not a url']) {
      expect(originMismatch(bad, 'https://pay.example'), bad).toBe(true);
    }
  });
  it('compares against the page origin', () => {
    expect(currentOriginCheck({ VITE_GHOSTPAY_PAGES_ORIGIN: 'https://pay.example' })).toEqual({ declared: 'https://pay.example', actual: window.location.origin });
    expect(currentOriginCheck({})).toEqual({ declared: undefined, actual: window.location.origin });
  });
});
