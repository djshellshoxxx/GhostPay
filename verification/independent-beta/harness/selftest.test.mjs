// W5 independent payment-state verifier: harness self-audit (no browser).
// Run: node --test verification/independent-beta/harness/selftest.test.mjs
// Bounded property checks over the synthetic chain and RPC, plus oracle sensitivity tests: the oracle must flag
// planted violations, or a green browser run would prove nothing.
import assert from 'node:assert/strict';
import test from 'node:test';
import { GENESIS, SyntheticChain } from './chain.mjs';
import { Oracle } from './oracle.mjs';
import { Rng } from './prng.mjs';
import { MockRpc } from './rpc.mjs';
import { classify } from './app.mjs';

const QTY = /^0x(0|[1-9a-f][0-9a-f]*)$/; // canonical JSON-RPC quantity

test('PRNG is deterministic per seed and differs across seeds', () => {
  const a = new Rng(7);
  const b = new Rng(7);
  const c = new Rng(8);
  const sa = Array.from({ length: 50 }, () => a.hash32());
  assert.deepEqual(sa, Array.from({ length: 50 }, () => b.hash32()));
  assert.notDeepEqual(sa, Array.from({ length: 50 }, () => c.hash32()));
  for (const h of sa) assert.match(h, /^0x[0-9a-f]{64}$/);
});

test('chain properties hold over 300 seeded random operation sequences', () => {
  for (let seed = 1; seed <= 300; seed += 1) {
    const rng = new Rng(seed);
    const chain = new SyntheticChain();
    const rpc = new MockRpc(chain);
    const hashes = [];
    for (let step = 0; step < 25; step += 1) {
      const r = rng.next();
      if (r < 0.3) {
        const h = rng.hash32();
        hashes.push(h);
        chain.submit(h, { from: rng.pick(['0xaa', '0xbb']).padEnd(42, '0'), to: '0x1111111111111111111111111111111111111111', value: '0x1', data: '0x' });
      } else if (r < 0.6) chain.mine(hashes.filter(() => rng.next() < 0.7), { success: rng.next() < 0.9 });
      else if (r < 0.75) chain.reorg(rng.int(1, 3));
      else if (r < 0.85) chain.drop(rng.pick(hashes.length ? hashes : ['0x0']));
      else chain.advance(rng.int(1, 2));
      // canonical linkage
      for (let n = Math.max(GENESIS + 1, chain.head - 6); n <= chain.head; n += 1) {
        assert.equal(chain.blockObject(n).parentHash, chain.blockObject(n - 1).hash, `seed ${seed}: parent link at ${n}`);
      }
      assert.equal(rpc.one({ id: 1, method: 'eth_blockNumber' }).result, `0x${chain.head.toString(16)}`);
      for (const h of hashes) {
        const t = chain.truth(h);
        const tx = chain.txObject(h);
        const rc = chain.receiptObject(h);
        assert.equal(rc !== null, t.state === 'mined', `seed ${seed}: receipt iff mined`);
        if (t.state === 'mined') {
          assert.ok(t.block <= chain.head && t.block > GENESIS);
          assert.ok(chain.blocks.get(t.block).txs.includes(h), `seed ${seed}: mined tx is in its canonical block`);
          assert.equal(rc.blockHash, chain.blockObject(t.block).hash, `seed ${seed}: receipt block hash is canonical`);
          assert.equal(tx.blockHash, rc.blockHash);
          assert.match(rc.blockNumber, QTY);
        } else if (t.state === 'mempool') {
          assert.equal(tx.blockHash, null);
          assert.equal(tx.blockNumber, null);
        } else if (t.state === 'dropped') assert.equal(tx, null);
        if (tx !== null) for (const k of ['nonce', 'value', 'gas', 'chainId']) assert.match(tx[k], QTY, `seed ${seed}: ${k} canonical`);
      }
      for (const from of ['0xaa', '0xbb'].map((x) => x.padEnd(42, '0'))) {
        assert.ok(chain.nonceOf(from, 'latest') <= chain.nonceOf(from, 'pending'));
      }
    }
  }
});

