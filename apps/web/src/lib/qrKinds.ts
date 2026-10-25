/**
 * Single source of truth for the colour-coded QR frame system.
 * Edit THIS table to add/rename a kind; the frame component, CSS class names, docs table test and
 * snapshot all derive from it. Colour is never the only cue: every kind also has a text label,
 * an icon and a distinct border style (WCAG 1.4.1).
 */

export type QrKind = 'secret' | 'shareable' | 'bearer' | 'device' | 'proof' | 'caution';

export type QrIconId = 'lock' | 'share' | 'key' | 'devices' | 'check-doc' | 'warning';

export type QrBorderStyle = 'solid-thick' | 'solid' | 'dashed' | 'double' | 'dotted' | 'hazard';

export interface QrHandlingRules {
  /** Hidden until the user explicitly presses Reveal. */
  readonly revealRequired: boolean;
  /** Seconds after which a revealed QR hides again (null: never). */
  readonly autoHideSeconds: number | null;
  readonly allowCopyText: boolean;
  readonly allowDownload: boolean;
  /** Whether print stylesheets may include the QR. */
  readonly printByDefault: boolean;
  /** Extra warning shown with the frame (null: none). */
  readonly warning: string | null;
}

export interface QrKindInfo {
  readonly kind: QrKind;
  /** Colour name, also the suffix of the CSS token `--qr-<color>`. */
  readonly color: 'red' | 'green' | 'orange' | 'blue' | 'purple' | 'yellow';
  readonly border: QrBorderStyle;
  readonly icon: QrIconId;
  readonly label: string;
  readonly explanation: string;
  readonly examples: string;
  readonly rules: QrHandlingRules;
}

export const SECRET_AUTO_HIDE_SECONDS = 60;

export const QR_KINDS: Readonly<Record<QrKind, QrKindInfo>> = {
  secret: {
    kind: 'secret',
    color: 'red',
    border: 'solid-thick',
    icon: 'lock',
    label: 'SECRET',
    explanation: 'Anyone who scans this can spend your funds or decrypt your data. Scan it only with your own phone, in private.',
    examples: 'Keystore backups, recovery data, anything that lets someone spend or decrypt.',
    rules: {
      revealRequired: true,
      autoHideSeconds: SECRET_AUTO_HIDE_SECONDS,
      allowCopyText: false,
      allowDownload: false,
      printByDefault: false,
      warning: 'Do not screenshot or photograph this in public. It hides itself after 60 seconds.',
    },
  },
  shareable: {
    kind: 'shareable',
    color: 'green',
    border: 'solid',
    icon: 'share',
    label: 'SHARE',
    explanation: 'Safe to show to the person paying you.',
    examples: 'Public invoice link (plain or passphrase-protected), seller stealth meta-address, payment request, registry entry.',
    rules: { revealRequired: false, autoHideSeconds: null, allowCopyText: true, allowDownload: true, printByDefault: true, warning: null },
  },
  bearer: {
    kind: 'bearer',
    color: 'orange',
    border: 'dashed',
    icon: 'key',
    label: 'PRIVATE LINK',
    explanation: 'This link contains its own decryption key: anyone who sees it can read the invoice. Share it only with the intended payer.',
    examples: 'An invoice link that embeds its decryption key.',
    rules: {
      revealRequired: false,
      autoHideSeconds: null,
      allowCopyText: true,
      allowDownload: true,
      printByDefault: false,
      warning: 'Anyone who sees this code can read the invoice.',
    },
  },
  device: {
    kind: 'device',
    color: 'blue',
    border: 'double',
    icon: 'devices',
    label: 'MY DEVICES',
    explanation: 'Settings moving between your own devices. Not secret, but private: do not show it to others.',
    examples: 'Settings, RPC list, pinned-signer list.',
    rules: { revealRequired: false, autoHideSeconds: null, allowCopyText: true, allowDownload: true, printByDefault: false, warning: null },
  },
  proof: {
    kind: 'proof',
    color: 'purple',
    border: 'dotted',
    icon: 'check-doc',
    label: 'PROOF',
    explanation: 'Signed data or fingerprints can be checked or kept. A seller receipt attests to key control; it does not independently prove payment or seller identity.',
    examples: 'Receipts, proof of payment, signed manifests, fingerprints to compare.',
    rules: { revealRequired: false, autoHideSeconds: null, allowCopyText: true, allowDownload: true, printByDefault: true, warning: null },
  },
  caution: {
    kind: 'caution',
    color: 'yellow',
    border: 'hazard',
    icon: 'warning',
    label: 'CAUTION',
    explanation: 'Test, development, unsigned or unverified data. Do not treat it as real or trusted.',
    examples: 'Testnet or dev data, unsigned or unverified data.',
    rules: {
      revealRequired: false,
      autoHideSeconds: null,
      allowCopyText: true,
      allowDownload: true,
      printByDefault: false,
      warning: 'Check where this came from before you rely on it.',
    },
  },
};

