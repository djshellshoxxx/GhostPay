import { describe, expect, it } from 'vitest';
import { PaymentUriError } from './errors.js';
import { buildQuery, parseQuery, pctDecode } from './query.js';

function expectCode(run: () => unknown, code: PaymentUriError['code']): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(PaymentUriError);
    expect((error as PaymentUriError).code).toBe(code);
    return;
  }
  throw new Error(`Expected PaymentUriError with code ${code}`);
}

describe('payment URI exported query runtime boundaries', () => {
  it('rejects non-string percent-decoder input with a typed input error', () => {
    for (const value of [undefined, null, 42, false, ['hello'], new String('hello')]) {
      expectCode(() => pctDecode(value as unknown as string), 'INVALID_INPUT');
    }
  });

  it('rejects non-string query input before accessing split', () => {
    for (const value of [undefined, null, 42, false, ['memo=abc'], new String('memo=abc')]) {
      expectCode(() => parseQuery(value as unknown as string, { foldKeys: false }), 'INVALID_INPUT');
    }
  });

  it('rejects malformed or injecting builder keys instead of emitting ambiguous queries', () => {
    for (const key of ['recipient&value', 'memo=1', 'bad key', 'foo%26bar', '', 'x'.repeat(33)]) {
      expectCode(() => buildQuery([[key, 'hello']]), 'INVALID_QUERY');
    }
    expectCode(() => buildQuery([[new String('memo') as unknown as string, 'hello']]), 'INVALID_QUERY');
    expectCode(() => buildQuery([[undefined as unknown as string, 'hello']]), 'INVALID_QUERY');
  });

  it('retains valid ABI-style keys, Unicode values and repeatable query parameters', () => {
    const pairs: [string, string][] = [
      ['address', '0xABC'],
      ['uint256', '42'],
      ['memo_1.v2', 'hello 😀 & goodbye'],
    ];
    const encoded = buildQuery(pairs);
    expect(encoded).toBe('address=0xABC&uint256=42&memo_1.v2=hello%20%F0%9F%98%80%20%26%20goodbye');
    expect(parseQuery(encoded, { foldKeys: false })).toEqual(pairs.map(([key, value]) => ({ key, value })));
    expect(parseQuery('memo=x&memo=y', { foldKeys: false, repeatable: new Set(['memo']) })).toEqual([
      { key: 'memo', value: 'x' },
      { key: 'memo', value: 'y' },
    ]);
    expect(pctDecode('')).toBe('');
    expectCode(() => pctDecode('%FF'), 'INVALID_ENCODING');
  });
});
