/**
 * Unified, typed, fail-closed classifier for scanned or pasted QR text (QR-01).
 *
 * `classifyQrText` only answers "what kind of GhostPay QR is this?" so a screen can accept the family it expects and
 * explain any other one ("this is a <family> QR; open <screen> instead"). It is pure and synchronous: it never
 * navigates, fetches, stores, decrypts or calls a wallet, and it never constructs a URL.
 *
 * Rules:
 * - A hard UTF-8 byte cap ({@link MAX_QR_TEXT_BYTES}, CameraImporter's limit) is checked before any parsing. Smaller
 *   per-family caps come from the owning parsers.
 * - NUL/control/bidi/BOM characters are refused before parsing. No trimming or repair is done beyond what each
 *   owning parser does itself (the JSON envelopes accept JSON whitespace, as `parseStrictJson` does).
 * - Each family is recognised by its owning parser's own envelope marker and then checked by that parser. Where the
 *   owning parser is async or needs context this module does not have, only the envelope is checked and the result
 *   says `validated: false`; the accepting screen MUST still run the owning parser on the original text.
 * - Text that matches more than one family is `unknown`/`ambiguous`, never a guess. Unknown JSON formats are
 *   `unknown-format`; known formats with an unsupported version are `unsupported-version` (so the UI can say "update
 *   the app"); recognised but rejected payloads are `malformed` with a `format` hint.
 * - Results never contain the input text, payload data, ciphertext or other secret material. `unknown` results carry
 *   only a fixed reason code and, at most, a fixed family name.
 */
import { CHAINS } from '@ghostpay/chain-adapters';
import { FRAGMENT_PREFIX, MAX_DECODED_BYTES, PASSPHRASE_ALG, canonicalize, decodeBase64Url, parseStrictJson } from '@ghostpay/invoice-schema';
import {
  DEFAULT_CHAIN_SHORT_NAMES,
  parseInvoiceLink,
  parsePaymentUri,
  type BtcNetwork,
  type InvoiceLinkOptions,
  type ParseOptions,
  type TronNetwork,
} from '@ghostpay/payment-uri';
import { SELLER_PAIRING_FORMAT, SELLER_PAIRING_VERSION, SETTINGS_EXCHANGE_FORMAT, parseChunk, parseSellerPairing } from '@ghostpay/qr-exchange';
import type { ViewId } from '../state';
import { validateKeystoreEnvelope } from './keystore';
import { parsePublicMetaQr } from './qrPayload';
import { kindForPayload, type QrKind, type QrPayloadFlags, type QrPayloadType } from './qrKinds';
import { parseVerifiedReceipt } from './receipts';
import { isSupportedPairingChain } from './sellerPairing';

/** Hard cap on classified text, in UTF-8 bytes (matches CameraImporter's 64 KiB input limit). */
export const MAX_QR_TEXT_BYTES = 65_536;

/** Every family, in a stable order. */
export const QR_FAMILIES = [
  'multipart-fragment',
  'invoice-link',
  'evm-request',
  'bitcoin-request',
  'solana-request',
  'tron-request',
  'public-meta',
  'seller-pairing',
  'settings',
  'seller-receipt',
  'payment-proof',
  'encrypted-keystore',
  'unknown',
] as const;
export type QrFamily = (typeof QR_FAMILIES)[number];
export type KnownQrFamily = Exclude<QrFamily, 'unknown'>;

/** Coarse, fixed rejection codes. They never include any part of the input. */
export type QrUnknownReason =
  | 'empty'
  | 'too-large'
  | 'unsupported-scheme'
  | 'malformed'
  | 'ambiguous'
  | 'unsupported-version'
  | 'unknown-format';

/** How an invoice link protects its contents (read from the unauthenticated envelope `alg`). */
export type InvoiceProtection = 'plain' | 'bearer-key' | 'passphrase';

