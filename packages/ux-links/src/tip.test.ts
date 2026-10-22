import { describe, expect, it } from 'vitest';
import { buildTipPageModel, tipUri, type TipConfig } from './tip.js';
import { code, META_A, NOW } from './fixtures.testutil.js';

const cfg: TipConfig = {
  title: 'Support my work',
  description: 'Thanks for reading',
  handle: '@Alice',
  target: META_A,
  asset: 'USDC',
  decimals: 6,
  chainId: 1,
  suggested: ['1', '5', '10.5'],
  minAmount: '0.5',
  maxAmount: '100',
  goal: { target: '200', deadline: NOW + 86400, label: 'New mic' },
};

describe('tip page', () => {
  it('computes model with exact goal math', () => {
    const m = buildTipPageModel(cfg, { raised: '50.25' }, NOW);
    expect(m.handle).toBe('alice');
    expect(m.presets.map((p) => p.amount)).toEqual(['1', '5', '10.5']);
    expect(m.presets[0]!.uri).toBe(`ghostpay:${META_A}?amount=1&asset=USDC&chain=1`);
    expect(m.custom).toEqual({ min: '0.5', max: '100' });
    expect(m.goal).toEqual({
      label: 'New mic',
      target: '200',
      raised: '50.25',
      remaining: '149.75',
      percent: 25,
      reached: false,
      overBy: '0',
      secondsRemaining: 86400,
      closed: false,
    });
  });
  it('floors percent, handles reached/over/closed', () => {
    expect(buildTipPageModel(cfg, { raised: '199.999999' }, NOW).goal!.percent).toBe(99);
    const hit = buildTipPageModel(cfg, { raised: '200' }, NOW + 86400).goal!;
    expect(hit).toMatchObject({
      percent: 100,
      reached: true,
      remaining: '0',
      overBy: '0',
      closed: true,
      secondsRemaining: 0,
    });
    expect(buildTipPageModel(cfg, { raised: '250.5' }, NOW).goal).toMatchObject({
      percent: 100,
      overBy: '50.5',
      remaining: '0',
    });
    expect(buildTipPageModel(cfg, { raised: '0' }, NOW).goal!.percent).toBe(0);
  });
  it('minimal config and defaults', () => {
    const m = buildTipPageModel(
      { title: 'Tips', target: META_A, asset: 'ETH', decimals: 18, suggested: ['0.001'] },
      { raised: '0' },
      NOW,
    );
    expect(m).toMatchObject({
      description: null,
      handle: null,
      chainId: null,
      goal: null,
      custom: { min: '0.000000000000000001', max: null },
    });
    const g = buildTipPageModel({ ...cfg, goal: { target: '10' } }, { raised: '1' }, NOW).goal!;
    expect(g).toMatchObject({ label: null, secondsRemaining: null, closed: false });
  });
  it('has no tracking-shaped fields', () => {
    const m = buildTipPageModel(cfg, { raised: '1' }, NOW);
    const keys = JSON.stringify(m);
    for (const k of ['analytics', 'track', 'pixel', 'session', 'ip', 'referrer', 'cookie'])
      expect(keys.toLowerCase()).not.toContain(`"${k}`);
  });
  it('rejects invalid config', () => {
    const bad: [Partial<TipConfig> | Record<string, unknown>, string][] = [
      [{ suggested: [] }, 'TIP'],
      [{ suggested: ['1', '1'] }, 'TIP'],
      [{ suggested: ['5', '1'] }, 'TIP'],
      [{ suggested: ['0.1'] }, 'TIP'],
      [{ suggested: ['101'] }, 'TIP'],
      [{ suggested: ['1', '2', '3', '4', '5', '6', '7'] }, 'TIP'],
      [{ suggested: 'x' }, 'TIP'],
      [{ suggested: ['1.50'] }, 'AMOUNT'],
      [{ maxAmount: '0.1' }, 'TIP'],
      [{ minAmount: '0' }, 'AMOUNT'],
      [{ decimals: 19 }, 'TIP'],
      [{ decimals: 'x' }, 'TIP'],
      [{ title: '' }, 'TEXT'],
      [{ title: 'a‮b' }, 'TEXT'],
      [{ description: 'x'.repeat(501) }, 'TEXT'],
      [{ handle: 'аlice' }, 'HANDLE'],
      [{ target: 'x' }, 'TARGET'],
      [{ asset: 'x' }, 'PARAM'],
      [{ chainId: 0 }, 'TIP'],
      [{ extra: 1 }, 'TIP'],
      [{ goal: { target: '0' } }, 'AMOUNT'],
      [{ goal: { target: '10', deadline: -1 } }, 'TIP'],
      [{ goal: { target: '10', x: 1 } }, 'TIP'],
      [{ goal: { target: '10', label: '' } }, 'TEXT'],
    ];
    for (const [o, c] of bad)
      expect(
        code(() => buildTipPageModel({ ...cfg, ...o }, { raised: '1' }, NOW)),
        JSON.stringify(o),
      ).toBe(c);
    expect(code(() => buildTipPageModel(cfg, { raised: '-1' }, NOW))).toBe('AMOUNT');
    expect(code(() => buildTipPageModel(cfg, { raised: '1' }, -1))).toBe('TIP');
    expect(code(() => buildTipPageModel(null as unknown as TipConfig, { raised: '1' }, NOW))).toBe('TIP');
  });
  it('tipUri enforces range', () => {
    const m = buildTipPageModel(cfg, { raised: '1' }, NOW);
    expect(tipUri(m, '7.25')).toBe(`ghostpay:${META_A}?amount=7.25&asset=USDC&chain=1`);
    expect(tipUri(m, '100')).toContain('amount=100');
    expect(tipUri(m, '0.5')).toContain('amount=0.5');
    for (const a of ['0.4', '100.01', '1e2', '-1']) expect(code(() => tipUri(m, a))).toBeDefined();
    expect(code(() => tipUri(m, '0.4'))).toBe('TIP');
    const open = buildTipPageModel(
      { ...cfg, maxAmount: undefined, chainId: undefined } as unknown as TipConfig,
      { raised: '1' },
      NOW,
    );
    expect(tipUri(open, '1000000')).toBe(`ghostpay:${META_A}?amount=1000000&asset=USDC`);
  });
});