test('a reorg orphans exactly the transactions above the fork point and changes those block hashes', () => {
  const chain = new SyntheticChain();
  chain.submit('0x' + '1'.repeat(64), { from: '0x' + 'a'.repeat(40), to: '0x' + 'b'.repeat(40) });
  const b1 = chain.mine(['0x' + '1'.repeat(64)]);
  const oldHash = chain.hashOf(b1);
  chain.advance(2);
  assert.deepEqual(chain.reorg(1), []);
  assert.equal(chain.truth('0x' + '1'.repeat(64)).state, 'mined');
  assert.deepEqual(chain.reorg(3), ['0x' + '1'.repeat(64)]);
  assert.equal(chain.truth('0x' + '1'.repeat(64)).state, 'mempool');
  assert.notEqual(chain.hashOf(b1), oldHash);
});

test('RPC: batch requests, unknown methods error, router getters and code answer the fixture', () => {
  const rpc = new MockRpc(new SyntheticChain());
  assert.equal(rpc.one({ id: 1, method: 'eth_chainId' }).result, '0x14a34');
  assert.equal(rpc.one({ id: 2, method: 'eth_nope' }).error.code, -32601);
  assert.equal(rpc.one({ id: 3, method: 'eth_getCode', params: ['0x1111111111111111111111111111111111111111'] }).result, '0x60016000');
  const feeBps = rpc.one({ id: 4, method: 'eth_call', params: [{ to: '0x1111111111111111111111111111111111111111', data: '0xbf333f2c' }] });
  assert.ok(typeof feeBps.result === 'string');
});

function fakeWorld() {
  const chain = new SyntheticChain();
  return {
    origin: 'http://localhost:4173',
    chain,
    wallet: { handoffs: [], seq: 0 },
    intentOfTab: { A: 'X', B: 'C' },
    clears: { X: 0, C: 0 },
    lastClearSeq: { X: 0, C: 0 },
    clearedHashes: new Set(),
    hashes: { X: new Set(), C: new Set() },
    docEndedAt: new Map(),
    deliveredToOpenPage: new Set(),
    reorged: new Set(),
  };
}
const handoff = (seq, intent, extra = {}) => ({ seq, intent, tab: 'A', account: '0x5555', chainId: '0x14a34', params: { from: '0x5555' }, behaviour: 'ok', ...extra });
const obsOf = (o) => ({ closed: false, origin: 'http://localhost:4173', headings: ['Review payment'], statuses: [], alerts: [], journal: [], mainText: '', mainHashes: [], storedHashes: [], ...o });

test('oracle flags planted I2 (second wallet request without a clear) but not after one deliberate clear', () => {
  const w = fakeWorld();
  const o = new Oracle(w);
  w.wallet.handoffs.push(handoff(1, 'X'), handoff(2, 'X'));
  o.checkHandoffs(0);
  assert.equal(o.violations[0]?.inv, 'I2');
  const w2 = fakeWorld();
  w2.clears.X = 1;
  const o2 = new Oracle(w2);
  w2.wallet.handoffs.push(handoff(1, 'X'), handoff(2, 'X'));
  o2.checkHandoffs(0);
  assert.equal(o2.violations.length, 0);
});

test('oracle flags planted I5a (request from a stale account / wrong chain)', () => {
  const w = fakeWorld();
  const o = new Oracle(w);
  w.wallet.handoffs.push(handoff(1, 'X', { params: { from: '0x6666' } }), handoff(2, 'C', { chainId: '0xaa36a7' }));
  o.checkHandoffs(0);
  assert.deepEqual(o.violations.map((v) => v.inv), ['I5a', 'I5a']);
});

test('oracle flags planted I1/I8 (success shown for a reorged-out hash) and accepts canonical success', () => {
  const w = fakeWorld();
  const o = new Oracle(w);
  const h = '0x' + '2'.repeat(64);
  w.chain.submit(h, { from: '0x5555', to: '0x1111' });
  w.chain.mine([h]);
  o.checkStatusResult(0, 'X', h, { checked: true, text: 'Included in a canonical block.', cls: classify('Included in a canonical block.') });
  assert.equal(o.violations.length, 0);
  w.chain.reorg(1);
  w.reorged.add(h);
  o.checkStatusResult(1, 'X', h, { checked: true, text: 'Included in a canonical block.', cls: classify('Included in a canonical block.') });
  assert.equal(o.violations[0]?.inv, 'I8');
});

