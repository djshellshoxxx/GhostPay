import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_BODY_BUCKETS, padBody } from '@ghostpay/metadata-hardening';
import { CHAIN_ID, DEST, FEE_TO, HOT_ADDRESS, ORIGIN, OWNER, SWEEP_CONTRACT, USDC, call, errCode, prepare, startHarness, type Harness } from './harness.testutil.js';
import { createLogger, zeroLogLogger } from './log.js';
import { parseConfig, type ConfigContext } from './config.js';
import { RelayerError } from './errors.js';
import { unpadBody } from './server.js';

let h: Harness | undefined;
afterEach(async () => {
  await h?.stop();
  h = undefined;
});
async function start(o: Parameters<typeof startHarness>[0] = {}): Promise<Harness> {
  h = await startHarness(o);
  return h;
}
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 20));
const quoteBody = { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '100000000' };
const code = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    return e instanceof RelayerError ? e.code : 'other';
  }
  return 'none';
};

describe('MH-REL-3 body padding (TM11 a)', () => {
  it('unpadBody strips a bounded hex pad and leaves everything else to the strict parser', () => {
    expect(unpadBody({ a: 1, pad: 'ab01' }, false)).toEqual({ a: 1 });
    expect(unpadBody({ a: 1 }, false)).toEqual({ a: 1 });
    expect(unpadBody('text', true)).toBe('text');
    expect(unpadBody(null, true)).toBeNull();
    expect(unpadBody([1], true)).toEqual([1]);
    expect(code(() => unpadBody({ a: 1, pad: 'XYZ' }, false))).toBe('invalid_pad');
    expect(code(() => unpadBody({ a: 1, pad: 7 }, false))).toBe('invalid_pad');
    expect(code(() => unpadBody({ a: 1 }, true))).toBe('invalid_pad');
  });

  it('accepts the documented padding boundary and rejects malformed or excessive padding', () => {
    expect(unpadBody({ a: 1, pad: '' }, true)).toEqual({ a: 1 });
    expect(unpadBody({ a: 1, pad: 'a'.repeat(16 * 1024) }, true)).toEqual({ a: 1 });
    for (const pad of ['a'.repeat(16 * 1024 + 1), 'AB', 'a\nb', 'ab ', null, false, 1, [], {}]) {
      expect(code(() => unpadBody({ a: 1, pad }, true))).toBe('invalid_pad');
    }
  });

  it('enforces the whole-body limit independently of the padding field limit', async () => {
    const s = await start();
    expect((await call(s, 'POST', '/v1/quote', padBody(quoteBody, [16 * 1024]))).status).toBe(200);
    const tooLarge = await call(s, 'POST', '/v1/quote', { ...quoteBody, pad: 'a'.repeat(16 * 1024) });
    expect(tooLarge.status).toBe(413);
    expect(errCode(tooLarge)).toBe('body_too_large');
  });

  it('accepts padded and unpadded quote and sweep bodies by default (transition)', async () => {
    const s = await start();
    const padded = padBody(quoteBody, DEFAULT_BODY_BUCKETS);
    expect(DEFAULT_BODY_BUCKETS).toContain(Buffer.byteLength(padded));
    expect((await call(s, 'POST', '/v1/quote', padded)).status).toBe(200);
    expect((await call(s, 'POST', '/v1/quote', quoteBody)).status).toBe(200);
    const ok = await prepare(s);
    const r = await call(s, 'POST', '/v1/sweep', padBody(ok.body));
    expect(r.status).toBe(200);
    const second = await prepare(s, { nonce: 2n });
    expect((await call(s, 'POST', '/v1/sweep', second.body)).status).toBe(200);
  });

  it('refuses a malformed pad before any other check', async () => {
    const s = await start();
    const r = await call(s, 'POST', '/v1/quote', { ...quoteBody, pad: 'not-hex' });
    expect(r.status).toBe(400);
    expect(errCode(r)).toBe('invalid_pad');
  });

  it('bodyPadding required refuses unpadded bodies and accepts padded ones', async () => {
    const s = await start({ config: { privacy: { zeroLog: false, ingress: 'direct', bodyPadding: 'required' } } });
    const bare = await call(s, 'POST', '/v1/quote', quoteBody);
    expect(bare.status).toBe(400);
    expect(errCode(bare)).toBe('invalid_pad');
    expect((await call(s, 'POST', '/v1/quote', padBody(quoteBody))).status).toBe(200);
  });
});

