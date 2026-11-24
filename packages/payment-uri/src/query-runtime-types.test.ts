import { describe, expect, it } from 'vitest';
import { PaymentUriError } from './errors.js';
import { buildQuery, pctDecode, pctEncode } from './query.js';

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

describe('payment URI query encoding JavaScript runtime inputs', () => {
  it('rejects non-string primitives without converting them into payment text', () => {
    for (const input of [undefined, null, 42, false, true, 0n]) {
      expectCode(() => pctEncode(input as unknown as string), 'INVALID_INPUT');
    }
  });

  it('rejects object, array and boxed-string inputs instead of coercing them', () => {
    for (const input of [{ memo: 'hello' }, ['note'], new String('note')]) {
      expectCode(() => pctEncode(input as unknown as string), 'INVALID_INPUT');
    }
  });

  it('rejects invalid runtime values propagated through the query builder', () => {
    expectCode(() => buildQuery([['memo', undefined as unknown as string]]), 'INVALID_INPUT');
    expectCode(() => buildQuery([['memo', 42 as unknown as string]]), 'INVALID_INPUT');
  });

  it('preserves string values and the existing strict malformed UTF-16 error', () => {
    for (const value of ['', '42', 'false', 'null', 'memo 😀']) {
      expect(pctDecode(pctEncode(value)) || '').toBe(value);
    }
    expect(buildQuery([['memo', 'memo 😀']])).toBe('memo=memo%20%F0%9F%98%80');
    expectCode(() => pctEncode('before\uD800after'), 'INVALID_ENCODING');
  });
});
