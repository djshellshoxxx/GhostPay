import fc from 'fast-check';
import { getAddress, getCreate2Address, keccak256 } from 'viem';
import { describe, expect, it } from 'vitest';
import { ARACHNID_DEPLOYER, CANONICAL_ANNOUNCER, ERC5564_SALT, computeCreate2Address, isChecksumAddress, toChecksumAddress } from './address.js';
import { bytesToHex, hexToBytes, isHexBytes, keccakHex } from './hex.js';

const hex = (n: number) => fc.uint8Array({ minLength: n, maxLength: n }).map((b) => bytesToHex(b));

describe('hex', () => {
  it('round-trips and rejects malformed', () => {
    expect(bytesToHex(hexToBytes('0x00ff10'))).toBe('0x00ff10');
    expect(isHexBytes('0x0')).toBe(false);
    expect(isHexBytes('ab')).toBe(false);
    expect(isHexBytes(5)).toBe(false);
    expect(() => hexToBytes('0xzz')).toThrow();
    expect(keccakHex('0x')).toBe('0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
  });
});

describe('checksum', () => {
  it('matches the EIP-55 reference vector', () => {
    const a = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
    expect(toChecksumAddress(a.toLowerCase())).toBe(a);
    expect(isChecksumAddress(a)).toBe(true);
    expect(isChecksumAddress(a.toLowerCase())).toBe(false);
    expect(isChecksumAddress('0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed')).toBe(false);
    expect(isChecksumAddress('0x12')).toBe(false);
    expect(() => toChecksumAddress('0x12')).toThrow();
  });
  it('canonical constants are valid EIP-55', () => {
    expect(isChecksumAddress(CANONICAL_ANNOUNCER)).toBe(true);
    expect(isChecksumAddress(ARACHNID_DEPLOYER)).toBe(true);
  });
  it('agrees with viem', () => {
    fc.assert(fc.property(hex(20), (h) => toChecksumAddress(h) === getAddress(h)));
  });
});

describe('computeCreate2Address', () => {
  it('agrees with viem for random inputs', () => {
    fc.assert(
      fc.property(hex(20), hex(32), hex(32), (d, s, h) =>
        computeCreate2Address(d, s, h) === getCreate2Address({ from: d as `0x${string}`, salt: s as `0x${string}`, bytecodeHash: h as `0x${string}` })),
    );
  });
  it('matches the EIP-1014 example 0', () => {
    const zero = '0x' + '00'.repeat(20);
    expect(computeCreate2Address(zero, '0x' + '00'.repeat(32), keccak256('0x00'))).toBe('0x4D1A2e2bB4F88F0250f26Ffff098B0b30B26BF38');
  });
  it('rejects malformed inputs', () => {
    const z = '0x' + '00'.repeat(32);
    expect(() => computeCreate2Address('0x12', z, z)).toThrow('deployer');
    expect(() => computeCreate2Address(ARACHNID_DEPLOYER, '0x12', z)).toThrow('salt');
    expect(() => computeCreate2Address(ARACHNID_DEPLOYER, z, '0x12')).toThrow('init code');
  });
  it('salt is 32 bytes', () => {
    expect(ERC5564_SALT).toHaveLength(66);
  });
});
