import { secp256k1 } from '@noble/curves/secp256k1.js';
import { encodeAbiParameters, getAddress, keccak256 } from 'viem/utils';
import { describe, expect, it } from 'vitest';
import { validateManifest, type DeploymentManifest } from './deployments.js';
import { ChainAdapterError } from './errors.js';
import { FAKE, SEPOLIA, manifestJson } from './fixtures.testutil.js';
import { createClient, type RpcClient } from './rpc.js';
import { FakeRpcError, fakeTransport, noSleep } from './rpc.testutil.js';
import {
  CANONICAL_ANNOUNCER,
  canonicalAnnouncer,
  canonicalManifestJson,
  manifestDigest,
  verifyDeployment,
  verifyManifestSignature,
} from './verify.js';
import type { Hex } from './types.js';

const ROUTER_CODE = '0x600160005260206000f3aa' as Hex;
const RELAYER_CODE = '0x600260005260206000f3bb' as Hex;
const FACTORY_CODE = '0x600360005260206000f3cc' as Hex;
const ANNOUNCER_CODE = '0x600460005260206000f3dd' as Hex;
const word = (a: string): Hex => `0x${'0'.repeat(24)}${a.slice(2).toLowerCase()}`;
const FEE_RECIPIENT = getAddress('0x00000000000000000000000000000000000d0d44');

function wire(withPolicy = false): Record<string, unknown> {
  const m = manifestJson();
  m['announcer'] = CANONICAL_ANNOUNCER;
  m['feeRecipient'] = FEE_RECIPIENT;
  m['bytecodeHashes'] = { router: keccak256(ROUTER_CODE), sweepRelayer: keccak256(RELAYER_CODE) };
  if (withPolicy) {
    m['policyImplementation'] = getAddress('0x0000000000000000000000000000000000000e55');
    m['policyFactory'] = getAddress('0x0000000000000000000000000000000000000f66');
    m['policyFeeToken'] = getAddress('0x0000000000000000000000000000000000000a77');
    m['policyFlatFee'] = '5000000';
    m['policyFeeRecipient'] = getAddress('0x0000000000000000000000000000000000000b88');
    (m['deployTx'] as Record<string, string>)['policyImplementation'] = `0x${'5'.repeat(64)}`;
    (m['deployTx'] as Record<string, string>)['policyFactory'] = `0x${'6'.repeat(64)}`;
    (m['bytecodeHashes'] as Record<string, string>)['policyImplementation'] = `0x${'7'.repeat(64)}`;
    (m['bytecodeHashes'] as Record<string, string>)['policyFactory'] = keccak256(FACTORY_CODE);
  }
  return m;
}

interface World {
  code: Record<string, Hex>;
  feeBps?: bigint;
  feeRecipient?: string;
  announcer?: string;
  badReturn?: Hex;
  rawRecipient?: Hex;
}

function client(w: World, chainHex = '0xaa36a7'): Promise<RpcClient> {
  return createClient(SEPOLIA, 'https://rpc.example.test', {
    sleep: noSleep,
    retries: 0,
    chainRecheckMs: 0,
    transport: fakeTransport((m, p) => {
      if (m === 'eth_chainId') return chainHex;
      if (m === 'eth_getCode') return w.code[(p[0] as string).toLowerCase()] ?? '0x';
      if (m === 'eth_call') {
        if (w.badReturn !== undefined) return w.badReturn;
        const data = (p[0] as { data: string }).data;
        // selectors: FEE_BPS, FEE_RECIPIENT, ANNOUNCER (looked up through the ABI in the code under test)
        if (data === FEE_BPS_SEL) return encodeAbiParameters([{ type: 'uint256' }], [w.feeBps ?? 25n]);
        if (data === FEE_RECIPIENT_SEL) return w.rawRecipient ?? word(w.feeRecipient ?? FEE_RECIPIENT);
        if (data === ANNOUNCER_SEL) return word(w.announcer ?? CANONICAL_ANNOUNCER);
      }
      throw new FakeRpcError(-32601);
    }),
  });
}

// selector = first 4 bytes of keccak256(signature)
const sel = (sig: string): string => keccak256(new TextEncoder().encode(sig)).slice(0, 10);
const FEE_BPS_SEL = sel('FEE_BPS()');
const FEE_RECIPIENT_SEL = sel('FEE_RECIPIENT()');
const ANNOUNCER_SEL = sel('ANNOUNCER()');

const good = (policy = false): World => ({
  code: {
    [FAKE.router.toLowerCase()]: ROUTER_CODE,
    [FAKE.relayer.toLowerCase()]: RELAYER_CODE,
    [CANONICAL_ANNOUNCER.toLowerCase()]: ANNOUNCER_CODE,
    ...(policy ? { [getAddress('0x0000000000000000000000000000000000000f66').toLowerCase()]: FACTORY_CODE } : {}),
  },
});
const mf = (policy = false): DeploymentManifest => validateManifest(wire(policy), 11155111);
const bad = async (p: Promise<unknown>, re: RegExp): Promise<void> => {
  await expect(p).rejects.toThrow(re);
  await p.catch((e: unknown) => {
    expect(e).toBeInstanceOf(ChainAdapterError);
  });
};