export type QrClassification =
  /** One GPQ1 chunk with a valid CRC. Classify the assembled payload separately; chunk data is never returned. */
  | { readonly family: 'multipart-fragment'; readonly validated: true; readonly session: string; readonly index: number; readonly total: number }
  /**
   * Invoice link or bare `#gpi=v1.` fragment. Link structure is checked by `parseInvoiceLink`; the envelope is only
   * decoded to read `alg`. Signature, schema and decryption need the async `openFragment` (and Pay's own host
   * check), so `validated` is false. The payload is a bearer secret and is not returned.
   */
  | { readonly family: 'invoice-link'; readonly validated: false; readonly form: 'link' | 'fragment'; readonly protection: InvoiceProtection }
  | { readonly family: 'evm-request'; readonly validated: true; readonly standard: 'eip681' | 'eip3770'; readonly chainId?: number }
  | { readonly family: 'bitcoin-request'; readonly validated: true; readonly network: BtcNetwork; readonly silentPayment: boolean }
  | { readonly family: 'solana-request'; readonly validated: true }
  | { readonly family: 'tron-request'; readonly validated: true; readonly network: TronNetwork }
  | { readonly family: 'public-meta'; readonly validated: true; readonly form: 'raw' | 'json' }
  /** Checked against the allowed chains; the owner must still confirm the config out of band. */
  | { readonly family: 'seller-pairing'; readonly validated: true }
  /**
   * Envelope only (`format` + positive integer `v`): the settings format is versioned by its owner and may gain
   * versions this module does not know. Callers MUST run the owning settings parser before showing or applying it.
   */
  | { readonly family: 'settings'; readonly validated: false; readonly version: number }
  /** Signature verified (key control only; not bound to an invoice and not proof of payment). */
  | { readonly family: 'seller-receipt'; readonly validated: true; readonly version: 1 }
  /** Payer's local receipt (`LocalReceipt`), matched by exact shape. There is no owning import parser. */
  | { readonly family: 'payment-proof'; readonly validated: false; readonly version: 1; readonly status: 'included' | 'reverted' | 'unconfirmed' }
  /** Encrypted seller keystore: envelope validated, never decrypted. Only the version is returned. */
  | { readonly family: 'encrypted-keystore'; readonly validated: true; readonly version: 1 }
  | { readonly family: 'unknown'; readonly reason: QrUnknownReason; readonly format?: KnownQrFamily };

export interface ClassifyOptions {
  /** Lower the byte cap (positive integer). Values above {@link MAX_QR_TEXT_BYTES} or invalid values are ignored. */
  readonly maxBytes?: number;
  /** Chains a seller pairing may name. Default: the app's pairing chains (lib/sellerPairing). */
  readonly sellerPairingChainIds?: readonly number[];
  /** Passed to `parseInvoiceLink` (e.g. `allowedHosts`, `allowLocalDev`). `http:` is refused unless `allowLocalDev`. */
  readonly invoiceLink?: InvoiceLinkOptions;
  /** Passed to `parsePaymentUri` (expected chain/network, EIP-3770 short-name registry). */
  readonly paymentUri?: Omit<ParseOptions, 'invoiceLink'>;
}

/** View that owns each family (`null`: no screen in this app imports it). */
export const QR_FAMILY_SCREEN: Readonly<Record<QrFamily, ViewId | null>> = Object.freeze({
  // Chunks belong to whichever screen is assembling them.
  'multipart-fragment': null,
  'invoice-link': 'pay',
  // No screen imports EIP-681/3770: the EVM sweep destination accepts a bare address only.
  'evm-request': null,
  'bitcoin-request': 'btc',
  'solana-request': 'solana',
  'tron-request': 'tron',
  'public-meta': 'registry',
  'seller-pairing': 'seller',
  settings: 'settings',
  'seller-receipt': 'pay',
  // Exported for the payer's records only; nothing imports it.
  'payment-proof': null,
  'encrypted-keystore': 'seller',
  unknown: null,
});