test('oracle flags planted I4 (returned hash lost) and I3 (unknown record not shown), honours R5 exception', () => {
  const w = fakeWorld();
  const o = new Oracle(w);
  const h = '0x' + '3'.repeat(64);
  w.wallet.handoffs.push(handoff(1, 'X', { hash: h, repliedAt: Date.now() - 10_000, pageId: 1, doc: 1 }));
  w.deliveredToOpenPage.add(h);
  o.checkObservations(0, { op: 'reload' }, { A: obsOf({}) });
  assert.ok(o.violations.some((v) => v.inv === 'I4'));
  assert.ok(o.violations.some((v) => v.inv === 'I3'));
  // Same, but the page closed within the record window: the hash may legitimately be missing (R5/A5).
  const w2 = fakeWorld();
  const o2 = new Oracle(w2);
  w2.wallet.handoffs.push(handoff(1, 'X', { hash: h, repliedAt: Date.now() - 10_000, pageId: 1, doc: 1 }));
  w2.deliveredToOpenPage.add(h);
  w2.docEndedAt.set('1:1', Date.now() - 9_500);
  o2.checkObservations(0, { op: 'reload' }, { A: obsOf({ journal: ['payment on chain 84532 · Outcome unknown'] }) });
  assert.equal(o2.violations.length, 0);
});

test('oracle does not judge retention from a tab outside the app origin (H6)', () => {
  const w = fakeWorld();
  const o = new Oracle(w);
  const h = '0x' + '5'.repeat(64);
  w.wallet.handoffs.push(handoff(1, 'X', { hash: h, repliedAt: Date.now() - 10_000, pageId: 1, doc: 1 }));
  w.deliveredToOpenPage.add(h);
  o.checkRetention(0, { A: obsOf({ origin: 'null', headings: [] }) });
  assert.equal(o.violations.length, 0);
  o.checkRetention(1, { A: obsOf({}) });
  assert.equal(o.violations[0]?.inv, 'I4');
});

test('oracle flags planted I5b (other intent hash shown in a checkout) and I7 (control never reached wallet)', () => {
  const w = fakeWorld();
  const o = new Oracle(w);
  const hx = '0x' + '4'.repeat(64);
  w.hashes.X.add(hx);
  o.checkObservations(0, { op: 'open' }, { B: obsOf({ headings: ['Final check before your wallet'], mainText: `Transaction hash: ${hx}`, mainHashes: [hx] }) });
  assert.ok(o.violations.some((v) => v.inv === 'I5b'));
  o.checkControlReached(1, 0, 'clicked', true);
  assert.ok(o.violations.some((v) => v.inv === 'I7'));
});

test('status vocabulary classifies the app strings it is meant to (en.json wording)', () => {
  assert.deepEqual(classify('Included in a canonical block. Waiting for the chain’s configured confirmation depth.'), ['success']);
  assert.deepEqual(classify('The RPC confirmed execution of this transaction.'), ['success']);
  assert.deepEqual(classify('Pending. The RPC sees the transaction without a verified receipt.'), ['pending']);
  assert.deepEqual(classify('Outcome unknown. Keep tracking this attempt and check your wallet before retrying.'), ['unknown']);
  assert.ok(classify('Status: included in block 501 (not necessarily final yet).').includes('success'));
  assert.deepEqual(classify('The RPC confirmed that this transaction reverted.').includes('success'), false);
});

// ---- Review gaps G1/G2 (PR #665 source review, 2026-11-25): the oracle must fail or explicitly classify, never pass.

const HX = '0x' + 'a1'.repeat(32);
const HC = '0x' + 'c3'.repeat(32);
const mask = (h) => `${h.slice(0, 6)}…${h.slice(-4)}`;
function g1World() {
  const w = fakeWorld();
  w.intentOfTab = { A: 'X', B: 'C' };
  return w;
}
const successObs = (text) => obsOf({ headings: ['Submitted'], mainText: text, mainHashes: (text.match(/0x[0-9a-fA-F]{64}/g) ?? []).map((h) => h.toLowerCase()) });

test('G1: success claimed with no wallet-returned hash and no canonical tx fails I1', () => {
  const w = g1World();
  const o = new Oracle(w);
  o.checkObservations(0, { op: 'send' }, { A: successObs('Submitted Status: included in block 501 (not necessarily final yet).') });
  const v = o.violations.find((x) => x.inv === 'I1');
  assert.ok(v, 'I1 expected');
  assert.equal(v.detail.reason, 'success claimed with no wallet-returned hash for this intent');
});

test('G1: success with no displayed hash is judged against the returned hash (fails when not mined)', () => {
  const w = g1World();
  w.hashes.X.add(HX);
  w.chain.submit(HX, { from: '0x5555', to: '0x1111' }); // mempool only
  const o = new Oracle(w);
  o.checkObservations(0, { op: 'send' }, { A: successObs('Submitted Status: included in block 501 (not necessarily final yet).') });
  assert.equal(o.violations[0]?.inv, 'I1');
  assert.equal(o.violations[0]?.detail.basis, 'no-displayed-hash');
  assert.ok(o.notes.some((n) => /without a displayed known hash/.test(n.note)), 'the fallback basis is recorded explicitly');
});

