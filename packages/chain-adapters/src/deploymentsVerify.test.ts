import { ed25519 } from '@noble/curves/ed25519.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { keccak256, toBytes } from 'viem/utils';
import { describe, expect, it, vi } from 'vitest';
import { validateManifest, type DeploymentManifest } from './deployments.js';
import {
  MANIFEST_SIGNING_DOMAIN, UNSIGNED_DEV_WARNING, manifestSigningBytes, verifyManifestSignature, type ReleaseKey,
} from './deploymentsSignature.js';
import { verifyManifestOnChain } from './deploymentsVerify.js';
import { FAKE, manifestJson } from './fixtures.testutil.js';
import { CANONICAL_ANNOUNCER } from './verify.js';
import type { RpcClient } from './rpc.js';
import type { Address, Hex } from './types.js';

const CHAIN = 11155111;
const word = (a: string): string => `0x${a.slice(2).toLowerCase().padStart(64, '0')}`;
const hex = (b: Uint8Array): Hex => `0x${Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')}`;
const CODE = { router: '0x6001600155', relayer: '0x6002600255', announcer: '0x6003600355' } as const;
const h = (c: string): Hex => keccak256(c as Hex);
const sel = (s: string): string => keccak256(toBytes(s)).slice(0, 10);

function manifest(chainId = CHAIN, announcer: Address = CANONICAL_ANNOUNCER): DeploymentManifest {
  const j = manifestJson(chainId);
  j['announcer'] = announcer;
  j['bytecodeHashes'] = { router: h(CODE.router), sweepRelayer: h(CODE.relayer) };
  return validateManifest(j, chainId);
}

interface World { feeRecipient: string; announcer: string; feeBps: bigint; code: Record<string, string> }
function world(over: Partial<World> = {}): World {
  return {
    feeRecipient: FAKE.feeRecipient, announcer: CANONICAL_ANNOUNCER, feeBps: 25n,
    code: { [FAKE.router.toLowerCase()]: CODE.router, [FAKE.relayer.toLowerCase()]: CODE.relayer, [CANONICAL_ANNOUNCER.toLowerCase()]: CODE.announcer },
    ...over,
  };
}
function client(w: World, chainId = CHAIN): RpcClient {
  const request = (method: string, params: readonly unknown[]): Promise<unknown> => {
    if (method === 'eth_getCode') return Promise.resolve(w.code[(params[0] as string).toLowerCase()] ?? '0x');
    if (method === 'eth_call') {
      const data = (params[0] as { data: string }).data;
      if (data === sel('FEE_RECIPIENT()')) return Promise.resolve(word(w.feeRecipient));
      if (data === sel('ANNOUNCER()')) return Promise.resolve(word(w.announcer));
      if (data === sel('FEE_BPS()')) return Promise.resolve(word(`0x${w.feeBps.toString(16)}`));
    }
    return Promise.reject(new Error('unexpected'));
  };
  return { chainId, request } as unknown as RpcClient;
}

