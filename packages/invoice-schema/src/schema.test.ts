import { describe, expect, it } from 'vitest';
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_LINE_ITEMS,
  MAX_MEMO_LENGTH,
  RandomnessError,
  SchemaError,
  createInvoice,
  validateInvoice,
  validatePrivatePart,
} from './index.js';
import { OTHER_META, SIGNER, newInvoiceInput, sampleInvoice, seededRng } from './fixtures.testutil.js';

function pathOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof SchemaError) return e.path;
    throw e;
  }
  return 'NO_THROW';
}

const base = sampleInvoice();
const mutate = (f: (o: Record<string, unknown>) => void): Record<string, unknown> => {
  const o = structuredClone(base) as unknown as Record<string, unknown>;
  f(o);
  return o;
};
const nested = (o: Record<string, unknown>, k: string): Record<string, unknown> =>
  o[k] as Record<string, unknown>;

describe('createInvoice', () => {
  it('fills v, schemeId and a 128-bit nonce', () => {
    expect(base.v).toBe(1);
    expect(base.schemeId).toBe(1);
    expect(base.nonce).toMatch(/^[0-9a-f]{32}$/);
  });
  it('nonces are unique over 2000 draws from the real CSPRNG', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(createInvoice(newInvoiceInput()).nonce);
    expect(seen.size).toBe(2000);
  });
  it('same seed gives the same nonce, different seeds differ', () => {
    const a = createInvoice(newInvoiceInput(), seededRng('s1')).nonce;
    expect(createInvoice(newInvoiceInput(), seededRng('s1')).nonce).toBe(a);
    expect(createInvoice(newInvoiceInput(), seededRng('s2')).nonce).not.toBe(a);
  });
  it('requires a random source', () => {
    const g = globalThis as { crypto?: unknown };
    const saved = g.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      expect(() => createInvoice(newInvoiceInput())).toThrow(RandomnessError);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: saved, configurable: true });
    }
  });
  it('omits memo when absent and keeps fixed_token policy', () => {
    const { memo: _memo, ...rest } = newInvoiceInput();
    void _memo;
    const inv = createInvoice({
      ...rest,
      amountPolicy: { mode: 'fixed_token', tokenAmount: '1000000' },
      token: 'native',
    });
    expect('memo' in inv).toBe(false);
    expect(inv.amountPolicy).toEqual({ mode: 'fixed_token', tokenAmount: '1000000' });
  });
  it('validation failures surface from createInvoice', () => {
    expect(() => createInvoice(newInvoiceInput({ chainId: 0 }))).toThrow(SchemaError);
  });
});

