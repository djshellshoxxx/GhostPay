import { CHAINS } from '@ghostpay/chain-adapters';
import { describe, expect, it } from 'vitest';
import { FAKE_ANNOUNCER } from '../test/fakeManifest';
import { mockRpc } from '../test/mockRpc';
import { openScanClients, type ScanPlan } from './scanPrivacy';

const chain = CHAINS.find((c) => c.chainId === 84532)!;
type Ready = Extract<ScanPlan, { kind: 'ready' }>;
const ready = (over: Partial<Ready> = {}): Ready => ({ kind: 'ready', endpoint: undefined, allowLoopbackHttp: false, useSecondary: true, indexerUrl: undefined, window: { windowBlocks: 1000, jitterMs: [0, 0] }, ...over });
const noFetch = (): Promise<Response> => Promise.reject(new Error('no network in this test'));
const sleep = (): Promise<void> => Promise.resolve();

describe('openScanClients', () => {
  it('uses the Settings RPC when no endpoint is set, and makes no request while opening', async () => {
    const app = mockRpc(84532, () => { throw new Error('unexpected'); });
    const r = await openScanClients({ plan: ready(), chain, announcer: FAKE_ANNOUNCER, appRpc: () => Promise.resolve(app), fetchImpl: noFetch, sleep });
    expect(r?.base).toBe(app);
    expect(app.calls).toEqual([]);
    expect(await openScanClients({ plan: ready(), chain, announcer: FAKE_ANNOUNCER, appRpc: () => Promise.resolve(undefined), fetchImpl: noFetch, sleep })).toBeUndefined();
  });

  it('talks only to the loopback proxy endpoint and fails closed, without falling back, when it is down', async () => {
    const seen: string[] = [];
    const fetchImpl = (url: string, init: RequestInit): Promise<Response> => {
      seen.push(url);
      const body = JSON.parse(init.body as string) as { id: number };
      return Promise.resolve(new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: '0x14a34' }), { status: 200 }));
    };
    let appAsked = false;
    const appRpc = () => { appAsked = true; return Promise.resolve(undefined); };
    const plan = ready({ endpoint: 'http://127.0.0.1:8545/', allowLoopbackHttp: true });
    expect(await openScanClients({ plan, chain, announcer: FAKE_ANNOUNCER, appRpc, fetchImpl, sleep })).toBeDefined();
    expect(seen).toEqual(['http://127.0.0.1:8545/']);
    await expect(openScanClients({ plan, chain, announcer: FAKE_ANNOUNCER, appRpc, fetchImpl: noFetch, sleep })).rejects.toThrow(/did not fall back/);
    expect(appAsked).toBe(false);
  });
});
