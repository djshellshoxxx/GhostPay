import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { UxFeesError } from './errors.js';
import { buildFeePrivacyPreview, DEFAULT_FEE_SCHEDULE, type FeePreviewInput } from './preview.js';

const USDC = { id: 'usdc', symbol: 'USDC', decimals: 6 };
const ETH = { id: 'native:ETH', symbol: 'ETH', decimals: 18 };
const RCP = '0x1111111111111111111111111111111111111111';

const base = (over: Partial<FeePreviewInput> = {}): FeePreviewInput => ({
  route: 'router',
  asset: USDC,
  amount: 100_000_000n,
  amountMode: 'gross',
  feeSchedule: DEFAULT_FEE_SCHEDULE,
  feeRecipient: RCP,
  recipientFromSignedManifest: true,
  privacy: { usesStealthAddress: true, sweepMode: 'self', timingJitter: true },
  ...over,
});
const keys = (l: readonly { key: string }[]): string[] => l.map((m) => m.key);
const wkeys = (p: ReturnType<typeof buildFeePrivacyPreview>): string[] =>
  p.warnings.map((w) => w.message.key);

describe('defaults vs documents (drift guard)', () => {
  it('matches docs/FEE_SCHEDULE.md and chain-adapters constants (text check only, no import)', () => {
    const doc = readFileSync(new URL('../../../docs/FEE_SCHEDULE.md', import.meta.url), 'utf8');
    expect(doc).toContain('**25 bps (0.25 %)**');
    expect(doc).toContain('capped at 300 bps');
    expect(doc).toContain('50 bps');
    const src = readFileSync(new URL('../../chain-adapters/src/fees.ts', import.meta.url), 'utf8');
    expect(src).toContain('ROUTER_FEE_BPS: 25n');
    expect(src).toContain('SPONSOR_CAP_BPS: 300n');
    expect(src).toContain('SPONSOR_MIN_BPS: 50n');
    expect(src).toContain('SPONSOR_GAS_NUM: 110n');
    expect(src).toContain('SPONSOR_GAS_DEN: 100n');
    expect(DEFAULT_FEE_SCHEDULE).toEqual({
      routerFeeBps: 25,
      sponsorMinBps: 50,
      sponsorCapBps: 300,
      sponsorGasNum: 110,
      sponsorGasDen: 100,
    });
    expect(Object.isFrozen(DEFAULT_FEE_SCHEDULE)).toBe(true);
  });
});