// Fixed set refused before any lookup, so not even a custom EIP-3770 registry can name one of these.
const DANGEROUS_SCHEMES: ReadonlySet<string> = new Set([
  'javascript', 'vbscript', 'livescript', 'data', 'file', 'blob', 'filesystem', 'intent', 'about', 'chrome',
  'chrome-extension', 'moz-extension', 'view-source', 'jar', 'ms-appx', 'ms-appx-web', 'res', 'resource', 'ftp',
  'ws', 'wss', 'mailto', 'tel', 'sms', 'content', 'android-app', 'itms-services', 'web+ghostpay',
]);
const PAYMENT_SCHEMES: ReadonlySet<string> = new Set(['ethereum', 'bitcoin', 'solana', 'tron']);
const SCHEME_RE = /^([A-Za-z][A-Za-z0-9+.-]{0,31}):/;
// C0 except TAB/LF/CR, DEL, C1, zero-width and bidi controls, line/paragraph separators, BOM.
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/;
const JSON_START = /^[ \t\n\r]*[{[]/;
const FRAGMENT_VERSION_RE = /^#gpi=v([0-9]{1,6})\./;
const FRAGMENT_RE = /^#gpi=v1\.[A-Za-z0-9_-]+$/;
const MAX_ENCODED_FRAGMENT_CHARS = Math.ceil((MAX_DECODED_BYTES * 4) / 3);
const CHUNK_VERSION_RE = /^GPQ([0-9]{1,6})\//;

const PUBLIC_META_FORMAT = 'ghostpay-public-meta';
const LOCAL_RECEIPT_KIND = 'ghostpay-local-receipt';
const LOCAL_RECEIPT_KEYS = 'chainId|createdAt|fee|fiat|gross|invoiceNonce|kind|net|quote|router|status|token|txHash|version';
const LOCAL_RECEIPT_STATUS: ReadonlySet<string> = new Set(['included', 'reverted', 'unconfirmed']);
const DEFAULT_PAIRING_CHAINS: readonly number[] = Object.freeze(CHAINS.map((chain) => chain.chainId).filter(isSupportedPairingChain));

type Detected = QrClassification | null;
type JsonObject = Readonly<Record<string, unknown>>;

const unknown = (reason: QrUnknownReason, format?: KnownQrFamily): QrClassification =>
  format === undefined ? { family: 'unknown', reason } : { family: 'unknown', reason, format };
const malformed = (format: KnownQrFamily): QrClassification => unknown('malformed', format);

/** Runs an owning parser; any throw is a fixed `malformed` result for that family (error text is never kept). */
function attempt(format: KnownQrFamily, run: () => QrClassification): QrClassification {
  try { return run(); } catch { return malformed(format); }
}

function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { bytes += 4; i++; }
    else bytes += 3; // BMP, or a lone surrogate (encoded as U+FFFD, 3 bytes).
  }
  return bytes;
}

function byteCap(opts: ClassifyOptions): number {
  const m = opts.maxBytes;
  return m !== undefined && Number.isSafeInteger(m) && m > 0 ? Math.min(m, MAX_QR_TEXT_BYTES) : MAX_QR_TEXT_BYTES;
}

function own(o: JsonObject, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, key);
}

/** `ok` for the supported version, `unsupported` for another non-negative integer, `bad` otherwise. */
function versionOf(value: unknown, supported: number): 'ok' | 'unsupported' | 'bad' {
  if (value === supported) return 'ok';
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? 'unsupported' : 'bad';
}

// ---------------------------------------------------------------- text detectors

function detectChunk(text: string): Detected {
  const m = CHUNK_VERSION_RE.exec(text);
  if (m === null) return null;
  if (m[1] !== '1') return unknown('unsupported-version', 'multipart-fragment');
  return attempt('multipart-fragment', () => {
    const c = parseChunk(text);
    return { family: 'multipart-fragment', validated: true, session: c.session, index: c.index, total: c.total };
  });
}

/** Reads only the envelope `alg` (prefix, length, canonical base64url, size, fatal UTF-8, strict canonical JSON). */
function invoiceProtection(fragment: string, form: 'link' | 'fragment'): QrClassification {
  const encoded = fragment.slice(FRAGMENT_PREFIX.length);
  if (!FRAGMENT_RE.test(fragment) || encoded.length > MAX_ENCODED_FRAGMENT_CHARS) return malformed('invoice-link');
  return attempt('invoice-link', () => {
    const bytes = decodeBase64Url(encoded);
    if (bytes.length > MAX_DECODED_BYTES) return malformed('invoice-link');
    const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    const root = parseStrictJson(source);
    if (canonicalize(root) !== source || typeof root !== 'object' || root === null || Array.isArray(root)) return malformed('invoice-link');
    const alg = root['alg'];
    const protection: InvoiceProtection | undefined =
      alg === 'none' ? 'plain' : alg === 'A256GCM' ? 'bearer-key' : alg === PASSPHRASE_ALG ? 'passphrase' : undefined;
    if (protection === undefined) return typeof alg === 'string' ? unknown('unsupported-version', 'invoice-link') : malformed('invoice-link');
    return { family: 'invoice-link', validated: false, form, protection };
  });
}

