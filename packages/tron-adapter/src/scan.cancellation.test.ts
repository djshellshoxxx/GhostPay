import { bytesToHex } from '@noble/hashes/utils.js';
import { generateKeySet } from '@ghostpay/core-crypto';
import { describe, expect, it, vi } from 'vitest';
import { tronAddressToHex } from './address.js';
import { createTronAdapter } from './adapter.js';
import { encodeTronMetaAddress } from './meta.js';
import { seededRng } from './rng.testutil.js';
import type { TronRpc } from './rpc.js';
import { scanTron, TRANSFER_TOPIC } from './scan.js';
import { decodeRawTx } from './tx.js';

const keys = generateKeySet(seededRng('scan-abort-fixture-keys'));
const recipient = encodeTronMetaAddress(keys);
const adapter = createTronAdapter({ network: 'nile' });
const payer = 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC';
const usdt = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const blockId = `${'00'.repeat(8)}00112233445566778899aabbccddeeff0011223344556677`.slice(0, 64);

type JsonRecord = Record<string, unknown>;
function payment(seed: string, kind: 'native' | 'trc20', amount: bigint) {
  const request = adapter.buildPaymentRequest({
    chainId: 'tron-nile',
    recipient,
    asset: kind === 'native' ? { kind: 'native' } : { kind: 'trc20', contract: usdt },
    amount,
  });
  const built = request.build({
    payer,
    refBlock: { number: 100n, blockId },
    timestampMs: 1_700_000_000_000n,
    ...(kind === 'trc20' ? { feeLimitSun: 100_000_000n } : {}),
    rng: seededRng(seed),
  });
  const decoded = decodeRawTx(built.tx.rawData);
  const owner = tronAddressToHex(payer);
  const value: JsonRecord = decoded.kind === 'trc20'
    ? {
        owner_address: owner,
        contract_address: tronAddressToHex(usdt),
        data: `a9059cbb${'0'.repeat(24)}${tronAddressToHex(decoded.to).slice(2)}${decoded.amount.toString(16).padStart(64, '0')}`,
      }
    : { owner_address: owner, to_address: tronAddressToHex(decoded.to), amount: Number(decoded.amount) };
  const nodeTx: JsonRecord = {
    txID: built.tx.txID,
    raw_data_hex: built.tx.rawDataHex,
    ret: [{ contractRet: 'SUCCESS' }],
    raw_data: {
      data: bytesToHex(decoded.memo),
      contract: [{ type: decoded.kind === 'trc20' ? 'TriggerSmartContract' : 'TransferContract', parameter: { value } }],
    },
  };
  return { built, nodeTx };
}

function page(txs: readonly JsonRecord[]): JsonRecord {
  return {
    block: [{
      blockID: blockId,
      block_header: { raw_data: { number: 100 } },
      transactions: txs,
    }],
  };
}

function options(signal: AbortSignal) {
  return { fromBlock: 100n, toBlock: 100n, viewingSecret: keys.viewingSecret, spendingPublicKey: keys.spendingPublicKey, signal };
}

describe('TRON scan cancellation after asynchronous and buffered work (GP-BUG-13)', () => {
  it('stops before yielding a second matching payment already buffered in the same block', async () => {
    const first = payment('abort-first', 'native', 1n);
    const second = payment('abort-second', 'native', 2n);
    const rpc: TronRpc = { post: () => Promise.resolve(page([first.nodeTx, second.nodeTx])) };
    const abort = new AbortController();
    const results = scanTron(rpc, options(abort.signal));
    const initial = await results.next();
    expect(initial.done).toBe(false);
    expect(initial.value).toMatchObject({ amount: 1n, txID: first.built.tx.txID });
    abort.abort();
    await expect(results.next()).rejects.toMatchObject({ code: 'ABORTED' });
  });

  it('rejects a completed page read when the RPC resolves after cancellation', async () => {
    let resolvePage!: (value: JsonRecord) => void;
    const delayed = new Promise<JsonRecord>((resolve) => { resolvePage = resolve; });
    const post = vi.fn().mockReturnValue(delayed);
    const rpc: TronRpc = { post };
    const abort = new AbortController();
    const results = scanTron(rpc, options(abort.signal));
    const pending = results.next();
    await vi.waitFor(() => { expect(post).toHaveBeenCalledOnce(); });
    abort.abort();
    resolvePage(page([payment('abort-page', 'native', 3n).nodeTx]));
    await expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
  });

  it('rejects an in-flight TRC-20 receipt before yielding a confirmed payment', async () => {
    const tokenPayment = payment('abort-token', 'trc20', 9n);
    const receipt: JsonRecord = {
      id: tokenPayment.built.tx.txID,
      log: [{
        address: tronAddressToHex(usdt).slice(2),
        topics: [
          TRANSFER_TOPIC,
          '0'.repeat(64),
          `${'0'.repeat(24)}${tronAddressToHex(tokenPayment.built.stealthAddress).slice(2)}`,
        ],
        data: (9n).toString(16).padStart(64, '0'),
      }],
    };
    let resolveReceipt!: (value: JsonRecord) => void;
    const delayed = new Promise<JsonRecord>((resolve) => { resolveReceipt = resolve; });
    const post = vi.fn((path: string) => Promise.resolve(path === '/wallet/getblockbylimitnext' ? page([tokenPayment.nodeTx]) : receipt));
    post.mockImplementation((path: string) =>
      path === '/wallet/gettransactioninfobyid' ? delayed : Promise.resolve(page([tokenPayment.nodeTx])));
    const rpc: TronRpc = { post };
    const abort = new AbortController();
    const results = scanTron(rpc, options(abort.signal));
    const pending = results.next();
    await vi.waitFor(() => {
      expect(post.mock.calls.some(([path]) => path === '/wallet/gettransactioninfobyid')).toBe(true);
    });
    abort.abort();
    resolveReceipt(receipt);
    await expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
  });
});
