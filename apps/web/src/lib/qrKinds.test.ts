import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { contrastRatio, deltaE, type Cvd } from './qrContrast';
import { MAX_PRINT_QR_LINK_CHARS, printQrPolicy, QR_KIND_ORDER, QR_KINDS, QR_PALETTE_DARK, QR_PALETTE_LIGHT, kindForPayload, qrKindClass, type QrKind, type QrPalette, type QrPayloadType } from './qrKinds';

const css = readFileSync(new URL('../styles/qr.css', import.meta.url), 'utf8');

describe('taxonomy', () => {
  it('table snapshot', () => {
    const rows = QR_KIND_ORDER.map((k) => {
      const i = QR_KINDS[k];
      return `${k} | ${i.color} | ${i.border} | ${i.icon} | ${i.label} | reveal=${String(i.rules.revealRequired)} hide=${String(i.rules.autoHideSeconds)} copy=${String(i.rules.allowCopyText)} dl=${String(i.rules.allowDownload)} print=${String(i.rules.printByDefault)}`;
    });
    expect(rows).toMatchInlineSnapshot(`
      [
        "secret | red | solid-thick | lock | SECRET | reveal=true hide=60 copy=false dl=false print=false",
        "shareable | green | solid | share | SHARE | reveal=false hide=null copy=true dl=true print=true",
        "bearer | orange | dashed | key | PRIVATE LINK | reveal=false hide=null copy=true dl=true print=false",
        "device | blue | double | devices | MY DEVICES | reveal=false hide=null copy=true dl=true print=false",
        "proof | purple | dotted | check-doc | PROOF | reveal=false hide=null copy=true dl=true print=true",
        "caution | yellow | hazard | warning | CAUTION | reveal=false hide=null copy=true dl=true print=false",
      ]
    `);
  });
  it('every kind has a unique colour, border, icon and label (colour is never the only cue)', () => {
    for (const f of ['color', 'border', 'icon', 'label'] as const) {
      expect(new Set(QR_KIND_ORDER.map((k) => QR_KINDS[k][f])).size).toBe(QR_KIND_ORDER.length);
    }
    expect(qrKindClass('proof')).toBe('qr-kind-proof');
  });
  it('rejects unknown runtime payload types before choosing handling warnings', () => {
    for (const raw of ['unknown', '', '__proto__', 'constructor', 'toString']) {
      const type = raw as Parameters<typeof kindForPayload>[0];
      expect(() => kindForPayload(type)).toThrow('unknown QR payload type');
      expect(() => kindForPayload(type, { unverified: true })).toThrow('unknown QR payload type');
    }
  });
  it('rejects unknown frame kinds instead of generating arbitrary CSS classes', () => {
    for (const raw of ['unknown', '__proto__', 'constructor']) {
      expect(() => qrKindClass(raw as Parameters<typeof qrKindClass>[0])).toThrow('unknown QR kind');
    }
  });
  const runtimeClassifiers = [
    ['payload', (value: unknown) => kindForPayload(value as QrPayloadType), 'spend-key', 'invoice-link', 'unknown QR payload type'],
    ['unverified payload', (value: unknown) => kindForPayload(value as QrPayloadType, { unverified: true }), 'spend-key', 'invoice-link', 'unknown QR payload type'],
    ['frame', (value: unknown) => qrKindClass(value as QrKind), 'secret', 'shareable', 'unknown QR kind'],
  ] as const;
  it.each(runtimeClassifiers)('rejects non-string %s inputs with the fixed error', (_name, classify, knownKey, _otherKey, message) => {
    const inputs: unknown[] = [
      undefined, null, false, true, 0, 1, NaN, Infinity, 1n, Symbol(knownKey),
      [], [knownKey], {}, { 0: knownKey, length: 1 }, new String(knownKey),
    ];
    for (const input of inputs) {
      expect(() => classify(input)).toThrow(TypeError);
      expect(() => classify(input)).toThrow(new TypeError(message));
    }
  });
  it.each(runtimeClassifiers)('does not coerce a stateful %s key before rejecting it', (_name, classify, knownKey, otherKey, message) => {
    const coerce = vi.fn().mockReturnValueOnce(knownKey).mockReturnValue(otherKey);
    const input = { [Symbol.toPrimitive]: coerce };
    expect(() => classify(input)).toThrow(TypeError);
    expect(() => classify(input)).toThrow(new TypeError(message));
    expect(coerce).not.toHaveBeenCalled();
  });
  it.each(runtimeClassifiers)('does not inspect a hostile %s coercion hook', (_name, classify, _knownKey, _otherKey, message) => {
    const inspect = vi.fn(() => { throw new Error('private input must not escape'); });
    const input = Object.defineProperty({}, Symbol.toPrimitive, { get: inspect });
    expect(() => classify(input)).toThrow(TypeError);
    expect(() => classify(input)).toThrow(new TypeError(message));
    expect(inspect).not.toHaveBeenCalled();
  });
  it('preserves every declared payload mapping, flag precedence and frame class', () => {
    const mappings: readonly (readonly [QrPayloadType, QrKind])[] = [
      ['keystore-backup', 'secret'], ['recovery-data', 'secret'], ['spend-key', 'secret'],
      ['invoice-link', 'shareable'], ['invoice-link-passphrase', 'shareable'],
      ['stealth-meta-address', 'shareable'], ['payment-request', 'shareable'], ['registry-entry', 'shareable'],
      ['invoice-link-with-key', 'bearer'], ['settings', 'device'], ['rpc-list', 'device'], ['pinned-signers', 'device'],
      ['receipt', 'proof'], ['payment-proof', 'proof'], ['signed-manifest', 'proof'], ['fingerprint', 'proof'],
    ];
    for (const [payload, kind] of mappings) {
      expect(kindForPayload(payload)).toBe(kind);
      for (const flags of [{ testnet: true }, { unsigned: true }, { unverified: true }, { testnet: true, unsigned: true, unverified: true }]) {
        expect(kindForPayload(payload, flags)).toBe(kind === 'secret' || kind === 'bearer' ? kind : 'caution');
      }
    }
    for (const kind of QR_KIND_ORDER) expect(qrKindClass(kind)).toBe(`qr-kind-${kind}`);
  });
  it('maps payloads to kinds; secret is never downgraded', () => {
    expect(kindForPayload('keystore-backup')).toBe('secret');
    expect(kindForPayload('keystore-backup', { testnet: true })).toBe('secret');
    expect(kindForPayload('invoice-link')).toBe('shareable');
    expect(kindForPayload('invoice-link', { testnet: true })).toBe('caution');
    expect(kindForPayload('payment-request', { unsigned: true })).toBe('caution');
    expect(kindForPayload('receipt', { unverified: true })).toBe('caution');
    expect(kindForPayload('invoice-link-with-key')).toBe('bearer');
    // A testnet or unverified marker must not hide that the QR itself carries a decryption key.
    // CAUTION lacks the bearer-capability warning shown by the PRIVATE LINK frame.
    expect(kindForPayload('invoice-link-with-key', { testnet: true })).toBe('bearer');
    expect(kindForPayload('invoice-link-with-key', { unsigned: true, unverified: true })).toBe('bearer');
    expect(kindForPayload('rpc-list')).toBe('device');
    expect(kindForPayload('signed-manifest')).toBe('proof');
  });
});

