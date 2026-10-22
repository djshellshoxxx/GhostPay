import { encodeAbiParameters, keccak256 } from 'viem/utils';
import { describe, expect, it } from 'vitest';
import { validateManifest, type DeploymentManifest } from './deployments.js';
import { ChainAdapterError } from './errors.js';
import { FAKE, SEPOLIA, manifestJson } from './fixtures.testutil.js';
import { assertManifestVerified, codehashOf, verifyManifest } from './readback.js';
import { createClient, type RpcClient } from './rpc.js';
import { fakeTransport, noSleep } from './rpc.testutil.js';
import type { Hex } from './types.js';

const ROUTER_CODE: Hex = '0x6080604052aa';
const RELAYER_CODE: Hex = '0x6080604052bb';
const ANNOUNCER_CODE: Hex = '0x6080604052cc';
const POLICY_IMPL_CODE: Hex = '0x6080604052dd';
const POLICY_FACTORY_CODE: Hex = '0x6080604052ee';

const SEL = { FEE_RECIPIENT: '0xebd09054', ANNOUNCER: '0x04e6b741', FEE_BPS: '0xbf333f2c' };

function word(addr: string): Hex {
  return encodeAbiParameters([{ type: 'address' }], [addr as Hex]);
}

interface World {
  feeRecipient: string;
  announcer: string;
  feeBps: bigint;
  code: Record<string, string>;
  chainId?: string;
  throwOn?: string;
}

function world(over: Partial<World> = {}): World {
  return {
    feeRecipient: FAKE.feeRecipient,
    announcer: FAKE.announcer,
    feeBps: 25n,
    code: {
      [FAKE.router.toLowerCase()]: ROUTER_CODE,
      [FAKE.relayer.toLowerCase()]: RELAYER_CODE,
      [FAKE.announcer.toLowerCase()]: ANNOUNCER_CODE,
    },
    ...over,
  };
}

async function clientFor(w: World, id = 11155111): Promise<RpcClient> {
  return createClient(SEPOLIA, 'https://rpc.example.test', {
    sleep: noSleep,
    transport: fakeTransport((m, p) => {
      if (m === 'eth_chainId') return '0xaa36a7';
      if (w.throwOn === m) throw new Error('boom');
      if (m === 'eth_getCode') return w.code[(p[0] as string).toLowerCase()] ?? '0x';
      if (m === 'eth_call') {
        const c = p[0] as { to: string; data: string };
        if (c.to.toLowerCase() !== FAKE.router.toLowerCase()) return '0x';
        const sel = c.data.slice(0, 10);
        if (sel === SEL.FEE_RECIPIENT) return word(w.feeRecipient);
        if (sel === SEL.ANNOUNCER) return word(w.announcer);
        if (sel === SEL.FEE_BPS) return encodeAbiParameters([{ type: 'uint256' }], [w.feeBps]);
      }
      throw new Error(`unexpected ${m}`);
    }),
  }).then((c) => (id === c.chainId ? c : { ...c, chainId: id }));
}

function good(): DeploymentManifest {
  const j = manifestJson();
  j['bytecodeHashes'] = { router: keccak256(ROUTER_CODE), sweepRelayer: keccak256(RELAYER_CODE) };
  return validateManifest(j, 11155111);
}

function names(r: { checks: readonly { name: string; pass: boolean }[] }): string[] {
  return r.checks.filter((c) => !c.pass).map((c) => c.name);
}