export const QR_KIND_ORDER: readonly QrKind[] = ['secret', 'shareable', 'bearer', 'device', 'proof', 'caution'];

/**
 * Colour palette per mode (hex). MUST match apps/web/src/styles/qr.css (a test enforces this) and is
 * what the contrast / colour-blind tests measure. `on` is the text colour used on a filled label chip.
 */
export interface QrPaletteEntry {
  readonly color: string;
  readonly on: string;
}
export type QrPalette = Readonly<Record<QrKindInfo['color'], QrPaletteEntry>>;

export const QR_PALETTE_LIGHT: QrPalette = {
  red: { color: '#b00020', on: '#ffffff' },
  green: { color: '#1b6b35', on: '#ffffff' },
  orange: { color: '#b45309', on: '#ffffff' },
  blue: { color: '#1565d8', on: '#ffffff' },
  purple: { color: '#4a148c', on: '#ffffff' },
  yellow: { color: '#a67c00', on: '#000000' },
};

export const QR_PALETTE_DARK: QrPalette = {
  red: { color: '#ff6b7a', on: '#000000' },
  green: { color: '#4cc38a', on: '#000000' },
  orange: { color: '#ff9f43', on: '#000000' },
  blue: { color: '#4d9fff', on: '#000000' },
  purple: { color: '#d0b0ff', on: '#000000' },
  yellow: { color: '#f2c230', on: '#000000' },
};

/** CSS class for a kind's frame. */
export function qrKindClass(kind: QrKind): string {
  return `qr-kind-${kind}`;
}

/** What is being put into a QR code; later wiring maps each call site to one of these. */
export type QrPayloadType =
  | 'keystore-backup'
  | 'recovery-data'
  | 'spend-key'
  | 'invoice-link'
  | 'invoice-link-passphrase'
  | 'stealth-meta-address'
  | 'payment-request'
  | 'registry-entry'
  | 'invoice-link-with-key'
  | 'settings'
  | 'rpc-list'
  | 'pinned-signers'
  | 'receipt'
  | 'payment-proof'
  | 'signed-manifest'
  | 'fingerprint';

const PAYLOAD_KIND: Readonly<Record<QrPayloadType, QrKind>> = {
  'keystore-backup': 'secret',
  'recovery-data': 'secret',
  'spend-key': 'secret',
  'invoice-link': 'shareable',
  'invoice-link-passphrase': 'shareable',
  'stealth-meta-address': 'shareable',
  'payment-request': 'shareable',
  'registry-entry': 'shareable',
  'invoice-link-with-key': 'bearer',
  settings: 'device',
  'rpc-list': 'device',
  'pinned-signers': 'device',
  receipt: 'proof',
  'payment-proof': 'proof',
  'signed-manifest': 'proof',
  fingerprint: 'proof',
};

export interface QrPayloadFlags {
  readonly testnet?: boolean;
  readonly unsigned?: boolean;
  readonly unverified?: boolean;
}

/**
 * Chooses the frame kind for a payload. Secret always wins (never downgraded to caution);
 * otherwise testnet/unsigned/unverified data is shown as CAUTION.
 */
export function kindForPayload(type: QrPayloadType, flags: QrPayloadFlags = {}): QrKind {
  const base = PAYLOAD_KIND[type];
  if (base === 'secret') return base;
  if (flags.testnet === true || flags.unsigned === true || flags.unverified === true) return 'caution';
  return base;
}

/** Longest link (characters) that is printed as a QR on a bill; longer links become dense, unscannable codes on paper. */
export const MAX_PRINT_QR_LINK_CHARS = 500;

export interface PrintQrPolicy {
  /** Whether a QR is printed for this link. */
  readonly includeQr: boolean;
  /** Frame kind to use when a QR is printed. */
  readonly kind: QrKind;
  /** Printed bearer links are readable by anyone who sees the paper. */
  readonly bearerWarning: boolean;
}

/**
 * Print policy for an invoice link on paper. A QR is included only for short links. A link that is not
 * passphrase protected may carry its own decryption key, so a printed copy is a bearer link.
 */
export function printQrPolicy(link: string | undefined, passphraseProtected: boolean): PrintQrPolicy {
  const hasLink = link !== undefined && link.length > 0;
  return {
    includeQr: hasLink && link.length <= MAX_PRINT_QR_LINK_CHARS,
    kind: kindForPayload(passphraseProtected ? 'invoice-link-passphrase' : 'invoice-link-with-key'),
    bearerWarning: hasLink && !passphraseProtected,
  };
}