const MODES: readonly (readonly [string, QrPalette, string, string])[] = [
  ['light', QR_PALETTE_LIGHT, '#f7f8fa', '#ffffff'],
  ['dark', QR_PALETTE_DARK, '#0f1218', '#181c24'],
];

describe('palette', () => {
  it.each(MODES)('%s: frame colours reach 3:1 against page and surface; label text reaches 4.5:1', (_n, pal, bg, surface) => {
    for (const c of Object.values(pal)) {
      expect(contrastRatio(c.color, bg)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(c.color, surface)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(c.on, c.color)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('light-mode frames also contrast with the white QR quiet zone', () => {
    for (const c of Object.values(QR_PALETTE_LIGHT)) expect(contrastRatio(c.color, '#ffffff')).toBeGreaterThanOrEqual(3);
  });
  it('colours stay distinguishable under simulated colour-vision deficiency (secondary to the label, icon and border cues)', () => {
    const cvds: (Cvd | null)[] = [null, 'protanopia', 'deuteranopia', 'tritanopia'];
    for (const [, pal] of MODES) {
      const cols = Object.values(pal).map((c) => c.color);
      for (const cvd of cvds) {
        for (let i = 0; i < cols.length; i++) {
          for (let j = i + 1; j < cols.length; j++) {
            // Measured minimum is documented in docs/design/qr-colors.md; this floor catches regressions.
            expect(deltaE(cols[i] ?? '', cols[j] ?? '', cvd)).toBeGreaterThan(5);
          }
        }
      }
    }
  });
  it('qr.css tokens match the TypeScript palette (light and dark)', () => {
    const light = css.slice(0, css.indexOf('@media (prefers-color-scheme: dark)'));
    const dark = css.slice(css.indexOf(":root[data-theme='dark']"), css.indexOf('@media (prefers-contrast'));
    for (const [block, pal] of [[light, QR_PALETTE_LIGHT], [dark, QR_PALETTE_DARK]] as const) {
      for (const [name, c] of Object.entries(pal)) {
        expect(block).toContain(`--qr-${name}: ${c.color};`);
        expect(block).toContain(`--qr-${name}-on: ${c.on};`);
      }
    }
  });
  it('qr.css has no inline-style hazards, external URLs or forced-colors gap', () => {
    expect(css).not.toMatch(/url\(|@import|http/);
    expect(css).toContain('@media (forced-colors: active)');
    expect(css).toContain('@media (prefers-contrast: more)');
  });
});

describe('printQrPolicy', () => {
  it('prints a QR only for short links', () => {
    expect(printQrPolicy('x'.repeat(MAX_PRINT_QR_LINK_CHARS), true).includeQr).toBe(true);
    expect(printQrPolicy('x'.repeat(MAX_PRINT_QR_LINK_CHARS + 1), true).includeQr).toBe(false);
    expect(printQrPolicy(undefined, true).includeQr).toBe(false);
    expect(printQrPolicy('', true).includeQr).toBe(false);
  });
  it('warns about bearer links unless passphrase protected, and picks the frame kind', () => {
    expect(printQrPolicy('abc', false)).toEqual({ includeQr: true, kind: 'bearer', bearerWarning: true });
    expect(printQrPolicy('abc', true)).toEqual({ includeQr: true, kind: 'shareable', bearerWarning: false });
    expect(printQrPolicy(undefined, false).bearerWarning).toBe(false);
  });
});


describe('printQrPolicy runtime protection boundary', () => {
  it('does not treat truthy non-boolean values as proof that an invoice link is passphrase-protected', () => {
    const invalidFlags: readonly unknown[] = ['false', 'true', 1, -1, [], {}, ['true']];
    for (const value of invalidFlags) {
      expect(printQrPolicy('https://example.invalid/#gpi=v1.test', value as boolean)).toEqual({
        includeQr: true,
        kind: 'bearer',
        bearerWarning: true,
      });
    }
  });
  it('preserves existing true/false handling, limits and missing-link behavior', () => {
    const link = 'https://example.invalid/#gpi=v1.test';
    expect(printQrPolicy(link, true)).toEqual({ includeQr: true, kind: 'shareable', bearerWarning: false });
    expect(printQrPolicy(link, false)).toEqual({ includeQr: true, kind: 'bearer', bearerWarning: true });
    const falsyFlags: readonly unknown[] = [null, undefined, 0, '', NaN];
    for (const value of falsyFlags) {
      expect(printQrPolicy(link, value as boolean)).toEqual({ includeQr: true, kind: 'bearer', bearerWarning: true });
      expect(printQrPolicy(undefined, value as boolean)).toEqual({ includeQr: false, kind: 'bearer', bearerWarning: false });
    }
    expect(printQrPolicy('x'.repeat(MAX_PRINT_QR_LINK_CHARS), false).includeQr).toBe(true);
    expect(printQrPolicy('x'.repeat(MAX_PRINT_QR_LINK_CHARS + 1), false)).toEqual({
      includeQr: false,
      kind: 'bearer',
      bearerWarning: true,
    });
  });
});
