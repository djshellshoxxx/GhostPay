import { base58 } from '@scure/base';
import { SolanaStealthError, type SolanaRpc } from '@ghostpay/solana-stealth';
import { describe, expect, it } from 'vitest';
import { DEST, SEED_A, mockChain, walletA } from './fixtures.testutil';
import { DEVNET_GENESIS, MAINNET_GENESIS, TESTNET_GENESIS, solNetwork } from './network';
import { checkNetwork, createRpc, getBalance, sendTransaction, solErrorMessage, SolViewError } from './rpc';
import { scanForPayments, wipeFound } from './scan';
import { formatSol, NEW_ACCOUNT_MIN_LAMPORTS, reviewSweep, signSweep, SWEEP_FEE_LAMPORTS } from './sweep';
import { randomSeedHex, walletFromSeedHex, wipeWallet } from './wallet';

function reply(result: unknown): SolanaRpc {
  return { request: () => Promise.resolve(result) };
}

/** Change a single public node response while retaining the real parser and cryptography. */
function changeResponse(chain: ReturnType<typeof mockChain>, method: string, change: (result: unknown) => unknown): SolanaRpc {
  return createRpc('http://127.0.0.1:8899', async (url, init) => {
    const response = await chain.fetchFn(url, init);
    const body = JSON.parse(init.body as string) as { method: string };
    if (body.method !== method) return response;
    const envelope = await response.json() as { result: unknown };
    return new Response(JSON.stringify({ ...envelope, result: change(envelope.result) }));
  });
}

describe('Solana node and key boundaries', () => {
  it.each([DEVNET_GENESIS, TESTNET_GENESIS, MAINNET_GENESIS])('refuses a public cluster posing as localnet (%s)', async (genesis) => {
    await expect(checkNetwork(reply(genesis), solNetwork('localnet'))).rejects.toBeInstanceOf(SolViewError);
  });

  it('pins testnet and devnet independently and refuses malformed genesis responses', async () => {
    await expect(checkNetwork(reply(DEVNET_GENESIS), solNetwork('devnet'))).resolves.toBeUndefined();
    await expect(checkNetwork(reply(TESTNET_GENESIS), solNetwork('testnet'))).resolves.toBeUndefined();
    await expect(checkNetwork(reply(TESTNET_GENESIS), solNetwork('devnet'))).rejects.toThrow(/not on the network/);
    await expect(checkNetwork(reply({ genesis: DEVNET_GENESIS }), solNetwork('devnet'))).rejects.toThrow(/unexpected answer/);
  });

  it.each([null, { value: -1 }, { value: Number.MAX_SAFE_INTEGER + 1 }, { value: 1.5 }, {}])('rejects malformed balances %#', async (value) => {
    await expect(getBalance(reply(value), DEST)).rejects.toThrow();
  });

  it.each(['', null, { signature: 'fake' }])('does not treat malformed send acknowledgements as acceptance %#', async (value) => {
    await expect(sendTransaction(reply(value), 'AA==')).rejects.toThrow(/unexpected answer/);
  });

  it('redacts arbitrary errors while preserving explicit safe and cancellation messages', () => {
    expect(solErrorMessage(new Error(SEED_A))).toBe('Something went wrong. Nothing was sent.');
    expect(solErrorMessage(new SolanaStealthError('ABORTED'))).toBe('Cancelled.');
    expect(solErrorMessage(new SolViewError('Safe message'))).toBe('Safe message');
  });

  it('preserves the library diagnostic when a derived-key failure has no UI-specific translation', () => {
    const error = new SolanaStealthError('DERIVED_KEY_INVALID');
    expect(solErrorMessage(error)).toBe('derived key or tweak is invalid');
    expect(solErrorMessage(error)).not.toContain(SEED_A);
  });

  it('displays whole SOL and the smallest lamport without rounding away value in a review', () => {
    expect(formatSol(1_000_000_000n)).toBe('1 SOL');
    expect(formatSol(1n)).toBe('0.000000001 SOL');
    expect(formatSol(1_000_000_001n)).toBe('1.000000001 SOL');
  });

  it('disallows disabled-network import and wipes wallet secrets on lock', () => {
    expect(() => walletFromSeedHex(SEED_A, solNetwork('mainnet'))).toThrow(/disabled/);
    const wallet = walletFromSeedHex(` ${SEED_A.toUpperCase()} `, solNetwork('testnet'));
    expect(wallet.metaAddress).toBe(walletA('testnet').metaAddress);
    expect(() => JSON.stringify(wallet.keys.spendSecret)).toThrow();
    wipeWallet(wallet);
    expect(wallet.keys.spendSecret.every((byte) => byte === 0)).toBe(true);
    expect(wallet.keys.viewSecret.every((byte) => byte === 0)).toBe(true);
  });

  it('wipes the temporary random seed buffer after encoding the backup', () => {
    const buffers: Uint8Array[] = [];
    const rng = { getRandomValues<T extends ArrayBufferView | null>(array: T): T {
      if (array !== null) {
        const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
        bytes.fill(0xa1);
        buffers.push(bytes);
      }
      return array;
    } };
    expect(randomSeedHex(rng)).toBe(SEED_A);
    expect(buffers[0]?.every((byte) => byte === 0)).toBe(true);
  });
});

