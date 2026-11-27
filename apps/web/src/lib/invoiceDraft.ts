import { base64urlnopad } from '@scure/base';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { checkpointKeyId } from '@ghostpay/ux-vault/portable';
import type { LineItemInput } from './invoiceCreate';
import { DRAFT_SLOT_PREFIX } from './invoiceDraftSlots';
import { sessionViewingKey, type ViewingKeyLender } from './scanCursorSlot';
import { captureSessionGuard, getSessionPublic, revealViewingKey, type SessionPublic } from './session';

/**
 * Opt-in, tab-local encrypted drafts of the Create invoice form (successor of #591/#604).
 *
 * A record holds editable form values and protection choices only. Seller keys, invoice passphrases, generated links
 * and the matching opt-in are never form values here. Records are AES-256-GCM encrypted with a key derived by HKDF
 * from the loaded seller's viewing key and a random per-record salt, with the seller-bound slot name as additional
 * data, using the browser's WebCrypto (as `features/btc/scanStore.ts` does). Without those seller keys a record cannot
 * be opened, and neither can its slot be named: the name is itself derived from the viewing key ({@link draftSlot}).
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

/** What the Create invoice form can present for a set of values. */
export interface DraftForm {
  /** The lean build: fixed-token v1 invoices only, without a gas-buffer policy. */
  readonly supportedOnly: boolean;
  /** Whether a fiat price quote exists for these values' chain, token and currency. */
  readonly quoteAvailable: (draft: InvoiceDraft) => boolean;
}

/** The pricing and gas-buffer choices the form shows and submits for these values. */
export function shownTerms(draft: InvoiceDraft, form: DraftForm): Pick<InvoiceDraft, 'amountMode' | 'bufferMode'> {
  return {
    amountMode: !form.supportedOnly && form.quoteAvailable(draft) ? draft.amountMode : 'fixed_token',
    // Payers never offer a gas buffer on the native coin (ADR-0024), so it always means no policy.
    bufferMode: !form.supportedOnly && draft.token !== 'native' ? draft.bufferMode : 'off',
  };
}

/** Whether the form would show a saved draft's money terms unchanged. Otherwise it is refused, never converted. */
export function formCanShow(draft: InvoiceDraft, form: DraftForm): boolean {
  const shown = shownTerms(draft, form);
  return shown.amountMode === draft.amountMode && shown.bufferMode === draft.bufferMode;
}

/**
 * The copy of the form values that is saved: the money terms the form shows (a fiat or buffer choice it hides is not
 * kept). A minimal-metadata draft never keeps a memo or line descriptions, even when the form still holds them from
 * before the switch.
 */
export function draftForForm(draft: InvoiceDraft, form: DraftForm): InvoiceDraft {
  const shown = shownTerms(draft, form);
  return {
    ...draft,
    ...shown,
    ...(shown.bufferMode === 'range' ? {} : { bufferMin: '', bufferMax: '' }),
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

const SLOT_INFO = 'GhostPay/web/invoice-draft/v3/slot';
const RECORD_INFO = 'GhostPay/web/invoice-draft/v3/record';

/** Public seller identity bound into the slot name, so another invoice-signing key under the same viewing key is another slot. */
const sellerId = (session: SessionPublic): string => checkpointKeyId(session.metaAddress, session.signerPublicKey);

/** HKDF-SHA256(viewing key, no salt, label|seller id) as hex, as `scanCursorSlot.checkpointSlot` names a scan cursor. */
function slotName(viewingKey: Uint8Array, seller: string): string {
  if (viewingKey.length !== 32) throw new Error('invalid viewing key');
  return `${DRAFT_SLOT_PREFIX}${bytesToHex(hkdf(sha256, viewingKey, undefined, utf8ToBytes(`${SLOT_INFO}|${seller}`), 32))}`;
}

/**
 * The tab storage slot of the loaded seller, or `undefined` while those keys are not usable: not loaded, suspended by the
 * idle lock, or another seller's (`lender` as in {@link sessionViewingKey}). Format v3: the name derives from the viewing
 * private key and the seller identity, so holding only the public meta-address and signer key cannot confirm that this
 * tab holds a draft. v2 named it from those public keys; a v2 record is never read or migrated (see `invoiceDraftSlots.ts`),
 * and the v1 label belongs to the unmerged #604 format.
 */
export function readableDraftSlot(session: SessionPublic, lender: ViewingKeyLender = sessionViewingKey): string | undefined {
  const seller = sellerId(session);
  return lender(checkpointKeyId(session.spendingPublicKey, session.viewingPublicKey), (viewingKey) => slotName(viewingKey, seller));
}

/** {@link readableDraftSlot}, throwing when the seller keys are not usable. */
export function draftSlot(session: SessionPublic, lender: ViewingKeyLender = sessionViewingKey): string {
  const slot = readableDraftSlot(session, lender);
  if (slot === undefined) throw new Error('Seller keys are not available');
  return slot;
}

const encoder = new TextEncoder();

async function draftKey(slot: string, salt: Uint8Array): Promise<CryptoKey> {
  const seller = getSessionPublic();
  if (seller === undefined) throw new Error('Seller changed');
  // Throws while the session is suspended: an idle lock refuses sealing and opening alike.
  const viewing = revealViewingKey();
  try {
    if (slotName(viewing, sellerId(seller)) !== slot) throw new Error('Seller changed');
    const base = await crypto.subtle.importKey('raw', viewing as BufferSource, 'HKDF', false, ['deriveKey']);
    return await crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: encoder.encode(RECORD_INFO) },
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
