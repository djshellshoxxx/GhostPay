import { createServer } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { afterAll, describe, expect, it } from 'vitest';
import { PUBLIC_SIGNAL_COUNT, ProverError, defaultLoader, handleWorkerRequest, loadArtifacts, prove, snarkjsEngine, terminateProver, verify, type Groth16Engine, type ProveRequest, type ProverArtifacts } from './prover.js';

const wasm = new Uint8Array([1, 2, 3]);
const zkey = new Uint8Array([4, 5, 6, 7]);
const hex = (u: Uint8Array): string => bytesToHex(sha256(u));
const art = (over: Partial<ProverArtifacts> = {}): ProverArtifacts => ({ wasmUrl: 'mem:wasm', zkeyUrl: 'mem:zkey', sha256: { wasm: hex(wasm), zkey: hex(zkey) }, label: 'INSECURE-LOCAL', ...over });
const loader = (u: string): Promise<Uint8Array> => Promise.resolve(u === 'mem:wasm' ? wasm : zkey);
const proof = { pi_a: ['1', '2', '1'], pi_b: [['1', '2'], ['3', '4'], ['1', '0']], pi_c: ['5', '6', '1'] };
const sig = (n: number): string[] => Array.from({ length: n }, (_, i) => String(i + 1));
const engine = (over: Partial<Groth16Engine> = {}): Groth16Engine => ({
  fullProve: () => Promise.resolve({ proof, publicSignals: sig(9) }),
  verify: () => Promise.resolve(true),
  ...over,
});
const req = (over: Partial<ProveRequest> = {}): ProveRequest => ({ kind: 'withdraw', chainId: 31337, inputs: { secretish: '42' }, artifacts: art(), ...over });
const code = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof ProverError ? e.code : 'other';
  }
};

afterAll(terminateProver);

describe('loadArtifacts', () => {
  it('verifies hashes and label', async () => {
    const l = await loadArtifacts(art(), { loader });
    expect(l.wasm).toEqual(wasm);
    expect(l.label).toBe('INSECURE-LOCAL');
    expect(await code(loadArtifacts(art({ sha256: { wasm: hex(zkey), zkey: hex(zkey) } }), { loader }))).toBe('ARTIFACT_HASH');
    expect(await code(loadArtifacts(art({ sha256: { wasm: hex(wasm), zkey: hex(wasm) } }), { loader }))).toBe('ARTIFACT_HASH');
    expect(await code(loadArtifacts(art({ sha256: { wasm: 'abcd', zkey: hex(zkey) } }), { loader }))).toBe('ARTIFACT_HASH');
    expect(await code(loadArtifacts(art({ label: 'PRODUCTION' as never }), { loader }))).toBe('ARTIFACT_LABEL');
    expect(await code(loadArtifacts(art({ label: undefined as never }), { loader }))).toBe('ARTIFACT_LABEL');
    expect((await loadArtifacts(art({ label: 'TESTNET-CEREMONY', sha256: { wasm: hex(wasm).toUpperCase(), zkey: hex(zkey) } }), { loader })).label).toBe('TESTNET-CEREMONY');
  });
});