describe('Solana scan and signing hardening', () => {
  it('returns an empty bounded result when the finalized head precedes the requested slot', async () => {
    const chain = mockChain('localnet', walletA());
    const result = await scanForPayments({ rpc: createRpc('http://127.0.0.1:8899', chain.fetchFn), wallet: walletA(), fromSlot: 601n });
    expect(result).toEqual({ fromSlot: 601n, toSlot: 600n, found: [], emptiedCount: 0 });
    expect(chain.calls).toEqual(['getSlot']);
  });

  it('rejects negative scan bounds before any node call', async () => {
    const chain = mockChain('localnet', walletA());
    await expect(scanForPayments({ rpc: createRpc('http://127.0.0.1:8899', chain.fetchFn), wallet: walletA(), fromSlot: -1n })).rejects.toThrow(/first slot/);
    expect(chain.calls).toEqual([]);
  });

  it('counts emptied addresses and does not offer them for signing', async () => {
    const chain = mockChain('localnet', walletA());
    chain.balance = 0n;
    const result = await scanForPayments({ rpc: createRpc('http://127.0.0.1:8899', chain.fetchFn), wallet: walletA(), fromSlot: 0n });
    expect(result.emptiedCount).toBe(1);
    expect(result.found).toEqual([]);
  });

  it('treats a disappeared finalized transaction as absent and rejects a slot mismatch', async () => {
    const chain = mockChain('localnet', walletA());
    const missing = changeResponse(chain, 'getTransaction', () => null);
    expect((await scanForPayments({ rpc: missing, wallet: walletA(), fromSlot: 0n })).found).toEqual([]);
    const moved = changeResponse(chain, 'getTransaction', (result) => ({ ...(result as object), slot: 499 }));
    await expect(scanForPayments({ rpc: moved, wallet: walletA(), fromSlot: 0n })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('fails closed on cancellation before scanning transaction history', async () => {
    const chain = mockChain('localnet', walletA());
    const controller = new AbortController();
    controller.abort();
    await expect(scanForPayments({ rpc: createRpc('http://127.0.0.1:8899', chain.fetchFn), wallet: walletA(), fromSlot: 0n, signal: controller.signal })).rejects.toMatchObject({ code: 'ABORTED' });
    expect(chain.calls).not.toContain('getTransaction');
  });

  it('warns about rent and tokens, refuses fee-only balances, and wipes discarded scan results', async () => {
    const wallet = walletA();
    const chain = mockChain('localnet', wallet);
    const result = await scanForPayments({ rpc: createRpc('http://127.0.0.1:8899', chain.fetchFn), wallet, fromSlot: 0n });
    const found = result.found[0];
    expect(found).toBeDefined();
    if (found === undefined) throw new Error('fixture must yield a payment');
    const small = { ...found, balanceLamports: NEW_ACCOUNT_MIN_LAMPORTS, tokenReceiptCount: 1 };
    expect(reviewSweep(wallet, small, DEST).warnings.join(' ')).toMatch(/does not exist.*tokens stay/s);
    expect(() => reviewSweep(wallet, { ...found, balanceLamports: SWEEP_FEE_LAMPORTS }, DEST)).toThrow(/network fee/);
    wipeFound(result.found);
    expect(found.tweak.every((byte) => byte === 0)).toBe(true);
  });

  it('refuses signing with another wallet and never broadcasts during a signing attempt', async () => {
    const wallet = walletA();
    const chain = mockChain('localnet', wallet);
    const rpc = createRpc('http://127.0.0.1:8899', chain.fetchFn);
    const result = await scanForPayments({ rpc, wallet, fromSlot: 0n });
    const found = result.found[0];
    if (found === undefined) throw new Error('fixture must yield a payment');
    const stranger = walletFromSeedHex('b2'.repeat(32), solNetwork('localnet'));
    await expect(signSweep({ rpc, wallet: stranger, found, review: reviewSweep(wallet, found, DEST) })).rejects.toMatchObject({ code: 'DERIVED_KEY_INVALID' });
    expect(chain.broadcasts).toEqual([]);
    expect(chain.calls).not.toContain('sendTransaction');
    wipeFound(result.found);
    wipeWallet(stranger);
  });

  it('checks finalized balance and lifetime while building a signed transfer without submitting it', async () => {
    const wallet = walletA();
    const chain = mockChain('localnet', wallet);
    const requests: { method: string; params: unknown[] }[] = [];
    const rpc = createRpc('http://127.0.0.1:8899', async (url, init) => {
      requests.push(JSON.parse(init.body as string) as { method: string; params: unknown[] });
      return chain.fetchFn(url, init);
    });
    const result = await scanForPayments({ rpc, wallet, fromSlot: 0n });
    const found = result.found[0];
    if (found === undefined) throw new Error('fixture must yield a payment');
    const signed = await signSweep({ rpc, wallet, found, review: reviewSweep(wallet, found, DEST) });
    expect(base58.decode(signed.signature)).toHaveLength(64);
    expect(requests.filter((r) => r.method === 'getBalance').every((r) => JSON.stringify(r.params).includes('finalized'))).toBe(true);
    expect(requests.find((r) => r.method === 'getLatestBlockhash')?.params).toEqual([{ commitment: 'finalized' }]);
    expect(chain.broadcasts).toEqual([]);
    wipeFound(result.found);
  });
});
