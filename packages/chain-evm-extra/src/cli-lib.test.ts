import { describe, expect, it } from 'vitest';
import { ARACHNID_DEPLOYER, CANONICAL_ANNOUNCER } from './address.js';
import { createFetchRpc, parseArgs, runCli, type FetchLike } from './cli-lib.js';
import { keccakHex } from './hex.js';

const CODE = '0x6080';
type Resp = { ok: boolean; status: number; text(): Promise<string> };
const ok = (result: unknown): Resp => ({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ jsonrpc: '2.0', id: 1, result })) });
function server(chain = '0xe708', code = CODE): FetchLike & { bodies: string[] } {
  const bodies: string[] = [];
  const f: FetchLike = (_u, init) => {
    bodies.push(init.body);
    const b = JSON.parse(init.body) as { method: string; params: string[] };
    return Promise.resolve(b.method === 'eth_chainId' ? ok(chain) : ok(b.params[0] === CANONICAL_ANNOUNCER || b.params[0] === ARACHNID_DEPLOYER ? code : '0x'));
  };
  return Object.assign(f, { bodies });
}
const URL_ = 'https://rpc.example.invalid/KEY123';

describe('createFetchRpc', () => {
  it('validates URL', () => {
    const f = server();
    expect(() => createFetchRpc('nope', f)).toThrow('invalid');
    expect(() => createFetchRpc('http://example.com', f)).toThrow('https');
    expect(() => createFetchRpc('https://u:p@example.com', f)).toThrow('credentials');
    expect(() => createFetchRpc('http://localhost:8545', f)).not.toThrow();
  });
  it('speaks read-only JSON-RPC', async () => {
    const f = server();
    const rpc = createFetchRpc(URL_, f);
    expect(await rpc.getChainId()).toBe(59144n);
    expect(await rpc.getCode(CANONICAL_ANNOUNCER)).toBe(CODE);
    expect(f.bodies.map((b) => (JSON.parse(b) as { method: string }).method)).toEqual(['eth_chainId', 'eth_getCode']);
  });
  it('rejects bad HTTP / bodies / malformed results', async () => {
    const mk = (r: Resp | string): FetchLike => () => Promise.resolve(typeof r === 'string' ? { ok: true, status: 200, text: () => Promise.resolve(r) } : r);
    await expect(createFetchRpc(URL_, mk({ ok: false, status: 500, text: () => Promise.resolve('') })).getChainId()).rejects.toThrow('HTTP 500');
    await expect(createFetchRpc(URL_, mk('null')).getChainId()).rejects.toThrow('malformed');
    await expect(createFetchRpc(URL_, mk('{"error":{"message":"KEY123"}}')).getChainId()).rejects.toThrow('JSON-RPC error');
    await expect(createFetchRpc(URL_, mk('{}')).getChainId()).rejects.toThrow('JSON-RPC error');
    await expect(createFetchRpc(URL_, mk('{"result":5}')).getChainId()).rejects.toThrow('chain id');
    await expect(createFetchRpc(URL_, mk('{"result":5}')).getCode(CANONICAL_ANNOUNCER)).rejects.toThrow('code');
  });
});

describe('parseArgs', () => {
  it('parses and uses env fallback', () => {
    expect(parseArgs(['--chain', '59144', '--rpc', URL_, '--announcer-hash', 'h', '--deployer-hash', 'd', '--timeout-ms', '500'], {})).toEqual({
      chainId: 59144, rpcUrl: URL_, expectedAnnouncerCodeHash: 'h', expectedDeployerCodeHash: 'd', timeoutMs: 500,
    });
    expect(parseArgs(['--chain', '1'], { GHOSTPAY_RPC_URL: URL_ }).rpcUrl).toBe(URL_);
  });
  it('rejects bad input', () => {
    expect(() => parseArgs(['--bogus', '1'], {})).toThrow('unknown');
    expect(() => parseArgs(['--chain'], {})).toThrow('missing');
    expect(() => parseArgs([], {})).toThrow('--chain');
    expect(() => parseArgs(['--chain', '0x1'], {})).toThrow('--chain');
    expect(() => parseArgs(['--chain', '1'], {})).toThrow('RPC URL');
    expect(() => parseArgs(['--chain', '1'], { GHOSTPAY_RPC_URL: '' })).toThrow('RPC URL');
    expect(() => parseArgs(['--chain', '1', '--rpc', URL_, '--timeout-ms', '-1'], {})).toThrow('timeout');
  });
});

describe('runCli', () => {
  const base = ['--chain', '59144', '--rpc', URL_];
  it('exit 0 with ok report and no URL in output', async () => {
    const o = await runCli([...base, '--announcer-hash', keccakHex(CODE)], {}, server());
    expect(o.exitCode).toBe(0);
    expect(o.output).not.toContain('KEY123');
    expect((JSON.parse(o.output) as { result: string }).result).toBe('ok');
  });
  it('exit 1 for unverified / mismatch', async () => {
    expect((await runCli(base, {}, server())).exitCode).toBe(1);
    expect((await runCli(base, {}, server('0x1'))).exitCode).toBe(1);
  });
  it('exit 2 for usage errors, unknown chain, bad rpc url, bad hash', async () => {
    expect((await runCli([], {}, server())).exitCode).toBe(2);
    expect((await runCli(['--chain', '999', '--rpc', URL_], {}, server())).output).toContain('not in manifest');
    expect((await runCli(['--chain', '59144', '--rpc', 'http://x.com'], {}, server())).exitCode).toBe(2);
    expect((await runCli([...base, '--announcer-hash', '0x1'], {}, server())).exitCode).toBe(2);
  });
  it('passes signal and timeout through', async () => {
    const ac = new AbortController();
    ac.abort();
    const o = await runCli([...base, '--timeout-ms', '100'], {}, server(), ac.signal);
    expect((JSON.parse(o.output) as { result: string }).result).toBe('aborted');
  });
  it('zkSync is rejected via CLI', async () => {
    const o = await runCli(['--chain', '324', '--rpc', URL_], {}, server('0x144'));
    expect(o.exitCode).toBe(1);
    expect(o.output).toContain('unsupported_create2');
  });
});
