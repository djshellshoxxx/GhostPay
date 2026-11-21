import { MAX_LINE_ITEMS, SchemaError, validatePrivatePart, type Invoice } from '@ghostpay/invoice-schema';
import { UserFacingError } from './errors';

export type InvoiceMetadataMode = 'standard' | 'minimal';
type InvoiceMetadata = Pick<Invoice, 'lineItems' | 'memo'>;

/** A stable schema-valid label; empty descriptions are not accepted by the invoice format. */
export const MINIMAL_INVOICE_DESCRIPTION = 'Item';

/**
 * Prepares only unsigned descriptive fields. The caller must create and sign the complete invoice afterwards.
 * Financial fields are validated by the existing schema and never recomputed here. Neither mode mutates input.
 */
export function prepareInvoiceMetadata(metadata: InvoiceMetadata, mode: InvoiceMetadataMode = 'standard'): InvoiceMetadata {
  if (mode === 'standard') return validatePrivatePart(metadata);
  if (mode !== 'minimal') throw new UserFacingError({ key: 'invoice.metadata.invalidMode' });
  // Check the existing schema bound before allocating a transformed collection; Array.from also visits holes.
  const items = metadata.lineItems;
  if (!Array.isArray(items) || items.length > MAX_LINE_ITEMS) throw new SchemaError('lineItems');
  return validatePrivatePart({
    lineItems: Array.from(items, (item: Invoice['lineItems'][number]) => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) throw new SchemaError('lineItems');
      return { description: MINIMAL_INVOICE_DESCRIPTION, quantity: item.quantity, unitMinorUnits: item.unitMinorUnits };
    }),
  });
}

// i18n-use: invoice.metadata.invalidMode