describe('validateInvoice rejects', () => {
  const cases: Array<[string, string, (o: Record<string, unknown>) => void]> = [
    [
      'unknown top-level key',
      '$',
      (o) => {
        o['extra'] = 1;
      },
    ],
    [
      'missing required key',
      'tax',
      (o) => {
        delete o['tax'];
      },
    ],
    [
      'undefined required key',
      'tax',
      (o) => {
        o['tax'] = undefined;
      },
    ],
    [
      'wrong version',
      'v',
      (o) => {
        o['v'] = 2;
      },
    ],
    [
      'wrong scheme',
      'schemeId',
      (o) => {
        o['schemeId'] = 2;
      },
    ],
    [
      'chainId zero',
      'chainId',
      (o) => {
        o['chainId'] = 0;
      },
    ],
    [
      'chainId float',
      'chainId',
      (o) => {
        o['chainId'] = 1.5;
      },
    ],
    [
      'chainId string',
      'chainId',
      (o) => {
        o['chainId'] = '1';
      },
    ],
    [
      'chainId unsafe',
      'chainId',
      (o) => {
        o['chainId'] = 2 ** 53;
      },
    ],
    [
      'uppercase meta',
      'metaAddress',
      (o) => {
        o['metaAddress'] = (o['metaAddress'] as string).toUpperCase();
      },
    ],
    [
      'meta wrong prefix',
      'metaAddress',
      (o) => {
        o['metaAddress'] = (o['metaAddress'] as string).replace('st:eth', 'st:btc');
      },
    ],
    [
      'meta off-curve key',
      'metaAddress',
      (o) => {
        o['metaAddress'] = `st:eth:0x02${'00'.repeat(31)}05${(o['metaAddress'] as string).slice(9 + 66)}`;
      },
    ],
    [
      'meta second key off-curve',
      'metaAddress',
      (o) => {
        o['metaAddress'] = `${(o['metaAddress'] as string).slice(0, 9 + 66)}02${'00'.repeat(31)}05`;
      },
    ],
    [
      'meta same keys',
      'metaAddress',
      (o) => {
        const m = o['metaAddress'] as string;
        o['metaAddress'] = m.slice(0, 9 + 66) + m.slice(9, 9 + 66);
      },
    ],
    [
      'nonce short',
      'nonce',
      (o) => {
        o['nonce'] = 'ab';
      },
    ],
    [
      'nonce uppercase',
      'nonce',
      (o) => {
        o['nonce'] = 'A'.repeat(32);
      },
    ],
    [
      'currency lowercase',
      'fiat.currency',
      (o) => {
        nested(o, 'fiat')['currency'] = 'usd';
      },
    ],
    [
      'currency 4 letters',
      'fiat.currency',
      (o) => {
        nested(o, 'fiat')['currency'] = 'USDT';
      },
    ],
    [
      'minorUnits number',
      'fiat.minorUnits',
      (o) => {
        nested(o, 'fiat')['minorUnits'] = 100;
      },
    ],
    [
      'minorUnits leading zero',
      'fiat.minorUnits',
      (o) => {
        nested(o, 'fiat')['minorUnits'] = '0100';
      },
    ],
    [
      'minorUnits negative',
      'fiat.minorUnits',
      (o) => {
        nested(o, 'fiat')['minorUnits'] = '-1';
      },
    ],
    [
      'minorUnits decimal',
      'fiat.minorUnits',
      (o) => {
        nested(o, 'fiat')['minorUnits'] = '1.5';
      },
    ],
    [
      'minorUnits 31 digits',
      'fiat.minorUnits',
      (o) => {
        nested(o, 'fiat')['minorUnits'] = '1'.repeat(31);
      },
    ],
    [
      'fiat unknown key',
      'fiat',
      (o) => {
        nested(o, 'fiat')['x'] = 1;
      },
    ],
    [
      'token checksum case',
      'token',
      (o) => {
        o['token'] = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
      },
    ],
    [
      'token short',
      'token',
      (o) => {
        o['token'] = '0x1234';
      },
    ],
    [
      'token NATIVE',
      'token',
      (o) => {
        o['token'] = 'NATIVE';
      },
    ],
    [
      'amountPolicy mode',
      'amountPolicy.mode',
      (o) => {
        o['amountPolicy'] = { mode: 'free' };
      },
    ],
    [
      'fiat_quote with amount',
      'amountPolicy.tokenAmount',
      (o) => {
        o['amountPolicy'] = { mode: 'fiat_quote', tokenAmount: '1' };
      },
    ],
    [
      'fixed_token missing amount',
      'amountPolicy.tokenAmount',
      (o) => {
        o['amountPolicy'] = { mode: 'fixed_token' };
      },
    ],
    [
      'fixed_token zero',
      'amountPolicy.tokenAmount',
      (o) => {
        o['amountPolicy'] = { mode: 'fixed_token', tokenAmount: '0' };
      },
    ],
    [
      'fixed_token > 2^256-1',
      'amountPolicy.tokenAmount',
      (o) => {
        o['amountPolicy'] = { mode: 'fixed_token', tokenAmount: (2n ** 256n).toString() };
      },
    ],
    [
      'quote source uppercase',
      'quote.source',
      (o) => {
        nested(o, 'quote')['source'] = 'Chainlink';
      },
    ],
    [
      'quote timestamp negative',
      'quote.timestamp',
      (o) => {
        nested(o, 'quote')['timestamp'] = -1;
      },
    ],
    [
      'quote expires before timestamp',
      'quote.expiresAt',
      (o) => {
        nested(o, 'quote')['expiresAt'] = (nested(o, 'quote')['timestamp'] as number) - 1;
      },
    ],
    [
      'slippage > 10000',
      'quote.maxSlippageBps',
      (o) => {
        nested(o, 'quote')['maxSlippageBps'] = 10_001;
      },
    ],
    [
      'expiresAt float',
      'expiresAt',
      (o) => {
        o['expiresAt'] = 1.5;
      },
    ],
    // G1-01: times past 9999-12-31T23:59:59Z (253402300799) make `new Date(s * 1000).toISOString()` throw or
    // render a 6-digit year in every consumer; the largest safe integer used to pass.
    [
      'expiresAt 2^53-1',
      'expiresAt',
      (o) => {
        o['expiresAt'] = Number.MAX_SAFE_INTEGER;
      },
    ],
    [
      'expiresAt after year 9999',
      'expiresAt',
      (o) => {
        o['expiresAt'] = 253_402_300_800;
      },
    ],
    [
      'quote timestamp after year 9999',
      'quote.timestamp',
      (o) => {
        nested(o, 'quote')['timestamp'] = 253_402_300_800;
        nested(o, 'quote')['expiresAt'] = 253_402_300_800;
      },
    ],
    [
      'quote expiresAt 2^53-1',
      'quote.expiresAt',
      (o) => {
        nested(o, 'quote')['expiresAt'] = Number.MAX_SAFE_INTEGER;
      },
    ],
    [
      'lineItems not array',
      'lineItems',
      (o) => {
        o['lineItems'] = {};
      },
    ],
    [
      'lineItems > 50',
      'lineItems',
      (o) => {
        o['lineItems'] = Array.from({ length: MAX_LINE_ITEMS + 1 }, () => ({
          description: 'x',
          quantity: '1',
          unitMinorUnits: '1',
        }));
      },
    ],
    [
      'line item unknown key',
      'lineItems[0]',
      (o) => {
        (o['lineItems'] as Array<Record<string, unknown>>)[0]!['html'] = '<b>';
      },
    ],
    [
      'line item quantity 0',
      'lineItems[0].quantity',
      (o) => {
        (o['lineItems'] as Array<Record<string, unknown>>)[0]!['quantity'] = '0';
      },
    ],
    [
      'line item empty description',
      'lineItems[0].description',
      (o) => {
        (o['lineItems'] as Array<Record<string, unknown>>)[0]!['description'] = '';
      },
    ],
    [
      'line item too long',
      'lineItems[1].description',
      (o) => {
        (o['lineItems'] as Array<Record<string, unknown>>)[1]!['description'] = 'a'.repeat(
          MAX_DESCRIPTION_LENGTH + 1,
        );
      },
    ],
    [
      'line item not object',
      'lineItems[0]',
      (o) => {
        (o['lineItems'] as unknown[])[0] = 'str';
      },
    ],
    [
      'tax rate',
      'tax.rateBps',
      (o) => {
        nested(o, 'tax')['rateBps'] = 10_001;
      },
    ],
    [
      'tax amount',
      'tax.minorUnits',
      (o) => {
        nested(o, 'tax')['minorUnits'] = 'x';
      },
    ],
    [
      'feePolicy',
      'feePolicy',
      (o) => {
        o['feePolicy'] = 'nobody';
      },
    ],
    [
      'memo too long',
      'memo',
      (o) => {
        o['memo'] = 'a'.repeat(MAX_MEMO_LENGTH + 1);
      },
    ],
    [
      'memo empty',
      'memo',
      (o) => {
        o['memo'] = '';
      },
    ],
    [
      'memo not NFC',
      'memo',
      (o) => {
        o['memo'] = 'é';
      },
    ],
    [
      'memo control char',
      'memo',
      (o) => {
        o['memo'] = 'a\u0000b';
      },
    ],
    [
      'memo C1 control',
      'memo',
      (o) => {
        o['memo'] = 'a\u0085b';
      },
    ],
    [
      'memo lone high surrogate',
      'memo',
      (o) => {
        o['memo'] = 'a\ud800b';
      },
    ],
    [
      'memo lone low surrogate',
      'memo',
      (o) => {
        o['memo'] = 'a\udc00';
      },
    ],
    [
      'memo number',
      'memo',
      (o) => {
        o['memo'] = 5;
      },
    ],
    [
      'signer uncompressed prefix',
      'signer',
      (o) => {
        o['signer'] = `04${'11'.repeat(32)}`;
      },
    ],
    [
      'signer off-curve',
      'signer',
      (o) => {
        o['signer'] = `02${'00'.repeat(31)}05`;
      },
    ],
    [
      'signer uppercase',
      'signer',
      (o) => {
        o['signer'] = SIGNER.toUpperCase();
      },
    ],
  ];
  for (const [name, path, f] of cases) {
    it(name, () => {
      const p = pathOf(() => validateInvoice(mutate(f)));
      expect(p).toBe(path);
    });
  }
  it('non-object roots, arrays, class instances, accessors-free', () => {
    for (const v of [
      null,
      undefined,
      5,
      'x',
      [],
      [1],
      new Date(),
      new (class X {
        v = 1;
      })(),
    ]) {
      expect(() => validateInvoice(v)).toThrow(SchemaError);
    }
  });
});