describe('zero-log mode (TM11 d)', () => {
  it('zeroLogLogger drops request lines and request ids only', () => {
    const lines: string[] = [];
    const log = zeroLogLogger(createLogger((l) => lines.push(l), () => 0));
    log.log('info', 'request', { requestId: '0123456789abcdef', route: '/v1/quote', status: 200 });
    log.log('info', 'sweep_sent', { requestId: '0123456789abcdef', chainId: 5 });
    log.log('warn', 'listening');
    expect(lines.map((l) => JSON.parse(l) as Record<string, unknown>)).toEqual([
      { ts: new Date(0).toISOString(), level: 'info', event: 'sweep_sent', chainId: 5 },
      { ts: new Date(0).toISOString(), level: 'warn', event: 'listening' },
    ]);
  });

  it('default mode logs one request line per request (baseline)', async () => {
    const s = await start();
    await call(s, 'POST', '/v1/quote', quoteBody);
    await settle();
    expect(s.logs.some((l) => (JSON.parse(l) as { event: string }).event === 'request')).toBe(true);
  });

  it('privacy.zeroLog suppresses per-request lines, request ids, IPs and destinations', async () => {
    const s = await start({ config: { privacy: { zeroLog: true, ingress: 'direct', bodyPadding: 'optional' } } });
    await call(s, 'POST', '/v1/quote', quoteBody);
    await call(s, 'POST', '/v1/quote', { ...quoteBody, pad: 'zz' });
    const ok = await prepare(s);
    expect((await call(s, 'POST', '/v1/sweep', ok.body)).status).toBe(200);
    await settle();
    const parsed = s.logs.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(parsed.some((p) => p['event'] === 'sweep_sent')).toBe(true);
    for (const p of parsed) {
      expect(p['event']).not.toBe('request');
      expect(p).not.toHaveProperty('requestId');
      expect(p).not.toHaveProperty('route');
    }
    const all = s.logs.join('\n').toLowerCase();
    for (const x of [DEST, OWNER, FEE_TO]) expect(all).not.toContain(x.toLowerCase());
    expect(all).not.toMatch(/127\.0\.0\.1|::1/);
  });
});

describe('privacy config block (TM11 c, d)', () => {
  const chain = {
    chainId: 11155111,
    rpcUrl: 'https://rpc.example/key',
    sweepRelayer: SWEEP_CONTRACT,
    feeTo: FEE_TO,
    tokens: [{ address: USDC, usdStable: true }],
    nativeUsdPrice: '3000.5',
    gasUnits: { sweep: '100000', sweepWithPermit: '130000' },
    maxGasLimit: '400000',
    maxGasPriceWei: '50000000000',
    dailyBudgetWei: '100000000000000000',
    minBalanceWei: '1000000000000000',
  };
  const ctx: ConfigContext = { env: {}, hotKeyAddress: HOT_ADDRESS, readManifest: () => undefined };
  const parse = (over: Record<string, unknown>) =>
    parseConfig({ allowedOrigins: [ORIGIN], state: { file: '/var/lib/ghostpay-relayer/state.json' }, chains: [chain], ...over }, ctx);
  const err = (over: Record<string, unknown>): string => {
    try {
      parse(over);
    } catch (e) {
      return (e as Error).message;
    }
    return 'none';
  };

  it('defaults keep existing behaviour, with ingress inferred from trustedProxies', () => {
    expect(parse({}).privacy).toEqual({ zeroLog: false, ingress: 'direct', bodyPadding: 'optional' });
    expect(parse({ trustedProxies: ['127.0.0.1'] }).privacy?.ingress).toBe('trusted-proxy');
    expect(parse({ privacy: { zeroLog: true, bodyPadding: 'required' } }).privacy).toEqual({ zeroLog: true, ingress: 'direct', bodyPadding: 'required' });
  });

  it('accepts onion ingress only on a loopback listener without trusted proxies', () => {
    expect(parse({ privacy: { ingress: 'onion' } }).privacy?.ingress).toBe('onion');
    expect(parse({ listen: { host: '::1' }, privacy: { ingress: 'onion' } }).privacy?.ingress).toBe('onion');
    expect(err({ listen: { host: '0.0.0.0' }, privacy: { ingress: 'onion' } })).toMatch(/onion needs listen.host on loopback/);
    expect(err({ trustedProxies: ['127.0.0.1'], privacy: { ingress: 'onion' } })).toMatch(/onion needs an empty trustedProxies/);
  });

  it('rejects contradictory or unknown privacy settings', () => {
    expect(err({ trustedProxies: ['10.0.0.1'], privacy: { ingress: 'direct' } })).toMatch(/direct needs an empty trustedProxies/);
    expect(err({ privacy: { ingress: 'trusted-proxy' } })).toMatch(/trusted-proxy needs trustedProxies/);
    expect(err({ privacy: { ingress: 'tor' } })).toMatch(/privacy.ingress/);
    expect(err({ privacy: { bodyPadding: 'always' } })).toMatch(/privacy.bodyPadding/);
    expect(err({ privacy: { zeroLog: 'yes' } })).toMatch(/privacy.zeroLog/);
    expect(err({ privacy: { logIps: true } })).toMatch(/privacy.logIps: unknown key/);
  });

  it.each(['ingress', 'bodyPadding'] as const)('rejects explicit null rather than defaulting privacy.%s', (setting) => {
    expect(err({ privacy: { [setting]: null } })).toContain(`privacy.${setting}: must be`);
  });
});