describe('buildFeePrivacyPreview router, gross mode', () => {
  it('100 USDC: 0.25 fee, 99.75 received, itemised and totalled', () => {
    const p = buildFeePrivacyPreview(base());
    expect(p.canProceed).toBe(true);
    expect(p.gross).toBe(100_000_000n);
    expect(p.ghostPayFeeNow).toBe(250_000n);
    expect(p.recipientReceives).toBe(99_750_000n);
    expect(p.lines).toHaveLength(1);
    const l = p.lines[0];
    expect(l?.id).toBe('F-PAY');
    expect(l?.display).toBe('0.25');
    expect(l?.bps).toBe(25);
    expect(l?.bearer).toBe('recipient');
    expect(l?.recipient).toBe(RCP);
    expect(p.payerTotals).toEqual([
      { assetId: 'usdc', symbol: 'USDC', decimals: 6, amount: 100_000_000n, display: '100' },
    ]);
    expect(p.disclosure[0]).toEqual({
      key: 'fees.preview.disclosure.router',
      params: { pct: '0.25', recipient: '0x1111…1111' },
    });
    expect(keys(p.privacyNotes)).toEqual([
      'fees.preview.privacy.stealthHidesRecipient',
      'fees.preview.privacy.amountPublic',
      'fees.preview.privacy.routerEventPublic',
      'fees.preview.privacy.feeRecipientPublic',
      'fees.preview.privacy.selfSweepGasLink',
    ]);
  });

  it('dust boundary 399 / 400 matches the documented vectors', () => {
    const d = buildFeePrivacyPreview(base({ amount: 399n }));
    expect(d.ghostPayFeeNow).toBe(0n);
    expect(wkeys(d)).toContain('fees.preview.info.dustNoFee');
    expect(d.lines[0]?.amount).toBe(0n);
    const e = buildFeePrivacyPreview(base({ amount: 400n }));
    expect(e.ghostPayFeeNow).toBe(1n);
    expect(e.recipientReceives).toBe(399n);
    expect(wkeys(e)).not.toContain('fees.preview.info.dustNoFee');
  });

  it('adds network fee, buffer and flat fee into per-asset totals', () => {
    const p = buildFeePrivacyPreview(
      base({
        networkFee: { asset: ETH, amount: 3_600_000_000_000_000n },
        gasBuffer: { asset: ETH, amount: 1_000_000_000_000_000n },
        flatSecurityFee: { asset: USDC, amount: 3_000_000n },
      }),
    );
    expect(p.lines.map((l) => l.id)).toEqual(['F-PAY', 'NETWORK', 'BUFFER', 'F-SECURE']);
    expect(p.payerTotals).toEqual([
      { assetId: 'usdc', symbol: 'USDC', decimals: 6, amount: 103_000_000n, display: '103' },
      {
        assetId: 'native:ETH',
        symbol: 'ETH',
        decimals: 18,
        amount: 4_600_000_000_000_000n,
        display: '0.0046',
      },
    ]);
    expect(p.lines.find((l) => l.id === 'BUFFER')?.goesToGhostPay).toBe(false);
    expect(p.lines.find((l) => l.id === 'F-SECURE')?.goesToGhostPay).toBe(true);
    expect(keys(p.privacyNotes)).toContain('fees.preview.privacy.bufferVisible');
  });

  it('native payment merges network fee into the same asset total and warns when gas is huge', () => {
    const p = buildFeePrivacyPreview(
      base({ asset: ETH, amount: 10n ** 16n, networkFee: { asset: ETH, amount: 2n * 10n ** 15n } }),
    );
    expect(p.payerTotals).toEqual([
      { assetId: 'native:ETH', symbol: 'ETH', decimals: 18, amount: 12n * 10n ** 15n, display: '0.012' },
    ]);
    expect(wkeys(p)).toContain('fees.preview.warn.networkFeeLargeVsAmount');
  });

  it('sponsored sweep fee is disclosed as a later, capped, recipient-borne line', () => {
    const p = buildFeePrivacyPreview(
      base({
        privacy: { usesStealthAddress: true, sweepMode: 'sponsored', timingJitter: true },
        sponsoredSweep: { expectedAmount: 100_000_000n, gasReimbursementTokenUnits: 400_000n },
      }),
    );
    const l = p.lines.find((x) => x.id === 'F-SPONSOR');
    // gas 400000*110/100 = 440000; min 50 bps = 500000; cap 300 bps = 3_000_000 -> fee 500000
    expect(l?.amount).toBe(500_000n);
    expect(l?.maxAmount).toBe(3_000_000n);
    expect(l?.phase).toBe('later');
    expect(l?.bearer).toBe('recipient');
    expect(p.payerTotals[0]?.amount).toBe(100_000_000n);
    expect(keys(p.privacyNotes)).toContain('fees.preview.privacy.sponsoredRelayerSees');
    const capped = buildFeePrivacyPreview(
      base({
        privacy: { usesStealthAddress: true, sweepMode: 'sponsored', timingJitter: true },
        sponsoredSweep: { expectedAmount: 100_000_000n, gasReimbursementTokenUnits: 50_000_000n },
      }),
    );
    expect(capped.lines.find((x) => x.id === 'F-SPONSOR')?.amount).toBe(3_000_000n);
    const gasDominated = buildFeePrivacyPreview(
      base({
        privacy: { usesStealthAddress: true, sweepMode: 'sponsored', timingJitter: true },
        sponsoredSweep: { expectedAmount: 100_000_000n, gasReimbursementTokenUnits: 1_000_000n },
      }),
    );
    expect(gasDominated.lines.find((x) => x.id === 'F-SPONSOR')?.amount).toBe(1_100_000n);
    // not shown when sweeping by self
    expect(
      buildFeePrivacyPreview(
        base({ sponsoredSweep: { expectedAmount: 100n, gasReimbursementTokenUnits: 1n } }),
      ).lines.some((x) => x.id === 'F-SPONSOR'),
    ).toBe(false);
  });
});

