import { TronAdapterError, type TronRpc } from '@ghostpay/tron-adapter';
import { describe, expect, it } from 'vitest';
import { BACKUP_A, DEST, mockTron, walletA } from './fixtures.testutil';
import { MAINNET_GENESIS, NILE_GENESIS, SHASTA_GENESIS, tronNetwork } from './network';
import { broadcastHex, checkNetwork, createRpc, fetchMemo, getBalanceSun, isActivated, tronErrorMessage, TronViewError } from './rpc';
import { MAX_SCAN_BLOCKS, scanForPayments } from './scan';
import { ACTIVATION_FEE_SUN, reviewSweep, signSweep } from './sweep';
import { backupHex, newWallet, walletFromBackupHex, wipeWallet } from './wallet';

function reply(value: unknown): TronRpc {
  return { post: () => Promise.resolve(value) };
}

/** Keep the real adapter parser and replace only one response from an in-memory node. */
function changeResponse(chain: ReturnType<typeof mockTron>, path: string, change: (value: unknown) => unknown): TronRpc {
  return createRpc('http://127.0.0.1:9090', async (url, init) => {
    const response = await chain.fetchFn(url, init);
    if (new URL(url).pathname !== path) return response;
    return new Response(JSON.stringify(change(await response.json())));
  });
}

describe('TRON untrusted-node and wallet boundaries', () => {
  it('refuses an omitted genesis and case-insensitive mainnet identity', async () => {
    await expect(checkNetwork(reply({ block: [] }))).rejects.toThrow(/first block/);
    const chain = mockTron(walletA());
    chain.genesis = MAINNET_GENESIS.toUpperCase();
    await expect(checkNetwork(createRpc('http://127.0.0.1:9090', chain.fetchFn))).rejects.toThrow(/mainnet/);
  });

  it('pins the genesis block ids published in tronprotocol/tips tip-474 and keeps them distinct', async () => {
    expect(MAINNET_GENESIS).toBe('00000000000000001ebf88508a03865c71d452e25f4d51194196a1d22b6653dc');
    expect(NILE_GENESIS).toBe('0000000000000000d698d4192c56cb6be724a558448e2684802de4d6cd8690dc');
    expect(SHASTA_GENESIS).toBe('0000000000000000de1aa88295e1fcf982742f773e0419c5a9c134c994a9059e');
    expect(new Set([MAINNET_GENESIS, NILE_GENESIS, SHASTA_GENESIS]).size).toBe(3);
    // A Nile or Shasta node is not mistaken for mainnet.
    for (const g of [NILE_GENESIS, SHASTA_GENESIS]) {
      const chain = mockTron(walletA());
      chain.genesis = g;
      await expect(checkNetwork(createRpc('http://127.0.0.1:9090', chain.fetchFn))).resolves.toBeUndefined();
    }
  });

  it.each([null, [], { balance: -1 }, { balance: 1.5 }, { balance: '42' }, { balance: Number.MAX_SAFE_INTEGER + 1 }])('rejects malformed account balances %#', async (value) => {
    await expect(getBalanceSun(reply(value), DEST)).rejects.toThrow(/unexpected answer/);
  });

  it('distinguishes an absent account from an activated account with no balance', async () => {
    expect(await getBalanceSun(reply({}), DEST)).toBe(0n);
    expect(await isActivated(reply({}), DEST)).toBe(false);
    expect(await isActivated(reply({ address: DEST }), DEST)).toBe(true);
  });

  it.each([{ result: false }, { result: true }, { result: true, txid: 'cd'.repeat(32) }, null])('rejects failed or substituted broadcast acknowledgements %#', async (value) => {
    await expect(broadcastHex(reply(value), '00', 'ab'.repeat(32))).rejects.toBeInstanceOf(TronViewError);
  });

  it('accepts only the signed transaction id, allowing node hex case differences', async () => {
    const txID = 'ab'.repeat(32);
    expect(await broadcastHex(reply({ result: true, txid: txID.toUpperCase() }), '00', txID)).toBe(txID);
  });

  it('redacts arbitrary errors and gives a safe cancellation message', () => {
    expect(tronErrorMessage(new Error(BACKUP_A))).toBe('Something went wrong. Nothing was sent.');
    expect(tronErrorMessage(new TronAdapterError('ABORTED'))).toBe('Cancelled.');
    expect(tronErrorMessage(new TronViewError('Safe message'))).toBe('Safe message');
  });

  it('preserves the fixed library diagnostic for an unreadable memo without a UI translation', () => {
    expect(tronErrorMessage(new TronAdapterError('INVALID_MEMO'))).toBe('invalid stealth announcement memo');
  });

  it('rejects mainnet creation/import and rejects zero or reused backup scalars', () => {
    expect(() => newWallet(tronNetwork('mainnet'))).toThrow(/disabled/);
    expect(() => walletFromBackupHex(BACKUP_A, tronNetwork('mainnet'))).toThrow(/disabled/);
    expect(() => walletFromBackupHex('00'.repeat(64), tronNetwork('local'))).toThrow(/not valid keys/);
    expect(() => walletFromBackupHex('11'.repeat(64), tronNetwork('local'))).toThrow(/not valid keys/);
  });

  it('round-trips normalized backup bytes without exposing the redacting secret holders', () => {
    const wallet = walletFromBackupHex(` ${BACKUP_A.toUpperCase()} `, tronNetwork('nile'));
    expect(backupHex(wallet)).toBe(BACKUP_A);
    expect(() => JSON.stringify(wallet.keys.spendingSecret)).toThrow();
    wipeWallet(wallet);
    expect(wallet.keys.spendingSecret.every((byte) => byte === 0)).toBe(true);
    expect(wallet.keys.viewingSecret.every((byte) => byte === 0)).toBe(true);
  });
});

