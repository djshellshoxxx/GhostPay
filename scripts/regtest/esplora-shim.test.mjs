// node --test scripts/regtest/esplora-shim.test.mjs   (no network, no bitcoind)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { btcToSats, createHandler, mapTx } from './esplora-shim-lib.mjs';

const H = (c) => c.repeat(64);
const block = {
  tx: [
    { txid: H('a'), version: 2, locktime: 0, vin: [{ coinbase: '03aabbcc', sequence: 1 }], vout: [{ value: 50, n: 0, scriptPubKey: { hex: '0014' + '9'.repeat(40) } }] },
    {
      txid: H('b'),
      version: 2,
      locktime: 101,
      vin: [{ txid: H('c'), vout: 1, sequence: 4294967293, scriptSig: { hex: '' }, txinwitness: ['3044', '02ab'], prevout: { value: 0.12345678, scriptPubKey: { hex: '0014' + '6'.repeat(40) } } }],
      vout: [{ value: 0.0005, n: 0, scriptPubKey: { hex: '5120' + 'ab'.repeat(32) } }],
    },
    ...Array.from({ length: 30 }, (_, i) => ({ txid: i.toString(16).padStart(64, '0'), vin: [{ coinbase: '00' }], vout: [] })),
  ],
};

function fakeRpc(log = []) {
  return async (method, params) => {
    log.push([method, params]);
    switch (method) {
      case 'getblockcount': return 7;
      case 'getblockhash': if (params[0] > 7) throw new Error('Block height out of range'); return H('d');
      case 'getblock': assert.deepEqual(params, [H('d'), 3]); return block;
      case 'getblockheader': assert.deepEqual(params, [H('d'), false]); return '00'.repeat(80);
      case 'gettxout': return params[0] === H('b') ? { value: 0.0005 } : null;
      case 'sendrawtransaction': return H('e');
      default: throw new Error(`unexpected ${method}`);
    }
  };
}

test('btcToSats rounds float BTC exactly', () => {
  assert.equal(btcToSats(0.12345678), 12345678);
  assert.equal(btcToSats(0.1 + 0.2), 30000000);
  assert.equal(btcToSats(50), 5000000000);
  assert.throws(() => btcToSats(-1));
  assert.throws(() => btcToSats('1'));
});

test('mapTx produces Esplora shape for coinbase and normal inputs', () => {
  const cb = mapTx(block.tx[0]);
  assert.equal(cb.vin[0].is_coinbase, true);
  assert.equal(cb.vin[0].prevout, null);
  assert.equal(cb.vin[0].sequence, 1);
  assert.equal(cb.version, 2);
  assert.equal(cb.vout[0].value, 5_000_000_000);
  const t = mapTx(block.tx[1]);
  assert.deepEqual(t.vin[0], {
    txid: H('c'), vout: 1, sequence: 4294967293, prevout: { scriptpubkey: '0014' + '6'.repeat(40), value: 12345678 },
    scriptsig: '', witness: ['3044', '02ab'], is_coinbase: false,
  });
  assert.equal(t.locktime, 101);
  assert.deepEqual(t.vout, [{ scriptpubkey: '5120' + 'ab'.repeat(32), value: 50000 }]);
});

test('routes', async () => {
  const log = [];
  const h = createHandler(fakeRpc(log));
  assert.deepEqual(await h('GET', '/blocks/tip/height'), { status: 200, type: 'text/plain', body: '7' });
  assert.equal((await h('GET', '/block-height/3')).body, H('d'));
  assert.equal((await h('GET', '/block-height/99')).status, 404);
  assert.equal((await h('GET', `/block/${H('d')}/header`)).body, '00'.repeat(80));
  const p0 = JSON.parse((await h('GET', `/block/${H('d')}/txs/0`)).body);
  assert.equal(p0.length, 25);
  assert.equal(p0[1].txid, H('b'));
  const p1 = JSON.parse((await h('GET', `/block/${H('d')}/txs/25`)).body);
  assert.equal(p1.length, 7);
  assert.equal((await h('GET', `/block/${H('d')}/txs/10`)).status, 400);
  assert.deepEqual(JSON.parse((await h('GET', `/tx/${H('b')}/outspend/0`)).body), { spent: false });
  assert.deepEqual(JSON.parse((await h('GET', `/tx/${H('f')}/outspend/0`)).body), { spent: true });
  assert.equal(JSON.parse((await h('GET', '/fee-estimates')).body)['1'], 1);
  assert.equal((await h('POST', '/tx', '0200ff\n')).body, H('e'));
  assert.deepEqual(log.at(-1), ['sendrawtransaction', ['0200ff']]);
});

test('rejects bad input and maps upstream failures to 502', async () => {
  const h = createHandler(fakeRpc());
  assert.equal((await h('POST', '/tx', 'zz')).status, 400);
  assert.equal((await h('POST', '/tx', '123')).status, 400);
  assert.equal((await h('GET', '/nope')).status, 404);
  assert.equal((await h('GET', '/block/xyz/txs/0')).status, 404);
  const broken = createHandler(async () => { throw new Error('connection refused'); });
  const r = await broken('GET', '/blocks/tip/height');
  assert.equal(r.status, 502);
  assert.match(r.body, /connection refused/);
});
