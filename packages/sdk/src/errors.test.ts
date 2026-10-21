import { SchemaError } from '@ghostpay/invoice-schema';
import { describe, expect, it } from 'vitest';
import { SdkError, SdkInvoiceError, wrapInvoice, wrapInvoiceAsync } from './errors.js';

describe('error wrapping', () => {
  it('wraps invoice errors, passes foreign errors through', async () => {
    const boom = new TypeError('other');
    expect(() => wrapInvoice(() => { throw new SchemaError('fiat.minorUnits'); })).toThrow(SdkInvoiceError);
    expect(() => wrapInvoice(() => { throw boom; })).toThrow(boom);
    await expect(wrapInvoiceAsync(() => Promise.reject(new SchemaError('x')))).rejects.toBeInstanceOf(SdkInvoiceError);
    await expect(wrapInvoiceAsync(() => Promise.reject(boom))).rejects.toBe(boom);
    expect(await wrapInvoiceAsync(() => Promise.resolve(3))).toBe(3);
  });
  it('typed errors carry names and codes, not input', () => {
    const e = new SdkInvoiceError(new SchemaError('memo'));
    expect(e).toBeInstanceOf(SdkError);
    expect(e.name).toBe('SdkInvoiceError');
    expect(e.code).toBe('INVOICE');
    expect(e.path).toBe('memo');
  });
});
