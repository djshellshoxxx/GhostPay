// Seeded fuzz of parseInvoiceLink's host, port and path handling (#732 added the browser-valid-host check). The oracle is
// the WHATWG URL parser of the runtime: whatever the parser ACCEPTS must be a link a browser loads from the very host,
// origin, path and fragment the parser reports; it may be stricter than a browser, never looser. A fixed-seed local
// PRNG builds the same hostile hosts every run. Synthetic names only (example/test labels), no network.
//
// Invariants: only PaymentUriError is thrown (message fixed, never the input); an accepted link round-trips through
// `new URL` with an identical hostname, origin, path, fragment and no userinfo or query; no IPv4 spelling is accepted
// (except dev 127.0.0.1); ordinary valid DNS names are never refused (no false rejections); same seed, same verdicts.
import { describe, expect, it } from 'vitest';
import { PaymentUriError } from './errors.js';
import { buildInvoiceLink, parseInvoiceLink, type InvoiceLink, type InvoiceLinkOptions } from './invoice-link.js';

function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rand = () => number;
const int = (r: Rand, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T>(r: Rand, xs: readonly T[]): T => xs[int(r, 0, xs.length - 1)] as T;
const str = (r: Rand, alphabet: string, lo: number, hi: number): string =>
  Array.from({ length: int(r, lo, hi) }, () => alphabet[int(r, 0, alphabet.length - 1)]).join('');

const LDH = 'abcdefghijklmnopqrstuvwxyz0123456789-';
const ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789';
const PUNY = 'abcdefghijklmnopqrstuvwxyz0123456789-';
const HOSTILE = ['_', ' ', '@', '\\', '%', '\t', '\n', 'é', '中', '\u0000', '[', ']', ':', '#', '?', '​', '．', '.'];

function label(r: Rand): string {
  switch (int(r, 0, 7)) {
    case 0: return `xn--${str(r, PUNY, 1, 12)}`; // arbitrary punycode: valid or not
    case 1: return `xn--bcher-kva`; // valid
    case 2: return str(r, ALNUM, 60, 66); // around the 63-character limit
    case 3: return str(r, ALNUM, 1, 3) + pick(r, HOSTILE) + str(r, ALNUM, 0, 3); // hostile character inside
    case 4: return String(int(r, 0, 999_999_999_999)); // decimal
    case 5: return `0x${str(r, '0123456789abcdefABCDEFg', 0, 9)}`; // hex-ish
    case 6: return pick(r, ['localhost', 'LOCALHOST', 'example', 'EXAMPLE', 'test']);
    default: return str(r, ALNUM, 1, 10);
  }
}
const hostOf = (r: Rand): string => Array.from({ length: int(r, 1, 4) }, () => label(r)).join(pick(r, ['.', '.', '.', '..', '-']));

function pathOf(r: Rand): string {
  const segment = (): string => pick(r, ['pay', 'a-b', '.', '..', '%2e', '%2E%2e', 'x.y', '', '~u', 'a%2fb', 'A_b', ' ', 'é']);
  return Array.from({ length: int(r, 0, 3) }, () => `/${segment()}`).join('') + pick(r, ['', '', '/']);
}
const portOf = (r: Rand): string => pick(r, ['', '', '', ':443', ':80', ':8443', ':65535', ':65536', ':99999', ':0', ':01', ':', ':443443', ':1']);
/** A base64url payload whose length is a possible one (a length of 1 mod 4 is refused by design). */
function payloadOf(r: Rand): string {
  let p = str(r, 'ABCxyz019-_', 1, 40);
  if (p.length % 4 === 1) p += 'A';
  return p;
}

function linkOf(r: Rand): { link: string; opts: InvoiceLinkOptions } {
  const scheme = pick(r, ['https', 'https', 'https', 'HTTPS', 'http', 'ftp']);
  const userinfo = r() < 0.08 ? `${pick(r, ['user', 'a:b', 'x@y'])}@` : '';
  const query = r() < 0.05 ? '?q=1' : '';
  const link = `${scheme}://${userinfo}${hostOf(r)}${portOf(r)}${pathOf(r)}${query}#gpi=v1.${payloadOf(r)}`;
  const opts: InvoiceLinkOptions = {
    ...(r() < 0.3 ? { allowLocalDev: true } : {}),
    ...(r() < 0.1 ? { allowedHosts: ['example.test', 'xn--bcher-kva.example'] } : {}),
  };
  return { link, opts };
}

/** Everything a browser would load for an accepted link must be what the parser reports. */
function assertBrowserAgrees(link: string, parsed: InvoiceLink, opts: InvoiceLinkOptions): void {
  const url = new URL(link); // an accepted link must be parseable at all
  expect(url.hostname).toBe(parsed.host);
  expect(url.origin).toBe(parsed.origin);
  expect(url.username + url.password).toBe('');
  expect(url.search).toBe('');
  expect(url.pathname).toBe(parsed.path === '' ? '/' : parsed.path);
  expect(url.hash).toBe(parsed.fragment);
  expect(parsed.host).toBe(parsed.host.toLowerCase());
  // No spelling of an IPv4 literal other than dev 127.0.0.1 is accepted as a host.
  if (/^[0-9.x]+$/i.test(parsed.host) || /(?:^|\.)(?:[0-9]+|0x[0-9a-f]*)$/i.test(parsed.host)) {
    expect(opts.allowLocalDev === true && parsed.host === '127.0.0.1').toBe(true);
  }
  if (!(opts.allowLocalDev === true)) expect(['localhost', '127.0.0.1']).not.toContain(parsed.host);
  if (opts.allowedHosts !== undefined) expect(opts.allowedHosts).toContain(parsed.host);
  expect(parsed.path.split('/')).not.toContain('..');
  expect(parsed.path.split('/')).not.toContain('.');
  expect(link).not.toContain(parsed.payload.slice(0, 0) + '\n');
}

function verdict(link: string, opts: InvoiceLinkOptions): string {
  try {
    const p = parseInvoiceLink(link, opts);
    assertBrowserAgrees(link, p, opts);
    return `ok:${p.origin}${p.path}${p.fragment}`;
  } catch (e) {
    expect(e).toBeInstanceOf(PaymentUriError);
    // The message is fixed per code and never echoes the hostile input.
    expect((e as Error).message).not.toContain(link.slice(8, 20));
    return `err:${(e as PaymentUriError).code}`;
  }
}

const SEEDS = [6, 732, 1126];
const ITERATIONS = 4000;

describe('parseInvoiceLink seeded host/port/path fuzz', () => {
  for (const seed of SEEDS) {
    it(`seed ${String(seed)}: ${String(ITERATIONS)} hostile links are refused typed or agree with the URL parser`, () => {
      const r = prng(seed);
      let accepted = 0;
      let invalidPuny = 0;
      for (let i = 0; i < ITERATIONS; i++) {
        const { link, opts } = linkOf(r);
        const v = verdict(link, opts);
        if (v.startsWith('ok:')) accepted++;
        // A punycode label the URL parser rejects must be refused (the #732 case), never reported as a host.
        if (/xn--/i.test(link)) {
          let urlThrows = false;
          try { new URL(link); } catch { urlThrows = true; }
          if (urlThrows) { invalidPuny++; expect(v.startsWith('err:')).toBe(true); }
        }
      }
      expect(accepted).toBeGreaterThan(20);
      expect(invalidPuny).toBeGreaterThan(5);
    });
  }

  it('never refuses an ordinary valid DNS name, with or without a default or explicit port and path', () => {
    const r = prng(2026);
    for (let i = 0; i < 1500; i++) {
      const labels = Array.from({ length: int(r, 2, 4) }, () => {
        const body = str(r, LDH, 0, 30).replace(/^-+|-+$/g, '');
        return (str(r, 'abcdefghijklmnopqrstuvwxyz', 1, 1) + body).slice(0, 63).replace(/-+$/, 'a');
      });
      labels[labels.length - 1] = str(r, 'abcdefghijklmnopqrstuvwxyz', 2, 6); // alphabetic TLD: never an IPv4 spelling
      const host = labels.join('.');
      const port = pick(r, ['', ':443', ':8443', ':65535']);
      const path = pick(r, ['', '/pay', '/a/b-c', '/pay/']);
      const link = `https://${host}${port}${path}#gpi=v1.${payloadOf(r)}`;
      const parsed = parseInvoiceLink(link);
      assertBrowserAgrees(link, parsed, {});
      expect(parsed.host).toBe(host);
      // Same link through the builder: re-validated and identical.
      expect(buildInvoiceLink(parsed.origin, parsed.fragment, parsed.path === '' ? '' : parsed.path)).toBe(`${parsed.origin}${parsed.path}${parsed.fragment}`);
    }
  });

  it('refuses every IPv4 spelling a browser reads as an address, in every scheme and option combination', () => {
    const r = prng(127);
    const spellings = ['127.0.0.1', '0x7f000001', '0x7f.1', '2130706433', '017700000001', '1.2.3.0x4', '1.2.3', '0.0.0.0', '256.1.1.1',
      '0X7F.0.0.1', '127.1', '1.2.3.4', '4294967295', '0x', '0xffffffff'];
    for (const host of spellings) {
      for (const scheme of ['https', 'http']) {
        for (const opts of [{}, { allowLocalDev: true }] as const) {
          const link = `${scheme}://${host}${pick(r, ['', ':8080'])}/pay#gpi=v1.AA`;
          const v = verdict(link, opts);
          // Only the literal dev loopback is allowed, and only over http or https with the dev switch.
          if (host === '127.0.0.1' && opts.allowLocalDev === true) continue;
          expect(v, `${link} ${JSON.stringify(opts)}`).toMatch(/^err:INVALID_LINK$/);
        }
      }
    }
  });

  it('refuses a punycode host that the URL parser rejects (it may also refuse hosts it loads, never the reverse)', () => {
    for (const host of ['xn--a.example', 'xn--abc.example', 'xn--0.example', 'a.xn--.example', 'xn--.example', 'xn--a-.example']) {
      let browserLoads = true;
      try { new URL(`https://${host}`); } catch { browserLoads = false; }
      const v = verdict(`https://${host}/pay#gpi=v1.AA`, {});
      if (!browserLoads) expect(v.startsWith('err:')).toBe(true);
    }
    expect(verdict('https://xn--bcher-kva.example/pay#gpi=v1.AA', {})).toBe('ok:https://xn--bcher-kva.example/pay#gpi=v1.AA');
  });

  it('is deterministic: the same seed yields the same verdicts', () => {
    const run = (seed: number): string[] => {
      const r = prng(seed);
      return Array.from({ length: 400 }, () => { const { link, opts } = linkOf(r); return verdict(link, opts); });
    };
    expect(run(8)).toEqual(run(8));
  });
});
