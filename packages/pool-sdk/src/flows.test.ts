import { generateKeySet, encodeMetaAddress, checkAnnouncement } from '@ghostpay/core-crypto';
import { decodeAbiParameters, decodeFunctionData, zeroAddress } from 'viem';
import { describe, expect, it } from 'vitest';
import { poolAbi } from './abi.js';
import { buildAspTree, verifyAspSet } from './asp.js';
import { buildSpPayAnnounce } from './announce.js';
import { assertSignals, encodeRagequitCall, encodeWithdrawCall, commitmentOf, planDeposit, prepareRagequit, prepareWithdrawal, type PrepareWithdrawArgs } from './flows.js';
import { buildRagequitInputs, buildWithdrawInputs, expectedWithdrawSignals } from './inputs.js';
import { deriveNoteSecrets, noteCommitment, nullifierHash, type Note } from './notes.js';
import { A1, A2, POOL, dep, foreignDeposit, synced, withSeed } from './fixtures.testutil.js';
import { SP_OPTION_INFO, LIMIT_COPY, LIMIT_IDS, BANNED_COPY, TEST_POOL_LINE } from './options.js';
import { toCalldataProof } from './wire.js';
import { PoolTree } from './tree.js';

function mkNote(index: number, value: bigint, label: bigint, leafIndex?: number): Note {
  const s = deriveNoteSecrets(withSeed, 31337, POOL, index);
  return { chainId: 31337, pool: POOL, index, value, label, ...s, ...(leafIndex === undefined ? {} : { leafIndex }) };
}

describe('asp', () => {
  it('verifies set root', () => {
    const labels = [5n, 6n, 7n];
    const root = buildAspTree(labels).root();
    const json = JSON.stringify({ version: 1, pool: POOL, chainId: 31337, labels: labels.map(String), policy: 'all', generatedAtBlock: 3 });
    const r = verifyAspSet(json, root);
    expect(r.labels).toEqual(labels);
    expect(r.set.pool).toBe(POOL);
    const bad = (s: string, root2 = root): unknown => { try { verifyAspSet(s, root2); return null; } catch (e) { return (e as { code: string }).code; } };
    expect(bad(json, root + 1n)).toBe('ASP_SET_MISMATCH');
    expect(bad('{')).toBe('ASP_SET_MISMATCH');
    expect(bad('5')).toBe('ASP_SET_MISMATCH');
    expect(bad('null')).toBe('ASP_SET_MISMATCH');
    expect(bad('{"version":2}')).toBe('ASP_SET_MISMATCH');
    expect(bad(JSON.stringify({ version: 1, pool: POOL, chainId: 31337, labels: ['x'], policy: 'a', generatedAtBlock: 1 }))).toBe('ASP_SET_MISMATCH');
    expect(bad(JSON.stringify({ version: 1, pool: POOL, chainId: 31337, labels: [5], policy: 'a', generatedAtBlock: 1 }))).toBe('ASP_SET_MISMATCH');
    expect(bad(JSON.stringify({ version: 1, pool: POOL, chainId: 31337, labels: ['21888242871839275222246405745257275088548364400416034343698204186575808495617'], policy: 'a', generatedAtBlock: 1 }))).toBe('ASP_SET_MISMATCH');
    expect(bad(JSON.stringify({ version: 1, pool: POOL, chainId: 1, labels: [], policy: 'a', generatedAtBlock: 1 }))).toBe('WRONG_CHAIN');
  });
});

