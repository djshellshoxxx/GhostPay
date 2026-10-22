import { encodeFragment, type EncodeOptions, type SignedInvoice } from '@ghostpay/invoice-schema';
import { HooksError } from './errors.js';
import { assertBaseUrl, assertPaymentLink, type LinkOptions } from './link.js';

export const MAX_LABEL_CODEPOINTS = 40;

const ESC: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

/** Escape text for HTML text and attribute contexts. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"'`]/g, (c) => ESC[c] ?? c);
}

/**
 * Build a payment link for a signed invoice.
 *
 * @param signed Signed invoice.
 * @param options `baseUrl` of the payment page; `encrypt` and `rng` forwarded to `encodeFragment`.
 * @returns Full URL and fragment.
 * @throws {HooksError} `bad-base`; schema errors from `encodeFragment` propagate.
 * @security The URL is a bearer secret (fragment holds the decryption key). Only embed it where the intended payer can see it.
 */
export async function buildPaymentLink(
  signed: SignedInvoice,
  options: LinkOptions & EncodeOptions & { readonly baseUrl: string },
): Promise<{ url: string; fragment: string }> {
  const base = assertBaseUrl(options.baseUrl, options);
  const fragment = await encodeFragment(signed, {
    ...(options.encrypt === undefined ? {} : { encrypt: options.encrypt }),
    ...(options.rng === undefined ? {} : { rng: options.rng }),
  });
  const url = base.origin + base.pathname + fragment;
  assertPaymentLink(url, options);
  return { url, fragment };
}

/**
 * Build a static HTML payment button (single anchor).
 *
 * @param url Payment link (validated).
 * @param label Button text, untrusted; capped and escaped.
 * @returns `href` and `html`; html contains no script, iframe, remote asset or event handler.
 * @throws {HooksError} `bad-link` or `bad-label`.
 * @security All interpolated values are HTML-escaped; `rel="noopener noreferrer"` prevents opener access.
 */
export function buildPaymentButton(url: string, label: string, options: LinkOptions = {}): { href: string; html: string } {
  const { base, fragment } = assertPaymentLink(url, options);
  // eslint-disable-next-line no-control-regex
  const clean = label.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').trim();
  const cps = Array.from(clean);
  if (cps.length === 0) throw new HooksError('bad-label');
  const text = cps.slice(0, MAX_LABEL_CODEPOINTS).join('');
  const href = base + fragment;
  return {
    href,
    html: `<a class="ghostpay-button" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`,
  };
}
