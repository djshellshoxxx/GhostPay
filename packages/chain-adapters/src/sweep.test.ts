import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deriveStealthSecret, secretScalarFromBytes, type PublicAnnouncement } from '@ghostpay/core-crypto';
import fc from 'fast-check';
import { getAddress, keccak256, recoverAddress, toBytes, verifyTypedData } from 'viem/utils';
import { describe, expect, it } from 'vitest';
import { ChainAdapterError } from './errors.js';
import { FAKE, USDC_SEPOLIA, payment, recipient } from './fixtures.testutil.js';
import {
  PERMIT_TYPES, SWEEP_DOMAIN_NAME, SWEEP_DOMAIN_VERSION, SWEEP_TYPES, SWEEP_TYPE_STRING, addressOfSecret, buildPermitTypedData,
  buildSweepTypedData, eip712DomainSeparator, permitDigest, signDigest, signPermit, signSweep, sweepDigest, sweepDigestManual,
  type PermitReader, type SweepOrder,
} from './sweep.js';
import type { Address, Hex } from './types.js';

const read = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const relayerSrc = read('../../contracts/src/GhostPaySweepRelayer.sol');
const ifaceSrc = read('../../contracts/src/interfaces/IGhostPaySweepRelayer.sol');

describe('Foundry-free parity with GhostPaySweepRelayer.sol', () => {
  it('SWEEP_TYPE_STRING equals the SWEEP_TYPEHASH preimage in the contract', () => {
    const m = /SWEEP_TYPEHASH\s*=\s*keccak256\(\s*"([^"]+)"\s*\)/.exec(relayerSrc);
    expect(m?.[1]).toBe(SWEEP_TYPE_STRING);
  });
  it('EIP-712 types field order equals the Solidity struct and the type string', () => {
    const struct = /struct Sweep\s*\{([^}]+)\}/.exec(ifaceSrc)?.[1] ?? '';
    const fields = [...struct.matchAll(/(\w+)\s+(\w+)\s*;/g)].map((x) => ({ type: x[1], name: x[2] }));
    expect(fields).toEqual(SWEEP_TYPES.Sweep.map((f) => ({ type: f.type, name: f.name })));
    const inner = SWEEP_TYPE_STRING.slice('Sweep('.length, -1);
    expect(inner).toBe(SWEEP_TYPES.Sweep.map((f) => `${f.type} ${f.name}`).join(','));
  });
  it('domain name and version equal the EIP712 constructor arguments', () => {
    const m = /EIP712\("([^"]+)",\s*"([^"]+)"\)/.exec(relayerSrc);
    expect([m?.[1], m?.[2]]).toEqual([SWEEP_DOMAIN_NAME, SWEEP_DOMAIN_VERSION]);
  });
  it('the contract hashes with abi.encode in struct order', () => {
    expect(relayerSrc).toMatch(/abi\.encode\(\s*SWEEP_TYPEHASH,\s*s\.token,\s*s\.owner,\s*s\.destination,\s*s\.feeTo,\s*s\.amount,\s*s\.fee,\s*s\.deadline,\s*s\.nonce\s*\)/);
  });
});

const ZERO32: Hex = `0x${'00'.repeat(32)}`;
const order = (over: Partial<SweepOrder> = {}): SweepOrder => ({
  token: USDC_SEPOLIA,
  owner: getAddress('0x00000000000000000000000000000000000000a1'),
  destination: getAddress('0x00000000000000000000000000000000000000a2'),
  feeTo: getAddress('0x00000000000000000000000000000000000000a3'),
  amount: 1_000_000n,
  fee: 5_000n,
  deadline: 4_000_000_000n,
  nonce: 7n,
  ...over,
});

