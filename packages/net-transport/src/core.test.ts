import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { RpcHttpError } from '@ghostpay/chain-adapters';
import {
  ALLOWED_BTC_NETWORKS,
  ALLOWED_EVM_CHAIN_IDS,
  COMMON_NOT_HIDDEN,
  CredentialSource,
  DEFAULT_NETWORK_SETTINGS,
  FIRST_USE_NOTICE,
  NET_PRIVACY_TESTNET_ONLY,
  NetTransportError,
  PROFILE_IDS,
  PROFILE_LABELS,
  PURPOSES,
  RPC_MODE_LABELS,
  SCAN_MODE_LABELS,
  TOR_BROWSER_NOTICE,
  assertTestnet,
  defaultRandom,
  encodeSocksDestination,
  encodeVarint,
  decodeBhttpRequest,
  decodeBhttpResponse,
  encodeBhttpRequest,
  encodeBhttpResponse,
  isValidV3OnionHost,
  parseHttpProxyUrl,
  parseProxyUrl,
  parseTargetUrl,
  transportToFetch,
  validateNetworkSettings,
  validateOnionUrl,
  validateRpcMode,
  type NetworkRef,
  type Purpose,
} from './index.js';

const SEPOLIA: NetworkRef = { kind: 'evm', chainId: 11155111 };
// Real, well-known v3 addresses (DuckDuckGo, Debian); the checksum is the only thing verified here.
const DDG = 'duckduckgogg42xjoc72x3sjasowoarfbgcmvfimaftt6twagswzczad.onion';
const DEBIAN = '2gzyxa5ihm7nsggfxnu52rck2vv4rvmdlkiu3zzui5du4xyclen53wid.onion';

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return e instanceof NetTransportError ? e.code : `other:${String(e)}`;
  }
  return 'no-throw';
}

describe('testnet guard (NP-C-4, AT-NP-23)', () => {
  it('flag is on', () => {
    expect(NET_PRIVACY_TESTNET_ONLY).toBe(true);
  });
  it('accepts only the allow-listed networks', () => {
    for (const chainId of ALLOWED_EVM_CHAIN_IDS) expect(() => assertTestnet({ kind: 'evm', chainId })).not.toThrow();
    for (const network of ALLOWED_BTC_NETWORKS) expect(() => assertTestnet({ kind: 'btc', network })).not.toThrow();
    expect([...ALLOWED_EVM_CHAIN_IDS]).toEqual([31337, 11155111, 84532]);
  });
  it('rejects mainnets and malformed refs', () => {
    for (const chainId of [1, 8453, 10, 42161, 137, 56, 43114, 0, -1, 11155111.5, NaN]) {
      expect(codeOf(() => assertTestnet({ kind: 'evm', chainId }))).toBe('NETWORK_NOT_ALLOWED');
    }
    expect(codeOf(() => assertTestnet({ kind: 'btc', network: 'mainnet' }))).toBe('NETWORK_NOT_ALLOWED');
    expect(codeOf(() => assertTestnet({ kind: 'btc', network: 'Testnet' }))).toBe('NETWORK_NOT_ALLOWED');
    for (const bad of [undefined, null, 5, 'evm', {}, { kind: 'evm' }, { kind: 'evm', chainId: '11155111' }, { kind: 'btc' }]) {
      expect(codeOf(() => assertTestnet(bad as unknown as NetworkRef))).toBe('NETWORK_NOT_ALLOWED');
    }
  });
});

