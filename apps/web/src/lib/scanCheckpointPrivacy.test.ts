import type { ScanCursor } from '@ghostpay/chain-adapters';
import { hkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkpointKeyId, localCheckpointStore } from './scanClient';
import { clearSession, importSession } from './session';

const scalar = (n: number): string => n.toString(16).padStart(64, '0');
const ALICE = { spendingKeyHex: scalar(1), viewingKeyHex: scalar(2), signingKeyHex: scalar(3) };
const BOB = { spendingKeyHex: scalar(4), viewingKeyHex: scalar(5), signingKeyHex: scalar(6) };
const CHAIN = 84532;
const CURSOR: ScanCursor = { nextBlock: 77n, last: { number: 76n, hash: `0x${'a'.repeat(64)}` } };
const ENCODED = JSON.stringify({ nextBlock: '77', last: { number: '76', hash: `0x${'a'.repeat(64)}` } });

function install(keys = ALICE): string {
  const pub = importSession(keys);
  return checkpointKeyId(pub.spendingPublicKey, pub.viewingPublicKey);
}

function memory() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: vi.fn((name: string) => map.get(name) ?? null),
    setItem: vi.fn((name: string, value: string) => { map.set(name, value); }),
    removeItem: vi.fn((name: string) => { map.delete(name); }),
    get length() { return map.size; },
    key: (index: number) => [...map.keys()][index] ?? null,
  };
}

// These are the two incompatible v3 algorithms in #211 and #222, not the new derivation.
function oldV3Slots(keyId: string): readonly string[] {
  const viewingKey = hexToBytes(ALICE.viewingKeyHex);
  try {
    return [
      `ghostpay.scan.checkpoint.v3.${bytesToHex(hkdf(sha256, viewingKey, undefined, utf8ToBytes(`GhostPay/scan-checkpoint/v3/slot|${CHAIN}|${keyId}`), 32))}`,
      `ghostpay.scan.checkpoint.v3.${bytesToHex(hmac(sha256, viewingKey, utf8ToBytes(`GhostPay/scan-checkpoint-slot/v3|${CHAIN}|${keyId}`)))}`,
    ];
  } finally {
    viewingKey.fill(0);
  }
}

afterEach(() => { clearSession(false); });

describe('checkpoint format reconciliation', () => {
  it('writes a separate v4 namespace and resumes it in a fresh store only with the matching identity', () => {
    const keyId = install();
    const storage = memory();
    localCheckpointStore(storage).save(CHAIN, keyId, CURSOR);
    expect([...storage.map.keys()]).toHaveLength(1);
    expect([...storage.map.keys()][0]).toMatch(/^ghostpay\.scan\.checkpoint\.v4\.[0-9a-f]{64}$/);
    clearSession(false);
    const restarted = localCheckpointStore(storage);
    expect(restarted.load(CHAIN, keyId)).toBeUndefined();
    install();
    expect(restarted.load(CHAIN, keyId)).toEqual(CURSOR);
    expect(restarted.load(1, keyId)).toBeUndefined();
  });

  it('refuses storage reads and writes for another seller key ID while keys are loaded', () => {
    const aliceId = install();
    const bobId = install(BOB);
    install();
    const storage = memory();
    const store = localCheckpointStore(storage);
    store.save(CHAIN, aliceId, CURSOR);
    storage.getItem.mockClear();
    storage.setItem.mockClear();
    expect(store.load(CHAIN, bobId)).toBeUndefined();
    store.save(CHAIN, bobId, { nextBlock: 999n });
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.map.size).toBe(1);
  });

  it('invalidates a retained store after silent lock or replacement and resumes only after the original identity returns', () => {
    const aliceId = install();
    const storage = memory();
    const store = localCheckpointStore(storage);
    store.save(CHAIN, aliceId, CURSOR);
    clearSession(false);
    store.save(CHAIN, aliceId, { nextBlock: 123n });
    expect(store.load(CHAIN, aliceId)).toBeUndefined();
    const bobId = install(BOB);
    store.save(CHAIN, aliceId, { nextBlock: 456n });
    expect(store.load(CHAIN, aliceId)).toBeUndefined();
    store.save(CHAIN, bobId, { nextBlock: 9n });
    expect(storage.map.size).toBe(2);
    install();
    expect(store.load(CHAIN, aliceId)).toEqual(CURSOR);
    expect(store.load(CHAIN, bobId)).toBeUndefined();
  });

  it('purges v1, v2 and both ambiguous v3 formats without keys or reading their contents', () => {
    const keyId = install();
    const storage = memory();
    const old = [`ghostpay.scan.checkpoint.v1.${CHAIN}`, `ghostpay.scan.checkpoint.v2.${CHAIN}.${keyId}`, ...oldV3Slots(keyId)];
    for (const name of old) storage.map.set(name, ENCODED);
    const keep = ['ghostpay.scan.checkpoint.v4.unrelated', 'ghostpay.scan.checkpoint.v30.unrelated', 'another.setting'];
    for (const name of keep) storage.map.set(name, 'untouched');
    clearSession(false);
    const store = localCheckpointStore(storage);
    expect(storage.getItem).not.toHaveBeenCalled();
    expect([...storage.map.keys()]).toEqual(keep);
    install();
    expect(store.load(CHAIN, keyId)).toBeUndefined();
    for (const name of old) expect(storage.getItem).not.toHaveBeenCalledWith(name);
  });

  it.each(['HKDF', 'HMAC'])('does not resume the %s v3 record from a non-enumerable adapter', (kind) => {
    const keyId = install();
    const storage = memory();
    const name = oldV3Slots(keyId)[kind === 'HKDF' ? 0 : 1]!;
    storage.map.set(name, ENCODED);
    const { getItem, setItem, removeItem } = storage;
    expect(localCheckpointStore({ getItem, setItem, removeItem }).load(CHAIN, keyId)).toBeUndefined();
    expect(getItem).not.toHaveBeenCalledWith(name);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('never imports a public v2 cursor even when the new write would fail', () => {
    const keyId = install();
    const storage = memory();
    const old = `ghostpay.scan.checkpoint.v2.${CHAIN}.${keyId}`;
    storage.map.set(old, ENCODED);
    const { getItem, removeItem } = storage;
    const setItem = vi.fn(() => { throw new Error('quota'); });
    const store = localCheckpointStore({ getItem, setItem, removeItem });
    expect(store.load(CHAIN, keyId)).toBeUndefined();
    expect(getItem).not.toHaveBeenCalledWith(old);
    expect(setItem).not.toHaveBeenCalled();
  });
});