describe('inputs', () => {
  const note = mkNote(0, 1000n, 77n);
  const tree = new PoolTree();
  for (let i = 0; i < 5; i++) tree.insert(BigInt(i + 100));
  tree.insert(noteCommitment(note));
  const ns = deriveNoteSecrets(withSeed, 31337, POOL, 1);
  it('builds without ASP and with ASP', () => {
    const i0 = buildWithdrawInputs({ note, tree, withdrawnValue: 400n, newNote: ns, context: 9n });
    expect(i0.aspEnabled).toBe('0');
    expect(i0.stateIndex).toBe('5');
    expect(i0.stateSiblings.length).toBe(32);
    expect(i0.ASPSiblings.every((x) => x === '0')).toBe(true);
    const e0 = expectedWithdrawSignals(i0);
    expect(e0.length).toBe(9);
    expect(e0[1]).toBe(nullifierHash(note.nullifier));
    expect(e0[2]).toBe(400n);
    const i1 = buildWithdrawInputs({ note, tree, asp: { labels: [1n, 77n, 3n] }, withdrawnValue: 1000n, newNote: ns, context: 9n });
    expect(i1.aspEnabled).toBe('1');
    expect(i1.ASPIndex).toBe('1');
    expect(i1.ASPRoot).toBe(buildAspTree([1n, 77n, 3n]).root().toString());
    expect(expectedWithdrawSignals(i1)[5]).toBe(1n);
  });
  it('rejects bad requests', () => {
    const base = { note, tree, withdrawnValue: 400n, newNote: ns, context: 9n };
    expect(() => buildWithdrawInputs({ ...base, withdrawnValue: 0n })).toThrow();
    expect(() => buildWithdrawInputs({ ...base, withdrawnValue: 1001n })).toThrow(/exceeds/);
    expect(() => buildWithdrawInputs({ ...base, newNote: { nullifier: note.nullifier, secret: 3n } })).toThrow(/new nullifier/);
    expect(() => buildWithdrawInputs({ ...base, asp: { labels: [1n] } })).toThrow(/association set/);
    expect(() => buildWithdrawInputs({ ...base, note: mkNote(9, 500n, 1n) })).toThrow(/not in the synced tree/);
    expect(() => buildWithdrawInputs({ ...base, context: -1n })).toThrow();
    expect(() => expectedWithdrawSignals({ ...buildWithdrawInputs(base), withdrawnValue: '2000' })).toThrow(/remainder/);
  });
  it('ragequit inputs', () => {
    const r = buildRagequitInputs(note);
    expect(r.expectedSignals).toEqual([noteCommitment(note), nullifierHash(note.nullifier), 1000n, 77n]);
    expect(r.inputs.value).toBe('1000');
  });
});

describe('announce', () => {
  it('builds an announcement the seller can find', () => {
    const keys = generateKeySet();
    const meta = encodeMetaAddress(keys);
    const token = '0x00000000000000000000000000000000000000c1';
    const { recipient, announce } = buildSpPayAnnounce(meta, undefined, token, 12345n);
    const [key, metadata] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], announce);
    expect((metadata.length - 2) / 2).toBe(57);
    const chk = checkAnnouncement({ stealthAddress: recipient, ephemeralPublicKey: key, metadata }, keys.viewingSecret, keys.spendingPublicKey);
    expect(chk.matches).toBe(true);
    const nat = buildSpPayAnnounce(meta, undefined, zeroAddress, 5n);
    expect(nat.announce.length).toBeGreaterThan(100);
    expect(() => buildSpPayAnnounce(meta, undefined, token, 0n)).toThrow();
  });
});

