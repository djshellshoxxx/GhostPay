import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, deltaE, type Cvd } from './qrContrast';
import { QR_KIND_ORDER, QR_KINDS, QR_PALETTE_DARK, QR_PALETTE_LIGHT, kindForPayload, qrKindClass, type QrPalette } from './qrKinds';

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
  it('maps payloads to kinds; secret is never downgraded', () => {
    expect(kindForPayload('keystore-backup')).toBe('secret');
    expect(kindForPayload('keystore-backup', { testnet: true })).toBe('secret');
    expect(kindForPayload('invoice-link')).toBe('shareable');
    expect(kindForPayload('invoice-link', { testnet: true })).toBe('caution');
    expect(kindForPayload('payment-request', { unsigned: true })).toBe('caution');
    expect(kindForPayload('receipt', { unverified: true })).toBe('caution');
    expect(kindForPayload('invoice-link-with-key')).toBe('bearer');
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
