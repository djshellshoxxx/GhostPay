// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ATTEMPT_JOURNAL_KEY, readAttempts } from './duplicateAttemptJournal';
import { userMessage } from './errors';
import { MockWallet } from '../test/mockWallet';
import { connectWallet, sendViaWallet, WalletBroadcastError, type WalletInfo, type TxRequest } from './wallet';
const tx: TxRequest = { to: `0x${'1'.repeat(40)}`, data: '0x', value: 0n };
const info = (provider: WalletInfo['provider']): WalletInfo => ({ id: 'mock', name: 'Mock', kind: 'injected', provider });
beforeEach(() => { vi.restoreAllMocks(); window.sessionStorage.clear(); });
describe('wallet attempt persistence', () => {
  it('writes before wallet invocation and blocks an invoice retry with a freshly rebuilt transaction', async () => {
    const base = new MockWallet();
    const provider = { request: async (args: Parameters<MockWallet['request']>[0]) => {
      if (args.method === 'eth_sendTransaction') expect(readAttempts()).toMatchObject([{ status: 'unknown' }]);
      return base.request(args);
    } };
    const session = await connectWallet(info(provider), 84532);
    await sendViaWallet(session, tx, undefined, { kind: 'payment', scope: 'invoice-one' });
    await expect(sendViaWallet(session, { ...tx, data: '0x1234' }, undefined, { kind: 'payment', scope: 'invoice-one' })).rejects.toThrow(/previous wallet attempt/);
    expect(base.calls.filter((c) => c.method === 'eth_sendTransaction')).toHaveLength(1);
  });
  it('blocks the same signed invoice after switching payer accounts until explicit clearing', async () => {
    const first = await connectWallet(info(new MockWallet()), 84532);
    const secondWallet = new MockWallet({ account: `0x${'2'.repeat(40)}` });
    const second = await connectWallet(info(secondWallet), 84532);
    await sendViaWallet(first, tx, undefined, { kind: 'payment', scope: 'same-signed-invoice' });
    await expect(sendViaWallet(second, tx, undefined, { kind: 'payment', scope: 'same-signed-invoice' })).rejects.toThrow(/previous wallet attempt/);
    expect(secondWallet.sent).toBeUndefined();
    await sendViaWallet(second, tx, undefined, { kind: 'payment', scope: 'different-signed-invoice' });
    expect(secondWallet.sent).toBeDefined();
  });
  it('retains the returned hash even when application authority changed while confirmation was in flight', async () => {
    const base = new MockWallet();
    let current = true;
    const session = await connectWallet(info({ request: async (args) => {
      if (args.method === 'eth_sendTransaction') current = false;
      return base.request(args);
    } }), 84532);
    const hash = await sendViaWallet(session, tx, () => { if (!current) throw new Error('session changed'); });
    expect(readAttempts()).toMatchObject([{ status: 'submitted', hash }]);
  });
  it('fails closed on storage failure before any send', async () => {
    const base = new MockWallet();
    const session = await connectWallet(info(base), 84532);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await expect(sendViaWallet(session, tx)).rejects.toThrow(/journal/);
    expect(base.sent).toBeUndefined();
  });
  it('reports a lost provider response as an unknown outcome and keeps the pre-send record', async () => {
    const base = new MockWallet();
    const session = await connectWallet(info({ request: (args) => args.method === 'eth_sendTransaction' ? Promise.reject(new Error('credential https://secret')) : base.request(args) }), 84532);
    const error = await sendViaWallet(session, tx).catch((e: unknown) => e);
    expect(userMessage(error)).toMatch(/unknown|may already|may have/i);
    expect(userMessage(error)).not.toMatch(/Nothing was sent|secret|credential/);
    expect(readAttempts()).toMatchObject([{ status: 'unknown' }]);
  });
  it('preserves a returned hash in the error when storage fails after broadcast', async () => {
    const base = new MockWallet();
    let sent = false;
    const session = await connectWallet(info({ request: (args) => { if (args.method === 'eth_sendTransaction') sent = true; return base.request(args); } }), 84532);
    const original = Storage.prototype.setItem.bind(window.sessionStorage);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (sent && key === ATTEMPT_JOURNAL_KEY) throw new Error('quota');
      original(key, value);
    });
    const request = sendViaWallet(session, tx);
    await expect(request).rejects.toBeInstanceOf(WalletBroadcastError);
    await expect(request).rejects.toMatchObject({ hash: `0x${'9'.repeat(64)}` });
  });
});