describe('buildSweepTypedData', () => {
  it('builds domain and message', () => {
    const td = buildSweepTypedData(84532, FAKE.relayer, order());
    expect(td.domain).toEqual({ name: 'GhostPaySweepRelayer', version: '1', chainId: 84532, verifyingContract: FAKE.relayer });
    expect(td.primaryType).toBe('Sweep');
    expect(td.message.nonce).toBe(7n);
  });
  it.each<[string, Partial<SweepOrder>]>([
    ['amount == fee', { amount: 5_000n }],
    ['amount < fee', { amount: 4_999n }],
    ['zero token', { token: '0x0000000000000000000000000000000000000000' }],
    ['zero owner', { owner: '0x0000000000000000000000000000000000000000' }],
    ['zero destination', { destination: '0x0000000000000000000000000000000000000000' }],
    ['zero feeTo', { feeTo: '0x0000000000000000000000000000000000000000' }],
    ['token is relayer', { token: FAKE.relayer }],
    ['destination is relayer', { destination: FAKE.relayer }],
    ['feeTo is relayer', { feeTo: FAKE.relayer }],
    ['owner is relayer', { owner: FAKE.relayer }],
    ['destination == owner', { destination: getAddress('0x00000000000000000000000000000000000000a1') }],
    ['feeTo == owner', { feeTo: getAddress('0x00000000000000000000000000000000000000a1') }],
    ['feeTo == destination', { feeTo: getAddress('0x00000000000000000000000000000000000000a2') }],
    ['negative nonce', { nonce: -1n }],
    ['oversized deadline', { deadline: 1n << 256n }],
    ['negative fee', { fee: -1n }],
    ['bad address', { owner: 'nope' as Address }],
  ])('rejects %s', (_n, over) => {
    expect(() => buildSweepTypedData(84532, FAKE.relayer, order(over))).toThrow(ChainAdapterError);
  });
  it('rejects bad chain id and relayer', () => {
    expect(() => buildSweepTypedData(0, FAKE.relayer, order())).toThrow(ChainAdapterError);
    expect(() => buildSweepTypedData(1.5, FAKE.relayer, order())).toThrow(ChainAdapterError);
    expect(() => buildSweepTypedData(1, '0x0000000000000000000000000000000000000000', order())).toThrow(ChainAdapterError);
  });
  it('zero fee is allowed', () => {
    expect(buildSweepTypedData(1, FAKE.relayer, order({ fee: 0n })).message.fee).toBe(0n);
  });
});

describe('digests', () => {
  it('viem hashTypedData equals the manual keccak digest (property)', () => {
    const addr = fc.uint8Array({ minLength: 20, maxLength: 20 }).map((b) => getAddress(`0x${Buffer.from(b).toString('hex')}`));
    fc.assert(
      fc.property(addr, addr, addr, addr, addr, fc.bigInt({ min: 1n, max: (1n << 200n) }), fc.bigInt({ min: 0n, max: (1n << 255n) }), fc.bigInt({ min: 0n, max: (1n << 255n) }), fc.bigInt({ min: 0n, max: (1n << 255n) }), fc.integer({ min: 1, max: 2 ** 31 }), (t, o, d, f, rel, amt, dl, n, fee, chain) => {
        fc.pre(new Set([t, o, d, f, rel]).size === 5 && amt > fee);
        fc.pre(![t, o, d, f, rel].some((a) => /^0x0{40}$/.test(a)));
        const td = buildSweepTypedData(chain, rel, { token: t, owner: o, destination: d, feeTo: f, amount: amt, fee, deadline: dl, nonce: n });
        expect(sweepDigest(td)).toBe(sweepDigestManual(td));
      }),
      { numRuns: 200 },
    );
  });
  it('typehash equals keccak of the type string and changes with any field', () => {
    const base = sweepDigest(buildSweepTypedData(1, FAKE.relayer, order()));
    expect(keccak256(toBytes(SWEEP_TYPE_STRING))).toMatch(/^0x[0-9a-f]{64}$/);
    const variants: Partial<SweepOrder>[] = [{ amount: 1_000_001n }, { fee: 4_999n }, { deadline: 4_000_000_001n }, { nonce: 8n }, { token: getAddress('0x00000000000000000000000000000000000000ff') }, { feeTo: getAddress('0x00000000000000000000000000000000000000fe') }, { destination: getAddress('0x00000000000000000000000000000000000000fd') }, { owner: getAddress('0x00000000000000000000000000000000000000fc') }];
    for (const v of variants) expect(sweepDigest(buildSweepTypedData(1, FAKE.relayer, order(v)))).not.toBe(base);
    expect(sweepDigest(buildSweepTypedData(2, FAKE.relayer, order()))).not.toBe(base);
    expect(sweepDigest(buildSweepTypedData(1, FAKE.router, order()))).not.toBe(base);
  });
});

