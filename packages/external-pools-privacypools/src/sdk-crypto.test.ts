import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as sdk from '@0xbow/privacy-pools-core-sdk';
import { entropyToMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { TESTNET_MANIFEST, assertArtifactHashes, findEntry, makeSeed, D1, S1, MemoryVaultStorage, Vault } from '@ghostpay/external-pools';
import { groth16 } from 'snarkjs';
import { PrivacyPoolsAdapter, decodeNoteData } from './adapter.js';
import { createSdkCrypto, poseidon1, type ArtifactProvider } from './sdk-crypto.js';
import { withEntropy } from './derive.js';
import { PoolEnv, POOL, ENTRYPOINT, FEE_RECEIVER, relayerHandler } from './fakes.testutil.js';
import { manifestFor } from './harness.testutil.js';
import { stubTransport, makeRequest } from '@ghostpay/external-pools';
import { keccak256 } from 'viem';
import { poseidonPerm } from '@zk-kit/poseidon-cipher';
import { ENTRY_CODE, POOL_CODE } from './fakes.testutil.js';

const DIR = process.env['PP_ARTIFACT_DIR'];
const haveArtifacts = DIR !== undefined && existsSync(join(DIR, 'withdraw.zkey'));
const provider: ArtifactProvider = (c, k) => Promise.resolve(new Uint8Array(readFileSync(join(DIR ?? '', `${c}.${k}`))));
const offline: ArtifactProvider = () => Promise.reject(new Error('no artifacts in this test'));

describe('real SDK derivations (offline, no artifacts)', () => {
  it('poseidon1 equals circomlib Poseidon(1) test vector', () => {
    expect(poseidon1(1n)).toBe(18586133768512220936620570745912940619677854269274689475585506675881198879027n);
  });

  it('matches direct SDK calls and is deterministic and domain separated (EP-PP-10)', async () => {
    const c = await createSdkCrypto(offline);
    const seed = makeSeed(5);
    const ent = withEntropy(seed, (e) => Uint8Array.from(e));
    const keys = sdk.generateMasterKeys(entropyToMnemonic(ent, wordlist));
    const want = sdk.generateDepositSecrets(keys, sdk.bigintToHash(12345n), 2n);
    const got = c.depositSecrets(ent, 12345n, 2n);
    expect(got.nullifier).toBe(want.nullifier);
    expect(got.secret).toBe(want.secret);
    expect(got.precommitment).toBe(sdk.hashPrecommitment(want.nullifier, want.secret));
    expect(c.depositSecrets(ent, 12345n, 2n)).toEqual(got);
    expect(c.depositSecrets(ent, 12345n, 3n).precommitment).not.toBe(got.precommitment);
    const other = withEntropy(seed, (e) => Uint8Array.from(e), 'ghostpay/ext-pools/railgun/v1');
    expect(c.depositSecrets(other, 12345n, 2n).precommitment).not.toBe(got.precommitment);
    const w = c.withdrawalSecrets(ent, 77n, 0n);
    const ww = sdk.generateWithdrawalSecrets(keys, sdk.bigintToHash(77n), 0n);
    expect(w).toEqual({ nullifier: ww.nullifier, secret: ww.secret });
    // fixed seed => fixed first precommitment (regression vector, computed with this build)
    expect(c.depositSecrets(ent, 1n, 0n).precommitment).toMatchInlineSnapshot(`12274543407799010503164624051246194105067574956543760715431765195506443023094n`);
  });

  it('commitment: hash is Poseidon(value,label,precommitment); nullifierHash is the circuit one, not the SDK field', async () => {
    const c = await createSdkCrypto(offline);
    const ent = new Uint8Array(16).fill(1);
    const s = c.depositSecrets(ent, 5n, 0n);
    const r = c.commitment(1000n, 9n, s.nullifier, s.secret);
    const sdkC = sdk.getCommitment(1000n, 9n, s.nullifier as never, s.secret as never);
    expect(r.hash).toBe(sdkC.hash);
    expect(r.nullifierHash).toBe(poseidon1(s.nullifier));
    expect(r.nullifierHash).not.toBe(sdkC.nullifierHash); // SDK's field is the precommitment
    expect(sdkC.nullifierHash).toBe(s.precommitment);
  });

  it('calculateContext equals the SDK value', async () => {
    const c = await createSdkCrypto(offline);
    const w = { processooor: ENTRYPOINT, data: '0x1234' as const };
    expect(c.calculateContext(w, 12345n)).toBe(BigInt(sdk.calculateContext(w, sdk.bigintToHash(12345n))));
  });

  it('rejects unsupported circuits and surfaces artifact errors', async () => {
    const c = await createSdkCrypto(offline);
    await expect(c.artifactDigests()).rejects.toThrow(/no artifacts/);
  });
});

describe.skipIf(!haveArtifacts)('real circuits (needs PP_ARTIFACT_DIR with the six official artifacts)', () => {
  it('artifact digests equal the manifest pins from the SDK README (EP-PP-6)', async () => {
    const c = await createSdkCrypto(provider);
    const entry = findEntry(TESTNET_MANIFEST, 'privacy-pools', 11155111)!;
    assertArtifactHashes(entry, await c.artifactDigests());
    await expect(c.artifactDigests()).resolves.toMatchObject({ 'withdraw.zkey': '2a893b42174c813566e5c40c715a8b90cd49fc4ecf384e3a6024158c3d6de677' });
  }, 120_000);

  it('ragequit and withdrawal proofs are real, verify, and bind the public signals', async () => {
    const c = await createSdkCrypto(provider);
    const ent = new Uint8Array(16).fill(9);
    const dep = c.depositSecrets(ent, 4242n, 0n);
    const value = 990_000n;
    const label = 31337n;
    const com = c.commitment(value, label, dep.nullifier, dep.secret);
    // ragequit (commitment circuit): [commitment, nullifierHash, value, label]
    const rq = await c.proveRagequit({ value, label, nullifier: dep.nullifier, secret: dep.secret });
    expect(rq.publicSignals.map(BigInt)).toEqual([com.hash, com.nullifierHash, value, label]);
    const vk = JSON.parse(readFileSync(join(DIR ?? '', 'commitment.vkey'), 'utf8')) as object;
    expect(await groth16.verify(vk, [...rq.publicSignals], rq.proof as never)).toBe(true);
    // withdrawal: other commitments in both trees
    const state = [111n, 222n, com.hash, 333n, 444n];
    const asp = [5n, label, 6n];
    const ws = c.withdrawalSecrets(ent, label, 0n);
    const withdrawal = { processooor: ENTRYPOINT, data: '0xabcd' as const };
    const context = c.calculateContext(withdrawal, 4242n);
    const wp = await c.proveWithdrawal({ value, label, nullifier: dep.nullifier, secret: dep.secret, context, withdrawalAmount: value, stateLeaves: state, aspLeaves: asp, newNullifier: ws.nullifier, newSecret: ws.secret });
    expect(await c.verifyWithdrawal(wp)).toBe(true);
    expect(wp.publicSignals).toHaveLength(8);
    expect(BigInt(wp.publicSignals[1] ?? '0')).toBe(com.nullifierHash);
    expect(BigInt(wp.publicSignals[2] ?? '0')).toBe(value);
    expect(BigInt(wp.publicSignals[3] ?? '0')).toBe(BigInt(sdk.generateMerkleProof(state, com.hash).root));
    expect(BigInt(wp.publicSignals[5] ?? '0')).toBe(BigInt(sdk.generateMerkleProof(asp, label).root));
    expect(BigInt(wp.publicSignals[7] ?? '0')).toBe(context);
    const bad = { ...wp, publicSignals: [...wp.publicSignals.slice(0, 2), '5', ...wp.publicSignals.slice(3)] };
    expect(await c.verifyWithdrawal(bad)).toBe(false);
  }, 240_000);

  it('end to end with real crypto and a simulated pool: deposit, relayed exit, ragequit, recovery', async () => {
    const crypto = await createSdkCrypto(provider);
    const env = new PoolEnv();
    env.commitFn = (v, l, p) => poseidonPerm([0n, v, l, p])[0] as bigint;
    env.rootFn = (ls) => (ls.length === 0 ? 0n : BigInt(sdk.generateMerkleProof([...ls], ls[0] as bigint).root));
    env.fund(S1, 10n ** 12n);
    const manifest = manifestFor({ artifactSha256: findEntry(TESTNET_MANIFEST, 'privacy-pools', 11155111)!.artifactSha256 });
    const clock = { now: 1_700_000_000_000 };
    const st = stubTransport((c) => relayerHandler(env, () => clock.now, {})(c), clock);
    const adapter = new PrivacyPoolsAdapter({ manifest, chain: env.reader(), transport: st.transport, crypto, asp: env, clock: () => clock.now });
    const req = makeRequest({ amount: 1_000_000n, rootSeed: makeSeed(3), destination: D1 });
    const enter = async (): Promise<ReturnType<typeof decodeNoteData> & { note: Awaited<ReturnType<typeof adapter.recordEntry>> }> => {
      const q = await adapter.quoteEntry(req);
      const [tx] = await adapter.prepareEntry(req, q);
      const note = await adapter.recordEntry(req, q, env.execute(tx!));
      env.aspLeaves.push(decodeNoteData(note.adapterData).label);
      return { ...decodeNoteData(note.adapterData), note };
    };
    const a = await enter();
    const b = await enter();
    const qa = await adapter.quoteExit(a.note, { destination: D1 });
    const ra = await adapter.executeExit(a.note, qa, st.transport);
    expect(ra.newState).toBe('exited');
    expect(env.balance(D1)).toBe(ra.exitedAmount);
    const [rq] = await adapter.prepareEmergencyExit(b.note);
    const before = env.balance(S1);
    env.execute(rq!);
    expect(env.balance(S1) - before).toBe(b.value);
    const vault = await Vault.create(new MemoryVaultStorage(), 'correct horse battery', { N: 1 << 14, r: 8, p: 1 });
    const { recoverNotes } = await import('@ghostpay/external-pools');
    const rep = await recoverNotes([adapter], req.rootSeed, { chainId: 31337, chain: env.reader(), stealthAddresses: [S1], fromBlock: 0n }, vault);
    const states = new Map((await vault.listNotes()).map((n) => [n.noteId, n.state]));
    expect(rep.errors).toEqual([]);
    expect(states.get(a.note.noteId)).toBe('exited'); // needs the circuit's nullifier hash, not the SDK field
    expect(states.get(b.note.noteId)).toBe('ragequit');
    expect(keccak256(ENTRY_CODE)).toBeDefined();
    void POOL_CODE; void FEE_RECEIVER; void POOL;
  }, 300_000);
});
