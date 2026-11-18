import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { afterEach, describe, expect, it } from 'vitest';
import { checkpointKeyId, localCheckpointStore } from './scanClient';
import { CHECKPOINT_SLOT_PREFIX, checkpointSlot, legacyCheckpointSlot, sessionViewingKey } from './scanCursorSlot';
import { clearSession, generateSession, importSession, type SessionPublic } from './session';

/** SEC-22: a scan cursor slot must not tell anyone holding only a seller's public keys that this browser scans for them. */

const LEGACY_PREFIX = 'ghostpay.scan.checkpoint.v2.';
const CURSOR = { nextBlock: 4242n, last: { number: 4241n, hash: `0x${'c'.repeat(64)}` as const } };

function mem() {
  const map = new Map<string, string>();
  return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
}

/** Every identifier an observer can compute from a meta-address (both public keys) alone. */
function publicIdentifiers(pub: SessionPublic): string[] {
  const keyId = checkpointKeyId(pub.spendingPublicKey, pub.viewingPublicKey);
  const spend = pub.spendingPublicKey.toLowerCase();
  const view = pub.viewingPublicKey.toLowerCase();
  return [keyId, spend, view, bytesToHex(sha256(utf8ToBytes(spend))), bytesToHex(sha256(utf8ToBytes(view))), pub.metaAddress.toLowerCase()];
}

afterEach(() => {
  clearSession(false);
});