describe('TRON scan and sweep hardening', () => {
  const signal = (): AbortSignal => new AbortController().signal;

  it('rejects negative and oversized scan ranges without downloading blocks', async () => {
    const chain = mockTron(walletA());
    const rpc = createRpc('http://127.0.0.1:9090', chain.fetchFn);
    await expect(scanForPayments({ rpc, wallet: walletA(), fromBlock: -1n, signal: signal() })).rejects.toThrow(/first block/);
    expect(chain.calls).toEqual([]);
    const oversized = changeResponse(chain, '/wallet/getnowblock', (value) => ({ ...(value as object), block_header: { raw_data: { number: MAX_SCAN_BLOCKS } } }));
    await expect(scanForPayments({ rpc: oversized, wallet: walletA(), fromBlock: 0n, signal: signal() })).rejects.toThrow(/at most 1000/);
    expect(chain.calls).not.toContain('/wallet/getblockbylimitnext');
  });

  it('returns an empty result when the node head moves behind the requested range', async () => {
    const chain = mockTron(walletA());
    const result = await scanForPayments({ rpc: createRpc('http://127.0.0.1:9090', chain.fetchFn), wallet: walletA(), fromBlock: 601n, signal: signal() });
    expect(result).toEqual({ fromBlock: 601n, toBlock: 600n, found: [], emptiedCount: 0, tokenCount: 0 });
    expect(chain.calls).toEqual(['/wallet/getnowblock']);
  });

  it('counts emptied payments without fetching their memos', async () => {
    const chain = mockTron(walletA());
    chain.balanceSun = 0;
    const result = await scanForPayments({ rpc: createRpc('http://127.0.0.1:9090', chain.fetchFn), wallet: walletA(), fromBlock: 500n, signal: signal() });
    expect(result.found).toEqual([]);
    expect(result.emptiedCount).toBe(1);
    expect(chain.calls).not.toContain('/wallet/gettransactionbyid');
  });

  it('fails closed when canceled before reading any funding blocks', async () => {
    const chain = mockTron(walletA());
    const controller = new AbortController();
    controller.abort();
    await expect(scanForPayments({ rpc: createRpc('http://127.0.0.1:9090', chain.fetchFn), wallet: walletA(), fromBlock: 500n, signal: controller.signal })).rejects.toMatchObject({ code: 'ABORTED' });
    expect(chain.calls).not.toContain('/wallet/gettransactionbyid');
  });

  it('rejects node blocks repeated at the same height instead of double-crediting them', async () => {
    const chain = mockTron(walletA());
    const rpc = changeResponse(chain, '/wallet/getblockbylimitnext', (value) => {
      const envelope = value as { block: unknown[] };
      return { block: [...envelope.block, ...envelope.block] };
    });
    await expect(scanForPayments({ rpc, wallet: walletA(), fromBlock: 500n, signal: signal() })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('rejects a funding transaction substituted between the scan and memo lookup', async () => {
    const chain = mockTron(walletA());
    const rpc = changeResponse(chain, '/wallet/gettransactionbyid', (value) => ({ ...(value as object), raw_data_hex: '00' }));
    await expect(scanForPayments({ rpc, wallet: walletA(), fromBlock: 500n, signal: signal() })).rejects.toThrow(/unexpected answer/);
  });

  it('refuses an unreadable announcement even when the raw transaction hash still matches the lookup', async () => {
    const wallet = walletA();
    const chain = mockTron(wallet);
    const rpc = createRpc('http://127.0.0.1:9090', chain.fetchFn);
    const scanned = await scanForPayments({ rpc, wallet, fromBlock: 500n, signal: signal() });
    const found = scanned.found[0];
    if (found === undefined) throw new Error('fixture must yield a payment');
    const malformed = changeResponse(chain, '/wallet/gettransactionbyid', (value) => {
      const transaction = value as { raw_data: Record<string, unknown> };
      return { ...transaction, raw_data: { ...transaction.raw_data, data: '00' } };
    });
    await expect(fetchMemo(malformed, found.txID)).rejects.toThrow(/no readable announcement/);
    expect(chain.broadcasts).toEqual([]);
  });

  it('deduplicates a valid payment repeated by the node without querying its balance or memo twice', async () => {
    const wallet = walletA();
    const chain = mockTron(wallet);
    const rpc = changeResponse(chain, '/wallet/getblockbylimitnext', (value) => {
      const envelope = value as { block: { transactions?: unknown[] }[] };
      return { block: envelope.block.map((block) => ({ ...block, transactions: [...(block.transactions ?? []), ...(block.transactions ?? [])] })) };
    });
    const result = await scanForPayments({ rpc, wallet, fromBlock: 500n, signal: signal() });
    expect(result.found).toHaveLength(1);
    expect(chain.calls.filter((path) => path === '/wallet/getaccount')).toHaveLength(1);
    expect(chain.calls.filter((path) => path === '/wallet/gettransactionbyid')).toHaveLength(1);
  });

  it.each([null, {}, { raw_data_hex: 'odd', raw_data: { data: '00' } }])('rejects malformed memo lookup responses %#', async (value) => {
    await expect(fetchMemo(reply(value), 'ab'.repeat(32))).rejects.toThrow(/unexpected answer/);
  });

  it('reserves the activation cost, refuses fee-only balances, and rejects an unrelated wallet key', async () => {
    const wallet = walletA();
    const chain = mockTron(wallet);
    const rpc = createRpc('http://127.0.0.1:9090', chain.fetchFn);
    const result = await scanForPayments({ rpc, wallet, fromBlock: 500n, signal: signal() });
    const found = result.found[0];
    if (found === undefined) throw new Error('fixture must yield a payment');
    const params = { bandwidthFeeSun: 1000n, energyFeeSun: 420n };
    const existing = reviewSweep(wallet, found, DEST, { params, destinationActivated: true });
    const fresh = reviewSweep(wallet, found, DEST, { params, destinationActivated: false });
    expect(fresh.feeReserveSun - existing.feeReserveSun).toBe(ACTIVATION_FEE_SUN);
    expect(fresh.totalSun).toBe(fresh.sendSun + fresh.feeReserveSun);
    expect(() => reviewSweep(wallet, { ...found, balanceSun: 1n }, DEST, { params, destinationActivated: false })).toThrow(/fee reserve/);
    const stranger = walletFromBackupHex(`${'33'.repeat(32)}${'44'.repeat(32)}`, tronNetwork('local'));
    await expect(signSweep({ rpc, wallet: stranger, found, review: existing, nowMs: 1_700_000_000_000 })).rejects.toThrow(/view tag|address|key/);
    expect(chain.broadcasts).toEqual([]);
    expect(chain.calls).not.toContain('/wallet/broadcasthex');
    wipeWallet(stranger);
  });
});