function detectInvoiceFragment(text: string): Detected {
  if (!text.startsWith('#gpi=')) return null;
  if (!text.startsWith(FRAGMENT_PREFIX)) return FRAGMENT_VERSION_RE.test(text) ? unknown('unsupported-version', 'invoice-link') : malformed('invoice-link');
  return invoiceProtection(text, 'fragment');
}

function detectInvoiceLink(text: string, scheme: string | undefined, opts: ClassifyOptions): Detected {
  if (scheme !== 'https' && scheme !== 'http') return null;
  const hash = text.indexOf('#gpi=');
  if (hash < 0) return null;
  const fragment = text.slice(hash);
  if (!fragment.startsWith(FRAGMENT_PREFIX)) return FRAGMENT_VERSION_RE.test(fragment) ? unknown('unsupported-version', 'invoice-link') : malformed('invoice-link');
  return attempt('invoice-link', () => invoiceProtection(parseInvoiceLink(text, opts.invoiceLink).fragment, 'link'));
}

function detectPaymentRequest(text: string, scheme: string | undefined, registry: Readonly<Record<string, number>>, opts: ClassifyOptions): Detected {
  // http(s) is only ever an invoice link and `st:` a meta-address, whatever a custom registry contains.
  if (scheme === undefined || scheme === 'https' || scheme === 'http' || scheme === 'st') return null;
  const eip3770 = !PAYMENT_SCHEMES.has(scheme);
  if (eip3770 && !own(registry, text.slice(0, text.indexOf(':')))) return null;
  const format: KnownQrFamily =
    scheme === 'bitcoin' ? 'bitcoin-request' : scheme === 'solana' ? 'solana-request' : scheme === 'tron' ? 'tron-request' : 'evm-request';
  return attempt(format, () => {
    const parsed = parsePaymentUri(text, { ...opts.paymentUri, chainShortNames: registry });
    switch (parsed.kind) {
      case 'eip681':
        return parsed.value.chainId === undefined
          ? { family: 'evm-request', validated: true, standard: 'eip681' }
          : { family: 'evm-request', validated: true, standard: 'eip681', chainId: parsed.value.chainId };
      case 'eip3770':
        return { family: 'evm-request', validated: true, standard: 'eip3770', chainId: parsed.value.chainId };
      case 'bitcoin':
        return { family: 'bitcoin-request', validated: true, network: parsed.value.network, silentPayment: parsed.value.silentPayment !== undefined };
      case 'solana-pay':
        return { family: 'solana-request', validated: true };
      case 'tron':
        return { family: 'tron-request', validated: true, network: parsed.value.network };
      /* c8 ignore next 2 -- http(s) never reaches this detector */
      default:
        return malformed(format);
    }
  });
}

function detectRawPublicMeta(text: string, scheme: string | undefined): Detected {
  if (scheme !== 'st') return null;
  return attempt('public-meta', () => { parsePublicMetaQr(text); return { family: 'public-meta', validated: true, form: 'raw' }; });
}

// ---------------------------------------------------------------- JSON detectors (one parse, shared)

function detectPairing(o: JsonObject, text: string, opts: ClassifyOptions): Detected {
  if (o['format'] !== SELLER_PAIRING_FORMAT) return null;
  const v = versionOf(o['v'], SELLER_PAIRING_VERSION);
  if (v !== 'ok') return unknown(v === 'unsupported' ? 'unsupported-version' : 'malformed', 'seller-pairing');
  return attempt('seller-pairing', () => {
    parseSellerPairing(text, opts.sellerPairingChainIds ?? DEFAULT_PAIRING_CHAINS);
    return { family: 'seller-pairing', validated: true };
  });
}

