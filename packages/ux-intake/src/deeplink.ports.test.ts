import { describe, expect, it } from 'vitest';
import { parseDeepLink, type LinkPolicy } from './deeplink.js';

const HOST = 'merchant.example';
const policy: LinkPolicy = { allowedHosts: [HOST] };

describe('parseDeepLink explicit HTTPS ports', () => {
  it('rejects an explicit default HTTPS port even when URL parsing normalizes it away', () => {
    for (const port of [':443', ':0443', ':000443']) {
      expect(parseDeepLink(`https://${HOST}${port}/pay`, policy)).toEqual({
        ok: false,
        code: 'port-not-allowed',
      });
    }
  });

  it('rejects an explicit empty port separator rather than treating it as an unported URL', () => {
    expect(parseDeepLink(`https://${HOST}:/pay`, policy)).toEqual({
      ok: false,
      code: 'port-not-allowed',
    });
  });

  it('rejects explicit default ports through WHATWG slash and backslash normalization', () => {
    for (const raw of [
      'https:merchant.example:443/pay',
      'https:/merchant.example:443/pay',
      'https:////merchant.example:443/pay',
      'https:\\merchant.example:443/pay',
    ]) {
      expect(parseDeepLink(raw, policy)).toEqual({ ok: false, code: 'port-not-allowed' });
    }
  });
  it('preserves accepted unported navigation and existing nondefault-port rejection', () => {
    expect(parseDeepLink(`https://${HOST}/pay`, policy)).toEqual({
      ok: true,
      value: { kind: 'navigate', path: '/pay', safeDisplay: `https://${HOST}/pay` },
    });
    expect(parseDeepLink(`https://${HOST}:444/pay`, policy)).toEqual({
      ok: false,
      code: 'port-not-allowed',
    });
  });

  it('preserves credential rejection before any raw authority port check', () => {
    expect(parseDeepLink(`https://alice:443@${HOST}/pay`, policy)).toEqual({
      ok: false,
      code: 'credentials-not-allowed',
    });
  });
});
