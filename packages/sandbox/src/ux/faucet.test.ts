import { describe, expect, it } from 'vitest';
import { MockChain } from './chain.js';
import { SandboxError } from './errors.js';
import { DEFAULT_FAUCET_CONFIG, MockFaucet, buildFaucetGuidance, validateFaucetSource } from './faucet.js';
import { manualClock, seededRng } from './sandbox.testutil.js';

const code = (f: () => unknown): string | undefined => {
  try {
    f();
  } catch (e) {
    return (e as SandboxError).code;
  }
  return undefined;
};

function setup(cfg = DEFAULT_FAUCET_CONFIG) {
  const c = manualClock();
  const chain = new MockChain({ rng: seededRng(3), clock: c.clock });
  const faucet = new MockFaucet(chain, c.clock, cfg);
  const addr = chain.createAccount();
  return { c, chain, faucet, addr };
}

describe('MockFaucet', () => {
  it('drips then rate limits with exact retryAfter, then allows after cooldown', () => {
    const { c, chain, faucet, addr } = setup();
    const r1 = faucet.drip(addr);
    expect(r1.ok).toBe(true);
    if (r1.ok) {
      expect(r1.tx.amount).toBe(1_000_000n);
      expect(r1.nextAllowedAt).toBe(1_060_000);
    }
    c.adv(20_000);
    expect(faucet.drip(addr)).toEqual({
      ok: false,
      code: 'rate-limited',
      retryAfterMs: 40_000,
      i18nKey: 'sandbox.error.rateLimited',
    });
    c.adv(40_000);
    expect(faucet.drip(addr).ok).toBe(true);
    chain.mine(3);
    expect(chain.getBalance(addr)).toBe(2_000_000n);
  });
  it('clock regression cannot bypass the limit', () => {
    const { c, faucet, addr } = setup();
    faucet.drip(addr);
    c.set(1);
    expect(faucet.drip(addr)).toMatchObject({ ok: false, code: 'rate-limited', retryAfterMs: 60_000 });
  });
  it('lifetime cap and reset', () => {
    const { c, faucet, addr } = setup({ dripAmount: 5n, cooldownMs: 1000, maxDripsPerAddress: 2 });
    faucet.drip(addr);
    c.adv(1000);
    faucet.drip(addr);
    c.adv(1000);
    expect(faucet.drip(addr)).toEqual({
      ok: false,
      code: 'lifetime-limit',
      i18nKey: 'sandbox.error.lifetimeLimit',
    });
    faucet.reset();
    expect(faucet.drip(addr).ok).toBe(true);
  });
  it('limits are per address', () => {
    const { chain, faucet, addr } = setup();
    const other = chain.createAccount();
    faucet.drip(addr);
    expect(faucet.drip(other).ok).toBe(true);
  });
  it('rejects malformed/unknown addresses and bad config', () => {
    const { faucet } = setup();
    expect(code(() => faucet.drip('bc1q'))).toBe('invalid-address');
    expect(code(() => faucet.drip('test1' + '22'.repeat(16)))).toBe('unknown-account');
    const c = manualClock().clock;
    const chain = new MockChain({ rng: seededRng(), clock: c });
    for (const bad of [
      { ...DEFAULT_FAUCET_CONFIG, cooldownMs: 999 },
      { ...DEFAULT_FAUCET_CONFIG, maxDripsPerAddress: 0 },
      { ...DEFAULT_FAUCET_CONFIG, maxDripsPerAddress: 1001 },
    ])
      expect(code(() => new MockFaucet(chain, c, bad))).toBe('invalid-option');
    expect(code(() => new MockFaucet(chain, c, { ...DEFAULT_FAUCET_CONFIG, dripAmount: 0n }))).toBe(
      'invalid-amount',
    );
  });
});

describe('faucet sources', () => {
  it('accepts plain https and marks untrusted', () => {
    const s = validateFaucetSource({ id: 'my-faucet', url: 'https://faucet.example.test/claim' });
    expect(s).toEqual({
      id: 'my-faucet',
      url: 'https://faucet.example.test/claim',
      host: 'faucet.example.test',
      trusted: false,
    });
  });
  it('rejects hostile urls', () => {
    const bad = [
      'http://a.example.test',
      'javascript:alert(1)',
      'https://user:pw@a.example.test',
      'https://u@a.example.test',
      'https://a.example.test/#frag',
      'https://a.example.test/ x',
      'https://a.example.test/\n',
      'not a url',
      'https://',
      'https://a.example.test/' + 'x'.repeat(2100),
      'data:text/html,hi',
      5,
    ];
    for (const url of bad)
      expect(code(() => validateFaucetSource({ id: 'x', url: url as string }))).toBe('invalid-faucet-source');
  });
  it('rejects bad ids', () => {
    for (const id of ['', 'A', '-x', 'x'.repeat(33), 5]) {
      expect(code(() => validateFaucetSource({ id: id as string, url: 'https://a.example.test' }))).toBe(
        'invalid-faucet-source',
      );
    }
  });
});

describe('buildFaucetGuidance', () => {
  const addr = 'test1' + 'cd'.repeat(16);
  it('with no sources uses noSource step and hardcodes no URL', () => {
    const g = buildFaucetGuidance(addr);
    expect(g.sources).toEqual([]);
    expect(g.steps.map((s) => s.key)).toContain('sandbox.faucet.step.noSource');
    expect(g.steps[0]).toEqual({ key: 'sandbox.faucet.step.copyAddress', params: { address: addr } });
    expect(JSON.stringify(g)).not.toMatch(/https?:/);
    expect(g.warningKeys).toContain('sandbox.faucet.warn.neverSeed');
  });
  it('with sources lists them as untrusted', () => {
    const g = buildFaucetGuidance(addr, [
      { id: 'one', url: 'https://one.example.test' },
      { id: 'two', url: 'https://two.example.test' },
    ]);
    expect(g.steps[1]).toEqual({ key: 'sandbox.faucet.step.openSource', params: { count: '2' } });
    expect(g.sources.every((s) => !s.trusted)).toBe(true);
  });
  it('rejects bad address, duplicates, too many', () => {
    expect(code(() => buildFaucetGuidance('bc1q'))).toBe('invalid-address');
    const s = { id: 'one', url: 'https://one.example.test' };
    expect(code(() => buildFaucetGuidance(addr, [s, s]))).toBe('invalid-faucet-source');
    const many = Array.from({ length: 11 }, (_, i) => ({ id: `s${i}`, url: 'https://a.example.test' }));
    expect(code(() => buildFaucetGuidance(addr, many))).toBe('invalid-faucet-source');
  });
});