describe('credentials (NP-I-1, NP-I-2, AT-NP-7)', () => {
  it('per-purpose: session purposes are stable, request purposes are fresh', () => {
    const s = new CredentialSource('per-purpose');
    const a1 = s.next('scan-bulk');
    const a2 = s.next('scan-bulk');
    expect(a1).toEqual(a2);
    expect(s.next('health')).toEqual(s.next('health'));
    const seen = new Set<string>();
    for (const p of ['read-address', 'quote', 'sweep', 'submit'] as Purpose[]) {
      for (let i = 0; i < 3; i++) {
        const c = s.next(p);
        expect(c).toBeDefined();
        seen.add(`${c?.username}|${c?.password}`);
      }
    }
    expect(seen.size).toBe(12);
  });
  it('scan-bulk and read-address never share credentials; usernames carry the purpose', () => {
    const s = new CredentialSource('per-purpose');
    const a = s.next('scan-bulk');
    const b = s.next('read-address');
    expect(a?.username).toMatch(/^gp1-scan-bulk-[0-9a-f]{16}$/);
    expect(b?.username).toMatch(/^gp1-read-address-[0-9a-f]{16}$/);
    expect(a?.password).toMatch(/^[0-9a-f]{32}$/);
    expect(a?.username).not.toBe(b?.username);
    expect(a?.password).not.toBe(b?.password);
  });
  it('per-request rotates even scan-bulk; none yields no credentials', () => {
    const s = new CredentialSource('per-request');
    expect(s.next('scan-bulk')).not.toEqual(s.next('scan-bulk'));
    expect(new CredentialSource('none').next('quote')).toBeUndefined();
  });
  it('different sources (sessions) get different session ids', () => {
    expect(new CredentialSource('per-purpose').next('scan-bulk')).not.toEqual(new CredentialSource('per-purpose').next('scan-bulk'));
  });
  it('comes only from the random source (deterministic injection) and checks its output', () => {
    let calls = 0;
    const rand = (n: number): Uint8Array => {
      calls++;
      return new Uint8Array(n).fill(0xab);
    };
    const c = new CredentialSource('per-request', rand).next('sweep');
    expect(c).toEqual({ username: `gp1-sweep-${'ab'.repeat(8)}`, password: 'ab'.repeat(16) });
    expect(calls).toBe(2);
    expect(codeOf(() => new CredentialSource('per-request', () => new Uint8Array(3)).next('sweep'))).toBe('INVALID_CONFIG');
    expect(codeOf(() => new CredentialSource('per-request', (() => 'x') as unknown as () => Uint8Array).next('sweep'))).toBe('INVALID_CONFIG');
  });
  it('rejects unknown isolation and purposes', () => {
    expect(codeOf(() => new CredentialSource('bogus' as 'none'))).toBe('INVALID_CONFIG');
    expect(codeOf(() => new CredentialSource('none').next('nope' as Purpose))).toBe('INVALID_CONFIG');
    expect(PURPOSES).toHaveLength(6);
  });
  it('default RNG returns requested length and varies', () => {
    expect(defaultRandom(16)).toHaveLength(16);
    expect(defaultRandom(16)).not.toEqual(defaultRandom(16));
  });
});