test('G1: masked hash of a canonical successful tx passes; masked hash of an unmined tx fails', () => {
  const w = g1World();
  w.hashes.X.add(HX);
  w.chain.submit(HX, { from: '0x5555', to: '0x1111' });
  const block = w.chain.mine([HX]);
  const o = new Oracle(w);
  o.checkObservations(0, { op: 'send' }, { A: successObs(`Transaction hash: ${mask(HX)} Status: included in block ${block} (not necessarily final yet).`) });
  assert.equal(o.violations.length, 0);
  const w2 = g1World();
  w2.hashes.X.add(HX);
  w2.chain.submit(HX, { from: '0x5555', to: '0x1111' });
  const o2 = new Oracle(w2);
  o2.checkObservations(0, { op: 'send' }, { A: successObs(`Transaction hash: ${mask(HX)} Status: included in block 501 (not necessarily final yet).`) });
  assert.equal(o2.violations[0]?.inv, 'I1');
  assert.equal(o2.violations[0]?.detail.basis, 'masked');
});

test('G1: valid canonical control with a full displayed hash passes', () => {
  const w = g1World();
  w.hashes.X.add(HX);
  w.chain.submit(HX, { from: '0x5555', to: '0x1111' });
  const block = w.chain.mine([HX]);
  const o = new Oracle(w);
  o.checkObservations(0, { op: 'send' }, { A: successObs(`Transaction hash: ${HX} Status: included in block ${block} (not necessarily final yet).`) });
  assert.equal(o.violations.length, 0);
});

test('G1: a foreign/unrecognised displayed hash does not let a non-canonical claim pass', () => {
  const w = g1World();
  w.hashes.X.add(HX);
  w.chain.submit(HX, { from: '0x5555', to: '0x1111' });
  const o = new Oracle(w);
  const stranger = '0x' + 'ee'.repeat(32);
  o.checkObservations(0, { op: 'send' }, { A: successObs(`Transaction hash: ${stranger} Status: included in block 501 (not necessarily final yet).`) });
  assert.equal(o.violations[0]?.inv, 'I1');
  assert.equal(o.violations[0]?.detail.basis, 'foreign-or-unrecognised-hash');
});

test('G1: a tab whose intent is unknown (e.g. after reload) is still judged', () => {
  const w = g1World();
  w.intentOfTab.A = null;
  const o = new Oracle(w);
  o.checkObservations(0, { op: 'reload' }, { A: successObs('Status: included in block 501 (not necessarily final yet).') });
  assert.equal(o.violations[0]?.inv, 'I1');
});

function g2World() {
  const w = fakeWorld();
  w.intentOfTab = { A: 'X', B: 'C' };
  // X: wallet prompt started, no hash returned (unknown record expected).
  w.wallet.handoffs.push(handoff(1, 'X', { behaviour: 'hang-broadcast', pageId: 1, doc: 1 }));
  // C: hash returned to a live page that stayed open (hash row expected).
  w.wallet.handoffs.push(handoff(2, 'C', { hash: HC, repliedAt: Date.now() - 10_000, pageId: 2, doc: 1 }));
  w.deliveredToOpenPage.add(HC);
  w.hashes.C.add(HC);
  return w;
}
const row = { unknownX: 'payment on chain 84532 · 0x5555555555555555555555555555555555555555 · Outcome unknown; check your wallet before retrying.', hashC: `payment on chain 84532 · 0x5555555555555555555555555555555555555555 · Returned hash: ${HC}` };

test('G2: right row count but wrong intent (two C rows, no X row) fails I3 for X', () => {
  const w = g2World();
  const o = new Oracle(w);
  o.checkObservations(0, { op: 'open' }, { A: obsOf({ journal: [row.hashC, row.hashC], storedHashes: [HC] }) });
  const v = o.violations.find((x) => x.inv === 'I3');
  assert.ok(v, 'I3 expected');
  assert.equal(v.detail.missingIntent, 'X');
});

