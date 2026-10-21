import { inspect } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import {
  GhostPayCryptoError,
  deriveStealthPayment,
  deriveStealthSecret,
  encodeMetaAddress,
  generateKeySet,
  secretScalarFromBytes,
  unsafeRevealSecret,
} from './index.js';
import { seededRng } from './rng.testutil.js';

describe('secret redaction', () => {
  const keys = generateKeySet(seededRng('secrets'));
  const spendHex = Buffer.from(unsafeRevealSecret(keys.spendingSecret)).toString('hex');
  const viewHex = Buffer.from(unsafeRevealSecret(keys.viewingSecret)).toString('hex');

  it('throws on JSON.stringify, String, template, concat, inspect, toLocaleString, valueOf-free paths', () => {
    for (const s of [keys.spendingSecret, keys.viewingSecret]) {
      expect(() => JSON.stringify(s)).toThrow(TypeError);
      expect(() => JSON.stringify({ nested: { s } })).toThrow(TypeError);
      expect(() => String(s)).toThrow(TypeError);
      expect(() => `${s as unknown as string}`).toThrow(TypeError);
      expect(() => (s as unknown as string) + '').toThrow(TypeError);
      expect(() => s.toString()).toThrow(TypeError);
      expect(() => s.toLocaleString()).toThrow(TypeError);
      expect(() => inspect(s)).toThrow(TypeError);
    }
  });

  it('a whole key set cannot be serialized', () => {
    expect(() => JSON.stringify(keys)).toThrow(TypeError);
    expect(() => inspect(keys)).toThrow(TypeError);
  });

  it('console.log of a secret throws instead of printing it', () => {
    const out: string[] = [];
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
        out.push(args.map((a) => inspect(a)).join(' '));
      }),
    );
    try {
      expect(() => console.log(keys.spendingSecret)).toThrow(TypeError);
      expect(() => console.log({ keys })).toThrow(TypeError);
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
    expect(out.join('\n')).not.toContain(spendHex);
    expect(out.join('\n')).not.toContain(viewHex);
  });

  it('secrets survive typed-array-derived views only as plain arrays (species)', () => {
    const sub = keys.spendingSecret.subarray(0, 4);
    expect(sub.constructor).toBe(Uint8Array);
    expect(() => JSON.stringify(Array.from(sub))).not.toThrow();
  });

  it('error messages and serialized errors never contain key material', () => {
    const msgs: string[] = [];
    const attempts: Array<() => unknown> = [
      () => secretScalarFromBytes(new Uint8Array(32)),
      () => secretScalarFromBytes(new Uint8Array(32).fill(0xff)),
      () => deriveStealthPayment(`st:eth:0x${spendHex}${viewHex}`, seededRng('x')),
      () => {
        const pay = deriveStealthPayment(encodeMetaAddress(keys), seededRng('y'));
        const other = generateKeySet(seededRng('z'));
        return deriveStealthSecret(
          {
            stealthAddress: pay.stealthAddress,
            ephemeralPublicKey: `0x${Buffer.from(pay.ephemeralPublicKey).toString('hex')}`,
            metadata: `0x${Buffer.from(pay.metadataPrefix).toString('hex')}`,
          },
          other,
        );
      },
    ];
    for (const a of attempts) {
      try {
        a();
        throw new Error('expected failure');
      } catch (e) {
        expect(e).toBeInstanceOf(GhostPayCryptoError);
        msgs.push(String((e as Error).message), String((e as Error).stack), inspect(e), JSON.stringify(e));
      }
    }
    const all = msgs.join('\n');
    expect(all).not.toContain(spendHex);
    expect(all).not.toContain(viewHex);
  });

  it('derived stealth secret is redacted too', () => {
    const pay = deriveStealthPayment(encodeMetaAddress(keys), seededRng('derived'));
    const secret = deriveStealthSecret(
      {
        stealthAddress: pay.stealthAddress,
        ephemeralPublicKey: `0x${Buffer.from(pay.ephemeralPublicKey).toString('hex')}`,
        metadata: `0x${Buffer.from(pay.metadataPrefix).toString('hex')}`,
      },
      keys,
    );
    expect(() => JSON.stringify(secret)).toThrow(TypeError);
    expect(unsafeRevealSecret(secret).constructor).toBe(Uint8Array);
    expect(() => JSON.stringify({ k: Array.from(unsafeRevealSecret(secret)).length })).not.toThrow();
  });
});