describe('prove', () => {
  it('returns proof and checks signals', async () => {
    const r = await prove(req({ expectedSignals: sig(9) }), { loader, engine: engine() });
    expect(r.publicSignals.length).toBe(PUBLIC_SIGNAL_COUNT.withdraw);
    expect(await code(prove(req({ expectedSignals: sig(8) }), { loader, engine: engine() }))).toBe('BAD_PROOF');
    expect(await code(prove(req({ expectedSignals: [...sig(8), '99'] }), { loader, engine: engine() }))).toBe('BAD_PROOF');
  });
  it('guards chain, kind, engine failure without leaking inputs', async () => {
    expect(await code(prove(req({ chainId: 1 }), { loader, engine: engine() }))).toBe('WRONG_CHAIN');
    expect(await code(prove(req({ chainId: 84532 }), { loader, engine: engine() }))).toBe('ok');
    expect(await code(prove(req({ kind: 'x' as never }), { loader, engine: engine() }))).toBe('BAD_REQUEST');
    let msg = '';
    try {
      await prove(req(), { loader, engine: engine({ fullProve: () => Promise.reject(new Error('witness 42 secretish')) }) });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toContain('proof generation failed');
    expect(msg).not.toContain('42');
    expect(await code(prove(req(), { loader, engine: engine({ fullProve: () => Promise.resolve({ proof: null, publicSignals: sig(9) }) }) }))).toBe('BAD_PROOF');
    expect(await code(prove(req(), { loader, engine: engine({ fullProve: () => Promise.resolve({ proof: 5, publicSignals: sig(9) }) }) }))).toBe('BAD_PROOF');
    expect(await code(prove(req(), { loader, engine: engine({ fullProve: () => Promise.resolve({ proof, publicSignals: sig(4) }) }) }))).toBe('BAD_PROOF');
    expect(await code(prove(req({ kind: 'commitment' }), { loader, engine: engine({ fullProve: () => Promise.resolve({ proof, publicSignals: sig(4) }) }) }))).toBe('ok');
  });
  it('default engine rejects garbage artifacts as PROVE_FAILED', async () => {
    expect(await code(prove(req(), { loader }))).toBe('PROVE_FAILED');
  });
});

describe('verify', () => {
  it('fails closed', async () => {
    expect(await verify('withdraw', {}, proof, sig(9), { engine: engine() })).toBe(true);
    expect(await verify('withdraw', {}, proof, sig(8), { engine: engine() })).toBe(false);
    expect(await verify('withdraw', {}, proof, sig(9), { engine: engine({ verify: () => Promise.reject(new Error('x')) }) })).toBe(false);
    expect(await verify('commitment', {}, proof, sig(4), { engine: engine({ verify: () => Promise.resolve(false) }) })).toBe(false);
    await expect(snarkjsEngine.verify({}, sig(9), proof)).rejects.toBeDefined();
  });
});

describe('worker handler', () => {
  it('replies ok or a code only', async () => {
    const ok = await handleWorkerRequest({ id: 1, req: req() }, { loader, engine: engine() });
    expect(ok).toMatchObject({ id: 1, ok: true });
    const bad = await handleWorkerRequest({ id: 2, req: req({ chainId: 1 }) });
    expect(bad).toEqual({ id: 2, ok: false, code: 'WRONG_CHAIN' });
    const unk = await handleWorkerRequest({ id: 3, req: req() }, { loader: () => Promise.reject(new Error('x')), engine: engine() });
    expect(unk).toEqual({ id: 3, ok: false, code: 'UNKNOWN' });
  });
  it('terminateProver is safe without curve', async () => {
    await expect(terminateProver()).resolves.toBeUndefined();
  });
});

describe('defaultLoader', () => {
  it('reads files, file urls and loopback http; refuses others', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'prover-'));
    const f = join(dir, 'a.bin');
    await writeFile(f, new Uint8Array([9, 8]));
    expect(await defaultLoader(f)).toEqual(new Uint8Array([9, 8]));
    expect(await defaultLoader(`file://${f}`)).toEqual(new Uint8Array([9, 8]));
    const srv = createServer((rq, rs) => {
      if (rq.url === '/ok') rs.end(Buffer.from([1, 1]));
      else {
        rs.statusCode = 404;
        rs.end();
      }
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    const port = (srv.address() as { port: number }).port;
    expect(await defaultLoader(`http://127.0.0.1:${String(port)}/ok`)).toEqual(new Uint8Array([1, 1]));
    expect(await code(defaultLoader(`http://127.0.0.1:${String(port)}/missing`))).toBe('ARTIFACT_LOAD');
    srv.close();
    expect(await code(defaultLoader('http://example.com/x'))).toBe('ARTIFACT_LOAD');
    expect(await code(defaultLoader('ftp://x'))).toBe('ARTIFACT_LOAD');
    expect(await code(defaultLoader('not a url'))).toBe('ARTIFACT_LOAD');
    expect(await code(defaultLoader('/definitely/missing/file'))).toBe('ARTIFACT_LOAD');
  });
});