describe('verifyManifest', () => {
  it('passes when the chain matches the manifest on every check', async () => {
    const r = await verifyManifest(good(), [await clientFor(world())]);
    expect(names(r)).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.checks.map((c) => c.name)).toEqual([
      'providers', 'chainId', 'router.FEE_RECIPIENT', 'router.ANNOUNCER', 'router.FEE_BPS',
      'router.codehash', 'relayer.codehash', 'announcer.code',
    ]);
    expect(() => assertManifestVerified(r)).not.toThrow();
  });

  it('fails when FEE_RECIPIENT on chain differs from the manifest', async () => {
    const r = await verifyManifest(good(), [await clientFor(world({ feeRecipient: '0x00000000000000000000000000000000000000ee' }))]);
    expect(r.ok).toBe(false);
    expect(names(r)).toEqual(['router.FEE_RECIPIENT']);
    expect(() => assertManifestVerified(r)).toThrow(/MANIFEST_READBACK_FAILED.*router\.FEE_RECIPIENT/);
  });

  it('fails when ANNOUNCER or FEE_BPS differ', async () => {
    const a = await verifyManifest(good(), [await clientFor(world({ announcer: '0x00000000000000000000000000000000000000ee' }))]);
    expect(names(a)).toEqual(['router.ANNOUNCER']);
    const b = await verifyManifest(good(), [await clientFor(world({ feeBps: 0n }))]);
    expect(names(b)).toEqual(['router.FEE_BPS']);
  });

  it('fails on a code hash mismatch for router and relayer', async () => {
    const w = world();
    w.code[FAKE.router.toLowerCase()] = '0x6080604052ff';
    const r1 = await verifyManifest(good(), [await clientFor(w)]);
    expect(names(r1)).toEqual(['router.codehash']);
    const w2 = world();
    w2.code[FAKE.relayer.toLowerCase()] = '0x00';
    expect(names(await verifyManifest(good(), [await clientFor(w2)]))).toEqual(['relayer.codehash']);
  });

  it('fails closed on missing code, malformed code and EIP-7702 delegation', async () => {
    for (const bad of ['0x', '0xef0100' + '11'.repeat(20)]) {
      const w = world();
      w.code[FAKE.announcer.toLowerCase()] = bad;
      expect(names(await verifyManifest(good(), [await clientFor(w)]))).toEqual(['announcer.code']);
    }
    expect(() => codehashOf('nothex')).toThrow(/getCode result malformed/);
    expect(() => codehashOf(5)).toThrow(ChainAdapterError);
    expect(() => codehashOf('0xEF0100aa')).toThrow(/delegation/);
    expect(codehashOf(ROUTER_CODE)).toBe(keccak256(ROUTER_CODE));
  });

  it('pins the announcer codehash when given', async () => {
    const ok = await verifyManifest(good(), [await clientFor(world())], { expectedAnnouncerCodehash: keccak256(ANNOUNCER_CODE) });
    expect(ok.ok).toBe(true);
    expect(ok.checks.some((c) => c.name === 'announcer.codehash')).toBe(true);
    const bad = await verifyManifest(good(), [await clientFor(world())], { expectedAnnouncerCodehash: `0x${'9'.repeat(64)}` });
    expect(names(bad)).toEqual(['announcer.codehash']);
  });

  it('treats RPC errors and malformed eth_call results as failures, never as pass', async () => {
    const r = await verifyManifest(good(), [await clientFor(world({ throwOn: 'eth_getCode' }))]);
    expect(r.ok).toBe(false);
    expect(r.checks.filter((c) => c.actual === 'error').length).toBeGreaterThan(0);
    const short = createClient(SEPOLIA, 'https://rpc.example.test', {
      sleep: noSleep,
      transport: fakeTransport((m) => (m === 'eth_chainId' ? '0xaa36a7' : '0x1234')),
    });
    const r2 = await verifyManifest(good(), [await short]);
    expect(r2.ok).toBe(false);
  });

  it('fails on chain id mismatch and when no client is supplied', async () => {
    const r = await verifyManifest(good(), [await clientFor(world(), 1)]);
    expect(r.ok).toBe(false);
    expect(names(r)).toEqual(['chainId']);
    const none = await verifyManifest(good(), []);
    expect(none.ok).toBe(false);
  });

  it('requireTwoProviders needs two clients that agree on every read', async () => {
    const one = await verifyManifest(good(), [await clientFor(world())], { requireTwoProviders: true });
    expect(names(one)).toEqual(['providers']);
    const both = await verifyManifest(good(), [await clientFor(world()), await clientFor(world())], { requireTwoProviders: true });
    expect(both.ok).toBe(true);
    const liar = world({ feeRecipient: '0x00000000000000000000000000000000000000ee' });
    const split = await verifyManifest(good(), [await clientFor(world()), await clientFor(liar)], { requireTwoProviders: true });
    expect(split.ok).toBe(false);
    expect(split.checks.find((c) => c.name === 'router.FEE_RECIPIENT')?.actual).toBe('error');
  });

  it('checks policy implementation and factory code when the manifest has them', async () => {
    const j = manifestJson();
    j['bytecodeHashes'] = {
      router: keccak256(ROUTER_CODE), sweepRelayer: keccak256(RELAYER_CODE),
      policyImplementation: keccak256(POLICY_IMPL_CODE), policyFactory: keccak256(POLICY_FACTORY_CODE),
    };
    j['deployTx'] = { router: `0x${'1'.repeat(64)}`, sweepRelayer: `0x${'2'.repeat(64)}`, policyImplementation: `0x${'5'.repeat(64)}`, policyFactory: `0x${'6'.repeat(64)}` };
    j['policyImplementation'] = '0x0000000000000000000000000000000000000e55';
    j['policyFactory'] = '0x0000000000000000000000000000000000000f66';
    j['policyFeeToken'] = '0x0000000000000000000000000000000000000a77';
    j['policyFlatFee'] = '1000000';
    j['policyFeeRecipient'] = '0x0000000000000000000000000000000000000d44';
    const m = validateManifest(j, 11155111);
    const w = world();
    w.code[m.policy!.implementation.toLowerCase()] = POLICY_IMPL_CODE;
    const r = await verifyManifest(m, [await clientFor(w)]);
    expect(names(r)).toEqual(['policy.factory.codehash']);
    w.code[m.policy!.factory.toLowerCase()] = POLICY_FACTORY_CODE;
    expect((await verifyManifest(m, [await clientFor(w)])).ok).toBe(true);
  });
});

describe('assertManifestVerified', () => {
  it('rejects empty and forged-ok results', () => {
    expect(() => assertManifestVerified({ ok: true, checks: [] })).toThrow(/no checks ran/);
    expect(() => assertManifestVerified({ ok: true, checks: [{ name: 'chainId', expected: '1', actual: '2', pass: false }] })).toThrow(/chainId/);
    expect(() => assertManifestVerified({ ok: false, checks: [] })).toThrow(/MANIFEST_READBACK_FAILED/);
  });
});