test('G2: an unrelated control row alone cannot satisfy the X record', () => {
  const w = g2World();
  const o = new Oracle(w);
  o.checkObservations(0, { op: 'open' }, { A: obsOf({ journal: [row.hashC], storedHashes: [HC] }) });
  assert.deepEqual(o.violations.filter((x) => x.inv === 'I3').map((x) => x.detail.missingIntent), ['X']);
});

test('G2: X record absent while the X pay action is still enabled fails I3 and records the button state', () => {
  const w = g2World();
  const o = new Oracle(w);
  o.checkObservations(0, { op: 'open' }, { A: obsOf({ headings: ['Review payment'], journal: [row.hashC], sendButton: 'enabled', storedHashes: [HC] }) });
  const v = o.violations.find((x) => x.inv === 'I3');
  assert.equal(v?.detail.sendButton, 'enabled');
  assert.equal(o.payEnabledWithRecord ?? 0, 0);
});

test('G2: both own records visible passes; an enabled pay action is then explicitly classified (R20), not silent', () => {
  const w = g2World();
  const o = new Oracle(w);
  o.checkObservations(0, { op: 'open' }, { A: obsOf({ journal: [row.unknownX, row.hashC], sendButton: 'enabled', storedHashes: [HC] }) });
  assert.equal(o.violations.length, 0);
  assert.equal(o.payEnabledWithRecord, 1);
});

test('G2: a returned-and-recorded hash shown only as a hash-less unknown row fails I3', () => {
  const w = fakeWorld();
  w.intentOfTab = { A: 'X', B: null };
  w.wallet.handoffs.push(handoff(1, 'X', { hash: HX, repliedAt: Date.now() - 10_000, pageId: 1, doc: 1 }));
  w.deliveredToOpenPage.add(HX);
  w.hashes.X.add(HX);
  const o = new Oracle(w);
  o.checkObservations(0, { op: 'open' }, { A: obsOf({ journal: [row.unknownX], storedHashes: [HX] }) });
  assert.equal(o.violations.find((x) => x.inv === 'I3')?.detail.missingIntent, 'X');
});

// ---- Follow-up review gaps G3–G5 (PR #665, 2026-11-26 00:02 UTC, head bb30044c).

test('G3: an explicitly displayed unrelated hash fails I1 even when the known X hash is canonical at that block', () => {
  const w = g1World();
  w.hashes.X.add(HX);
  w.chain.submit(HX, { from: '0x5555', to: '0x1111' });
  const block = w.chain.mine([HX]);
  const o = new Oracle(w);
  const stranger = '0x' + 'ee'.repeat(32);
  o.checkObservations(0, { op: 'send' }, { A: successObs(`Transaction hash: ${stranger} Status: included in block ${block} (not necessarily final yet).`) });
  const v = o.violations.find((x) => x.inv === 'I1');
  assert.ok(v, 'foreign evidence must not be substituted with the known X transaction');
  assert.equal(v.detail.basis, 'foreign-or-unrecognised-hash');
  assert.equal(v.detail.reason, 'displayed hash is not one the wallet returned for this intent');
});

test('G3 control: a genuinely hash-omitted claim with X canonical at that block passes, fallback recorded', () => {
  const w = g1World();
  w.hashes.X.add(HX);
  w.chain.submit(HX, { from: '0x5555', to: '0x1111' });
  const block = w.chain.mine([HX]);
  const o = new Oracle(w);
  o.checkObservations(0, { op: 'send' }, { A: successObs(`Submitted Status: included in block ${block} (not necessarily final yet).`) });
  assert.equal(o.violations.length, 0);
  assert.ok(o.notes.some((n) => /no-displayed-hash/.test(n.note)));
});

function g4Setup() {
  const w = g1World();
  w.hashes.X.add(HX);
  w.chain.submit(HX, { from: '0x5555', to: '0x1111' });
  const block = w.chain.mine([HX]);
  const o = new Oracle(w);
  const text = `Transaction hash: ${HX} Status: included in block ${block} (not necessarily final yet).`;
  o.checkObservations(0, { op: 'send', tab: 'A' }, { A: successObs(text) });
  assert.equal(o.violations.length, 0, 'canonical success first');
  for (const h of w.chain.reorg(1)) w.reorged.add(h);
  o.checkObservations(1, { op: 'reorg' }, { A: successObs(text) });
  assert.equal(o.violations.length, 0, 'unchanged claim during the chain change is A1, not a violation');
  assert.ok(o.ambiguities.some((a) => a.inv === 'A1' && /chain change/.test(a.detail.after)));
  return { o, text };
}

