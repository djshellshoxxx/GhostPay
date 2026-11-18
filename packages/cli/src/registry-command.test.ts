import { describe, expect, it } from 'vitest';
import { ERC6538_ENTRY_TYPEHASH, ERC6538_REGISTRY, buildLookupCall } from '@ghostpay/chain-adapters';
import { encodeAbiParameters } from 'viem/utils';
import { G, G2, allOutput, makeIo, stdoutJson } from './fixtures.testutil.js';
import { run } from './run.js';

const who = '0x1111111111111111111111111111111111111111';
const meta = `st:eth:0x${G}${G2}`;
const lookupData = buildLookupCall(who).data;
const args = ['registry', 'lookup', '--chain', '11155111', '--registrant', who, '--online', '--rpc-env', 'TEST_RPC_ENDPOINT', '--json'];
function world() {
  const state = { primary: `0x${G}${G2}`, secondary: `0x${G}${G2}`, code: '0x6001', probe: ERC6538_ENTRY_TYPEHASH as string, fail: false };
  const calls: string[] = [];
  const io = Object.assign(makeIo(), { rpcTransport: { send: (url: string, raw: string) => {
    const request = JSON.parse(raw) as { id: number; method: string; params: readonly unknown[] }; calls.push(request.method);
    if (state.fail) return Promise.reject(new Error('PRIVATE_ENDPOINT_SECRET'));
    const result = request.method === 'eth_chainId' ? '0xaa36a7' : request.method === 'eth_getCode' ? state.code
      : (request.params[0] as { data: string }).data === lookupData
        ? encodeAbiParameters([{ type: 'bytes' }], [(url.includes('secondary') ? state.secondary : state.primary) as `0x${string}`]) : state.probe;
    return Promise.resolve(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }));
  } } });
  io.env['TEST_RPC_ENDPOINT'] = 'https://primary.example.test/PRIVATE_ENDPOINT_SECRET';
  io.env['TEST_SECONDARY_ENDPOINT'] = 'https://secondary.example.test/PRIVATE_ENDPOINT_SECRET';
  return { io, calls, state };
}

describe('explicit read-only ERC-6538 registry lookup', () => {
  it('reuses the shared behavioral probe and exact lookup without claiming code pins or identity', async () => {
    const { io, calls } = world();
    expect(await run(args, io)).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ registry: ERC6538_REGISTRY, registered: true, metaAddress: meta,
      registryBehaviorChecked: true, registryCodePinned: false, identityVerified: false, paymentVerified: false, providerTrustEstablished: false });
    expect(calls.filter(c => c === 'eth_getCode')).toHaveLength(2);
    expect(calls.filter(c => c === 'eth_call')).toHaveLength(2);
    expect(allOutput(io)).not.toContain('PRIVATE_ENDPOINT_SECRET');
  });
  it('reports an absent entry without inventing receiving keys and supports private report output', async () => {
    const { io, state } = world(); state.primary = '0x';
    expect(await run([...args, '--out', 'report'], io)).toBe(0);
    expect(stdoutJson(io)).toMatchObject({ registered: false, metaAddress: null });
    expect(JSON.parse(io.files.get('report')!) as unknown).toMatchObject({ registered: false });
    expect(await run([...args, '--out', 'report'], io)).toBe(3);
    expect(await run([...args, '--out', 'report', '--force'], io)).toBe(0);
  });
  it('requires explicit online consent, validates registrants first and refuses disabled chains', async () => {
    const { io, calls } = world();
    expect(await run(args.filter(a => a !== '--online'), io)).toBe(2);
    expect(await run(args.map(a => a === who ? 'javascript:alert(1)' : a), io)).toBe(1);
    expect(await run(args.map(a => a === '11155111' ? '1' : a), io)).toBe(5);
    expect(calls).toEqual([]);
  });
  it('compares both configured providers and refuses disagreement', async () => {
    const { io, state } = world(); const both = [...args, '--secondary-rpc-env', 'TEST_SECONDARY_ENDPOINT'];
    expect(await run(both, io)).toBe(0); expect(stdoutJson(io)).toMatchObject({ providers: 2 });
    io.out.length = 0; state.secondary = '0x';
    expect(await run(both, io)).toBe(1);
    expect(io.out).toEqual([]); expect(io.err.join('')).toContain('PROVIDER_DISAGREEMENT');
  });
  it.each(['code', 'probe', 'entry', 'network'] as const)('fails closed on invalid %s evidence', async kind => {
    const { io, state } = world();
    if (kind === 'code') state.code = '0x';
    if (kind === 'probe') state.probe = '0x' + '00'.repeat(32);
    if (kind === 'entry') state.primary = '0x1234';
    if (kind === 'network') state.fail = true;
    expect(await run(args, io)).toBe(kind === 'network' ? 4 : kind === 'entry' ? 1 : 6);
    expect(io.out).toEqual([]); expect(allOutput(io)).not.toContain('PRIVATE_ENDPOINT_SECRET');
  });
  it('gives human-readable found and absent results with explicit unverified identity', async () => {
    const { io, state } = world(); const human = args.filter(a => a !== '--json');
    expect(await run(human, io)).toBe(0); expect(io.out.join('')).toContain('identity');
    io.out.length = 0; state.primary = '0x';
    expect(await run(human, io)).toBe(0); expect(io.out.join('')).toContain('No scheme-1 entry');
  });
});