function detectJsonPublicMeta(o: JsonObject, text: string): Detected {
  if (o['format'] !== PUBLIC_META_FORMAT) return null;
  const v = versionOf(o['v'], 1);
  if (v !== 'ok') return unknown(v === 'unsupported' ? 'unsupported-version' : 'malformed', 'public-meta');
  return attempt('public-meta', () => { parsePublicMetaQr(text); return { family: 'public-meta', validated: true, form: 'json' }; });
}

/** Envelope only: the settings format's owner validates (and may add versions). */
function detectSettings(o: JsonObject): Detected {
  if (o['format'] !== SETTINGS_EXCHANGE_FORMAT) return null;
  const v = o['v'];
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 1) return malformed('settings');
  return { family: 'settings', validated: false, version: v };
}

function detectSellerReceipt(o: JsonObject, text: string): Detected {
  if (!own(o, 'signature') || !own(o, 'invoiceDigest') || !own(o, 'txHash')) return null;
  const v = versionOf(o['version'], 1);
  if (v !== 'ok') return unknown(v === 'unsupported' ? 'unsupported-version' : 'malformed', 'seller-receipt');
  return attempt('seller-receipt', () => { parseVerifiedReceipt(text); return { family: 'seller-receipt', validated: true, version: 1 }; });
}

/** Exact `LocalReceipt` shape (lib/payExec.ts), as PaymentProofQr renders it. No owning import parser exists. */
function detectPaymentProof(o: JsonObject): Detected {
  if (o['kind'] !== LOCAL_RECEIPT_KIND) return null;
  const v = versionOf(o['version'], 1);
  if (v !== 'ok') return unknown(v === 'unsupported' ? 'unsupported-version' : 'malformed', 'payment-proof');
  const keys = Object.keys(o).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).join('|');
  const status = o['status'];
  const quote = o['quote'];
  const txHash = o['txHash'];
  const quoteOk = typeof quote === 'object' && quote !== null && !Array.isArray(quote) && Object.keys(quote).sort().join('|') === 'expiresAt|source|timestamp';
  if (keys !== LOCAL_RECEIPT_KEYS || typeof status !== 'string' || !LOCAL_RECEIPT_STATUS.has(status) || !quoteOk
    || typeof txHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(txHash) || typeof o['chainId'] !== 'number') return malformed('payment-proof');
  return { family: 'payment-proof', validated: false, version: 1, status: status as 'included' | 'reverted' | 'unconfirmed' };
}

/** Envelope validation by the owning sync validator; never decrypts and returns no field of the file. */
function detectKeystore(o: JsonObject, text: string): Detected {
  if (!own(o, 'ciphertext') || !own(o, 'kdf') || !own(o, 'cipher')) return null;
  const v = versionOf(o['v'], 1);
  if (v !== 'ok') return unknown(v === 'unsupported' ? 'unsupported-version' : 'malformed', 'encrypted-keystore');
  return attempt('encrypted-keystore', () => { validateKeystoreEnvelope(text); return { family: 'encrypted-keystore', validated: true, version: 1 }; });
}

function detectJson(text: string, opts: ClassifyOptions): Detected[] | QrClassification {
  let root: unknown;
  try { root = parseStrictJson(text); } catch { return unknown('malformed'); }
  if (typeof root !== 'object' || root === null || Array.isArray(root)) return unknown('unknown-format');
  const o = root as JsonObject;
  return [
    detectPairing(o, text, opts),
    detectJsonPublicMeta(o, text),
    detectSettings(o),
    detectSellerReceipt(o, text),
    detectPaymentProof(o),
    detectKeystore(o, text),
  ];
}