describe('parseProxyUrl (NP-T-3, AT-NP-2)', () => {
  it('accepts socks5h and socks on loopback with an explicit port', () => {
    expect(parseProxyUrl('socks5h://127.0.0.1:9150')).toEqual({ host: '127.0.0.1', port: 9150, remoteDns: true });
    expect(parseProxyUrl('socks://127.0.0.1:9050/')).toEqual({ host: '127.0.0.1', port: 9050, remoteDns: true });
    expect(parseProxyUrl('socks5h://localhost:9150').host).toBe('127.0.0.1');
    expect(parseProxyUrl('socks5h://[::1]:9150')).toEqual({ host: '::1', port: 9150, remoteDns: true });
  });
  it.each(['socks5://127.0.0.1:9050', 'socks4://127.0.0.1:9050', 'socks4a://127.0.0.1:9050'])('rejects local-DNS scheme %s', (u) => {
    expect(codeOf(() => parseProxyUrl(u))).toBe('PROXY_LOCAL_DNS');
  });
  it.each([
    'http://127.0.0.1:9050',
    'socks5h://127.0.0.1',
    'socks5h://127.0.0.1:0',
    'socks5h://127.0.0.1:70000',
    'socks5h://user:pw@127.0.0.1:9050',
    'socks5h://127.0.0.1:9050/path',
    'socks5h://127.0.0.1:9050?x=1',
    'socks5h://127.0.0.1:9050#f',
    'socks5h://proxy.example.test:9050',
    'socks5h://10.1.2.3:9050',
    'not a url',
    '',
  ])('rejects %s', (u) => {
    expect(codeOf(() => parseProxyUrl(u))).toBe('INVALID_CONFIG');
  });
  it('non-loopback IP only with the explicit flag', () => {
    expect(parseProxyUrl('socks5h://10.1.2.3:9050', { allowNonLoopback: true }).host).toBe('10.1.2.3');
  });
  it('http proxy variant', () => {
    expect(parseHttpProxyUrl('http://127.0.0.1:4444')).toEqual({ host: '127.0.0.1', port: 4444, remoteDns: true });
    for (const u of ['https://127.0.0.1:4444', 'http://u:p@127.0.0.1:4444', 'http://127.0.0.1:4444/x', 'http://127.0.0.1', 'nope', 'http://x.test:4444']) {
      expect(codeOf(() => parseHttpProxyUrl(u))).toBe('INVALID_CONFIG');
    }
  });
  it('errors never echo the input (fuzz)', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 6, maxLength: 40 }), (s) => {
        for (const fn of [() => parseProxyUrl(s), () => parseHttpProxyUrl(s), () => validateOnionUrl(s), () => parseTargetUrl(s)]) {
          try {
            fn();
          } catch (e) {
            expect((e as Error).message).not.toContain(s);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe('encodeSocksDestination (ATYP selection)', () => {
  it('hostnames always use ATYP 0x03 with the name, never an address', () => {
    const b = encodeSocksDestination('rpc.example.test', 443);
    expect([...b]).toEqual([3, 16, ...Buffer.from('rpc.example.test'), 0x01, 0xbb]);
  });
  it('IP literals use 0x01 / 0x04', () => {
    expect([...encodeSocksDestination('127.0.0.1', 80)]).toEqual([1, 127, 0, 0, 1, 0, 80]);
    expect(encodeSocksDestination('[::1]', 80)[0]).toBe(4);
    expect([...encodeSocksDestination('[::1]', 80).subarray(1, 17)]).toEqual([...new Array<number>(15).fill(0), 1]);
    expect([...encodeSocksDestination('[2001:db8::2]', 1).subarray(1, 17)]).toEqual([0x20, 0x01, 0x0d, 0xb8, ...new Array<number>(11).fill(0), 2]);
    expect([...encodeSocksDestination('[::ffff:1.2.3.4]', 1).subarray(13, 17)]).toEqual([1, 2, 3, 4]);
    expect([...encodeSocksDestination('[1:2:3:4:5:6:7:8]', 1).subarray(1, 17)]).toEqual([0, 1, 0, 2, 0, 3, 0, 4, 0, 5, 0, 6, 0, 7, 0, 8]);
  });
  it('255-byte names ok, 256 rejected, empty and control chars rejected, bad ports rejected', () => {
    expect(encodeSocksDestination(`${'a'.repeat(251)}.com`, 1)[1]).toBe(255);
    expect(codeOf(() => encodeSocksDestination(`${'a'.repeat(252)}.com`, 1))).toBe('URL_REJECTED');
    expect(codeOf(() => encodeSocksDestination('', 1))).toBe('URL_REJECTED');
    expect(codeOf(() => encodeSocksDestination('a b', 1))).toBe('URL_REJECTED');
    expect(codeOf(() => encodeSocksDestination('a\r\nb', 1))).toBe('URL_REJECTED');
    for (const p of [0, 65536, -1, 1.5]) expect(codeOf(() => encodeSocksDestination('a.test', p))).toBe('URL_REJECTED');
  });
});

describe('validateOnionUrl (NP-T-7, AT-NP-6)', () => {
  it('accepts real v3 addresses (checksum verified)', () => {
    expect(isValidV3OnionHost(DDG)).toBe(true);
    expect(isValidV3OnionHost(DEBIAN)).toBe(true);
    expect(validateOnionUrl(`https://${DDG}/rpc`)).toBe(`https://${DDG}/rpc`);
    expect(validateOnionUrl(`http://${DDG}:8545`, { allowHttp: true })).toBe(`http://${DDG}:8545/`);
  });
  it('rejects a single flipped character in every position (checksum, pubkey, version)', () => {
    const base = DDG.slice(0, 56);
    let rejected = 0;
    for (let i = 0; i < 56; i++) {
      const alt = base[i] === 'a' ? 'b' : 'a';
      if (!isValidV3OnionHost(`${base.slice(0, i)}${alt}${base.slice(i + 1)}.onion`)) rejected++;
    }
    expect(rejected).toBe(56);
  });
  it('rejects wrong version byte even with a recomputed checksum shape, v2, wrong lengths, uppercase, userinfo, fragment, http without flag', () => {
    expect(isValidV3OnionHost('propub3r6espa33w.onion')).toBe(false);
    expect(isValidV3OnionHost(`${DDG.slice(0, 55)}.onion`)).toBe(false);
    expect(isValidV3OnionHost(`${DDG.slice(0, 56)}a.onion`)).toBe(false);
    expect(isValidV3OnionHost(DDG.replace('.onion', '.onio'))).toBe(false);
    expect(isValidV3OnionHost(DDG.replace('a', '1'))).toBe(false); // '1' is not in the base32 alphabet
    expect(isValidV3OnionHost('example.com')).toBe(false);
    const bad = [
      `https://${DDG.toUpperCase()}/`,
      `https://${DDG.slice(0, 10)}${DDG.slice(10, 11).toUpperCase()}${DDG.slice(11)}/`,
      `https://user@${DDG}/`,
      `https://user:pw@${DDG}/`,
      `https://${DDG}/#frag`,
      `http://${DDG}/`,
      `ftp://${DDG}/`,
      `ws://${DDG}/`,
      'https://propub3r6espa33w.onion/',
      'https://example.com/',
      '',
      'not a url',
      `//${DDG}`,
    ];
    for (const u of bad) expect(codeOf(() => validateOnionUrl(u))).toBe('ONION_URL');
    expect(codeOf(() => validateOnionUrl(undefined as unknown as string))).toBe('ONION_URL');
    expect(codeOf(() => validateOnionUrl(`http://${DDG}/`, { allowHttp: false }))).toBe('ONION_URL');
  });
  it('error messages never contain the address', () => {
    try {
      validateOnionUrl(`https://${DDG}x/`);
    } catch (e) {
      expect(String((e as Error).message)).not.toContain('duckduckgo');
    }
  });
  it('every single-character mutation of two real addresses is rejected, up to the 16-bit checksum collision rate', () => {
    // The checksum is only 16 bits: it catches typos, it is NOT an authenticity check. Over 56*31 = 1736
    // mutations the expected number of accidental passes is 0.03; one real address does have one.
    const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
    for (const addr of [DDG, DEBIAN]) {
      const base = addr.slice(0, 56);
      let accepted = 0;
      for (let pos = 0; pos < 56; pos++) {
        for (const ch of alphabet) {
          if (ch === base[pos]) continue;
          if (isValidV3OnionHost(`${base.slice(0, pos)}${ch}${base.slice(pos + 1)}.onion`)) accepted++;
        }
      }
      expect(accepted).toBeLessThanOrEqual(2);
    }
  });
});

describe('parseTargetUrl', () => {
  it('accepts https, defaults ports, keeps path+query', () => {
    const t = parseTargetUrl('https://rpc.example.test/v1/key?x=1');
    expect(t).toMatchObject({ host: 'rpc.example.test', port: 443, tls: true, path: '/v1/key?x=1' });
    expect(parseTargetUrl('http://a.test:8080/', { allowPlainHttp: true })).toMatchObject({ port: 8080, tls: false });
    expect(parseTargetUrl('http://a.test/', { allowPlainHttp: true }).port).toBe(80);
  });
  it('rejects http by default, userinfo, fragment, other schemes, garbage', () => {
    for (const u of ['http://a.test/', 'https://u:p@a.test/', 'https://u@a.test/', 'https://a.test/#x', 'ftp://a.test/', 'wss://a.test/', 'x', '']) {
      expect(codeOf(() => parseTargetUrl(u))).toBe('URL_REJECTED');
    }
  });
});

describe('claims and honest labels (NP-C-1..4, AT-NP-9)', () => {
  it('has a label for every profile id', () => {
    expect(Object.keys(PROFILE_LABELS).sort()).toEqual([...PROFILE_IDS].sort());
    for (const id of PROFILE_IDS) expect(PROFILE_LABELS[id].id).toBe(id);
  });
  it('every profile carries the NOT-hidden statements from spec section 2', () => {
    for (const id of PROFILE_IDS) {
      const text = PROFILE_LABELS[id].doesNotHide.join('\n');
      expect(text).toContain('On-chain data is unchanged by any overlay');
      expect(text).toContain('Hiding the IP does not hide content');
      expect(text).toContain('Timing correlation');
      expect(text).toContain('do not hide the request from the destination');
      for (const s of COMMON_NOT_HIDDEN) expect(PROFILE_LABELS[id].doesNotHide).toContain(s);
    }
  });
  it('never uses forbidden wording', () => {
    const labels = Object.values(PROFILE_LABELS).map((l) => [l.title, l.hides, ...l.doesNotHide, ...l.trust]);
    const all = JSON.stringify([labels, Object.values(SCAN_MODE_LABELS), Object.values(RPC_MODE_LABELS), FIRST_USE_NOTICE, TOR_BROWSER_NOTICE]);
    expect(all).not.toMatch(/anonym|untraceab|unlinkab|verified mirror/i);
    // "mix" appears only inside the verbatim Nym quotation from the spec
    const withoutQuote = all.replaceAll('mixing \\"does not protect against the server you are talking to\\"', '');
    expect(withoutQuote).not.toMatch(/\bmix/i);
    expect(PROFILE_LABELS['nym-mixfetch'].title).toContain('Nym');
  });
  it('profile-specific honesty rules', () => {
    expect(PROFILE_LABELS.direct.hides).toContain('your RPC/relayer sees your IP');
    expect(PROFILE_LABELS['tor-browser'].doesNotHide).toContain(TOR_BROWSER_NOTICE);
    expect(TOR_BROWSER_NOTICE).toBe('You are responsible for using Tor Browser; this page cannot verify it.');
    expect(FIRST_USE_NOTICE).toContain('not what you send or what is on-chain');
    expect(PROFILE_LABELS['i2p-outproxy'].secondary).toBe(true);
    expect(PROFILE_LABELS['i2p-outproxy'].doesNotHide.join(' ')).toContain('outproxy operator sees the destination');
    expect(PROFILE_LABELS['i2p-outproxy'].doesNotHide.join(' ')).toContain('Stream isolation is not claimed');
    for (const id of ['nym-mixfetch', 'nym-socks5'] as const) {
      expect(PROFILE_LABELS[id].experimental).toBe(true);
      expect(PROFILE_LABELS[id].doesNotHide.join(' ')).toContain('does not protect against the server you are talking to');
      expect(PROFILE_LABELS[id].doesNotHide.join(' ')).toContain('Stream isolation is not claimed');
    }
    expect(PROFILE_LABELS.ohttp.trust.join(' ')).toContain('Non-collusion');
    expect(PROFILE_LABELS.ohttp.doesNotHide.join(' ')).toContain('collusion defeats the split');
    expect(SCAN_MODE_LABELS.pir2).toContain('do not collude');
    expect(SCAN_MODE_LABELS['light-client']).toBe('Verifies answers, does not hide queries.');
    expect(Object.isFrozen(PROFILE_LABELS.direct)).toBe(true);
  });
});

describe('settings schema (NP-T-2, AT-NP-11)', () => {
  const web = { env: 'web', network: SEPOLIA } as const;
  const node = { env: 'node', network: SEPOLIA } as const;
  it('defaults are all direct/single/range and nothing is automatic', () => {
    expect(DEFAULT_NETWORK_SETTINGS).toEqual({ rpcProfile: 'direct', relayerProfile: 'direct', rpcMode: 'single', scanMode: 'range', experimental: false });
    expect(validateNetworkSettings(undefined, web)).toBe(DEFAULT_NETWORK_SETTINGS);
    expect(validateNetworkSettings(null, node)).toBe(DEFAULT_NETWORK_SETTINGS);
    expect(validateNetworkSettings({}, web)).toEqual(DEFAULT_NETWORK_SETTINGS);
  });
  it('is testnet-guarded', () => {
    expect(codeOf(() => validateNetworkSettings({}, { env: 'web', network: { kind: 'evm', chainId: 1 } }))).toBe('NETWORK_NOT_ALLOWED');
    expect(codeOf(() => validateRpcMode('single', ['https://a.test'], { network: { kind: 'evm', chainId: 8453 } }))).toBe('NETWORK_NOT_ALLOWED');
  });
  it('accepts valid combinations per environment', () => {
    expect(validateNetworkSettings({ rpcProfile: 'tor-socks', relayerProfile: 'tor-socks', scanMode: 'indexer-tor' }, node).scanMode).toBe('indexer-tor');
    expect(validateNetworkSettings({ rpcProfile: 'tor-browser' }, web).rpcProfile).toBe('tor-browser');
    expect(validateNetworkSettings({ relayerProfile: 'i2p-outproxy' }, node).relayerProfile).toBe('i2p-outproxy');
    expect(validateNetworkSettings({ rpcProfile: 'onion', rpcMode: 'own-node' }, { ...web, builds: { onion: true } }).rpcProfile).toBe('onion');
    expect(validateNetworkSettings({ relayerProfile: 'onion' }, node).relayerProfile).toBe('onion');
    expect(validateNetworkSettings({ rpcProfile: 'nym-mixfetch', experimental: true }, { ...web, builds: { nym: true } }).experimental).toBe(true);
    expect(validateNetworkSettings({ relayerProfile: 'nym-socks5', experimental: true }, node).relayerProfile).toBe('nym-socks5');
    expect(validateNetworkSettings({ relayerProfile: 'ohttp', experimental: true }, node).relayerProfile).toBe('ohttp');
    expect(validateNetworkSettings({ rpcProfile: 'ohttp', experimental: true }, { ...node, ohttpGatewayConfigured: true }).rpcProfile).toBe('ohttp');
    expect(validateNetworkSettings({ scanMode: 'pir2', rpcMode: 'quorum' }, web)).toMatchObject({ scanMode: 'pir2', rpcMode: 'quorum' });
  });
  it('rejects unavailable, gated and inconsistent combinations', () => {
    const bad: [unknown, Parameters<typeof validateNetworkSettings>[1]][] = [
      [{ rpcProfile: 'tor-socks' }, web],
      [{ rpcProfile: 'tor-browser' }, node],
      [{ rpcProfile: 'i2p-outproxy' }, node], // relayer role only
      [{ relayerProfile: 'i2p-outproxy' }, web],
      [{ rpcProfile: 'nym-mixfetch', experimental: true }, node],
      [{ rpcProfile: 'nym-mixfetch', experimental: true }, web], // no nym build
      [{ rpcProfile: 'nym-mixfetch' }, { ...web, builds: { nym: true } }], // no experimental toggle
      [{ relayerProfile: 'nym-socks5' }, node],
      [{ rpcProfile: 'onion' }, { ...web, builds: { onion: true } }], // onion RPC needs own-node
      [{ rpcProfile: 'onion', rpcMode: 'own-node' }, web], // no onion build
      [{ rpcProfile: 'ohttp', experimental: true }, node], // no gateway for rpc
      [{ relayerProfile: 'ohttp' }, node], // no experimental
      [{ scanMode: 'indexer-tor' }, web], // direct + indexer-tor
      [{ rpcProfile: 'warp-drive' }, web],
      [{ rpcMode: 'telepathy' }, web],
      [{ scanMode: 5 }, web],
      [{ experimental: 'yes' }, web],
      [{ extra: 1 }, web],
      [{ __proto__: null, constructor: 1 }, web],
      [[], web],
      ['direct', web],
      [7, web],
    ];
    for (const [raw, o] of bad) expect(codeOf(() => validateNetworkSettings(raw, o))).toBe('INVALID_CONFIG');
  });
  it('rpc mode URL rules', () => {
    const o = { network: SEPOLIA } as const;
    expect(validateRpcMode('single', ['https://rpc.a.test/k'], o)).toEqual(['https://rpc.a.test/k']);
    expect(validateRpcMode('quorum', ['https://a.test', 'https://b.test'], o)).toHaveLength(2);
    expect(validateRpcMode('light-client', ['https://a.test'], o)).toHaveLength(1);
    expect(validateRpcMode('own-node', ['http://127.0.0.1:8545'], { ...o, allowInsecureLocalhost: true })).toEqual(['http://127.0.0.1:8545/']);
    expect(validateRpcMode('own-node', [`http://${DDG}:8545`], o)).toEqual([`http://${DDG}:8545/`]);
    expect(validateRpcMode('own-node', [`https://${DDG}/`], o)).toHaveLength(1);
    const code = (m: Parameters<typeof validateRpcMode>[0], u: string[], oo: Parameters<typeof validateRpcMode>[2] = o): string => {
      try {
        validateRpcMode(m, u, oo);
      } catch (e) {
        return (e as { code?: string }).code ?? 'other';
      }
      return 'no-throw';
    };
    expect(code('single', [])).toBe('INVALID_CONFIG');
    expect(code('single', ['https://a.test', 'https://b.test'])).toBe('INVALID_CONFIG');
    expect(code('quorum', ['https://a.test'])).toBe('INVALID_CONFIG');
    expect(code('quorum', ['https://a.test/x', 'https://a.test/y'])).toBe('INVALID_CONFIG'); // same host
    expect(code('own-node', ['https://a.test', 'https://b.test'])).toBe('INVALID_CONFIG');
    expect(code('own-node', ['https://rpc.example.test'])).toBe('INVALID_CONFIG'); // not loopback
    expect(code('own-node', ['http://127.0.0.1:8545'])).toBe('RPC_URL_REJECTED'); // http needs the flag
    expect(code('own-node', ['http://propub3r6espa33w.onion/'])).toBe('ONION_URL');
    expect(code('single', ['http://a.test'])).toBe('RPC_URL_REJECTED');
    expect(code('single', ['https://u:p@a.test'])).toBe('RPC_URL_REJECTED');
    expect(code('telepathy' as 'single', ['https://a.test'])).toBe('INVALID_CONFIG');
    expect(code('light-client', Array.from({ length: 9 }, (_, i) => `https://h${String(i)}.test`))).toBe('INVALID_CONFIG');
  });
});

describe('binary HTTP (RFC 9292 known-length) [UNVERIFIED against the RFC]', () => {
  const hex = (b: Uint8Array): string => Buffer.from(b).toString('hex');
  it('varint vectors (RFC 9000 appendix A.1 values that fit in 30 bits)', () => {
    expect(hex(encodeVarint(37))).toBe('25');
    expect(hex(encodeVarint(15293))).toBe('7bbd');
    expect(hex(encodeVarint(494878333))).toBe('9d7f3e7d');
    expect(hex(encodeVarint(0))).toBe('00');
    expect(hex(encodeVarint(63))).toBe('3f');
    expect(hex(encodeVarint(64))).toBe('4040');
    for (const bad of [-1, 2 ** 30, 1.5, NaN]) expect(codeOf(() => encodeVarint(bad))).toBe('OHTTP_FRAMING');
  });
  it('exact bytes for a tiny request', () => {
    const b = encodeBhttpRequest({ method: 'GET', scheme: 'https', authority: 'a.b', path: '/', headers: [], content: new Uint8Array() });
    expect(hex(b)).toBe('00' + '03474554' + '056874747073' + '03612e62' + '012f' + '00' + '00' + '00');
  });
  it('round trips requests with headers, content and padding', () => {
    const r = {
      method: 'POST',
      scheme: 'https',
      authority: 'rpc.example.test:8545',
      path: '/v1/x?y=1',
      headers: [['content-type', 'application/json'] as const, ['accept', 'application/json'] as const],
      content: new TextEncoder().encode('{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'),
    };
    const enc = encodeBhttpRequest(r, 256);
    expect(enc.length % 256).toBe(0);
    expect(decodeBhttpRequest(enc)).toEqual(r);
    expect(decodeBhttpRequest(encodeBhttpRequest(r))).toEqual(r);
  });
  it('round trips responses and skips interim 1xx', () => {
    const r = { status: 200, headers: [['content-type', 'application/json'] as const], content: new TextEncoder().encode('{"a":1}') };
    expect(decodeBhttpResponse(encodeBhttpResponse(r, 64))).toEqual(r);
    const interim = Buffer.concat([
      Buffer.from([1]),
      Buffer.from(encodeVarint(103)),
      Buffer.from([0]), // empty header section
      Buffer.from(encodeVarint(204)),
      Buffer.from([0, 0, 0]), // headers, content, trailers
    ]);
    expect(decodeBhttpResponse(interim)).toMatchObject({ status: 204 });
  });
  it('handles multi-byte length prefixes (100 byte method, 20000 byte body)', () => {
    const r = { method: 'M'.repeat(100), scheme: 'https', authority: 'a', path: '/', headers: [], content: new Uint8Array(20000).fill(7) };
    expect(decodeBhttpRequest(encodeBhttpRequest(r))).toEqual(r);
  });
  it('rejects malformed input: truncation at every prefix, bad framing, nonzero padding, indeterminate length, 1xx-only, bad utf8, huge field', () => {
    const good = encodeBhttpRequest({ method: 'POST', scheme: 'https', authority: 'a.b', path: '/p', headers: [['k', 'v']], content: Uint8Array.of(1, 2, 3) });
    for (let n = 0; n < good.length; n++) expect(codeOf(() => decodeBhttpRequest(good.subarray(0, n)))).toBe('OHTTP_FRAMING');
    const goodResp = encodeBhttpResponse({ status: 200, headers: [], content: Uint8Array.of(9) });
    for (let n = 0; n < goodResp.length; n++) expect(codeOf(() => decodeBhttpResponse(goodResp.subarray(0, n)))).toBe('OHTTP_FRAMING');
    const nonzeroPad = Uint8Array.from([...good, 1]);
    expect(codeOf(() => decodeBhttpRequest(nonzeroPad))).toBe('OHTTP_FRAMING');
    expect(codeOf(() => decodeBhttpRequest(Uint8Array.from([2, ...good.subarray(1)])))).toBe('OHTTP_FRAMING');
    expect(codeOf(() => decodeBhttpResponse(good))).toBe('OHTTP_FRAMING'); // request framing byte
    expect(codeOf(() => decodeBhttpResponse(Uint8Array.from([1, ...encodeVarint(99), 0, 0, 0])))).toBe('OHTTP_FRAMING'); // status < 100 and >= 600 below
    expect(codeOf(() => decodeBhttpResponse(Uint8Array.from([1, ...encodeVarint(600), 0, 0, 0])))).toBe('OHTTP_FRAMING');
    expect(codeOf(() => decodeBhttpRequest(Uint8Array.from([0, 2, 0xff, 0xfe])))).toBe('OHTTP_FRAMING'); // invalid utf-8 method
    expect(codeOf(() => decodeBhttpRequest(Uint8Array.from([0, 0xc0, 0, 0, 0, 0, 0, 0, 0])))).toBe('OHTTP_FRAMING'); // 8-byte varint
    expect(codeOf(() => decodeBhttpRequest(Uint8Array.from([0, 0xbf, 0xff, 0xff, 0xff])))).toBe('OHTTP_FRAMING'); // field larger than 1 MiB
  });
  it('fuzz: decoders never throw anything but NetTransportError', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 120 }), (b) => {
        for (const f of [decodeBhttpRequest, decodeBhttpResponse]) {
          try {
            f(b);
          } catch (e) {
            expect(e).toBeInstanceOf(NetTransportError);
          }
        }
      }),
      { numRuns: 500 },
    );
  });
});

