import { describe, expect, it, vi } from 'vitest';
import { RpcHttpError, type RpcTransport } from '@ghostpay/chain-adapters';
import { transportToFetch } from './fetchAdapter.js';

const URL_ = 'https://selected.test/rpc';
const BODY = '{"method":"eth_getBalance","params":["synthetic-address"]}';

describe('fetch adapter cancellation boundary', () => {
  it.each(['init', 'request'] as const)('refuses an already-aborted %s signal before transport dispatch', async (source) => {
    const controller = new AbortController();
    controller.abort(new Error(`private request ${BODY}`));
    const send = vi.fn<RpcTransport['send']>(() => Promise.resolve('{}'));
    const input = source === 'request' ? new Request(URL_, { method: 'POST', signal: controller.signal }) : URL_;
    const init = source === 'init' ? { method: 'POST', body: BODY, signal: controller.signal } : { body: BODY };
    await expect(transportToFetch({ send })(input, init)).rejects.toMatchObject({ name: 'AbortError', message: 'request aborted' });
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses a Request GET method instead of silently treating it as POST', async () => {
    const send = vi.fn<RpcTransport['send']>(() => Promise.resolve('{}'));
    await expect(transportToFetch({ send })(new Request(URL_), { body: BODY })).rejects.toThrow('only POST');
    expect(send).not.toHaveBeenCalled();
  });

  it('honours an explicit POST override and the explicit override signal', async () => {
    const original = new AbortController();
    original.abort();
    const replacement = new AbortController();
    const send = vi.fn<RpcTransport['send']>(() => Promise.resolve('{}'));
    const res = await transportToFetch({ send })(new Request(URL_, { signal: original.signal }), { method: 'POST', body: BODY, signal: replacement.signal });
    expect(res.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('rejects cancellation during an outstanding operation without re-dispatch or disclosing its reason', async () => {
    const controller = new AbortController();
    let complete: ((value: string) => void) | undefined;
    const send = vi.fn<RpcTransport['send']>(() => new Promise((resolve) => { complete = resolve; }));
    const pending = transportToFetch({ send })(URL_, { body: BODY, signal: controller.signal });
    const outcome = pending.then(() => ({ success: true }), (error: unknown) => ({ error }));
    controller.abort(new Error(`private request ${BODY}`));
    // Give the abort handler and Promise.race handlers a turn without waiting for an ignored transport.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(await Promise.race([outcome, Promise.resolve({ pending: true })])).toMatchObject({ error: { name: 'AbortError', message: 'request aborted' } });
    expect(send).toHaveBeenCalledTimes(1);
    complete?.('{}');
    await outcome;
  });

  it('does not turn an aborted pending HTTP failure into a successful response', async () => {
    const controller = new AbortController();
    let fail: ((error: Error) => void) | undefined;
    const send: RpcTransport['send'] = () => new Promise((_resolve, reject) => { fail = reject; });
    const pending = transportToFetch({ send })(URL_, { body: BODY, signal: controller.signal });
    void pending.catch(() => undefined);
    controller.abort();
    fail?.(new RpcHttpError(503));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('removes the abort listener after a successful operation', async () => {
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, 'addEventListener');
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    await transportToFetch({ send: () => Promise.resolve('{}') })(URL_, { body: BODY, signal: controller.signal });
    expect(add).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0]?.[1]);
  });
});
