// @vitest-environment jsdom
import { checkpointKeyId } from '@ghostpay/ux-vault/portable';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blankDraft, draftSlot, sealDraft } from './invoiceDraft';
import { clearSession, getSessionPublic, suspendSession } from './session';
import { generateWaivedSession } from '../test/keys';

// D2: an opt-in draft (memo, line items, amounts) has no timer, so an explicit clear of the seller keys, which includes an
// idle wipe of recoverable keys, must also remove the draft record. A replacement of the keys (`clearSession(false)`, as
// every install does) and a suspension that keeps the keys must not: reloading, importing the same keys and resuming
// the draft is the documented flow.
const DRAFT_PREFIX = 'ghostpay.invoice-draft.';
const drafts = (): string[] => Object.keys(sessionStorage).filter((k) => k.startsWith(DRAFT_PREFIX));

beforeEach(() => { clearSession(); sessionStorage.clear(); });
afterEach(() => { clearSession(); sessionStorage.clear(); });

async function keepDraft(): Promise<string> {
  const session = generateWaivedSession();
  const slot = draftSlot(session);
  sessionStorage.setItem(slot, await sealDraft(slot, { ...blankDraft(84532), memo: 'private fixture memo' }));
  return slot;
}

describe('opt-in invoice draft retention', () => {
  it('removes the draft record when the seller keys are cleared explicitly', async () => {
    const slot = await keepDraft();
    sessionStorage.setItem('ghostpay.unrelated', 'kept');
    expect(drafts()).toEqual([slot]);
    clearSession();
    expect(drafts()).toEqual([]);
    expect(sessionStorage.getItem('ghostpay.unrelated')).toBe('kept');
  });

  it('removes it after a suspension too, which needs no keys to find the record', async () => {
    await keepDraft();
    suspendSession();
    expect(drafts()).toHaveLength(1);
    clearSession();
    expect(drafts()).toEqual([]);
  });

  it('also removes a legacy v2 record named from the public keys', () => {
    const session = generateWaivedSession();
    sessionStorage.setItem(`ghostpay.invoice-draft.v2.${checkpointKeyId(session.metaAddress, session.signerPublicKey)}`, 'x');
    clearSession();
    expect(drafts()).toEqual([]);
  });

  it('keeps the draft when the keys are only replaced or suspended', async () => {
    const slot = await keepDraft();
    clearSession(false);
    expect(drafts()).toEqual([slot]);
    generateWaivedSession();
    expect(drafts()).toEqual([slot]);
    suspendSession();
    expect(drafts()).toEqual([slot]);
  });

  it('still clears the keys, and keeps the ciphertext, when the browser refuses a removal', async () => {
    const slot = await keepDraft();
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    try {
      expect(() => { clearSession(); }).not.toThrow();
    } finally {
      vi.restoreAllMocks();
    }
    expect(getSessionPublic()).toBeUndefined();
    expect(drafts()).toEqual([slot]);
  });

  it('still clears the keys when the browser refuses storage access', async () => {
    await keepDraft();
    const real = Object.getOwnPropertyDescriptor(window, 'sessionStorage') as PropertyDescriptor;
    Object.defineProperty(window, 'sessionStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } });
    try {
      expect(() => { clearSession(); }).not.toThrow();
    } finally {
      Object.defineProperty(window, 'sessionStorage', real);
    }
  });
});