describe('validateInvoice accepts', () => {
  it('boundary values', () => {
    const items = Array.from({ length: MAX_LINE_ITEMS }, () => ({
      description: '😀'.repeat(MAX_DESCRIPTION_LENGTH),
      quantity: '999999999',
      unitMinorUnits: '9'.repeat(30),
    }));
    const inv = validateInvoice(
      mutate((o) => {
        o['lineItems'] = items;
        o['memo'] = '€'.repeat(MAX_MEMO_LENGTH);
        o['chainId'] = Number.MAX_SAFE_INTEGER;
        o['token'] = 'native';
        o['amountPolicy'] = { mode: 'fixed_token', tokenAmount: (2n ** 256n - 1n).toString() };
        nested(o, 'quote')['maxSlippageBps'] = 10_000;
        nested(o, 'tax')['rateBps'] = 0;
      }),
    );
    expect(inv.lineItems).toHaveLength(MAX_LINE_ITEMS);
  });
  it('times up to 9999-12-31T23:59:59Z, which every Date consumer can render', () => {
    const last = 253_402_300_799;
    const inv = validateInvoice(
      mutate((o) => {
        o['expiresAt'] = last;
        o['quote'] = { ...nested(o, 'quote'), timestamp: last, expiresAt: last };
      }),
    );
    expect([inv.expiresAt, inv.quote.timestamp, inv.quote.expiresAt]).toEqual([last, last, last]);
    expect(new Date(inv.expiresAt * 1000).toISOString()).toBe('9999-12-31T23:59:59.000Z');
  });
  it('empty line items and a null-prototype object', () => {
    const o = Object.assign(
      Object.create(null) as Record<string, unknown>,
      mutate((x) => {
        x['lineItems'] = [];
      }),
    );
    expect(validateInvoice(o).lineItems).toEqual([]);
  });
  it('returns a fresh object', () => {
    const copy = validateInvoice(base);
    expect(copy).not.toBe(base);
    expect(copy).toEqual(base);
  });
  it('XSS and markup strings are accepted as inert text', () => {
    const xss = '<script>alert(1)</script><img src=x onerror=alert(1)> javascript:alert(1) "\'`${7*7}';
    const inv = validateInvoice(
      mutate((o) => {
        o['memo'] = xss;
      }),
    );
    expect(inv.memo).toBe(xss);
  });
});

