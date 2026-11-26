import { describe, expect, it } from 'vitest';
import { PaymentUriError } from './errors.js';
import { TRX, TRX2 } from './fixtures.testutil.js';
import { buildTronUri, parseTronUri } from './tron.js';

describe('TRON URI builder input snapshot', () => {
  it('serializes the first observation of every supplied optional field', () => {
    const reads = { amount: 0, token: 0, label: 0, message: 0 };
    const uri = buildTronUri({
      recipient: TRX,
      network: 'nile',
      get amount() {
        return reads.amount++ === 0 ? '1.2500' : '9';
      },
      get token() {
        return reads.token++ === 0 ? TRX2 : TRX;
      },
      get label() {
        return reads.label++ === 0 ? 'Original label' : 'Later label';
      },
      get message() {
        return reads.message++ === 0 ? 'Original message' : 'Later message';
      },
    });

    expect(parseTronUri(uri, 'nile')).toMatchObject({
      recipient: { canonical: TRX },
      token: { canonical: TRX2 },
      amount: { canonical: '1.25', mantissa: 125n, scale: 2 },
      label: 'Original label',
      message: 'Original message',
    });
    expect(reads).toEqual({ amount: 1, token: 1, label: 1, message: 1 });
  });

  it('omits absent optional fields and preserves the explicit network default', () => {
    expect(buildTronUri({ recipient: TRX })).toBe(`tron:${TRX}?network=mainnet`);
    const parsed = parseTronUri(buildTronUri({ recipient: TRX, network: 'nile' }), 'nile');
    expect(parsed).not.toHaveProperty('amount');
    expect(parsed).not.toHaveProperty('token');
    expect(parsed).not.toHaveProperty('label');
    expect(parsed).not.toHaveProperty('message');
  });

  it('continues to reject invalid ordinary optional values', () => {
    expect(() => buildTronUri({ recipient: TRX, amount: '0' })).toThrow(PaymentUriError);
    expect(() => buildTronUri({ recipient: TRX, token: 'invalid' })).toThrow(PaymentUriError);
    expect(() => buildTronUri({ recipient: TRX, label: '' })).toThrow(PaymentUriError);
    expect(() => buildTronUri({ recipient: TRX, message: '' })).toThrow(PaymentUriError);
  });
});
