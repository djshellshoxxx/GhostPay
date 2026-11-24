import { describe, expect, it } from 'vitest';
import { HooksError } from './errors.js';
import { buildPaymentButton } from './button.js';

const PAYMENT_LINK = 'https://pay.example.com/#gpi=v1.YWJj';

describe('buildPaymentButton runtime label boundary', () => {
  const malformed: readonly (readonly [string, unknown])[] = [
    ['null', null],
    ['undefined', undefined],
    ['number', 42],
    ['boolean', false],
    ['array', []],
  ];

  for (const [name, label] of malformed) {
    it(`returns the existing bad-label error for ${name}`, () => {
      const make = () => buildPaymentButton(PAYMENT_LINK, label as string);
      expect(make).toThrowError(HooksError);
      expect(make).toThrowError('hooks error: bad-label');
    });
  }

  it('retains malformed payment-link precedence even for a malformed label', () => {
    expect(() => buildPaymentButton('not a payment link', null as unknown as string)).toThrowError('hooks error: bad-link');
  });

  it('preserves valid text, escaping and Unicode codepoint bounds', () => {
    const normal = buildPaymentButton(PAYMENT_LINK, 'Pay now');
    expect(normal.href).toBe(PAYMENT_LINK);
    expect(normal.html).toContain('>Pay now</a>');
    expect(buildPaymentButton(PAYMENT_LINK, '<script>').html).toContain('&lt;script&gt;');
    const capped = buildPaymentButton(PAYMENT_LINK, '😀'.repeat(45)).html;
    expect(capped).toContain('😀'.repeat(40));
    expect(capped).not.toContain('😀'.repeat(41));
    expect(() => buildPaymentButton(PAYMENT_LINK, ' \n ')).toThrowError('hooks error: bad-label');
  });
});