describe('validatePrivatePart', () => {
  it('accepts with and without memo, rejects extras', () => {
    expect(validatePrivatePart({ lineItems: [] })).toEqual({ lineItems: [] });
    expect(validatePrivatePart({ lineItems: [], memo: 'hi' })).toEqual({ lineItems: [], memo: 'hi' });
    expect(() => validatePrivatePart({ lineItems: [], chainId: 1 })).toThrow(SchemaError);
    expect(() => validatePrivatePart({ memo: 'x' })).toThrow(SchemaError);
    expect(() => validatePrivatePart({ lineItems: [], memo: '' })).toThrow(SchemaError);
  });
});

describe('metadata sanity', () => {
  it('OTHER_META differs', () => {
    expect(OTHER_META).not.toBe(base.metaAddress);
  });
});

describe('v2 bufferPolicy (spec 13, ADR-0024)', () => {
  const POLICY = { accepted: true, maxWei: '10000000000000000', minWei: '100000000000000', refund: 'none' } as const;
  const v2 = sampleInvoice({ bufferPolicy: POLICY });

  it('createInvoice emits v 2 exactly when a bufferPolicy is given; v1 stays unchanged', () => {
    expect(v2.v).toBe(2);
    expect(v2.bufferPolicy).toEqual(POLICY);
    expect(base.v).toBe(1);
    expect('bufferPolicy' in base).toBe(false);
    expect(validateInvoice(structuredClone(v2))).toEqual(v2);
  });

  it('accepts a declined policy with zero bounds', () => {
    const declined = sampleInvoice({ bufferPolicy: { accepted: false, maxWei: '0', minWei: '0', refund: 'none' } });
    expect(declined.v).toBe(2);
    expect(declined.bufferPolicy?.accepted).toBe(false);
  });

  const mutate2 = (f: (o: Record<string, unknown>, p: Record<string, unknown>) => void): Record<string, unknown> => {
    const o = structuredClone(v2) as unknown as Record<string, unknown>;
    f(o, o['bufferPolicy'] as Record<string, unknown>);
    return o;
  };

  it.each([
    ['v1 carrying a bufferPolicy', mutate2((o) => { o['v'] = 1; }), 'bufferPolicy'],
    ['v2 without a bufferPolicy', mutate2((o) => { delete o['bufferPolicy']; }), 'v'],
    ['v3', mutate2((o) => { o['v'] = 3; }), 'v'],
    ['unknown policy key', mutate2((_o, p) => { p['extra'] = 1; }), 'bufferPolicy'],
    ['missing refund', mutate2((_o, p) => { delete p['refund']; }), 'bufferPolicy.refund'],
    ['refund other than none (no silent refunds)', mutate2((_o, p) => { p['refund'] = 'payer'; }), 'bufferPolicy.refund'],
    ['accepted not boolean', mutate2((_o, p) => { p['accepted'] = 'yes'; }), 'bufferPolicy.accepted'],
    ['maxWei not decimal', mutate2((_o, p) => { p['maxWei'] = '0x10'; }), 'bufferPolicy.maxWei'],
    ['maxWei leading zero', mutate2((_o, p) => { p['maxWei'] = '010'; }), 'bufferPolicy.maxWei'],
    ['maxWei number', mutate2((_o, p) => { p['maxWei'] = 10; }), 'bufferPolicy.maxWei'],
    ['maxWei above uint256', mutate2((_o, p) => { p['maxWei'] = (1n << 256n).toString(); }), 'bufferPolicy.maxWei'],
    ['minWei above maxWei', mutate2((_o, p) => { p['minWei'] = '20000000000000000'; }), 'bufferPolicy.minWei'],
    ['accepted with zero minimum (dust)', mutate2((_o, p) => { p['minWei'] = '0'; }), 'bufferPolicy.minWei'],
    ['declined with non-zero bounds', mutate2((_o, p) => { p['accepted'] = false; }), 'bufferPolicy.maxWei'],
    ['accepted on a native invoice', mutate2((o) => { o['token'] = 'native'; }), 'bufferPolicy.accepted'],
  ])('rejects %s', (_name, value, path) => {
    expect(pathOf(() => validateInvoice(value))).toBe(path);
  });
});
