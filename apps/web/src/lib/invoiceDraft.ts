import { base64urlnopad } from '@scure/base';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { checkpointKeyId } from '@ghostpay/ux-vault/portable';
import type { LineItemInput } from './invoiceCreate';
import { captureSessionGuard, getSessionPublic, revealViewingKey, type SessionPublic } from './session';

/**
 * Opt-in, tab-local encrypted drafts of the Create invoice form (successor of #591/#604).
 *
 * A record holds editable form values and protection choices only. Seller keys, invoice passphrases, generated links
 * and the matching opt-in are never form values here. Records are AES-256-GCM encrypted with a key derived by HKDF
 * from the loaded seller's viewing key and a random per-record salt, with the seller-bound slot name as additional
 * data, using the browser's WebCrypto (as `features/btc/scanStore.ts` does). Without those seller keys a record cannot
 * be opened.
 */

export const emptyItem: LineItemInput = { description: '', quantity: '1', unitPrice: '' };

export type FeePolicy = 'payer_pays' | 'seller_pays';
export type AmountMode = 'fixed_token' | 'fiat_quote';
export type BufferMode = 'off' | 'declined' | 'range';

export interface InvoiceDraft {
  readonly chainId: number;
  readonly token: string;
  readonly currency: string;
  readonly items: readonly LineItemInput[];
  readonly taxRate: string;
  readonly feePolicy: FeePolicy;
  readonly amountMode: AmountMode;
  readonly tokenAmount: string;
  readonly expiryHours: number;
  readonly quoteMinutes: number;
  readonly slippage: number;
  readonly minimalMetadata: boolean;
  readonly memo: string;
  readonly bufferMode: BufferMode;
  readonly bufferMin: string;
  readonly bufferMax: string;
  readonly encrypt: boolean;
  readonly protectWithPassphrase: boolean;
}

export function blankDraft(chainId: number): InvoiceDraft {
  return {
    chainId, token: 'native', currency: 'USD', items: [{ ...emptyItem }], taxRate: '0',
    feePolicy: 'seller_pays', amountMode: 'fixed_token', tokenAmount: '', expiryHours: 24, quoteMinutes: 15,
    slippage: 50, minimalMetadata: false, memo: '', bufferMode: 'off', bufferMin: '', bufferMax: '', encrypt: false,
    protectWithPassphrase: false,
  };
}

/**
 * Whether a lean form can show a draft's money terms unchanged. A lean build only issues fixed-token v1 invoices, so a
 * draft with fiat pricing or a gas-buffer policy is refused there rather than converted.
 */
export const leanCanShow = (draft: InvoiceDraft): boolean => draft.amountMode === 'fixed_token' && draft.bufferMode === 'off';

/**
 * What a draft may carry for the form it is saved from or restored into. A lean form never writes fiat pricing or the
 * v2 buffer policy. A minimal-metadata draft never keeps a memo or line descriptions, even when the form still holds
 * them from before the switch.
 */
export function draftForForm(draft: InvoiceDraft, supportedOnly: boolean): InvoiceDraft {
  const blank = blankDraft(draft.chainId);
  return {
    ...draft,
    ...(supportedOnly ? {
      amountMode: blank.amountMode, bufferMode: blank.bufferMode, bufferMin: blank.bufferMin, bufferMax: blank.bufferMax,
    } : {}),
    ...(draft.minimalMetadata ? { memo: '', items: draft.items.map((item) => ({ ...item, description: '' })) } : {}),
  };
}

const MAX_RECORD_CHARS = 256 * 1024;
const MAX_PLAIN_BYTES = 128 * 1024;
const MAX_ITEMS = 50;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const SHORT_TEXT = 100;
const RECORD = /^[a-f0-9]{32}\.[A-Za-z0-9_-]+$/;
const TOKEN = /^(native|0x[0-9a-f]{40})$/;
const STRING_LIMITS = {
  token: 42, currency: 3, taxRate: SHORT_TEXT, tokenAmount: SHORT_TEXT, memo: 500, bufferMin: 80, bufferMax: 80,
} as const;
const NUMBER_KEYS = ['expiryHours', 'quoteMinutes', 'slippage'] as const;
const BOOLEAN_KEYS = ['minimalMetadata', 'encrypt', 'protectWithPassphrase'] as const;
const DRAFT_KEYS = Object.keys(blankDraft(0)).sort();
const ITEM_KEYS = ['description', 'quantity', 'unitPrice'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const sameKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const own = Object.keys(value).sort();
  return own.length === keys.length && own.every((key, i) => key === keys[i]);
};
const shortString = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max;

