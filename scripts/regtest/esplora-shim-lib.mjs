// Pure request handling for the regtest Esplora shim: maps the few Esplora REST routes GhostPay uses onto
// bitcoind JSON-RPC. `rpc(method, params)` is injected, so this file is testable without bitcoind.
// Esplora routes used by apps/web/src/features/btc/esplora.ts:
//   GET /blocks/tip/height, GET /block-height/:h, GET /block/:hash/txs/:start (25 per page),
//   GET /tx/:txid/outspend/:vout, GET /fee-estimates, POST /tx
// bitcoind getblock verbosity 3 includes each input's `prevout` (needs no txindex).

export const PAGE = 25;
const HEX64 = /^[0-9a-f]{64}$/;

/** BTC (float from JSON-RPC) to integer satoshis. */
export function btcToSats(v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new Error('bad amount');
  return Math.round(v * 1e8);
}

/** bitcoind verbosity-3 transaction -> Esplora transaction JSON (only the fields GhostPay reads). */
export function mapTx(tx) {
  return {
    txid: tx.txid,
    vin: tx.vin.map((i) =>
      i.coinbase !== undefined
        ? { txid: '0'.repeat(64), vout: 0xffffffff, prevout: null, scriptsig: i.coinbase, witness: i.txinwitness ?? [], is_coinbase: true }
        : {
            txid: i.txid,
            vout: i.vout,
            prevout: { scriptpubkey: i.prevout.scriptPubKey.hex, value: btcToSats(i.prevout.value) },
            scriptsig: i.scriptSig?.hex ?? '',
            witness: i.txinwitness ?? [],
            is_coinbase: false,
          },
    ),
    vout: tx.vout.map((o) => ({ scriptpubkey: o.scriptPubKey.hex, value: btcToSats(o.value) })),
  };
}

const json = (body, status = 200) => ({ status, type: 'application/json', body: JSON.stringify(body) });
const text = (body, status = 200) => ({ status, type: 'text/plain', body });

/**
 * @param {(method: string, params: unknown[]) => Promise<unknown>} rpc
 * @returns {(method: string, path: string, body?: string) => Promise<{status:number,type:string,body:string}>}
 */
export function createHandler(rpc) {
  return async (method, path, body = '') => {
    try {
      let m;
      if (method === 'GET' && path === '/blocks/tip/height') return text(String(await rpc('getblockcount', [])));
      if (method === 'GET' && (m = /^\/block-height\/(\d{1,10})$/.exec(path))) {
        try {
          return text(await rpc('getblockhash', [Number(m[1])]));
        } catch {
          return text('Block not found', 404);
        }
      }
      if (method === 'GET' && (m = /^\/block\/([0-9a-f]{64})\/txs\/(\d{1,7})$/.exec(path))) {
        const start = Number(m[2]);
        if (start % PAGE !== 0) return text('start index must be a multiple of 25', 400);
        const block = await rpc('getblock', [m[1], 3]);
        return json(block.tx.slice(start, start + PAGE).map(mapTx));
      }
      if (method === 'GET' && (m = /^\/tx\/([0-9a-f]{64})\/outspend\/(\d{1,10})$/.exec(path))) {
        const out = await rpc('gettxout', [m[1], Number(m[2]), true]);
        return json({ spent: out === null });
      }
      // regtest has no fee market; bitcoind's estimatesmartfee has no data. Constant 1 sat/vB.
      if (method === 'GET' && path === '/fee-estimates') return json({ 1: 1, 6: 1, 144: 1 });
      if (method === 'POST' && path === '/tx') {
        const hex = body.trim();
        if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return text('invalid hex', 400);
        return text(await rpc('sendrawtransaction', [hex]));
      }
      return text('not found', 404);
    } catch (e) {
      return text(`upstream error: ${e instanceof Error ? e.message : 'unknown'}`, 502);
    }
  };
}

export { HEX64 };