describe('prepareWithdrawal', () => {
  const note0 = mkNote(0, 1000n, 77n);
  const d0 = dep(withSeed, 0, 1000n, 77n, 2n, 0, A1);
  const evts = [foreignDeposit(1, 1n), d0];
  const base = (over: Partial<PrepareWithdrawArgs> = {}): PrepareWithdrawArgs => ({
    option: 'SP-EXIT',
    withSeed,
    synced: synced(evts, 2n),
    note: note0,
    scope: 123n,
    withdrawnValue: 400n,
    recipient: '0x00000000000000000000000000000000000000d1',
    submitter: { kind: 'relayer', relayer: A2, feeTo: A2, fee: 10n },
    asp: { kind: 'none' },
    deadline: 9999n,
    newIndex: 1,
    minCrowd: 0,
    ...over,
  });
  it('SP-EXIT happy path', () => {
    const p = prepareWithdrawal(base());
    expect(p.withdrawal.relayerFee).toBe(10n);
    expect(p.withdrawal.announce).toBe('0x');
    expect(p.changeNote.value).toBe(600n);
    expect(p.expectedSignals[8]).toBe(p.context);
    const cd = encodeWithdrawCall(p.withdrawal, toCalldataProof({ pi_a: ['1', '2', '1'], pi_b: [['3', '4'], ['5', '6'], ['1', '0']], pi_c: ['7', '8', '1'] }, p.expectedSignals.map(String), 9));
    expect(decodeFunctionData({ abi: poolAbi, data: cd }).functionName).toBe('withdraw');
    const withAsp = prepareWithdrawal(base({ asp: { kind: 'publisher', publisher: A2, labels: [77n] }, submitter: { kind: 'self', submitter: A1 } }));
    expect(withAsp.withdrawal.aspPublisher).toBe(A2);
    expect(withAsp.withdrawal.feeTo).toBe(zeroAddress);
    expect(withAsp.withdrawal.relayerFee).toBe(0n);
    expect(withAsp.inputs.aspEnabled).toBe('1');
  });
  it('guards', () => {
    const code = (o: Partial<PrepareWithdrawArgs>): string => { try { prepareWithdrawal(base(o)); return 'ok'; } catch (e) { return (e as { code: string }).code; } };
    expect(code({ note: { ...note0, spent: true } })).toBe('NOTE_SPENT');
    expect(code({ recipient: zeroAddress })).toBe('BAD_RECIPIENT');
    expect(code({ recipient: POOL })).toBe('BAD_RECIPIENT');
    expect(code({ recipient: A1 })).toBe('BAD_RECIPIENT');
    expect(code({ forbiddenRecipients: ['0x00000000000000000000000000000000000000d1'] })).toBe('BAD_RECIPIENT');
    expect(code({ announce: '0x1234' })).toBe('INVALID_INPUT');
    expect(code({ submitter: { kind: 'relayer', relayer: A2, feeTo: A2, fee: 41n }, maxFeeBps: 1000n })).toBe('FEE_TOO_HIGH');
    expect(code({ minCrowd: 50 })).toBe('CROWD_TOO_SMALL');
    expect(code({ minCrowd: 50, crowdConfirmed: true })).toBe('ok');
    expect(code({ asp: { kind: 'publisher', publisher: zeroAddress, labels: [77n] } })).toBe('INVALID_INPUT');
    expect(code({ withdrawnValue: 0n })).toBe('INVALID_INPUT');
    const s = synced([...evts, { kind: 'withdraw', blockNumber: 3n, logIndex: 0, txHash: d0.txHash, recipient: A2, value: 1n, relayerFee: 0n, spentNullifier: nullifierHash(note0.nullifier), newCommitment: 5n, aspPublisher: zeroAddress, aspRoot: 0n }], 3n);
    expect(code({ synced: s })).toBe('NOTE_SPENT');
  });
  it('SP-PAY needs announce and may pay a depositor-linked S1', () => {
    expect(() => prepareWithdrawal(base({ option: 'SP-PAY' }))).toThrow(/announcement/);
    expect(() => prepareWithdrawal(base({ option: 'SP-PAY', announce: '0x' }))).toThrow(/announcement/);
    const p = prepareWithdrawal(base({ option: 'SP-PAY', announce: '0x1234', recipient: A1 }));
    expect(p.withdrawal.announce).toBe('0x1234');
  });
  it('assertSignals, ragequit, deposit', () => {
    const p = prepareWithdrawal(base());
    const proof = toCalldataProof({ pi_a: ['1', '2'], pi_b: [['3', '4'], ['5', '6']], pi_c: ['7', '8'] }, p.expectedSignals.map(String), 9);
    expect(() => assertSignals(p.expectedSignals, proof)).not.toThrow();
    expect(() => assertSignals(p.expectedSignals.slice(1), proof)).toThrow();
    expect(() => assertSignals([...p.expectedSignals.slice(0, 8), 1n], proof)).toThrow();
    expect(() => encodeWithdrawCall(p.withdrawal, { ...proof, pubSignals: [1n] })).toThrow();
    const rq = prepareRagequit(note0);
    expect(rq.expectedSignals[0]).toBe(commitmentOf(note0));
    expect(() => prepareRagequit({ ...note0, spent: true })).toThrow(/spent/);
    expect(() => prepareRagequit({ ...note0, chainId: 1 })).toThrow(/testnet/);
    const rp = toCalldataProof({ pi_a: ['1', '2'], pi_b: [['3', '4'], ['5', '6']], pi_c: ['7', '8'] }, rq.expectedSignals.map(String), 4);
    expect(decodeFunctionData({ abi: poolAbi, data: encodeRagequitCall(rp) }).functionName).toBe('ragequit');
    expect(() => encodeRagequitCall({ ...rp, pubSignals: [1n] })).toThrow();
    const dp = planDeposit(withSeed, 31337, POOL, 0, 1000n);
    expect(decodeFunctionData({ abi: poolAbi, data: dp.data }).functionName).toBe('deposit');
    expect(() => planDeposit(withSeed, 31337, POOL, 0, 0n)).toThrow();
  });
});

describe('options and copy', () => {
  it('SP-GEN-3: option table honesty', () => {
    for (const info of Object.values(SP_OPTION_INFO)) {
      expect(info.testnetOnly).toBe(true);
      expect(info.doesNotHide).toEqual(LIMIT_IDS);
      for (const h of info.hides) {
        expect(['deposit', 'depositor', 'ip', 'anonymity']).not.toContain(h);
        expect(h).not.toMatch(/anonymity|network-address/);
      }
    }
    expect(SP_OPTION_INFO['SP-RQ'].hides).toEqual([]);
  });
  it('SP-UI-3: no banned wording', () => {
    for (const s of [...Object.values(LIMIT_COPY), TEST_POOL_LINE, JSON.stringify(SP_OPTION_INFO)]) expect(s).not.toMatch(BANNED_COPY);
    expect(Object.keys(LIMIT_COPY)).toEqual([...LIMIT_IDS]);
    expect('anonymous').toMatch(BANNED_COPY);
  });
});
