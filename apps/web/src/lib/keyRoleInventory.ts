// Compile-time references pin the inventory to existing package exports without loading them.
type CoreOperation = keyof Pick<typeof import('@ghostpay/core-crypto'), 'checkAnnouncement' | 'deriveStealthSecret'>;
type PolicyOperation = keyof Pick<typeof import('@ghostpay/policy-scheme'), 'checkScheme2Announcement' | 'deriveScheme2OwnerKey'>;
type InvoiceOperation = keyof Pick<typeof import('@ghostpay/invoice-schema'), 'signInvoice' | 'signReceipt'>;
type ExistingOperation = CoreOperation | PolicyOperation | InvoiceOperation;

const view = Object.freeze(['checkAnnouncement', 'checkScheme2Announcement'] as const);
const spend = Object.freeze(['deriveStealthSecret', 'deriveScheme2OwnerKey'] as const);
const invoiceSign = Object.freeze(['signInvoice', 'signReceipt'] as const);
const none = Object.freeze([] as const);

/**
 * Describe existing seller-session operations. These names are source inventory only.
 * A check uses a viewing secret and a public spending key. Either recipient-secret
 * derivation requires both secrets. Invoices and receipts use the independent signer.
 * The identity-sign, device-auth and service-authorize roles have no entry here.
 */
export function existingSellerOperations(role: unknown): readonly ExistingOperation[] {
  switch (role) {
    case 'view': return view;
    case 'spend': return spend;
    case 'invoice-sign': return invoiceSign;
    default: return none;
  }
}