describe('buildFeePrivacyPreview net mode', () => {
  it('payer adds the fee: recipient gets at least the requested amount', () => {
    const p = buildFeePrivacyPreview(base({ amountMode: 'net', amount: 99_750_000n }));
    // floor rounding: gross 99_999_999 -> fee 249_999 (not 250_000), net exactly 99_750_000
    expect(p.gross).toBe(99_999_999n);
    expect(p.ghostPayFeeNow).toBe(249_999n);
    expect(p.recipientReceives).toBe(99_750_000n);
    expect(p.lines[0]?.bearer).toBe('payer');
  });

  it('floor rounding may deliver one base unit extra and says so', () => {
    // net=399 -> gross 399 (fee 0) ; net=400 -> gross 401: 401-1=400
    expect(buildFeePrivacyPreview(base({ amountMode: 'net', amount: 399n })).gross).toBe(399n);
    const p = buildFeePrivacyPreview(base({ amountMode: 'net', amount: 400n }));
    expect(p.gross).toBe(401n);
    expect(p.recipientReceives).toBe(400n);
    // net = 10_000 base units: gross = ceil(10_000*10000/9975)=10_026 ; fee floor(10026*25/10000)=25 -> net 10_001? check minimality
    const q = buildFeePrivacyPreview(base({ amountMode: 'net', amount: 7_960n }));
    expect(q.recipientReceives >= 7_960n).toBe(true);
    expect(q.gross - 1n - ((q.gross - 1n) * 25n) / 10_000n < 7_960n).toBe(true);
  });

  it('property: fee + receives == gross and gross is minimal for net mode', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 10n ** 24n }), fc.integer({ min: 0, max: 1000 }), (net, bps) => {
        const p = buildFeePrivacyPreview(
          base({
            amountMode: 'net',
            amount: net,
            feeSchedule: { ...DEFAULT_FEE_SCHEDULE, routerFeeBps: bps },
          }),
        );
        expect(p.ghostPayFeeNow + p.recipientReceives).toBe(p.gross);
        expect(p.recipientReceives >= net).toBe(true);
        expect(p.recipientReceives - net <= 1n).toBe(true);
        const g1 = p.gross - 1n;
        expect(g1 - (g1 * BigInt(bps)) / 10_000n < net).toBe(true);
      }),
    );
  });

  it('property: gross mode split matches floor formula', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 10n ** 30n }), (gross) => {
        const p = buildFeePrivacyPreview(base({ amount: gross }));
        expect(p.ghostPayFeeNow).toBe((gross * 25n) / 10_000n);
        expect(p.ghostPayFeeNow + p.recipientReceives).toBe(gross);
      }),
    );
  });
});

