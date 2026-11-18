import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { Transaction } from '@scure/btc-signer';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { sha256d } from '@ghostpay/btc-silent-payments';
import { BlockHashResponseSchema, BlockHeightRequestSchema, FullBlockResponseSchema, InfoResponseSchema } from '../../../../../packages/btc-silent-payments/src/scan/proto/indexing_server_pb';
import { EsploraClient, EsploraTweakSource, type EsploraFetch } from './esplora';
import { mockChain, walletA, type EsploraTxJson } from './fixtures.testutil';
import { EsploraHeaderSource, loadHeaderChain, MemoryHeaderStore, syncHeaders } from './headers';
import { InlineBtcScanWorker } from './scanWorker.testutil';
import type { BtcOracleBlock } from './oracleSource';

function frame(payload: Uint8Array, flag = 0): Uint8Array {
  const out = new Uint8Array(payload.length + 5); out[0] = flag; new DataView(out.buffer).setUint32(1, payload.length); out.set(payload, 5); return out;
}
function grpc(payload: Uint8Array): Response {
  const data = frame(payload); const tail = frame(new TextEncoder().encode('grpc-status: 0\r\n'), 0x80);
  const bytes = new Uint8Array(data.length + tail.length); bytes.set(data); bytes.set(tail, data.length);
  return new Response(bytes, { headers: { 'content-type': 'application/grpc-web+proto' } });
}
const little = (hex: string): Uint8Array => hexToBytes(hex).reverse();
function raw(tx: EsploraTxJson): string {
  const t = new Transaction({ version: tx.version, lockTime: tx.locktime, allowUnknownInputs: true, allowUnknownOutputs: true, disableScriptCheck: true });
  for (const o of tx.vout) t.addOutput({ script: hexToBytes(o.scriptpubkey), amount: BigInt(o.value) });
  for (const i of tx.vin) t.addInput({ txid: i.txid, index: i.vout, sequence: i.sequence, finalScriptSig: hexToBytes(i.scriptsig), finalScriptWitness: i.witness.map(hexToBytes) });
  return bytesToHex(t.toBytes(true, true));
}
function proof(txids: readonly string[], at: number): { pos: number; merkle: string[] } {
  const branch: string[] = []; let hashes = txids.map(little); let position = at;
  while (hashes.length > 1) {
    branch.push(bytesToHex((hashes[position ^ 1] ?? hashes[position]!).slice().reverse()));
    const next: Uint8Array[] = [];
    for (let i = 0; i < hashes.length; i += 2) {
      const joined = new Uint8Array(64); joined.set(hashes[i]!); joined.set(hashes[i + 1] ?? hashes[i]!, 32); next.push(sha256d(joined));
    }
    hashes = next; position = Math.floor(position / 2);
  }
  return { pos: at, merkle: branch };
}
export async function oracleFixture() {
  const wallet = walletA(); const chain = mockChain('regtest', wallet);
  const client = new EsploraClient({ baseUrl: 'https://esplora.test/api', fetchFn: chain.fetchFn });
  const local = new EsploraTweakSource(client, wallet.net);
  const blocks = new Map<number, BtcOracleBlock>();
  for (let height = 0; height < chain.blocks.length; height++) blocks.set(height, { tweaks: await local.getTweaks(height), outputs: await local.getOutputs(height) });
  const store = new MemoryHeaderStore(); const { chain: headers } = await loadHeaderChain(wallet.net, store);
  await syncHeaders({ chain: headers, sources: [new EsploraHeaderSource(client)], store });
  chain.requests.length = 0;
  const controls = { network: 'regtest', full: true, badProof: false, badRaw: false,
    edit: undefined as ((block: BtcOracleBlock, origin: string) => BtcOracleBlock) | undefined };
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn: EsploraFetch = async (url, init) => {
    calls.push({ url, init }); const u = new URL(url);
    if (u.origin === 'https://esplora.test') {
      const match = /^\/api\/tx\/([0-9a-f]{64})\/(hex|merkle-proof)$/.exec(u.pathname);
      if (match !== null) {
        chain.requests.push(`GET ${u.pathname.slice(4)}`);
        const height = chain.blocks.findIndex((b) => b.txs.some((t) => t.txid === match[1]));
        const block = chain.blocks[height]; if (block === undefined) return new Response('', { status: 404 });
        const index = block.txs.findIndex((t) => t.txid === match[1]);
        if (match[2] === 'hex') return new Response(controls.badRaw ? '00' : raw(block.txs[index]!));
        return new Response(JSON.stringify({ block_height: controls.badProof ? height + 1 : height, ...proof(block.txs.map((t) => t.txid), index) }));
      }
      return chain.fetchFn(url, init);
    }
    if (!['https://oracle.test', 'https://second.test'].includes(u.origin)) throw new Error('Unexpected source');
    const info = { network: controls.network, height: 4, tweaks_only: false, tweaks_full_basic: controls.full, tweaks_full_with_dust_filter: false, tweaks_cut_through_with_dust_filter: false };
    if (u.pathname === '/info') return new Response(JSON.stringify(info));
    const http = /^\/(tweaks|utxos)\/(\d+)$/.exec(u.pathname);
    if (http !== null) {
      const height = Number(http[2]); const initial = blocks.get(height)!; const block = controls.edit?.(initial, u.origin) ?? initial;
      return new Response(JSON.stringify({ block_identifier: { block_height: height, block_hash: block.tweaks.blockHash }, index: http[1] === 'tweaks'
        ? block.tweaks.tweaks.map(bytesToHex) : block.outputs.outputs.map((o) => ({ txid: o.txid, vout: o.vout, amount: Number(o.amountSats), pubkey: bytesToHex(o.xOnlyPublicKey) })) }));
    }
    const method = u.pathname.split('/').at(-1);
    if (method === 'GetInfo') return grpc(toBinary(InfoResponseSchema, create(InfoResponseSchema, { network: info.network, height: 4n, tweaksFullBasic: info.tweaks_full_basic })));
    const body = init.body as Uint8Array; const height = Number(fromBinary(BlockHeightRequestSchema, body.slice(5)).blockHeight);
    const initial = blocks.get(height)!; const block = controls.edit?.(initial, u.origin) ?? initial;
    if (method === 'GetBlockHashByHeight') return grpc(toBinary(BlockHashResponseSchema, create(BlockHashResponseSchema, { blockHash: little(block.tweaks.blockHash) })));
    const eligible = chain.blocks[height]!.txs.filter((tx) => !tx.vin[0]!.is_coinbase);
    return grpc(toBinary(FullBlockResponseSchema, create(FullBlockResponseSchema, {
      blockIdentifier: { blockHeight: BigInt(height), blockHash: little(block.tweaks.blockHash) },
      index: block.tweaks.tweaks.map((tweak, i) => ({ txid: little(eligible[i]!.txid), tweak, inputs: new Uint8Array(),
        utxos: block.outputs.outputs.filter((o) => o.txid === eligible[i]!.txid).map((o) => ({ vout: o.vout!, amount: o.amountSats!, pubkey: o.xOnlyPublicKey })) })),
    })));
  };
  const workers: InlineBtcScanWorker[] = [];
  const factory = () => { const worker = new InlineBtcScanWorker(); workers.push(worker); return worker; };
  return { wallet, chain, client, headers, controls, calls, fetchFn, factory, workers, fromHeight: 1, blocks };
}
