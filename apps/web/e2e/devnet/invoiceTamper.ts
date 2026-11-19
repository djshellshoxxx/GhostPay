import { FRAGMENT_PREFIX, canonicalize, decodeBase64Url, encodeBase64Url } from '@ghostpay/invoice-schema';

/** A signed fixture whose public amount is changed after signing, while retaining the original signature. */
export function tamperInvoiceLink(link: string): string {
  const url = new URL(link);
  if (!url.hash.startsWith(FRAGMENT_PREFIX)) throw new Error('Expected an invoice fixture fragment');
  const envelope = JSON.parse(new TextDecoder().decode(decodeBase64Url(url.hash.slice(FRAGMENT_PREFIX.length)))) as {
    alg: string;
    inv?: { amountPolicy: { mode: string; tokenAmount: string } };
    pub?: { amountPolicy: { mode: string; tokenAmount: string } };
  };
  // A256GCM encrypts line items and memo. Its public amount is still covered by the seller's signature.
  const invoice = envelope.alg === 'none' ? envelope.inv : envelope.alg === 'A256GCM' ? envelope.pub : undefined;
  if (invoice === undefined) throw new Error('Expected a plain or A256GCM invoice fixture');
  if (invoice.amountPolicy.mode !== 'fixed_token') throw new Error('Expected a fixed-token invoice fixture');
  invoice.amountPolicy.tokenAmount = (BigInt(invoice.amountPolicy.tokenAmount) / 10n).toString();
  url.hash = FRAGMENT_PREFIX + encodeBase64Url(new TextEncoder().encode(canonicalize(envelope)));
  return url.toString();
}