describe('buildFeePrivacyPreview routes and fail-closed paths', () => {
  it('direct payment has no GhostPay fee line and says so', () => {
    const p = buildFeePrivacyPreview(
      base({ route: 'direct', feeRecipient: undefined as never, gasBuffer: { asset: ETH, amount: 5n } }),
    );
    expect(p.lines).toHaveLength(0);
    expect(p.ghostPayFeeNow).toBe(0n);
    expect(p.recipientReceives).toBe(100_000_000n);
    expect(keys(p.disclosure)).toEqual(['fees.preview.disclosure.directNoFee']);
    expect(wkeys(p)).toContain('fees.preview.warn.bufferNeedsRouter');
    expect(keys(p.privacyNotes)).not.toContain('fees.preview.privacy.routerEventPublic');
    expect(p.canProceed).toBe(true);
  });

  it('not_enforceable shows a disclosure instead of a fake fee; not_deployed blocks', () => {
    const ne = buildFeePrivacyPreview(base({ checkoutStatus: 'not_enforceable' }));
    expect(ne.lines).toHaveLength(0);
    expect(keys(ne.disclosure)).toEqual(['fees.preview.disclosure.notEnforceableHere']);
    const nd = buildFeePrivacyPreview(base({ checkoutStatus: 'not_deployed' }));
    expect(nd.canProceed).toBe(false);
    expect(wkeys(nd)).toContain('fees.preview.warn.checkoutNotDeployed');
  });

  it('blocks zero amount, bad / zero / unverified fee recipient', () => {
    expect(buildFeePrivacyPreview(base({ amount: 0n })).canProceed).toBe(false);
    for (const r of [undefined, '', '0x123', `0x${'0'.repeat(40)}`, `0x${'g'.repeat(40)}`, `${RCP}00`]) {
      const p = buildFeePrivacyPreview(base({ feeRecipient: r as never }));
      expect(p.canProceed, String(r)).toBe(false);
      expect(wkeys(p)).toContain('fees.preview.warn.feeRecipientInvalid');
      expect(p.lines[0]?.recipient).toBeUndefined();
    }
    const unv = buildFeePrivacyPreview(base({ recipientFromSignedManifest: false }));
    expect(unv.canProceed).toBe(false);
    expect(wkeys(unv)).toContain('fees.preview.warn.feeRecipientUnverified');
    expect(buildFeePrivacyPreview(base({ recipientFromSignedManifest: undefined as never })).canProceed).toBe(
      false,
    );
  });

  it('a zero-bps schedule needs no recipient', () => {
    const p = buildFeePrivacyPreview(
      base({ feeSchedule: { ...DEFAULT_FEE_SCHEDULE, routerFeeBps: 0 }, feeRecipient: undefined as never }),
    );
    expect(p.canProceed).toBe(true);
    expect(p.lines).toHaveLength(0);
    expect(
      buildFeePrivacyPreview(
        base({ feeSchedule: { ...DEFAULT_FEE_SCHEDULE, routerFeeBps: 0 }, amountMode: 'net' }),
      ).gross,
    ).toBe(100_000_000n);
  });

  it('warns on non-default or high schedules', () => {
    const w = buildFeePrivacyPreview(base({ feeSchedule: { ...DEFAULT_FEE_SCHEDULE, routerFeeBps: 150 } }));
    expect(wkeys(w)).toEqual(
      expect.arrayContaining([
        'fees.preview.warn.scheduleDiffersFromDefault',
        'fees.preview.warn.feeUnusuallyHigh',
      ]),
    );
    const ok = buildFeePrivacyPreview(base({ feeSchedule: { ...DEFAULT_FEE_SCHEDULE, routerFeeBps: 50 } }));
    expect(wkeys(ok)).toEqual(['fees.preview.warn.scheduleDiffersFromDefault']);
  });

  it('privacy notes reflect a weak profile', () => {
    const p = buildFeePrivacyPreview(
      base({ privacy: { usesStealthAddress: false, sweepMode: 'self', timingJitter: false } }),
    );
    expect(keys(p.privacyNotes)).toEqual(
      expect.arrayContaining([
        'fees.preview.privacy.noStealthLinksRecipient',
        'fees.preview.privacy.enableJitter',
      ]),
    );
    expect(wkeys(p)).toContain('fees.preview.warn.noStealth');
    expect(p.canProceed).toBe(true);
  });

  it('blocks asset id collisions with different decimals', () => {
    const p = buildFeePrivacyPreview(base({ networkFee: { asset: { ...ETH, id: 'usdc' }, amount: 5n } }));
    expect(p.canProceed).toBe(false);
    expect(wkeys(p)).toContain('fees.preview.warn.assetMismatch');
  });

  it('throws on structurally invalid input', () => {
    const t = (o: Partial<FeePreviewInput>): void => {
      expect(() => buildFeePrivacyPreview(base(o))).toThrow(UxFeesError);
    };
    t({ asset: { ...USDC, symbol: 'US DC' } });
    t({ asset: { ...USDC, symbol: '<b>' } });
    t({ asset: { ...USDC, symbol: '' } });
    t({ asset: { ...USDC, id: 'a b' } });
    t({ asset: { ...USDC, decimals: 37 } });
    t({ asset: null as never });
    t({ amount: -1n });
    t({ amount: 1 as never });
    t({ amount: 1n << 201n });
    t({ route: 'x' as never });
    t({ amountMode: 'x' as never });
    t({ checkoutStatus: 'x' as never });
    t({ feeSchedule: { ...DEFAULT_FEE_SCHEDULE, routerFeeBps: 1001 } });
    t({ feeSchedule: { ...DEFAULT_FEE_SCHEDULE, routerFeeBps: 0.5 } });
    t({ feeSchedule: { ...DEFAULT_FEE_SCHEDULE, sponsorCapBps: 0 } });
    t({ feeSchedule: { ...DEFAULT_FEE_SCHEDULE, sponsorMinBps: -1 } });
    t({ feeSchedule: { ...DEFAULT_FEE_SCHEDULE, sponsorGasNum: 0 } });
    t({ feeSchedule: { ...DEFAULT_FEE_SCHEDULE, sponsorGasDen: 0 } });
    t({ networkFee: { asset: ETH, amount: -1n } });
    t({ gasBuffer: { asset: { ...ETH, symbol: 'E!' }, amount: 1n } });
    t({ flatSecurityFee: { asset: USDC, amount: -1n } });
    t({ sponsoredSweep: { expectedAmount: -1n, gasReimbursementTokenUnits: 0n } });
    t({ sponsoredSweep: { expectedAmount: 1n, gasReimbursementTokenUnits: -1n } });
  });
});