describe('verifyManifestOnChain', () => {
  it('passes when the chain matches the manifest', async () => {
    await expect(verifyManifestOnChain(manifest(), client(world()))).resolves.toBeUndefined();
  });
  it('rejects a swapped FEE_RECIPIENT (fee skim)', async () => {
    await expect(verifyManifestOnChain(manifest(), client(world({ feeRecipient: '0x00000000000000000000000000000000deadbeef' })))).rejects.toThrow(/FEE_RECIPIENT/);
  });
  it('rejects a different ANNOUNCER', async () => {
    await expect(verifyManifestOnChain(manifest(), client(world({ announcer: '0x00000000000000000000000000000000deadbeef' })))).rejects.toThrow(/ANNOUNCER/);
  });
  it('rejects FEE_BPS != manifest', async () => {
    await expect(verifyManifestOnChain(manifest(), client(world({ feeBps: 100n })))).rejects.toThrow(/FEE_BPS/);
  });
  it('rejects wrong runtime codehash and missing code', async () => {
    const w = world();
    w.code[FAKE.router.toLowerCase()] = '0x60ff60ff';
    await expect(verifyManifestOnChain(manifest(), client(w))).rejects.toThrow(/router codehash/);
    const w2 = world();
    delete w2.code[FAKE.relayer.toLowerCase()];
    delete w2.code[CANONICAL_ANNOUNCER.toLowerCase()];
    await expect(verifyManifestOnChain(manifest(), client(w2))).rejects.toThrow(/sweepRelayer codehash.*announcer has no code/);
  });
  it('rejects a client on another chain and propagates RPC failure (no silent pass)', async () => {
    await expect(verifyManifestOnChain(manifest(), client(world(), 1))).rejects.toThrow(/CHAIN_MISMATCH/);
    const dead = { chainId: CHAIN, request: () => Promise.reject(new Error('down')) } as unknown as RpcClient;
    await expect(verifyManifestOnChain(manifest(), dead)).rejects.toThrow();
  });
  it('rejects malformed eth_call / eth_getCode answers', async () => {
    const c = { chainId: CHAIN, request: () => Promise.resolve('0x1234') } as unknown as RpcClient;
    await expect(verifyManifestOnChain(manifest(), c)).rejects.toThrow(/RPC_FAILURE/);
  });

  it('rejects a known-chain manifest and router agreeing on a noncanonical announcer', async () => {
    const w = world({ announcer: FAKE.announcer });
    w.code[FAKE.announcer.toLowerCase()] = CODE.announcer;
    await expect(verifyManifestOnChain(manifest(CHAIN, FAKE.announcer), client(w))).rejects.toThrow(/canonical announcer/);
  });

  it('preserves development chain 31337 readback with its locally deployed announcer', async () => {
    const w = world({ announcer: FAKE.announcer });
    w.code[FAKE.announcer.toLowerCase()] = CODE.announcer;
    await expect(verifyManifestOnChain(manifest(31337, FAKE.announcer), client(w, 31337))).resolves.toBeUndefined();
  });

  it('fails before reads when a required secondary is absent or on the wrong chain', async () => {
    const primary = client(world());
    const read = vi.spyOn(primary, 'request');
    await expect(verifyManifestOnChain(manifest(), primary, { requireSecondary: true })).rejects.toThrow(/second.*required/);
    await expect(verifyManifestOnChain(manifest(), primary, { secondary: client(world(), 1) })).rejects.toMatchObject({ code: 'CHAIN_MISMATCH' });
    expect(read).not.toHaveBeenCalled();
  });

  it('propagates a configured secondary failure instead of accepting the primary alone', async () => {
    const secondary = { chainId: CHAIN, request: () => Promise.reject(new Error('secondary unavailable')) } as unknown as RpcClient;
    await expect(verifyManifestOnChain(manifest(), client(world()), { secondary })).rejects.toThrow(/secondary unavailable/);
  });
});

describe('verifyManifestOnChain provider agreement', () => {
  const implementation: Address = '0x0000000000000000000000000000000000000e55';
  const factory: Address = '0x0000000000000000000000000000000000000f66';
  const policyCode = { implementation: '0x6004600455', factory: '0x6005600555' } as const;
  const m: DeploymentManifest = {
    ...manifest(),
    policy: {
      implementation, factory, feeToken: FAKE.feeRecipient, flatFee: 0n, feeRecipient: FAKE.feeRecipient,
      deployTx: { implementation: `0x${'11'.repeat(32)}`, factory: `0x${'22'.repeat(32)}` },
      bytecodeHashes: { implementation: h(policyCode.implementation), factory: h(policyCode.factory) },
    },
  };
  const policyWorld = (): World => {
    const w = world();
    w.code[implementation] = policyCode.implementation;
    w.code[factory] = policyCode.factory;
    return w;
  };

  it('requires identical answers for all eight router, relayer, announcer and policy reads', async () => {
    const primary = client(policyWorld()); const secondary = client(policyWorld());
    const primaryReads = vi.spyOn(primary, 'request'); const secondaryReads = vi.spyOn(secondary, 'request');
    await expect(verifyManifestOnChain(m, primary, { secondary, requireSecondary: true })).resolves.toBeUndefined();
    expect(primaryReads).toHaveBeenCalledTimes(8);
    expect(secondaryReads.mock.calls).toEqual(primaryReads.mock.calls);
  });

  const discrepancies: [string, (w: World) => void][] = [
    ['fee recipient', (w) => { w.feeRecipient = FAKE.router; }],
    ['announcer getter', (w) => { w.announcer = FAKE.announcer; }],
    ['fee bps', (w) => { w.feeBps = 100n; }],
    ['router code', (w) => { w.code[FAKE.router.toLowerCase()] = '0x6000'; }],
    ['sweep relayer code', (w) => { w.code[FAKE.relayer.toLowerCase()] = '0x6000'; }],
    ['announcer code', (w) => { w.code[CANONICAL_ANNOUNCER.toLowerCase()] = '0x'; }],
    ['policy implementation code', (w) => { w.code[implementation] = '0x6000'; }],
    ['policy factory code', (w) => { w.code[factory] = '0x6000'; }],
  ];
  it.each(discrepancies)('rejects secondary disagreement on %s', async (_name, alter) => {
    const other = policyWorld(); alter(other);
    await expect(verifyManifestOnChain(m, client(policyWorld()), { secondary: client(other) })).rejects.toMatchObject({ code: 'RPC_FAILURE' });
  });
});

