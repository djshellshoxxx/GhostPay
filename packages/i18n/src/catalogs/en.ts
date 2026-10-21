/** Sample English catalog (base locale). Fake strings for the framework; product copy is owned elsewhere. */
export const en = {
  'checkout.title': 'Pay {merchant}',
  'checkout.amount_due': 'Amount due: {amount} {asset}',
  'checkout.pay_button': 'Pay now',
  'checkout.items': '{count, plural, =0{No items} one{# item} other{# items}}',
  'checkout.expires_in': 'This invoice expires in {minutes, plural, one{# minute} other{# minutes}}.',
  'checkout.copy_address': "Copy the payer's address",
  'status.confirmed': 'Payment confirmed',
  'status.pending': 'Waiting for confirmation',
  'errors.invoice_invalid': 'This invoice is not valid.',
  'errors.literal_braces': "Use '{'curly braces'}' for placeholders.",
} as const;