describe('canonicalAnnouncer', () => {
  it('is a constant for known chains only', () => {
    expect(canonicalAnnouncer(11155111)).toBe('0x55649E01B5Df198D18D95b5cc5051630cfD45564');
    expect(canonicalAnnouncer(999_999)).toBeUndefined();
  });
});

describe('verifyDeployment', () => {
  it('returns the values READ FROM THE CHAIN when everything matches', async () => {
    const v = await verifyDeployment(mf(), await client(good()));
    expect(v).toMatchObject({ chainId: 11155111, router: FAKE.router, feeRecipient: FEE_RECIPIENT, announcer: CANONICAL_ANNOUNCER, feeBps: 25n, providers: 1 });
    expect(v.policyFactory).toBeUndefined();
  });
  it('checks the policy factory when the manifest has a policy section', async () => {
    const v = await verifyDeployment(mf(true), await client(good(true)));
    expect(v.policyFactory).toBe(getAddress('0x0000000000000000000000000000000000000f66'));
    await bad(verifyDeployment(mf(true), await client(good(false))), /no contract code/);
    const w = good(true);
    w.code[getAddress('0x0000000000000000000000000000000000000f66').toLowerCase()] = '0x6000';
    await bad(verifyDeployment(mf(true), await client(w)), /policy factory code hash/);
  });
  it('fails closed on a wrong router, relayer or missing code', async () => {
    const w1 = good();
    w1.code[FAKE.router.toLowerCase()] = '0x6000';
    await bad(verifyDeployment(mf(), await client(w1)), /router code hash/);
    const w2 = good();
    w2.code[FAKE.relayer.toLowerCase()] = '0x6000';
    await bad(verifyDeployment(mf(), await client(w2)), /sweep relayer code hash/);
    const w3 = good();
    delete w3.code[FAKE.router.toLowerCase()];
    await bad(verifyDeployment(mf(), await client(w3)), /no contract code/);
    const w4 = good();
    delete w4.code[CANONICAL_ANNOUNCER.toLowerCase()];
    await bad(verifyDeployment(mf(), await client(w4)), /no contract code/);
  });
  it('rejects a hostile router: wrong FEE_BPS, FEE_RECIPIENT or ANNOUNCER', async () => {
    await bad(verifyDeployment(mf(), await client({ ...good(), feeBps: 26n })), /FEE_BPS/);
    await bad(verifyDeployment(mf(), await client({ ...good(), feeBps: 0n })), /FEE_BPS/);
    await bad(verifyDeployment(mf(), await client({ ...good(), feeRecipient: '0x00000000000000000000000000000000deadbeef' })), /FEE_RECIPIENT/);
    await bad(verifyDeployment(mf(), await client({ ...good(), announcer: '0x00000000000000000000000000000000deadbeef' })), /ANNOUNCER/);
  });
  it('rejects malformed router answers', async () => {
    await bad(verifyDeployment(mf(), await client({ ...good(), badReturn: '0x1234' })), /malformed/);
    await bad(verifyDeployment(mf(), await client({ ...good(), badReturn: `0x${'f'.repeat(64)}` })), /FEE_BPS/);
    await bad(verifyDeployment(mf(), await client({ ...good(), badReturn: `0x${'1'.repeat(64)}` })), /FEE_BPS/);
    await bad(verifyDeployment(mf(), await client({ ...good(), rawRecipient: `0x${'1'.repeat(64)}` })), /malformed/);
  });
  it('rejects a manifest that names a non-canonical announcer, even if the chain agrees with it', async () => {
    const m = wire();
    m['announcer'] = FAKE.announcer;
    const w = good();
    w.code[FAKE.announcer.toLowerCase()] = ANNOUNCER_CODE;
    await bad(verifyDeployment(validateManifest(m, 11155111), await client({ ...w, announcer: FAKE.announcer })), /not the canonical announcer/);
  });
  it('rejects chains without a canonical announcer and mismatched clients', async () => {
    const unknown = { ...mf(), chainId: 999_999 } as DeploymentManifest;
    const c = { ...(await client(good())), chainId: 999_999 };
    await bad(verifyDeployment(unknown, c), /no canonical announcer/);
    await bad(verifyDeployment(mf(), { ...(await client(good())), chainId: 1 }), /CHAIN_MISMATCH/);
    await bad(verifyDeployment(mf(), await client(good()), { secondary: { ...(await client(good())), chainId: 1 } }), /CHAIN_MISMATCH/);
    await bad(verifyDeployment({ ...mf(), feeBps: 30 } as unknown as DeploymentManifest, await client(good())), /25 bps/);
  });
  it('with a second provider every read must agree', async () => {
    const v = await verifyDeployment(mf(), await client(good()), { secondary: await client(good()), requireSecondary: true });
    expect(v.providers).toBe(2);
    const lying = good();
    lying.code[FAKE.router.toLowerCase()] = `${ROUTER_CODE}00`;
    await bad(verifyDeployment(mf(), await client(good()), { secondary: await client(lying) }), /providers disagree/);
    await bad(verifyDeployment(mf(), await client(good()), { secondary: await client({ ...good(), feeRecipient: '0x00000000000000000000000000000000deadbeef' }) }), /providers disagree/);
  });
  it('requireSecondary without a second provider fails closed', async () => {
    await bad(verifyDeployment(mf(), await client(good()), { requireSecondary: true }), /second independent provider/);
  });
});