test('G4: an unchanged stale inclusion that survives a reload of its tab fails (I8)', () => {
  const { o, text } = g4Setup();
  o.checkObservations(2, { op: 'reload', tab: 'A' }, { A: successObs(text) });
  const v = o.violations.find((x) => x.inv === 'I8');
  assert.ok(v, 'stale claim after a fresh render must fail');
  assert.equal(v.detail.after, 'fresh render (reload)');
});

test('G4: the same stale claim after a journal check (no done-panel refresh) is an explicit, labelled A1', () => {
  const { o, text } = g4Setup();
  o.checkObservations(2, { op: 'check', tab: 'A' }, { A: successObs(text) });
  assert.equal(o.violations.length, 0);
  assert.ok(o.ambiguities.some((a) => a.inv === 'A1' && a.detail.after === 'no fresh render (check)'));
});

test('G4: a reload of the OTHER tab is not a fresh render of this one', () => {
  const { o, text } = g4Setup();
  o.checkObservations(2, { op: 'reload', tab: 'B' }, { A: successObs(text) });
  assert.equal(o.violations.length, 0);
  assert.ok(o.ambiguities.some((a) => a.inv === 'A1' && a.detail.after === 'no fresh render (reload)'));
});

test('G5: a record satisfied only by a hash-less unknown row is counted as unqualified, not proof of identity', () => {
  const w = g2World();
  const o = new Oracle(w);
  o.checkObservations(0, { op: 'open' }, { A: obsOf({ journal: [row.unknownX, row.hashC], storedHashes: [HC] }) });
  assert.equal(o.violations.length, 0);
  assert.equal(o.i3UnqualifiedMatches, 1);
  assert.ok(o.notes.some((n) => /unqualified: presence, not proof of identity/.test(n.note)));
});

// ---- Milestone 2: log emission (contract model hook) and eth_getLogs.

test('logs: canonical-only, removed by reorg, re-emitted on re-mine, receipt logs equal getLogs, filters hold (200 seeds)', () => {
  const TOPIC = '0x' + '7a'.repeat(32);
  for (let seed = 1; seed <= 200; seed += 1) {
    const rng = new Rng(seed);
    const chain = new SyntheticChain();
    const emitter = '0x' + '55'.repeat(20);
    chain.executor = (p) => (p.to === emitter ? [{ address: emitter, topics: [TOPIC, '0x' + String(p.data).slice(2).padStart(64, '0')], data: '0x' }] : []);
    const hashes = [];
    for (let step = 0; step < 20; step += 1) {
      const r = rng.next();
      if (r < 0.35) {
        const h = rng.hash32();
        hashes.push(h);
        chain.submit(h, { from: '0xaa'.padEnd(42, '0'), to: rng.next() < 0.7 ? emitter : '0x' + '66'.repeat(20), data: '0x' + rng.int(1, 9) });
      } else if (r < 0.7) chain.mine(hashes.filter(() => rng.next() < 0.8), { success: rng.next() < 0.85 });
      else if (r < 0.85) chain.reorg(rng.int(1, 3));
      else chain.advance(1);
      const all = chain.getLogs({ fromBlock: '0x0', toBlock: 'latest' });
      for (const l of all) {
        const t = chain.truth(l.transactionHash);
        assert.equal(t.state, 'mined', `seed ${seed}: log of a non-canonical tx`);
        assert.ok(t.success, `seed ${seed}: log of a reverted tx`);
        assert.equal(l.blockHash, chain.hashOf(parseInt(l.blockNumber, 16)), `seed ${seed}: stale blockHash`);
      }
      for (const h of hashes) {
        const rc = chain.receiptObject(h);
        if (rc === null) continue;
        const viaGetLogs = all.filter((l) => l.transactionHash === h);
        assert.deepEqual(rc.logs, viaGetLogs, `seed ${seed}: receipt logs differ from eth_getLogs`);
      }
      assert.deepEqual(chain.getLogs({ fromBlock: '0x0', toBlock: 'latest', address: '0x' + '66'.repeat(20) }), [], `seed ${seed}: address filter`);
      const withTopic = chain.getLogs({ fromBlock: '0x0', toBlock: 'latest', topics: [TOPIC] });
      assert.equal(withTopic.length, all.length, `seed ${seed}: topic filter`);
      assert.deepEqual(chain.getLogs({ fromBlock: '0x0', toBlock: 'latest', topics: ['0x' + '00'.repeat(32)] }), [], `seed ${seed}: non-matching topic`);
    }
  }
});
