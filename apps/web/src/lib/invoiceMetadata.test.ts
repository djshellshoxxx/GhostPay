import { MAX_LINE_ITEMS, SchemaError, type Invoice, type LineItem } from '@ghostpay/invoice-schema';
import { describe, expect, it } from 'vitest';
import { prepareInvoiceMetadata, type InvoiceMetadataMode } from './invoiceMetadata';

const metadata = Object.freeze({
  lineItems: Object.freeze([
    Object.freeze({ description: 'Private customer name', quantity: '2', unitMinorUnits: '1234' }),
    Object.freeze({ description: 'Private service detail', quantity: '3', unitMinorUnits: '567' }),
  ]),
  memo: 'Private merchant identifier',
});

describe('prepareInvoiceMetadata', () => {
  it('returns fresh standard metadata without changing its values or caller-owned input', () => {
    const prepared = prepareInvoiceMetadata(metadata);
    expect(prepared).toEqual(metadata);
    expect(prepared).not.toBe(metadata);
    expect(prepared.lineItems).not.toBe(metadata.lineItems);
    expect(prepared.lineItems[0]).not.toBe(metadata.lineItems[0]);
  });

  it('omits optional memo and uses one fixed valid description without changing financial fields or input', () => {
    const prepared = prepareInvoiceMetadata(metadata, 'minimal');
    expect(prepared).toEqual({ lineItems: [
      { description: 'Item', quantity: '2', unitMinorUnits: '1234' },
      { description: 'Item', quantity: '3', unitMinorUnits: '567' },
    ] });
    expect(Object.hasOwn(prepared, 'memo')).toBe(false);
    expect(metadata.lineItems[0]?.description).toBe('Private customer name');
    expect(metadata.memo).toBe('Private merchant identifier');
    expect(prepared.lineItems[0]).not.toBe(metadata.lineItems[0]);
  });

  it('does not require a discarded description or memo to be populated', () => {
    expect(prepareInvoiceMetadata({ lineItems: [{ description: '', quantity: '1', unitMinorUnits: '0' }], memo: '' }, 'minimal'))
      .toEqual({ lineItems: [{ description: 'Item', quantity: '1', unitMinorUnits: '0' }] });
    expect(prepareInvoiceMetadata({ lineItems: [] }, 'minimal')).toEqual({ lineItems: [] });
  });

  it.each(['minimal ', null, false, {}, 1])('rejects unsupported runtime mode %s without including it in errors', (mode) => {
    expect(() => prepareInvoiceMetadata(metadata, mode as InvoiceMetadataMode)).toThrow('Choose a supported invoice metadata mode.');
  });

  it.each([
    { description: 'ignored', quantity: '0', unitMinorUnits: '1' },
    { description: 'ignored', quantity: '1', unitMinorUnits: '1.5' },
  ])('retains required financial field validation for %s', (item) => {
    expect(() => prepareInvoiceMetadata({ lineItems: [item] }, 'minimal')).toThrow(SchemaError);
  });

  it('retains the existing item-count bound and rejects sparse or missing items', () => {
    const tooMany = Array.from({ length: MAX_LINE_ITEMS + 1 }, () => metadata.lineItems[0]!);
    expect(() => prepareInvoiceMetadata({ lineItems: tooMany }, 'minimal')).toThrow(SchemaError);
    expect(() => prepareInvoiceMetadata({ lineItems: new Array<LineItem>(1) }, 'minimal')).toThrow(SchemaError);
    expect(() => prepareInvoiceMetadata({ lineItems: null } as unknown as Pick<Invoice, 'lineItems'>, 'minimal')).toThrow(SchemaError);
  });
});
