import { createAesGcmSealer, deriveSealKey } from '@ghostpay/ux-core';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { checkpointKeyId } from '@ghostpay/ux-vault/portable';
import type { LineItemInput } from './invoiceCreate';
import { captureSessionGuard, getSessionPublic, revealViewingKey, type SessionPublic } from './session';

export const emptyItem: LineItemInput = { description: '', quantity: '1', unitPrice: '' };
export function blankDraft(chainId: number) {
  return {
    chainId, token: 'native', currency: 'USD', items: [{ ...emptyItem }], taxRate: '0',
    feePolicy: 'seller_pays' as 'payer_pays' | 'seller_pays', amountMode: 'fixed_token' as 'fixed_token' | 'fiat_quote',
    tokenAmount: '', expiryHours: 24, quoteMinutes: 15, slippage: 50, memo: '',
    bufferMode: 'off' as 'off' | 'declined' | 'range', bufferMin: '', bufferMax: '', encrypt: false, protectWithPassphrase: false,
  };
}
export type InvoiceDraft = ReturnType<typeof blankDraft>;

// Only unfinished form values can enter this record. Neither sharing credentials nor signing material are form fields.
const MAX_RECORD_CHARS = 256 * 1024;
function validDraft(value: unknown): value is InvoiceDraft {
  if (typeof value !== 'object' || value === null) return false;
  const fields = value as Record<string, unknown>;
  const defaults = blankDraft(0);
  const keys = Object.keys(defaults) as (keyof InvoiceDraft)[];
  return Object.keys(fields).length === keys.length && keys.every(key =>
    key === 'items' || (typeof fields[key] === typeof defaults[key] &&
      (typeof defaults[key] !== 'number' || Number.isSafeInteger(fields[key])))) &&
    ['seller_pays', 'payer_pays'].includes(String(fields['feePolicy'])) &&
    ['fixed_token', 'fiat_quote'].includes(String(fields['amountMode'])) &&
    ['off', 'declined', 'range'].includes(String(fields['bufferMode'])) &&
    Array.isArray(fields['items']) && fields['items'].length >= 1 && fields['items'].length <= 50 &&
    fields['items'].every((row: unknown) => {
      if (typeof row !== 'object' || row === null) return false;
      const item = row as Record<string, unknown>;
      return Object.keys(item).length === 3 && ['description', 'quantity', 'unitPrice'].every(key => typeof item[key] === 'string');
    });
}

export function draftSlot(session: SessionPublic): string {
  return 'ghostpay.invoice-draft.v1.' + checkpointKeyId(session.metaAddress, session.signerPublicKey);
}

async function sealer(slot: string, salt: Uint8Array) {
  const seller = getSessionPublic();
  if (seller === undefined || draftSlot(seller) !== slot) throw new Error('Seller changed');
  const viewing = revealViewingKey();
  try {
    const key = await deriveSealKey(viewing, salt, 'invoice-draft');
    return createAesGcmSealer(key, n => crypto.getRandomValues(new Uint8Array(n)));
  } finally { viewing.fill(0); }
}

export async function sealDraft(slot: string, draft: InvoiceDraft): Promise<string> {
  const guard = captureSessionGuard();
  const text = JSON.stringify(draft);
  if (!validDraft(draft) || new TextEncoder().encode(text).length > MAX_RECORD_CHARS / 2) throw new Error('Invalid draft');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const box = await sealer(slot, salt);
  const sealed = await box.seal(text, slot);
  guard();
  return bytesToHex(salt) + '.' + sealed;
}

export async function openDraft(slot: string, raw: string): Promise<InvoiceDraft> {
  const guard = captureSessionGuard();
  if (raw.length > MAX_RECORD_CHARS || !/^[a-f0-9]{32}\.[A-Za-z0-9_-]+$/.test(raw)) throw new Error('Invalid draft');
  const box = await sealer(slot, hexToBytes(raw.slice(0, 32)));
  const draft: unknown = JSON.parse(await box.open(raw.slice(33), slot));
  guard();
  if (!validDraft(draft)) throw new Error('Invalid draft');
  return draft;
}
