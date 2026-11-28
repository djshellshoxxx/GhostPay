// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { encodeMetaAddress, generateKeySet } from '@ghostpay/core-crypto';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearSession, generateSession } from '../lib/session';
import { SETTINGS_KEY } from '../lib/settings';
import { SCAN_PRIVACY_KEY } from '../lib/scanPrivacy';
import { SCAN_LANES_KEY } from '../lib/scanSpam';
import type { Services } from '../lib/services';
import { makeLog } from '../test/announcements';
import { FAKE_ANNOUNCER, FAKE_ROUTER } from '../test/fakeManifest';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { chainWithLogs } from '../test/mockChain';
import { makeServices, renderApp } from '../test/render';

const loaded: Services['loadManifest'] = (id) => Promise.resolve({ status: 'loaded', manifest: backedManifest(id), trust: 'unsigned-dev', warning: 'UNSIGNED DEV MANIFEST: test.' });

async function openScan(services: Services): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  renderApp(services);
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Scan and receive' }));
  await user.selectOptions(screen.getByLabelText('Chain'), screen.getByRole('option', { name: 'Base Sepolia' }));
  return user;
}

const bothRpcs = (): void => { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' }, rpcUrlsSecondary: { '84532': 'https://rpc2.test' } })); };

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('Scan privacy (spec 10)', () => {
  it('does not mention cover lookups while the opt-in is off', async () => {
    generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const rpc = chainWithLogs(84532, 2500, []);
    await openScan(makeServices({ loadManifest: loaded, createRpc: () => Promise.resolve(withManifestChain(rpc)) }));
    expect(screen.getByText(/Scan RPC/)).toBeTruthy();
    expect(screen.queryByText(/about half of the other router payments each scan reads are looked up/)).toBeNull();
  });

  it('discloses cover lookups when the opt-in is on, and still scans', async () => {
    generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    window.localStorage.setItem(SCAN_LANES_KEY, JSON.stringify({ floodPerBlock: 32, spamScoring: true, privacySetTransfers: false, matchCover: true }));
    const rpc = chainWithLogs(84532, 2500, []);
    const user = await openScan(makeServices({ loadManifest: loaded, createRpc: () => Promise.resolve(withManifestChain(rpc)) }));
    expect(screen.getByText(/about half of the other router payments each scan reads are looked up/)).toBeTruthy();
    await user.type(screen.getByLabelText('Start block'), '0');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    await waitFor(() => { expect(screen.getByText(/Finished\./)).toBeTruthy(); });
  });

  it('blocks the scan, sending nothing, when the saved cover choice cannot be read', async () => {
    generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    window.localStorage.setItem(SCAN_LANES_KEY, '{"matchCover":tru');
    const created: string[] = [];
    const user = await openScan(makeServices({ loadManifest: loaded, createRpc: (_c, url) => { created.push(url); return Promise.resolve(withManifestChain(chainWithLogs(84532, 500, []))); } }));
    await user.type(screen.getByLabelText('Start block'), '100');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Scan blocked: .*could not be read exactly as saved/);
    expect(created).toEqual([]);
  });

  it.each([
    ['turned on', false, JSON.stringify({ matchCover: true })],
    ['turned off', true, JSON.stringify({ matchCover: false })],
    ['made unreadable', true, '{broken'],
  ])('stops a running scan, sending nothing more, when cover lookups are %s in another tab', async (_name, atStart, changed) => {
    generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    window.localStorage.setItem(SCAN_LANES_KEY, JSON.stringify({ matchCover: atStart }));
    const base = withManifestChain(chainWithLogs(84532, 2500, []));
    let pages = 0;
    const client: typeof base = { ...base, getLogs: async (filter) => { pages += 1; const logs = await base.getLogs(filter); window.localStorage.setItem(SCAN_LANES_KEY, changed); return logs; } };
    const user = await openScan(makeServices({ loadManifest: loaded, createRpc: () => Promise.resolve(client) }));
    await user.type(screen.getByLabelText('Start block'), '0');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    expect(await screen.findByText(/Scan stopped: the scan privacy settings or an RPC this scan uses changed/)).toBeTruthy();
    expect(pages).toBe(1);
    expect(screen.queryByText(/Finished\./)).toBeNull();
  });

  it.each([[true, true], [false, false]])('looks up other router payments only when cover lookups are on (%s)', async (matchCover, expected) => {
    generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    window.localStorage.setItem(SCAN_LANES_KEY, JSON.stringify({ matchCover }));
    // Router payments to other sellers: nothing matches. With 24 of them the keyed half is empty once in 2^24 runs.
    const strangers = Array.from({ length: 24 }, (_, i) => makeLog({ announcer: FAKE_ANNOUNCER, caller: FAKE_ROUTER, metaAddress: encodeMetaAddress(generateKeySet()), block: 100 + i, index: i }).log);
    const rpc = chainWithLogs(84532, 500, strangers);
    const user = await openScan(makeServices({ loadManifest: loaded, createRpc: () => Promise.resolve(withManifestChain(rpc)) }));
    await user.type(screen.getByLabelText('Start block'), '0');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    await waitFor(() => { expect(screen.getByText(/Finished\./)).toBeTruthy(); }, { timeout: 10_000 });
    expect(rpc.calls.some((c) => c.method === 'eth_getTransactionReceipt')).toBe(expected);
  });

  it('queries announcements only in whole aligned windows by default and shows what each party learns', async () => {
    generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const rpc = chainWithLogs(84532, 2500, []);
    const user = await openScan(makeServices({ loadManifest: loaded, createRpc: () => Promise.resolve(withManifestChain(rpc)) }));
    expect(screen.getByText(/Scan RPC/)).toBeTruthy();
    await user.type(screen.getByLabelText('Start block'), '1234');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    await waitFor(() => { expect(screen.getByText(/Finished\./)).toBeTruthy(); });
    const scans = rpc.calls.filter((c) => c.method === 'eth_getLogs' && (c.params[0] as { address?: string }).address?.toLowerCase() === FAKE_ANNOUNCER.toLowerCase());
    expect(scans.length).toBeGreaterThan(0);
    for (const c of scans) expect((c.params[0] as { fromBlock: bigint }).fromBlock % 1000n).toBe(0n);
  });

  it('queries the second RPC in the same aligned windows, never from the exact checkpoint (L3-F5)', async () => {
    generateSession();
    bothRpcs();
    const primary = chainWithLogs(84532, 2500, []);
    const secondary = chainWithLogs(84532, 2500, []);
    const user = await openScan(makeServices({ loadManifest: loaded, createRpc: (_c, url) => Promise.resolve(new URL(url).host === 'rpc2.test' ? secondary : withManifestChain(primary)) }));
    expect(screen.getByText(/Second RPC/)).toBeTruthy();
    await user.type(screen.getByLabelText('Start block'), '1234');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    await waitFor(() => { expect(screen.getByText(/Finished\./)).toBeTruthy(); });
    const scans = secondary.calls.filter((c) => c.method === 'eth_getLogs' && (c.params[0] as { address?: string }).address?.toLowerCase() === FAKE_ANNOUNCER.toLowerCase());
    expect(scans.length).toBeGreaterThan(0);
    for (const c of scans) expect((c.params[0] as { fromBlock: bigint }).fromBlock % 1000n).toBe(0n);
  });

  it('blocks instead of scanning directly when the private path is required but the transport is Direct', async () => {
    generateSession();
    bothRpcs();
    window.localStorage.setItem(SCAN_PRIVACY_KEY, JSON.stringify({ transport: 'direct', requireProxy: true }));
    const created: string[] = [];
    const user = await openScan(makeServices({ loadManifest: loaded, createRpc: (_c, url) => { created.push(url); return Promise.resolve(withManifestChain(chainWithLogs(84532, 500, []))); } }));
    await user.type(screen.getByLabelText('Start block'), '100');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    expect(await screen.findByText(/Require the private path/)).toBeTruthy();
    expect(created).toEqual([]);
  });

  it('never falls back to the Settings RPCs when the local proxy endpoint is down', async () => {
    generateSession();
    bothRpcs();
    window.localStorage.setItem(SCAN_PRIVACY_KEY, JSON.stringify({ transport: 'local-proxy', requireProxy: true, endpoints: { '84532': 'http://127.0.0.1:8545' } }));
    const created: string[] = [];
    const fetched: string[] = [];
    const user = await openScan(makeServices({
      loadManifest: loaded,
      createRpc: (_c, url) => { created.push(url); return Promise.resolve(withManifestChain(chainWithLogs(84532, 500, []))); },
      fetchFn: (url) => { fetched.push(url); return Promise.reject(new Error('connection refused')); },
    }));
    await user.type(screen.getByLabelText('Start block'), '100');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    expect(await screen.findByText(/did not fall back/)).toBeTruthy();
    expect(created).toEqual([]);
    expect(fetched.length).toBeGreaterThan(0);
    expect(fetched.every((u) => u.startsWith('http://127.0.0.1:8545'))).toBe(true);
  });
});