describe('manifest signature', () => {
  const sk = secp256k1.utils.randomSecretKey();
  const pub = Array.from(secp256k1.getPublicKey(sk, true), (b) => b.toString(16).padStart(2, '0')).join('');
  const other = Array.from(secp256k1.getPublicKey(secp256k1.utils.randomSecretKey(), true), (b) => b.toString(16).padStart(2, '0')).join('');
  const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  const sign = (m: DeploymentManifest, key = sk): Hex => {
    const d = Uint8Array.from(manifestDigest(m).slice(2).match(/../g) ?? [], (h) => parseInt(h, 16));
    return `0x${hex(secp256k1.sign(d, key, { prehash: false, lowS: true }))}`;
  };
  const withSig = (policy: boolean, sig: (m: DeploymentManifest) => Hex = sign): DeploymentManifest => {
    const m = mf(policy);
    return { ...m, signature: sig(m) };
  };

  it('canonical JSON is key-order independent, excludes the signature and includes policy fields flat', () => {
    const a = canonicalManifestJson(mf());
    const reordered = Object.fromEntries(Object.entries(wire()).reverse());
    expect(canonicalManifestJson(validateManifest(reordered, 11155111))).toBe(a);
    expect(canonicalManifestJson({ ...mf(), signature: '0xabcd' })).toBe(a);
    expect(a).not.toMatch(/signature|\s/);
    const p = JSON.parse(canonicalManifestJson(mf(true))) as Record<string, unknown>;
    expect(p['policyFlatFee']).toBe('5000000');
    expect(p['policyFactory']).toBeDefined();
    expect(Object.keys(p)).toEqual([...Object.keys(p)].sort());
  });
  it('reports unsigned honestly', () => {
    expect(verifyManifestSignature(mf(), [])).toEqual({ status: 'unsigned' });
    expect(verifyManifestSignature(mf(), [pub])).toEqual({ status: 'unsigned' });
  });
  it('reports a signature without release keys as UNVERIFIABLE, never as valid', () => {
    expect(verifyManifestSignature(withSig(false), [])).toEqual({ status: 'unverifiable' });
  });
  it('accepts a valid signature from any configured key (with and without policy section)', () => {
    expect(verifyManifestSignature(withSig(false), [pub])).toEqual({ status: 'valid', keyIndex: 0 });
    expect(verifyManifestSignature(withSig(true), [other, pub.toUpperCase()])).toEqual({ status: 'valid', keyIndex: 1 });
  });
  it('rejects tampering, wrong key, wrong length, high-s and garbage', () => {
    const s = withSig(false);
    expect(verifyManifestSignature({ ...s, feeRecipient: FAKE.relayer }, [pub])).toEqual({ status: 'invalid' });
    expect(verifyManifestSignature({ ...s, router: FAKE.feeRecipient }, [pub])).toEqual({ status: 'invalid' });
    expect(verifyManifestSignature(s, [other])).toEqual({ status: 'invalid' });
    expect(verifyManifestSignature({ ...s, signature: `${s.signature}00` as Hex }, [pub])).toEqual({ status: 'invalid' });
    expect(verifyManifestSignature({ ...s, signature: `0x${'00'.repeat(64)}` }, [pub])).toEqual({ status: 'invalid' });
    const sig = secp256k1.sign(Uint8Array.from(manifestDigest(mf()).slice(2).match(/../g) ?? [], (h) => parseInt(h, 16)), sk, { prehash: false, lowS: true });
    const n = secp256k1.Point.Fn.ORDER;
    const r = sig.slice(0, 32);
    const sHigh = n - BigInt(`0x${hex(sig.slice(32))}`);
    const highS: Hex = `0x${hex(r)}${sHigh.toString(16).padStart(64, '0')}`;
    expect(verifyManifestSignature({ ...mf(), signature: highS }, [pub])).toEqual({ status: 'invalid' });
  });
  it('rejects malformed release keys loudly', () => {
    for (const k of ['04' + '11'.repeat(64), '02', 'zz', '']) expect(() => verifyManifestSignature(mf(), [k])).toThrow(/INVALID_INPUT/);
  });
  it('signature binds the chain: a copy for another chain does not verify', () => {
    const s = withSig(false);
    const other84532 = validateManifest({ ...manifestJson(84532), announcer: CANONICAL_ANNOUNCER, feeRecipient: FEE_RECIPIENT, bytecodeHashes: wire()['bytecodeHashes'] }, 84532);
    expect(verifyManifestSignature({ ...other84532, signature: s.signature as Hex }, [pub])).toEqual({ status: 'invalid' });
  });
});