function classify(text: string, opts: ClassifyOptions): QrClassification {
  if (typeof text !== 'string') return unknown('malformed');
  if (text.length === 0) return unknown('empty');
  const cap = byteCap(opts);
  // UTF-8 never needs fewer bytes than UTF-16 code units, so the length check is a safe cheap pre-check.
  if (text.length > cap || utf8Length(text) > cap) return unknown('too-large');
  if (FORBIDDEN_CHARS.test(text)) return unknown('malformed');
  if (/^\s*$/.test(text)) return unknown('empty');

  const match = SCHEME_RE.exec(text);
  const scheme = match?.[1]?.toLowerCase();
  if (scheme !== undefined && DANGEROUS_SCHEMES.has(scheme)) return unknown('unsupported-scheme');
  if (scheme === 'http' && opts.invoiceLink?.allowLocalDev !== true) return unknown('unsupported-scheme');
  const registry = opts.paymentUri?.chainShortNames ?? DEFAULT_CHAIN_SHORT_NAMES;

  let detected: Detected[];
  let isJson = false;
  if (JSON_START.test(text)) {
    const json = detectJson(text, opts);
    if (!Array.isArray(json)) return json;
    detected = json;
    isJson = true;
  } else {
    detected = [
      detectChunk(text),
      detectInvoiceFragment(text),
      detectInvoiceLink(text, scheme, opts),
      detectPaymentRequest(text, scheme, registry, opts),
      detectRawPublicMeta(text, scheme),
    ];
  }
  const hits = detected.filter((d): d is QrClassification => d !== null);
  if (hits.length > 1) return unknown('ambiguous');
  const [hit] = hits;
  if (hit !== undefined) return hit;
  if (isJson) return unknown('unknown-format');
  if (scheme !== undefined) return unknown('unsupported-scheme');
  // Reason only (no repair): a dangerous scheme behind leading whitespace is still reported as a scheme problem.
  const padded = SCHEME_RE.exec(text.replace(/^\s+/, ''))?.[1]?.toLowerCase();
  return unknown(padded !== undefined && DANGEROUS_SCHEMES.has(padded) ? 'unsupported-scheme' : 'malformed');
}

/**
 * Identifies the payload family of scanned or pasted QR text. Never throws, never performs an action, and never
 * returns the input. See the module comment for the rules and the meaning of `validated`.
 */
export function classifyQrText(text: string, opts: ClassifyOptions = {}): QrClassification {
  try { return classify(text, opts); } catch { return unknown('malformed'); }
}

function evmTestnet(chainId: number | undefined): boolean {
  return chainId !== undefined && CHAINS.some((chain) => chain.chainId === chainId && chain.testnet);
}

/**
 * Colour-coded frame kind for a classification, via `kindForPayload` (secret always wins). Testnet networks and an
 * unconfirmed payment proof are shown as CAUTION, as PaymentProofQr does; `flags` add caller knowledge.
 * Returns `null` for `unknown` and for a lone multipart chunk (classify the assembled payload instead).
 */
export function kindForFamily(result: QrClassification, flags: QrPayloadFlags = {}): QrKind | null {
  let type: QrPayloadType;
  let derived: QrPayloadFlags = {};
  switch (result.family) {
    case 'unknown':
    case 'multipart-fragment':
      return null;
    case 'invoice-link':
      type = result.protection === 'bearer-key' ? 'invoice-link-with-key' : result.protection === 'passphrase' ? 'invoice-link-passphrase' : 'invoice-link';
      break;
    case 'evm-request':
      type = 'payment-request'; derived = { testnet: evmTestnet(result.chainId) };
      break;
    case 'bitcoin-request':
      type = 'payment-request'; derived = { testnet: result.network !== 'main' };
      break;
    case 'tron-request':
      type = 'payment-request'; derived = { testnet: result.network !== 'mainnet' };
      break;
    case 'solana-request':
      type = 'payment-request';
      break;
    case 'public-meta':
      type = 'stealth-meta-address';
      break;
    case 'seller-pairing':
    case 'settings':
      type = 'settings';
      break;
    case 'seller-receipt':
      type = 'receipt';
      break;
    case 'payment-proof':
      type = 'payment-proof'; derived = { unverified: result.status !== 'included' };
      break;
    case 'encrypted-keystore':
      type = 'keystore-backup';
      break;
  }
  return kindForPayload(type, {
    testnet: derived.testnet === true || flags.testnet === true,
    unsigned: flags.unsigned === true,
    unverified: derived.unverified === true || flags.unverified === true,
  });
}