/** Derive a real stealth key through core-crypto, exactly as the receiver does. */
function stealthKey() {
  const { keys, meta } = recipient();
  const p = payment(meta);
  const ann: PublicAnnouncement = {
    schemeId: 1n,
    stealthAddress: p.stealthAddress,
    ephemeralPublicKey: `0x${Buffer.from(p.ephemeralPublicKey).toString('hex')}`,
    metadata: `0x${Buffer.from(p.metadataPrefix).toString('hex')}`,
  };
  return { secret: deriveStealthSecret(ann, keys), address: p.stealthAddress };
}

describe('signing', () => {
  it('signs a sweep with a derived stealth key; viem verifies and recovery equals owner', async () => {
    const { secret, address } = stealthKey();
    expect(addressOfSecret(secret)).toBe(address);
    const td = buildSweepTypedData(84532, FAKE.relayer, order({ owner: address }));
    const sig = await signSweep(td, secret);
    expect(sig.signature).toMatch(/^0x[0-9a-f]{130}$/);
    expect([27, 28]).toContain(sig.v);
    expect(BigInt(sig.s) <= 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n).toBe(true);
    expect(await recoverAddress({ hash: sweepDigest(td), signature: sig.signature })).toBe(address);
    expect(await recoverAddress({ hash: sweepDigestManual(td), signature: sig.signature })).toBe(address);
    expect(await verifyTypedData({ address, domain: td.domain, types: td.types, primaryType: 'Sweep', message: td.message, signature: sig.signature })).toBe(true);
    // deterministic (RFC 6979)
    expect((await signSweep(td, secret)).signature).toBe(sig.signature);
  });
  it('refuses to sign when owner is not the key address', async () => {
    const { secret } = stealthKey();
    const td = buildSweepTypedData(84532, FAKE.relayer, order());
    await expect(signSweep(td, secret)).rejects.toThrow(/owner is not/);
  });
  it('signDigest rejects non-32-byte digests', async () => {
    const { secret } = stealthKey();
    await expect(signDigest('0x1234', secret)).rejects.toThrow(ChainAdapterError);
  });
  it('signature does not recover to the owner under another chain id', async () => {
    const { secret, address } = stealthKey();
    const td = buildSweepTypedData(84532, FAKE.relayer, order({ owner: address }));
    const sig = await signSweep(td, secret);
    const other = buildSweepTypedData(11155111, FAKE.relayer, order({ owner: address }));
    expect(await recoverAddress({ hash: sweepDigest(other), signature: sig.signature })).not.toBe(address);
  });
  it('a hand-made scalar key also works and secrets are never exposed in results', async () => {
    const secret = secretScalarFromBytes(Uint8Array.from({ length: 32 }, (_, i) => (i === 31 ? 5 : 0)));
    const address = addressOfSecret(secret);
    const sig = await signDigest(`0x${'ab'.repeat(32)}`, secret);
    expect(JSON.stringify(sig)).not.toContain('0000000000000000000000000000000000000000000000000000000000000005');
    expect(await recoverAddress({ hash: `0x${'ab'.repeat(32)}`, signature: sig.signature })).toBe(address);
  });
});

