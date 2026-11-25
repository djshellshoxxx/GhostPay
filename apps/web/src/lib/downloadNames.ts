/**
 * Suggested download names (#286 item 5).
 *
 * The browser copies a suggested file name into its download history, the downloads folder and any sync or backup of
 * either, all outside GhostPay's control. A name may therefore only be one of the fixed names below: none carries an
 * address, hash, key, amount, date, invoice detail or any other value that differs between users or payments.
 *
 * The names stay descriptive on purpose. Recovery depends on finding the right file months later (the encrypted
 * keystore and payment-key exports are often the only copy), and the user guides and the formats specification
 * (stealth exports, section 1.7) refer to them. A file's contents identify it on import; its name never has to.
 *
 * Any other requested name, including one assembled from runtime values, is replaced by `export.<extension>`.
 */
export const DOWNLOAD_NAMES = Object.freeze([
  'ghostpay-keystore.json',
  'ghostpay-seller-public.json',
  'ghostpay-receipt.json',
  'ghostpay-receipts.json',
  'ghostpay-proof-of-payment.json',
  'ghostpay-reconciliation-encrypted.json',
  'ghostpay-untrusted-legacy-ledger.txt',
  'ghostpay-policy-record.json',
  'ghostpay-tags.gpa',
  'ghostpay-invoice-qr.svg',
  // QrFrame: `ghostpay-${kind}-qr.svg` for each QrKind.
  'ghostpay-secret-qr.svg',
  'ghostpay-shareable-qr.svg',
  'ghostpay-bearer-qr.svg',
  'ghostpay-device-qr.svg',
  'ghostpay-proof-qr.svg',
  'ghostpay-caution-qr.svg',
  // STEALTH_EXPORT_FILENAMES (formats section 1.7); downloadNames.test.ts keeps this list in step.
  'ghostpay-stealth-public.json',
  'ghostpay-stealth-keypair.json',
  'ghostpay-stealth-keypairs.json',
  'ghostpay-stealth-master.json',
  'ghostpay-stealth-private-key.txt',
] as const);

export type DownloadName = (typeof DOWNLOAD_NAMES)[number];

const FIXED: ReadonlySet<string> = new Set(DOWNLOAD_NAMES);

/** Extensions a fallback name may keep, so the operating system still opens the file with a suitable program. */
const EXTENSION = /\.(json|svg|gpa|txt|csv|pdf|png|zip)$/i;

/**
 * The name to suggest for a download requested as `requested`: the same name when it is one of {@link DOWNLOAD_NAMES},
 * otherwise `export.` plus its extension when that is one of the allowed extensions, otherwise `export.bin`.
 * Never throws and never returns any other part of `requested`.
 */
export function neutralDownloadName(requested: unknown): string {
  if (typeof requested !== 'string') return 'export.bin';
  if (FIXED.has(requested)) return requested;
  const extension = EXTENSION.exec(requested)?.[1]?.toLowerCase();
  return `export.${extension ?? 'bin'}`;
}
