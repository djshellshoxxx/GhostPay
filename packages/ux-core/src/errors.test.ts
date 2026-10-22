import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  ADAPTER_CODES,
  APP_CODES,
  CRYPTO_CODES,
  INVOICE_CODES,
  codeOf,
  diagnostics,
  isKnownCode,
  listCodes,
  recover,
  retryLine,
  type GuidanceContext,
} from './errors.js';

const ctx: GuidanceContext = { view: 'pay', hasRpc: true, hasRelayer: true, online: true };

function unionOf(rel: string, typeName: string): string[] {
  const src = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  const m = new RegExp(`export type ${typeName} =([^;]+);`).exec(src);
  if (m?.[1] === undefined) throw new Error('union not found ' + typeName);
  return [...m[1].matchAll(/'([A-Z_0-9]+)'/g)].map((x) => x[1] as string);
}

describe('catalog coverage (UXERR-1, T-1)', () => {
  it('mirrors the real code unions exactly', () => {
    expect([...INVOICE_CODES].sort()).toEqual(
      unionOf('../../invoice-schema/src/errors.ts', 'InvoiceErrorCode').sort(),
    );
    expect([...ADAPTER_CODES].sort()).toEqual(
      unionOf('../../chain-adapters/src/errors.ts', 'AdapterErrorCode').sort(),
    );
    expect([...CRYPTO_CODES].sort()).toEqual(
      unionOf('../../core-crypto/src/errors.ts', 'CryptoErrorCode').sort(),
    );
  });
  it('every code has summary and at least one step', () => {
    const all = [...INVOICE_CODES, ...ADAPTER_CODES, ...CRYPTO_CODES, ...APP_CODES];
    expect(new Set(all).size).toBe(all.length);
    expect(listCodes()).toEqual([...all].sort());
    for (const c of all) {
      const g = recover(c, ctx);
      expect(g.code).toBe(c);
      expect(g.summary.length).toBeGreaterThan(5);
      expect(g.steps.length).toBeGreaterThanOrEqual(1);
      expect(g.docAnchor).toMatch(/^[a-z-]+$/);
      expect(isKnownCode(c)).toBe(true);
    }
  });
});

describe('recover', () => {
  it('T-3 first step names Settings when no RPC', () => {
    const g = recover('RPC_UNREACHABLE', { ...ctx, hasRpc: false });
    expect(g.steps[0]?.action).toBe('open-settings-rpc');
    expect(g.steps[0]?.text).toContain('Settings');
  });
  it('offline puts go-online first, ahead of add-RPC', () => {
    const g = recover('RPC_FAILURE', { ...ctx, online: false, hasRpc: false });
    expect(g.steps[0]?.key).toBe('step.goOnline');
  });
  it('steps are de-duplicated', () => {
    const g = recover('NO_RPC', { ...ctx, hasRpc: false });
    const keys = g.steps.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys[0]).toBe('step.addRpc');
  });
  it('relayer missing adds relayer step first', () => {
    expect(recover('RELAYER_UNREACHABLE', { ...ctx, hasRelayer: false }).steps[0]?.action).toBe(
      'open-settings-relayer',
    );
  });
  it('T-4 unknown code returns generic with the three universal steps', () => {
    for (const bad of [
      'NOPE',
      '',
      '__proto__',
      'constructor',
      'toString',
      'hasOwnProperty',
      'A'.repeat(500),
      '0xabc',
    ]) {
      const g = recover(bad, ctx);
      expect(g.code).toBe('UNKNOWN');
      expect(g.steps.map((s) => s.key)).toEqual(['step.checkRpc', 'step.reload', 'step.docs']);
    }
  });
  it('non-string code is generic, not a throw', () => {
    expect(recover(undefined as unknown as string, ctx).code).toBe('UNKNOWN');
  });
  it('UXERR-3 retrySafe rules', () => {
    expect(recover('INVALID_AMOUNT', ctx).retrySafe).toBe('unknown');
    expect(recover('INVALID_AMOUNT', { ...ctx, phase: 'prepare' }).retrySafe).toBe('yes');
    expect(recover('INVALID_AMOUNT', { ...ctx, phase: 'sign' }).retrySafe).toBe('no');
    expect(recover('RPC_FAILURE', { ...ctx, phase: 'prepare' }).retrySafe).toBe('unknown');
    expect(recover('SIGNING_FAILED', { ...ctx, phase: 'prepare' }).retrySafe).toBe('no');
    expect(recover('FOO', { ...ctx, phase: 'broadcast' }).retrySafe).toBe('no');
  });
  it('retryLine only claims nothing was sent when yes', () => {
    expect(retryLine(recover('SCHEMA', { ...ctx, phase: 'prepare' }))).toContain('Nothing was sent');
    expect(retryLine(recover('SCHEMA', ctx))).not.toContain('Nothing was sent');
    expect(retryLine(recover('SIGNING_FAILED', ctx))).not.toContain('Nothing was sent');
  });
  it('is deterministic', () => {
    expect(recover('DECRYPT', ctx)).toEqual(recover('DECRYPT', ctx));
  });
  it('T-2 property: no address or URL in any output', () => {
    const codes = fc.oneof(fc.constantFrom(...listCodes()), fc.string(), fc.constant('0x' + 'a'.repeat(40)));
    fc.assert(
      fc.property(
        codes,
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.constantFrom('prepare', 'sign', 'broadcast', 'unknown'),
        (c, a, b, d, phase) => {
          const g = recover(c, { view: 'other', hasRpc: a, hasRelayer: b, online: d, phase });
          const text = JSON.stringify(g);
          expect(text).not.toMatch(/0x[0-9a-fA-F]{40}/);
          expect(text).not.toMatch(/https?:\/\//);
          expect(text).not.toContain(c.length > 40 ? c : '\u0000');
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('codeOf / diagnostics', () => {
  it('extracts only well-formed codes', () => {
    expect(codeOf({ code: 'RPC_FAILURE', message: 'https://secret' })).toBe('RPC_FAILURE');
    expect(codeOf({ code: 'bad code with https://x' })).toBe('UNKNOWN');
    expect(codeOf({ code: 5 })).toBe('UNKNOWN');
    expect(codeOf(null)).toBe('UNKNOWN');
    expect(codeOf('str')).toBe('UNKNOWN');
    expect(
      codeOf({
        get code(): string {
          throw new Error('x');
        },
      }),
    ).toBe('UNKNOWN');
  });
  it('diagnostics holds only code and version', () => {
    expect(diagnostics('DECRYPT', '1.2.3')).toBe('GhostPay diagnostics\ncode: DECRYPT\nversion: 1.2.3');
    expect(diagnostics('0xabc https://x', 'v1 https://evil')).toBe(
      'GhostPay diagnostics\ncode: UNKNOWN\nversion: unknown',
    );
    expect(diagnostics(5 as unknown as string, 5 as unknown as string)).toContain('UNKNOWN');
  });
});