describe('transportToFetch', () => {
  it('returns a 200 Response for success and the status for RpcHttpError', async () => {
    const ok = transportToFetch({ send: () => Promise.resolve('{"a":1}') });
    const r = await ok('https://a.test/', { method: 'POST', body: '{}' });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ a: 1 });
    const fail = transportToFetch({ send: () => Promise.reject(new RpcHttpError(503)) });
    expect((await fail(new URL('https://a.test/'), { method: 'POST', body: '{}' })).status).toBe(503);
  });
  it('passes limits, accepts Request-likes, and never swallows other errors', async () => {
    let seen: unknown;
    const f = transportToFetch(
      {
        send: (u, b, init) => {
          seen = { u, b, init };
          return Promise.reject(new NetTransportError('PROXY_CONNECT', 'x'));
        },
      },
      { timeoutMs: 5, maxBytes: 9 },
    );
    await expect(f({ url: 'https://a.test/z' } as Request, { body: 'B' })).rejects.toBeInstanceOf(NetTransportError);
    expect(seen).toEqual({ u: 'https://a.test/z', b: 'B', init: { timeoutMs: 5, maxBytes: 9 } });
  });
  it('rejects non-POST and non-string bodies', async () => {
    const f = transportToFetch({ send: () => Promise.resolve('') });
    await expect(f('https://a.test/', { method: 'GET' })).rejects.toThrow('only POST');
    await expect(f('https://a.test/', { method: 'POST', body: new Uint8Array(1) })).rejects.toThrow('body must be a string');
    await expect(f('https://a.test/')).rejects.toThrow('body must be a string');
  });
});