describe('SEC-22 scan cursor slot names', () => {
  it('are not computable from the public spending and viewing keys', () => {
    const pub = generateSession();
    const keyId = checkpointKeyId(pub.spendingPublicKey, pub.viewingPublicKey);
    const st = mem();
    const cp = localCheckpointStore(st);
    cp.save(84532, keyId, CURSOR);
    expect(cp.load(84532, keyId)).toEqual(CURSOR);
    expect(st.map.size).toBe(1);
    const [slot] = [...st.map.keys()];
    for (const id of publicIdentifiers(pub)) expect(slot!.toLowerCase()).not.toContain(id);
    expect(slot).not.toContain('84532');
    expect(st.map.has(`${LEGACY_PREFIX}84532.${keyId}`)).toBe(false);
    // The stored value is public chain data only.
    for (const id of publicIdentifiers(pub)) expect(st.map.get(slot!)!.toLowerCase()).not.toContain(id);
  });

  it('depend on the viewing private key: other keys never read this position, the same keys restored do', () => {
    const viewingKeyHex = '22'.repeat(32);
    const st = mem();
    const cp = localCheckpointStore(st);
    const a = importSession({ spendingKeyHex: '11'.repeat(32), viewingKeyHex, signingKeyHex: '33'.repeat(32) });
    const keyA = checkpointKeyId(a.spendingPublicKey, a.viewingPublicKey);
    cp.save(84532, keyA, CURSOR);
    const slotA = [...st.map.keys()];
    clearSession(false);
    // With no keys loaded, the position is neither readable nor writable, and nothing is written.
    expect(cp.load(84532, keyA)).toBeUndefined();
    cp.save(84532, keyA, { nextBlock: 1n });
    expect([...st.map.keys()]).toEqual(slotA);
    const b = importSession({ spendingKeyHex: '44'.repeat(32), viewingKeyHex: '55'.repeat(32), signingKeyHex: '66'.repeat(32) });
    const keyB = checkpointKeyId(b.spendingPublicKey, b.viewingPublicKey);
    expect(cp.load(84532, keyB)).toBeUndefined();
    // A key id that is not the loaded keys' is refused rather than served from another key's slot.
    expect(cp.load(84532, keyA)).toBeUndefined();
    cp.save(84532, keyA, { nextBlock: 2n });
    expect([...st.map.keys()]).toEqual(slotA);
    clearSession(false);
    importSession({ spendingKeyHex: '11'.repeat(32), viewingKeyHex, signingKeyHex: '33'.repeat(32) });
    expect(cp.load(84532, keyA)).toEqual(CURSOR);
  });

  it('ignore a legacy public-key slot (fail closed to a rescan) and delete it on the first new-format save', () => {
    const pub = generateSession();
    const keyId = checkpointKeyId(pub.spendingPublicKey, pub.viewingPublicKey);
    const legacy = `${LEGACY_PREFIX}84532.${keyId}`;
    const st = mem();
    st.setItem(legacy, JSON.stringify({ nextBlock: '9000', last: { number: '8999', hash: `0x${'a'.repeat(64)}` } }));
    const cp = localCheckpointStore(st);
    expect(cp.load(84532, keyId)).toBeUndefined();
    expect(st.map.has(legacy)).toBe(true); // loading has no side effects
    cp.save(84532, keyId, { nextBlock: 100n });
    expect(st.map.has(legacy)).toBe(false);
    expect(cp.load(84532, keyId)).toEqual({ nextBlock: 100n });
    expect(st.map.size).toBe(1);
  });

  it('keep the legacy slot when the new-format write fails, and remove it on clear', () => {
    const pub = generateSession();
    const keyId = checkpointKeyId(pub.spendingPublicKey, pub.viewingPublicKey);
    const legacy = `${LEGACY_PREFIX}84532.${keyId}`;
    const st = mem();
    st.setItem(legacy, JSON.stringify({ nextBlock: '9000' }));
    const full = { ...st, setItem: () => { throw new Error('QuotaExceededError'); } };
    localCheckpointStore(full).save(84532, keyId, { nextBlock: 100n });
    expect(st.map.has(legacy)).toBe(true);
    const cp = localCheckpointStore(st);
    cp.save(1, keyId, { nextBlock: 7n });
    expect(st.map.has(legacy)).toBe(true); // another chain's save leaves this chain's legacy slot alone
    cp.clear(84532, 'not-a-key-id');
    expect(st.map.has(legacy)).toBe(true);
    cp.clear(84532, keyId);
    expect(st.map.has(legacy)).toBe(false);
    expect(cp.load(1, keyId)).toEqual({ nextBlock: 7n });
    cp.clear(1, keyId);
    expect(st.map.size).toBe(0);
  });

  it('are HKDF-SHA256 of the viewing key, bound to the chain and key id (format pinned: a change orphans every checkpoint)', () => {
    const vk = new Uint8Array(32).fill(7);
    const keyId = checkpointKeyId('02aa', '03bb');
    const slot = checkpointSlot(vk, 84532, keyId);
    expect(slot).toBe('ghostpay.scan.checkpoint.v3.3ae58ebe3012d222cf7ecf9eb30b2a511a5125c9ecbe073d944e2483d6b5dd82');
    expect(slot.startsWith(CHECKPOINT_SLOT_PREFIX)).toBe(true);
    expect(vk.every((b) => b === 7)).toBe(true); // the caller's key is only read
    expect(checkpointSlot(new Uint8Array(32).fill(8), 84532, keyId)).not.toBe(slot);
    expect(checkpointSlot(vk, 1, keyId)).not.toBe(slot);
    expect(checkpointSlot(vk, 84532, checkpointKeyId('02cc', '03dd'))).not.toBe(slot);
    expect(legacyCheckpointSlot(84532, keyId)).toBe(`${LEGACY_PREFIX}84532.${keyId}`);
  });

  it('borrow the session viewing key only for its own key id, and wipe the copy afterwards', () => {
    const pub = generateSession();
    const keyId = checkpointKeyId(pub.spendingPublicKey, pub.viewingPublicKey);
    let lent: Uint8Array | undefined;
    expect(sessionViewingKey(keyId, (vk) => { lent = vk; return vk.some((b) => b !== 0); })).toBe(true);
    expect(lent?.every((b) => b === 0)).toBe(true);
    let called = false;
    expect(sessionViewingKey(checkpointKeyId('02aa', '03bb'), () => { called = true; })).toBeUndefined();
    clearSession(false);
    expect(sessionViewingKey(keyId, () => { called = true; })).toBeUndefined();
    expect(called).toBe(false);
  });
});