describe('ERC-2612 permit', () => {
  const reader = (over: Partial<PermitReader> = {}): PermitReader => ({
    name: () => Promise.resolve('USDC'),
    version: () => Promise.resolve('2'),
    nonce: () => Promise.resolve(3n),
    ...over,
  });
  const args = (over: Record<string, unknown> = {}) => ({
    chainId: 84532, token: USDC_SEPOLIA, owner: order().owner, spender: FAKE.relayer, value: 1_000_000n, deadline: 4_000_000_000n, reader: reader(), ...over,
  });

  it('builds typed data with name/version/nonce from the reader and matches the ERC-2612 type', async () => {
    const td = await buildPermitTypedData(args());
    expect(td.domain).toEqual({ name: 'USDC', version: '2', chainId: 84532, verifyingContract: USDC_SEPOLIA });
    expect(td.message.nonce).toBe(3n);
    expect(PERMIT_TYPES.Permit.map((f) => `${f.type} ${f.name}`).join(',')).toBe('address owner,address spender,uint256 value,uint256 nonce,uint256 deadline');
  });
  it('checks DOMAIN_SEPARATOR when the reader provides it', async () => {
    const good = eip712DomainSeparator({ name: 'USDC', version: '2', chainId: 84532, verifyingContract: USDC_SEPOLIA });
    await expect(buildPermitTypedData(args({ reader: reader({ domainSeparator: () => Promise.resolve(good) }) }))).resolves.toBeDefined();
    await expect(buildPermitTypedData(args({ reader: reader({ domainSeparator: () => Promise.resolve(ZERO32) }) }))).rejects.toThrow(/DOMAIN_SEPARATOR/);
  });
  it('fails closed on weird token metadata and bad input', async () => {
    await expect(buildPermitTypedData(args({ reader: reader({ name: () => Promise.resolve('') }) }))).rejects.toThrow(/name/);
    await expect(buildPermitTypedData(args({ reader: reader({ name: () => Promise.resolve('x'.repeat(129)) }) }))).rejects.toThrow(/name/);
    await expect(buildPermitTypedData(args({ reader: reader({ version: () => Promise.resolve('') }) }))).rejects.toThrow(/version/);
    await expect(buildPermitTypedData(args({ reader: reader({ nonce: () => Promise.resolve(-1n) }) }))).rejects.toThrow(/nonce/);
    await expect(buildPermitTypedData(args({ reader: reader({ nonce: () => Promise.resolve(1n << 256n) }) }))).rejects.toThrow(/nonce/);
    await expect(buildPermitTypedData(args({ value: 0n }))).rejects.toThrow(ChainAdapterError);
    await expect(buildPermitTypedData(args({ value: -1n }))).rejects.toThrow(ChainAdapterError);
    await expect(buildPermitTypedData(args({ deadline: -1n }))).rejects.toThrow(ChainAdapterError);
    await expect(buildPermitTypedData(args({ chainId: 0 }))).rejects.toThrow(ChainAdapterError);
    await expect(buildPermitTypedData(args({ token: '0x12' }))).rejects.toThrow(ChainAdapterError);
    await expect(buildPermitTypedData(args({ reader: reader({ name: () => Promise.reject(new Error('rpc down')) }) }))).rejects.toThrow('rpc down');
  });
  it('signs and recovers; wrong owner refused', async () => {
    const { secret, address } = stealthKey();
    const td = await buildPermitTypedData(args({ owner: address }));
    const sig = await signPermit(td, secret);
    expect(await recoverAddress({ hash: permitDigest(td), signature: sig.signature })).toBe(address);
    expect(await verifyTypedData({ address, domain: td.domain, types: td.types, primaryType: 'Permit', message: td.message, signature: sig.signature })).toBe(true);
    const wrong = await buildPermitTypedData(args());
    await expect(signPermit(wrong, secret)).rejects.toThrow(/owner is not/);
  });
});
