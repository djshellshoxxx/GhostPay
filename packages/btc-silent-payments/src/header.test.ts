import { describe, expect, it } from 'vitest';
import { POW_LIMIT, checkProofOfWork, merkleRoot, parseHeader, reverseHex, sha256d, targetFromBits, verifyBlockData } from './header.js';

// Bitcoin Core chainparams genesis blocks (mainnet and regtest share the coinbase/Merkle root).
const GENESIS_MERKLE = '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b';
const MAINNET_GENESIS_HEADER =
  '0100000000000000000000000000000000000000000000000000000000000000000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a29ab5f49ffff001d1dac2b7c';
const MAINNET_GENESIS_HASH = '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f';
const REGTEST_GENESIS_HEADER =
  '0100000000000000000000000000000000000000000000000000000000000000000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4adae5494dffff7f2002000000';
const REGTEST_GENESIS_HASH = '0f9188f13cb7b2c71f2a335e3a4fc328bf5beb436012afca590b1a11466e2206';

const hexOf = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const u32 = (n: number): string => hexOf(Uint8Array.of(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff));

/** Regtest header over `merkle` with the nonce ground until it meets 0x207fffff. */
function regtestHeader(prev: string, merkle: string, bits = 0x207fffff): string {
  for (let nonce = 0; ; nonce++) {
    const hex = `${u32(0x20000000)}${reverseHex(prev)}${reverseHex(merkle)}${u32(1_700_000_000)}${u32(bits)}${u32(nonce)}`;
    const h = parseHeader(hex);
    if (BigInt(`0x${h.hash}`) <= targetFromBits(bits)) return hex;
  }
}

describe('parseHeader', () => {
  it('parses the mainnet genesis header and reproduces its hash', () => {
    const h = parseHeader(MAINNET_GENESIS_HEADER);
    expect(h.hash).toBe(MAINNET_GENESIS_HASH);
    expect(h.merkleRoot).toBe(GENESIS_MERKLE);
    expect(h.prevHash).toBe('0'.repeat(64));
    expect(h).toMatchObject({ version: 1, time: 1231006505, bits: 0x1d00ffff, nonce: 2083236893 });
  });
  it('parses the regtest genesis header', () => {
    expect(parseHeader(REGTEST_GENESIS_HEADER).hash).toBe(REGTEST_GENESIS_HASH);
  });
  it('rejects anything but exactly 80 hex bytes', () => {
    for (const bad of ['', MAINNET_GENESIS_HEADER.slice(2), `${MAINNET_GENESIS_HEADER}00`, `zz${MAINNET_GENESIS_HEADER.slice(2)}`, 7 as unknown as string]) {
      expect(() => parseHeader(bad)).toThrow(/invalid response/);
    }
  });
});

describe('targetFromBits', () => {
  it('expands known compact targets', () => {
    expect(targetFromBits(0x1d00ffff)).toBe(0xffffn << 208n);
    expect(targetFromBits(0x207fffff)).toBe(0x7fffffn << 232n);
    expect(targetFromBits(0x03123456)).toBe(0x123456n);
    expect(targetFromBits(0x02123456)).toBe(0x1234n);
  });
  it('rejects negative, zero and overflowing encodings', () => {
    for (const bits of [0x04923456, 0x1d000000, 0x00000000, 0x01003456, 0x23000001, 0x22000100, 0x21010000, -1, 2 ** 32, 1.5]) {
      expect(() => targetFromBits(bits)).toThrow(/invalid response/);
    }
    expect(targetFromBits(0x220000ff)).toBe(0xffn << 248n);
  });
});