describe('verifyManifestSignature', () => {
  const edPriv = ed25519.utils.randomSecretKey();
  const edKey: ReleaseKey = { alg: 'ed25519', publicKey: hex(ed25519.getPublicKey(edPriv)) };
  const skPriv = secp256k1.utils.randomSecretKey();
  const skKey: ReleaseKey = { alg: 'secp256k1', publicKey: hex(secp256k1.getPublicKey(skPriv, true)) };
  const body = JSON.stringify(manifestJson());
  const withSig = (text: string, sig: Hex): string => JSON.stringify({ ...(JSON.parse(text) as object), signature: sig });
  const signEd = (text: string): string => withSig(text, hex(ed25519.sign(manifestSigningBytes(text), edPriv)));
  const signSk = (text: string): string => withSig(text, hex(secp256k1.sign(sha256(manifestSigningBytes(text)), skPriv, { prehash: false })));

  it('canonical bytes ignore key order, whitespace and the signature field', () => {
    const a = manifestSigningBytes(body);
    const reordered = JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(body) as object).reverse()), null, 3);
    expect(manifestSigningBytes(reordered)).toEqual(a);
    expect(manifestSigningBytes(withSig(body, '0xaa'))).toEqual(a);
    expect(new TextDecoder().decode(a).startsWith(MANIFEST_SIGNING_DOMAIN)).toBe(true);
  });
  it('accepts ed25519 and secp256k1 signatures from the pinned key', () => {
    expect(verifyManifestSignature(signEd(body), { testnet: false, key: edKey })).toEqual({ trust: 'signed' });
    expect(verifyManifestSignature(signSk(body), { testnet: false, key: skKey })).toEqual({ trust: 'signed' });
  });
  it('rejects a tampered manifest (fee recipient swapped after signing)', () => {
    for (const [signed, key] of [[signEd(body), edKey], [signSk(body), skKey]] as const) {
      const t = JSON.parse(signed) as Record<string, unknown>;
      t['feeRecipient'] = '0x00000000000000000000000000000000deadbeef';
      expect(() => verifyManifestSignature(JSON.stringify(t), { testnet: true, key })).toThrow(/signature invalid/);
    }
  });
  it('rejects wrong key, wrong alg, missing, truncated and non-hex signatures even on testnet', () => {
    const other: ReleaseKey = { alg: 'ed25519', publicKey: hex(ed25519.getPublicKey(ed25519.utils.randomSecretKey())) };
    expect(() => verifyManifestSignature(signEd(body), { testnet: true, key: other })).toThrow(/invalid/);
    expect(() => verifyManifestSignature(signEd(body), { testnet: true, key: { alg: 'secp256k1', publicKey: skKey.publicKey } })).toThrow(/invalid/);
    expect(() => verifyManifestSignature(body, { testnet: true, key: edKey })).toThrow(/signature missing/);
    expect(() => verifyManifestSignature(withSig(body, '0xabcd'), { testnet: true, key: edKey })).toThrow(/signature invalid/);
    expect(() => verifyManifestSignature(withSig(body, '0xzz'), { testnet: true, key: edKey })).toThrow();
  });
  it('rejects a high-s (malleated) secp256k1 signature', () => {
    const sig = secp256k1.sign(sha256(manifestSigningBytes(body)), skPriv, { prehash: false });
    const s = BigInt(`0x${hex(sig).slice(66)}`);
    const hi = secp256k1.Point.Fn.ORDER - s;
    const mal = `${hex(sig).slice(0, 66)}${hi.toString(16).padStart(64, '0')}` as Hex;
    expect(() => verifyManifestSignature(withSig(body, mal), { testnet: true, key: skKey })).toThrow(/invalid/);
  });
  it('without a pinned key: testnet = loud unsigned-dev, mainnet refused', () => {
    expect(verifyManifestSignature(body, { testnet: true, key: undefined })).toEqual({ trust: 'unsigned-dev', warning: UNSIGNED_DEV_WARNING });
    expect(UNSIGNED_DEV_WARNING).toMatch(/UNSIGNED DEV MANIFEST/);
    expect(() => verifyManifestSignature(body, { testnet: false, key: undefined })).toThrow(/mainnet|outside testnets/);
    expect(() => verifyManifestSignature(signEd(body), { testnet: false, key: undefined })).toThrow();
  });
  it('defaults to the pinned constant (empty today => testnet only)', () => {
    expect(verifyManifestSignature(body, { testnet: true })).toMatchObject({ trust: 'unsigned-dev' });
    expect(() => verifyManifestSignature(body, { testnet: false })).toThrow();
  });
});