function validItem(value: unknown, minimal: boolean): value is LineItemInput {
  if (!isRecord(value) || !sameKeys(value, [...ITEM_KEYS].sort())) return false;
  return shortString(value['description'], 200) && shortString(value['quantity'], SHORT_TEXT) &&
    shortString(value['unitPrice'], SHORT_TEXT) && (!minimal || value['description'] === '');
}

/** Exactly the draft shape: no extra or missing fields, bounded text, known choices and a minimal draft stays minimal. */
export function validDraft(value: unknown): value is InvoiceDraft {
  if (!isRecord(value) || !sameKeys(value, DRAFT_KEYS)) return false;
  const chainId = value['chainId'];
  if (typeof chainId !== 'number' || !Number.isSafeInteger(chainId) || chainId <= 0) return false;
  for (const [key, max] of Object.entries(STRING_LIMITS)) if (!shortString(value[key], max)) return false;
  if (!TOKEN.test(value['token'] as string)) return false;
  for (const key of NUMBER_KEYS) {
    const n = value[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 1_000_000) return false;
  }
  for (const key of BOOLEAN_KEYS) if (typeof value[key] !== 'boolean') return false;
  if (!['seller_pays', 'payer_pays'].includes(value['feePolicy'] as string)) return false;
  if (!['fixed_token', 'fiat_quote'].includes(value['amountMode'] as string)) return false;
  if (!['off', 'declined', 'range'].includes(value['bufferMode'] as string)) return false;
  const minimal = value['minimalMetadata'] === true;
  if (minimal && value['memo'] !== '') return false;
  const items = value['items'];
  return Array.isArray(items) && items.length >= 1 && items.length <= MAX_ITEMS && items.every((item) => validItem(item, minimal));
}

/**
 * The tab storage slot of the loaded seller: bound to the meta-address and the invoice-signing key. Format v2: the v1
 * label belongs to the unmerged #604 format, whose records this build neither reads nor overwrites.
 */
export function draftSlot(session: SessionPublic): string {
  return 'ghostpay.invoice-draft.v2.' + checkpointKeyId(session.metaAddress, session.signerPublicKey);
}

const encoder = new TextEncoder();

async function draftKey(slot: string, salt: Uint8Array): Promise<CryptoKey> {
  const seller = getSessionPublic();
  if (seller === undefined || draftSlot(seller) !== slot) throw new Error('Seller changed');
  const viewing = revealViewingKey();
  try {
    const base = await crypto.subtle.importKey('raw', viewing as BufferSource, 'HKDF', false, ['deriveKey']);
    return await crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: encoder.encode('GhostPay/web/invoice-draft/v2') },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
    );
  } finally { viewing.fill(0); }
}

/** Encrypts a valid draft for `slot`. Throws when the seller changes or the draft is invalid or too large. */
export async function sealDraft(slot: string, draft: InvoiceDraft): Promise<string> {
  const guard = captureSessionGuard();
  const plain = encoder.encode(JSON.stringify(draft));
  if (!validDraft(draft) || plain.length > MAX_PLAIN_BYTES) throw new Error('Invalid draft');
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await draftKey(slot, salt);
  const sealed = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: encoder.encode(slot), tagLength: 128 }, key, plain,
  ));
  guard();
  const body = new Uint8Array(IV_BYTES + sealed.length);
  body.set(iv, 0);
  body.set(sealed, IV_BYTES);
  return bytesToHex(salt) + '.' + base64urlnopad.encode(body);
}

/** Opens a record for `slot` with the loaded seller keys. Damaged, foreign or out-of-shape records throw. */
export async function openDraft(slot: string, raw: string): Promise<InvoiceDraft> {
  const guard = captureSessionGuard();
  if (raw.length > MAX_RECORD_CHARS || !RECORD.test(raw)) throw new Error('Invalid draft');
  const body = base64urlnopad.decode(raw.slice(2 * SALT_BYTES + 1));
  if (body.length < IV_BYTES + 16) throw new Error('Invalid draft');
  const key = await draftKey(slot, hexToBytes(raw.slice(0, 2 * SALT_BYTES)));
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: body.slice(0, IV_BYTES) as BufferSource, additionalData: encoder.encode(slot), tagLength: 128 },
    key, body.slice(IV_BYTES),
  );
  guard();
  const draft: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain));
  if (!validDraft(draft)) throw new Error('Invalid draft');
  return draft;
}