describe('checkProofOfWork', () => {
  it('accepts the genesis blocks on their own networks', () => {
    expect(() => { checkProofOfWork(parseHeader(MAINNET_GENESIS_HEADER), 'mainnet'); }).not.toThrow();
    expect(() => { checkProofOfWork(parseHeader(REGTEST_GENESIS_HEADER), 'regtest'); }).not.toThrow();
  });
  it('refuses regtest-difficulty headers on networks with a stricter limit', () => {
    const h = parseHeader(REGTEST_GENESIS_HEADER);
    for (const n of ['mainnet', 'testnet4', 'signet'] as const) expect(() => { checkProofOfWork(h, n); }).toThrow(/invalid response/);
  });
  it('refuses a header whose hash exceeds its own target', () => {
    // Genesis with nonce + 1 has (overwhelmingly likely) not met 0x1d00ffff.
    const tampered = `${MAINNET_GENESIS_HEADER.slice(0, 152)}${u32(2083236894)}`;
    expect(() => { checkProofOfWork(parseHeader(tampered), 'mainnet'); }).toThrow(/invalid response/);
  });
  it('has powLimits ordered as Bitcoin Core defines them', () => {
    expect(POW_LIMIT.mainnet).toBe(POW_LIMIT.testnet4);
    expect(POW_LIMIT.signet > POW_LIMIT.mainnet && POW_LIMIT.regtest > POW_LIMIT.signet).toBe(true);
  });
});

describe('merkleRoot', () => {
  const t = (i: number): string => hexOf(sha256d(Uint8Array.of(i)));
  const pair = (a: string, b: string): string => reverseHex(hexOf(sha256d(Uint8Array.from(Buffer.from(reverseHex(a) + reverseHex(b), 'hex')))));
  it('single transaction: the root is the txid (genesis)', () => {
    expect(merkleRoot([GENESIS_MERKLE])).toBe(GENESIS_MERKLE);
  });
  it('pairs and duplicates the odd last hash like Bitcoin Core', () => {
    expect(merkleRoot([t(1), t(2)])).toBe(pair(t(1), t(2)));
    expect(merkleRoot([t(1), t(2), t(3)])).toBe(pair(pair(t(1), t(2)), pair(t(3), t(3))));
  });
  it('reproduces block 170 (first bitcoin transfer)', () => {
    expect(merkleRoot([
      'b1fea52486ce0c62bb442b530a3f0132b826c74e473d1f2c220bfa78111c5082',
      'f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16',
    ])).toBe('7dac2c5666815c17a3b36427de37bb9d2e2c5ccec3f8633eb91a4205cb4c10ff');
  });
  it('rejects the CVE-2012-2459 duplicate-sibling mutation, empty lists and bad txids', () => {
    // [1,2,3] and [1,2,3,3] share a root in naive implementations.
    expect(() => merkleRoot([t(1), t(2), t(3), t(3)])).toThrow(/invalid response/);
    expect(() => merkleRoot([t(1), t(1)])).toThrow(/invalid response/);
    expect(() => merkleRoot([])).toThrow(/invalid response/);
    expect(() => merkleRoot(['AB'.repeat(32)])).toThrow(/invalid response/);
  });
  it('changes when the order or any txid changes', () => {
    const r = merkleRoot([t(1), t(2), t(3)]);
    expect(merkleRoot([t(2), t(1), t(3)])).not.toBe(r);
    expect(merkleRoot([t(1), t(2), t(4)])).not.toBe(r);
    expect(merkleRoot([t(1), t(2)])).not.toBe(r);
  });
});

describe('verifyBlockData', () => {
  const txids = ['11'.repeat(32), '22'.repeat(32), '33'.repeat(32)];
  const header = regtestHeader(REGTEST_GENESIS_HASH, merkleRoot(txids));
  const hash = parseHeader(header).hash;
  it('accepts a consistent regtest block', () => {
    expect(verifyBlockData({ headerHex: header, expectedHash: hash, txids, network: 'regtest' }).prevHash).toBe(REGTEST_GENESIS_HASH);
  });
  it('refuses a mismatched hash, omitted / reordered / injected txids, or the wrong network', () => {
    expect(() => verifyBlockData({ headerHex: header, expectedHash: REGTEST_GENESIS_HASH, txids, network: 'regtest' })).toThrow();
    expect(() => verifyBlockData({ headerHex: header, expectedHash: hash, txids: txids.slice(0, 2), network: 'regtest' })).toThrow();
    expect(() => verifyBlockData({ headerHex: header, expectedHash: hash, txids: [txids[1]!, txids[0]!, txids[2]!], network: 'regtest' })).toThrow();
    expect(() => verifyBlockData({ headerHex: header, expectedHash: hash, txids: [...txids, '44'.repeat(32)], network: 'regtest' })).toThrow();
    expect(() => verifyBlockData({ headerHex: header, expectedHash: hash, txids, network: 'testnet4' })).toThrow();
  });
});
