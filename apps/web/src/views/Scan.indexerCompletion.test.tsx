// @vitest-environment jsdom
import * as chainAdapters from '@ghostpay/chain-adapters';
import { ghostPayRouterAbi, grossForNet, type Address, type Hex, type RpcLog } from '@ghostpay/chain-adapters';
import { parseMetadata } from '@ghostpay/core-crypto';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { decodeAbiParameters, encodeFunctionData } from 'viem/utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ar from '../../locales/ar.json';
import en from '../../locales/en.json';
import es from '../../locales/es.json';
import ja from '../../locales/ja.json';
import { App } from '../App';
import type { Catalog, CatalogLoader } from '../i18n/catalog';
import { I18nProvider, useI18n } from '../i18n/context';
import * as languages from '../i18n/languages';
import { SECURITY_KEY_GROUPS } from '../i18n/securityKeys';
import type { ReconciliationVaultStore } from '../lib/reconciliationVault';
import * as scanClient from '../lib/scanClient';
import { DEFAULT_SCAN_PRIVACY, SCAN_PRIVACY_KEY, saveScanPrivacy, type ScanLogSource } from '../lib/scanPrivacy';
import type { Services } from '../lib/services';
import { captureSessionGuard, clearSession, generateSession, revealViewingKey } from '../lib/session';
import { SETTINGS_KEY } from '../lib/settings';
import { makeLog, type MadeLog } from '../test/announcements';
import { FAKE_ANNOUNCER, FAKE_ROUTER } from '../test/fakeManifest';
import { InlineWorker } from '../test/inlineWorker';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { blockHash, chainWithLogs } from '../test/mockChain';
import { makeServices, renderWith } from '../test/render';

const CHAIN_ID = 84532;
const CAVEAT_KEY = 'scan.done.indexerCaveat';
const CAVEAT = 'An indexer can omit announcements even when block hashes match. These results may be missing payments.';
const SPANISH_CAVEAT = 'ES: El índice puede omitir anuncios aunque coincidan los hashes de bloques. Estos resultados pueden no mostrar todos los pagos.';
const OTHER = '0x9999999999999999999999999999999999999999' as Address;
const PAYER = '0x2222222222222222222222222222222222222222' as Address;
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const catalogs: Readonly<Record<string, Catalog>> = { en, es, ja, ar };
const loaded: Services['loadManifest'] = (id) => Promise.resolve({ status: 'loaded', manifest: backedManifest(id), trust: 'unsigned-dev', warning: 'UNSIGNED DEV MANIFEST: test.' });
let vaultData = new Map<string, string>();
let releasePending: (() => void)[] = [];

// Keep real encryption, evidence handling and guarded writes; jsdom only needs a substitute storage backend.
vi.mock('../lib/reconciliationVault', async (original) => {
  const actual = await original<typeof import('../lib/reconciliationVault')>();
  return { ...actual, createCurrentReconciliationVault: async (chainId: number, sellerKeyId: string) => {
    const store: ReconciliationVaultStore = {
      read: (key) => Promise.resolve(vaultData.get(key) ?? null),
      compareAndSwap: (key, expected, next, guard) => {
        guard();
        if ((vaultData.get(key) ?? null) !== expected) return Promise.resolve(false);
        vaultData.set(key, next);
        return Promise.resolve(true);
      },
    };
    const vault = new actual.ReconciliationVault(store, { chainId, sellerKeyId }, captureSessionGuard());
    await vault.unlock(revealViewingKey());
    return vault;
  } };
});

beforeEach(() => {
  clearSession();
  vaultData = new Map();
  releasePending = [];
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(1_800_000_000_000);
});

afterEach(async () => {
  cleanup();
  await act(async () => { releasePending.forEach((release) => { release(); }); await Promise.resolve(); });
  clearSession();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function saveSource(source: ScanLogSource): void {
  expect(saveScanPrivacy(window.localStorage, { ...DEFAULT_SCAN_PRIVACY, source, indexerUrls: { [CHAIN_ID]: 'https://indexer.test' } })).toBe(true);
}

function indexerAnnouncement(log: RpcLog): Record<string, unknown> {
  const [ephemeralPublicKey, metadata] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], log.data as Hex);
  return {
    schemeId: '1', stealthAddress: `0x${log.topics[2]!.slice(26)}`, caller: `0x${log.topics[3]!.slice(26)}`,
    ephemeralPublicKey, metadata, blockNumber: BigInt(log.blockNumber).toString(), blockHash: log.blockHash,
    logIndex: Number(BigInt(log.logIndex)), transactionHash: log.transactionHash,
  };
}

function paymentEvidence(made: MadeLog) {
  const announcement = made.log;
  const [ephemeral, metadata] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], announcement.data as Hex);
  const parsed = parseMetadata(metadata);
  if (parsed.kind !== 'erc20') throw new Error('ERC20 fixture required');
  const transfer = {
    address: parsed.token.toLowerCase(), topics: [TRANSFER_TOPIC, `0x${PAYER.slice(2).padStart(64, '0')}`, announcement.topics[2]!],
    data: `0x${parsed.netAmount.toString(16).padStart(64, '0')}`, blockNumber: announcement.blockNumber,
    blockHash: announcement.blockHash, transactionHash: announcement.transactionHash, logIndex: '0x0',
  };
  const common = { to: FAKE_ROUTER, from: PAYER, blockHash: announcement.blockHash, blockNumber: announcement.blockNumber };
  return {
    transfer, hash: announcement.transactionHash,
    receipt: { ...common, status: '0x1', transactionHash: announcement.transactionHash, logs: [transfer, announcement] },
    transaction: { ...common, hash: announcement.transactionHash, value: '0x0', input: encodeFunctionData({
      abi: ghostPayRouterAbi, functionName: 'payERC20',
      args: [parsed.token, made.stealthAddress as Address, grossForNet(parsed.netAmount), parsed.netAmount, 9999999999n, ephemeral, metadata],
    }) },
  };
}

interface FixtureOptions {
  readonly source?: ScanLogSource;
  readonly records?: 'claim' | 'mixed' | 'partial';
  readonly omit?: boolean;
  readonly pauseFrom?: number;
  readonly badHeader?: boolean;
  readonly pageBudget?: boolean;
  readonly announcementBudget?: number;
}

function fixture(o: FixtureOptions = {}) {
  const session = generateSession();
  const keyId = scanClient.checkpointKeyId(session.spendingPublicKey, session.viewingPublicKey);
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { [CHAIN_ID]: 'https://rpc.test' } }));
  saveSource(o.source ?? 'indexer');
  const make = (block: number, caller: Address = FAKE_ROUTER): MadeLog => makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: session.metaAddress, block, index: 1, caller });
  const records = o.records === 'mixed' ? [make(1200), make(1300, OTHER), make(1450)]
    : o.records === 'partial' ? [make(1200), make(2200)] : [make(1200)];
  const head = o.records === 'partial' ? 2500 : 1500;
  const evidence = o.records === 'mixed' ? [paymentEvidence(records[0]!), paymentEvidence(records[2]!)] : [];
  const rpc = chainWithLogs(CHAIN_ID, head, records.map((r) => r.log), (method, params) => {
    if (method === 'eth_getTransactionReceipt') return evidence.find((e) => e.hash === params[0])?.receipt ?? null;
    if (method === 'eth_getTransactionByHash') return evidence.find((e) => e.hash === params[0])?.transaction ?? null;
    if (method === 'eth_getLogs') {
      const filter = params[0] as { address?: string; fromBlock: bigint; toBlock: bigint };
      if (filter.address?.toLowerCase() !== FAKE_ANNOUNCER.toLowerCase()) {
        return evidence.map((e) => e.transfer).filter((t) => t.address === filter.address?.toLowerCase() && BigInt(t.blockNumber) >= filter.fromBlock && BigInt(t.blockNumber) <= filter.toBlock);
      }
    }
    return undefined;
  });
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  releasePending.push(() => { release(); });
  const fetchFn = vi.fn<Services['fetchFn']>(async (url) => {
    const parsed = new URL(url);
    if (parsed.origin !== 'https://indexer.test') throw new Error('Unexpected test endpoint');
    const from = Number(parsed.searchParams.get('from'));
    const to = Math.min(Number(parsed.searchParams.get('to')), head);
    if (o.pauseFrom !== undefined && from >= o.pauseFrom) await gate;
    const headers = Array.from({ length: to - from + 1 }, (_, i) => ({ number: String(from + i), hash: blockHash(from + i), parentHash: blockHash(from + i - 1) }));
    if (o.badHeader === true && headers[1] !== undefined) headers[1].parentHash = `0x${'ee'.repeat(32)}`;
    const announcements = o.omit === true ? [] : records.map((r) => indexerAnnouncement(r.log)).filter((a) => Number(a['blockNumber']) >= from && Number(a['blockNumber']) <= to);
    return new Response(JSON.stringify({ announcements, headers }), { status: 200 });
  });
  const createRpc = vi.fn<Services['createRpc']>(() => Promise.resolve(withManifestChain(rpc)));
  const createWorker = vi.fn(() => new InlineWorker());
  const services = makeServices({ loadManifest: loaded, createRpc, createScanWorker: createWorker, fetchFn });
  const save = vi.spyOn(services.checkpoints, 'save');
  const clear = vi.spyOn(services.checkpoints, 'clear');
  const actualRun = scanClient.runScan;
  const run = vi.spyOn(scanClient, 'runScan');
  const announcementBudget = o.announcementBudget;
  if (announcementBudget !== undefined) run.mockImplementation((params) => actualRun({ ...params, maxAnnouncementsPerScan: announcementBudget }));
  if (o.pageBudget === true) {
    // Lower the public request budget, preserving the real fetcher/scanner, so two small windows produce two pages.
    const fetchAnnouncements = chainAdapters.fetchAnnouncements;
    vi.spyOn(chainAdapters, 'fetchAnnouncements').mockImplementation((params) => fetchAnnouncements({ ...params, maxRequests: 1 }));
  }
  return { records, keyId, rpc, fetchFn, createRpc, createWorker, services, save, clear, run, release: () => { release(); } };
}

type Fixture = ReturnType<typeof fixture>;

function LocaleControl(): ReactNode {
  const { setPreference, locale, status } = useI18n();
  return <><output aria-label="Test locale">{locale}:{status}</output>{(['en', 'es', 'ja', 'ar'] as const).map((value) =>
    <button key={value} type="button" onClick={() => { setPreference(value); }}>Test {value}</button>)}</>;
}

async function openScan(f: Fixture, reviewedSpanish = false) {
  const user = userEvent.setup();
  const loader: CatalogLoader = (locale) => Promise.resolve(locale === 'es' && reviewedSpanish
    ? { ...es, messages: { ...en.messages, [CAVEAT_KEY]: SPANISH_CAVEAT, 'scan.done.finished': 'ES: terminado. {scanned} anuncios comprobados, {found} pagos encontrados.' } }
    : catalogs[locale]);
  renderWith(<I18nProvider initialPreference="en" target={null} onIssue={() => undefined} loader={loader}><LocaleControl /><App /></I18nProvider>, f.services);
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Scan and receive' }));
  await user.selectOptions(screen.getByLabelText('Chain'), screen.getByRole('option', { name: 'Base Sepolia' }));
  await user.type(screen.getByLabelText('Start block'), '1000');
  return user;
}

const scanRegion = (): HTMLElement => screen.getByRole('region', { name: 'Scan and receive' });
const liveText = (): string => document.querySelector('[role="status"][aria-atomic="true"]')?.textContent ?? '';
const checkpoint = (f: Fixture) => f.services.checkpoints.load(CHAIN_ID, f.keyId);
const effects = (f: Fixture) => ({ rpc: f.rpc.calls.slice(), indexer: f.fetchFn.mock.calls.slice(), connections: f.createRpc.mock.calls.length, workers: f.createWorker.mock.calls.length, saves: f.save.mock.calls.slice(), clears: f.clear.mock.calls.slice() });
const announcerRpcCalls = (f: Fixture) => f.rpc.calls.filter((c) => c.method === 'eth_getLogs' && (c.params[0] as { address?: string }).address?.toLowerCase() === FAKE_ANNOUNCER.toLowerCase());

async function resultOf(f: Fixture): ReturnType<typeof scanClient.runScan> {
  const result = f.run.mock.results[0];
  if (result?.type !== 'return') throw new Error('The real scanner must return a result');
  return result.value;
}

async function startAndFinish(f: Fixture, user: Awaited<ReturnType<typeof openScan>>) {
  await user.click(screen.getByRole('button', { name: 'Start scan' }));
  const done = await within(scanRegion()).findByText(/^Finished\./);
  expect(f.run).toHaveBeenCalledTimes(1);
  return done;
}

function expectCaveat(done: HTMLElement, announcement = 'Scan finished.'): void {
  // Soft assertions still fail the regression while allowing the unchanged evidence/checkpoint controls to run.
  expect.soft(done.textContent).toContain(CAVEAT);
  expect.soft(liveText()).toBe(`${announcement} ${CAVEAT}`);
  expect(done.closest('details')).toBeNull();
  expect(liveText()).not.toMatch(/0x[0-9a-f]|announcements checked|payments found/);
}

describe('indexer completion retains the source and its omission limit (P14 F3)', () => {
  it('discloses an empty result that omitted a real payment within genuine headers, with the details closed', async () => {
    const f = fixture({ omit: true });
    const user = await openScan(f);
    const done = await startAndFinish(f, user);
    expect(done.textContent).toContain('Finished. 0 announcements checked, 0 payments found.');
    expect(done.textContent).toContain('Started at block 1000.');
    expectCaveat(done);
    expect(screen.getByText(en.messages['scan.disclosure.summary']).closest('details')?.open).toBe(false);
    expect(screen.getByText('No payments found yet.')).toBeTruthy();
    expect(screen.queryByText(f.records[0]!.stealthAddress)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(f.fetchFn).toHaveBeenCalledTimes(1);
    expect(new URL(f.fetchFn.mock.calls[0]![0]).searchParams.get('from')).toBe('1000');
    // The indexer source keeps the public request padded; its genuine header response ends at the RPC head.
    expect(new URL(f.fetchFn.mock.calls[0]![0]).searchParams.get('to')).toBe('1999');
    expect(announcerRpcCalls(f)).toEqual([]);
    expect(checkpoint(f)).toEqual({ nextBlock: 1401n, last: { number: 1400n, hash: blockHash(1400) } });
    expect((await resultOf(f)).discrepancies).toEqual([]);
  });

  it('keeps verified, claimed and pending evidence and all counts when the indexer returns payments', async () => {
    const f = fixture({ records: 'mixed' });
    const user = await openScan(f);
    const done = await startAndFinish(f, user);
    const result = await resultOf(f);
    expect(result.matches.map((m) => m.receipt)).toEqual(['verified', 'claimed', 'pending']);
    expect(result.matches.map((m) => m.stealthAddress)).toEqual(f.records.map((r) => r.stealthAddress));
    expect(done.textContent).toContain('Finished. 3 announcements checked, 3 payments found.');
    expectCaveat(done);
    for (const record of f.records) expect(screen.getAllByText(record.stealthAddress).length).toBeGreaterThan(0);
    expect(screen.getByText(/this is a direct announcement claim/)).toBeTruthy();
    expect(screen.getByText(/waiting for enough confirmations/)).toBeTruthy();
    expect(screen.getByText('Seller-signed receipt')).toBeTruthy();
    expect(checkpoint(f)?.nextBlock).toBe(1401n);
    expect(result.discrepancies).toEqual([]);
    expect(announcerRpcCalls(f)).toEqual([]);
  });

  it('keeps RPC completion free of the indexer caveat even with an indexer URL saved', async () => {
    const f = fixture({ source: 'rpc' });
    const user = await openScan(f);
    const done = await startAndFinish(f, user);
    expect(done.textContent).toContain('Finished. 1 announcements checked, 1 payments found.');
    expect(done.textContent).not.toContain(CAVEAT);
    expect(liveText()).toBe('Scan finished.');
    expect((await resultOf(f)).matches.map((m) => m.receipt)).toEqual(['claimed']);
    expect(f.fetchFn).not.toHaveBeenCalled();
    expect(announcerRpcCalls(f).length).toBeGreaterThan(0);
  });

  it.each(['indexer', 'rpc'] as const)('retains a completed %s result when saved source settings change without scanning again', async (source) => {
    const f = fixture({ source, omit: true });
    const user = await openScan(f);
    const done = await startAndFinish(f, user);
    const original = done.textContent;
    const announcement = liveText();
    const before = effects(f);
    const savedCheckpoint = checkpoint(f);
    if (source === 'indexer') expectCaveat(done);
    else expect(done.textContent).not.toContain(CAVEAT);
    act(() => { saveSource(source === 'indexer' ? 'rpc' : 'indexer'); });
    // A form edit re-renders the current settings disclosure, but does not authorize another scan.
    await user.type(screen.getByLabelText('Start block'), '1');
    expect(screen.queryByText('Indexer operator:') !== null).toBe(source === 'rpc');
    expect(done.textContent).toBe(original);
    expect(liveText()).toBe(announcement);
    expect.soft(done.textContent?.includes(CAVEAT)).toBe(source === 'indexer');
    expect(effects(f)).toEqual(before);
    expect(checkpoint(f)).toEqual(savedCheckpoint);
    expect(f.run).toHaveBeenCalledTimes(1);
  });

  it.each(['es', 'ja', 'ar'] as const)('keeps the security caveat in English for the unreviewed %s catalog without replay', async (locale) => {
    const f = fixture({ omit: true });
    const user = await openScan(f);
    const done = await startAndFinish(f, user);
    const before = effects(f);
    const saved = window.localStorage.getItem(SCAN_PRIVACY_KEY);
    await user.click(screen.getByRole('button', { name: `Test ${locale}` }));
    await waitFor(() => { expect(screen.getByLabelText('Test locale').textContent).toBe(`${locale}:ready`); });
    expect(languages.isReviewed(locale)).toBe(false);
    expect.soft(SECURITY_KEY_GROUPS.scanPrivacyAndOutcomes as readonly string[]).toContain(CAVEAT_KEY);
    expect.soft(catalogs[locale]?.messages[CAVEAT_KEY]).toBeTypeOf('string');
    expect.soft(done.textContent).toContain(CAVEAT);
    expect(done.textContent).toContain('Finished. 0 announcements checked, 0 payments found.');
    expect(effects(f)).toEqual(before);
    expect(window.localStorage.getItem(SCAN_PRIVACY_KEY)).toBe(saved);
  });

  it('retranslates a completed descriptor only for a reviewed locale, without changing counts or replaying side effects', async () => {
    // Simulate review only for this test catalog; production review status and translations are untouched.
    vi.spyOn(languages, 'isReviewed').mockImplementation((locale) => locale === 'es');
    const f = fixture({ omit: true });
    const user = await openScan(f, true);
    const done = await startAndFinish(f, user);
    const before = effects(f);
    await user.click(screen.getByRole('button', { name: 'Test es' }));
    await waitFor(() => { expect(done.textContent).toContain('ES: terminado. 0 anuncios comprobados, 0 pagos encontrados.'); });
    expect.soft(done.textContent).toContain(SPANISH_CAVEAT);
    expect(done.textContent).not.toContain(CAVEAT);
    await user.click(screen.getByRole('button', { name: 'Test en' }));
    await waitFor(() => { expect(done.textContent).toContain('Finished. 0 announcements checked, 0 payments found.'); });
    expect.soft(done.textContent).toContain(CAVEAT);
    expect(effects(f)).toEqual(before);
    expect(f.run).toHaveBeenCalledTimes(1);
  });

  it('uses the current reviewed locale when an indexer answer settles after a language change', async () => {
    vi.spyOn(languages, 'isReviewed').mockImplementation((locale) => locale === 'es');
    const f = fixture({ omit: true, pauseFrom: 1000 });
    const user = await openScan(f, true);
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    await waitFor(() => { expect(f.fetchFn).toHaveBeenCalledTimes(1); });
    await user.click(screen.getByRole('button', { name: 'Test es' }));
    await waitFor(() => { expect(screen.getByLabelText('Test locale').textContent).toBe('es:ready'); });
    expect(f.run).toHaveBeenCalledTimes(1);
    expect(f.save).not.toHaveBeenCalled();
    await act(async () => { f.release(); await Promise.resolve(); });
    const done = await within(scanRegion()).findByText(/^ES: terminado\. 0 anuncios comprobados, 0 pagos encontrados\./);
    expect.soft(done.textContent).toContain(SPANISH_CAVEAT);
    expect.soft(liveText()).toBe(`Scan finished. ${SPANISH_CAVEAT}`);
    expect(f.fetchFn).toHaveBeenCalledTimes(1);
    expect(f.run).toHaveBeenCalledTimes(1);
    expect(checkpoint(f)?.nextBlock).toBe(1401n);
  });

  it('retains partial evidence and the checkpoint on cancel, with a cancelled accessible outcome and the caveat', async () => {
    const f = fixture({ records: 'partial', pauseFrom: 2000, pageBudget: true });
    const user = await openScan(f);
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    await waitFor(() => { expect(f.fetchFn).toHaveBeenCalledTimes(2); });
    expect(screen.getByText(f.records[0]!.stealthAddress)).toBeTruthy();
    const saved = checkpoint(f);
    const saves = f.save.mock.calls.slice();
    expect(saved?.nextBlock).toBe(1200n);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await act(async () => { f.release(); await Promise.resolve(); });
    const done = await within(scanRegion()).findByText(/^Cancelled\. 1 announcements checked\./);
    expectCaveat(done, en.messages['scan.done.cancelledEarly']);
    expect.soft(liveText()).not.toContain('Scan finished.');
    expect(within(scanRegion()).queryByText(/^Finished\./)).toBeNull();
    expect(screen.getByText(f.records[0]!.stealthAddress)).toBeTruthy();
    expect(screen.queryByText(f.records[1]!.stealthAddress)).toBeNull();
    expect((await resultOf(f)).matches.map((m) => m.receipt)).toEqual(['claimed']);
    expect(checkpoint(f)).toEqual(saved);
    expect(f.save.mock.calls).toEqual(saves);
    expect(f.fetchFn).toHaveBeenCalledTimes(2);
    const worker = f.createWorker.mock.results[0];
    if (worker?.type !== 'return') throw new Error('The real worker must be created');
    expect(worker.value.terminated).toBe(true);
  });

  it('retains the safety-limit outcome, counts, first payment and resumable checkpoint with the caveat', async () => {
    const f = fixture({ records: 'partial', pageBudget: true, announcementBudget: 1 });
    const user = await openScan(f);
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    const done = await within(scanRegion()).findByText(/^Stopped at the safety limit\./);
    expect(done.textContent).toContain('Stopped at the safety limit. 1 announcements checked, 1 payments found.');
    expectCaveat(done, 'Scan stopped at the safety limit.');
    expect(screen.getByRole('alert').textContent).toContain('resume from block 2000 to continue');
    expect(within(scanRegion()).queryByText(/^Finished\./)).toBeNull();
    expect(screen.getByText(f.records[0]!.stealthAddress)).toBeTruthy();
    expect(screen.queryByText(f.records[1]!.stealthAddress)).toBeNull();
    const result = await resultOf(f);
    expect(result).toMatchObject({ scanned: 1, limitReached: true, cursor: { nextBlock: 2000n } });
    expect(result.matches.map((m) => m.receipt)).toEqual(['claimed']);
    expect(checkpoint(f)?.nextBlock).toBe(1200n);
    expect(f.fetchFn).toHaveBeenCalledTimes(2);
  });

  it.each(['invalid headers', 'changed route'] as const)('keeps %s as a failed scan without inventing successful completion or a checkpoint', async (failure) => {
    const f = fixture({ badHeader: failure === 'invalid headers', ...(failure === 'changed route' ? { pauseFrom: 1000 } : {}) });
    const user = await openScan(f);
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    if (failure === 'changed route') {
      await waitFor(() => { expect(f.fetchFn).toHaveBeenCalledTimes(1); });
      act(() => { saveSource('rpc'); });
      await act(async () => { f.release(); await Promise.resolve(); });
    }
    const error = await within(scanRegion()).findByRole('alert');
    if (failure === 'changed route') expect(error.textContent).toContain(en.messages['scanPrivacy.blocked.routeChanged']);
    else expect(error.textContent).toContain('RPC_FAILURE');
    expect(within(scanRegion()).queryByText(/^Finished\.|^Stopped at the safety limit\.|^Cancelled\./)).toBeNull();
    expect(within(scanRegion()).queryByText(CAVEAT, { exact: false })).toBeNull();
    expect(liveText()).not.toContain('Scan finished.');
    expect(checkpoint(f)).toBeUndefined();
    expect(f.save).not.toHaveBeenCalled();
    expect(f.fetchFn).toHaveBeenCalledTimes(1);
    expect(announcerRpcCalls(f)).toEqual([]);
    expect(f.createRpc).toHaveBeenCalledTimes(1);
  });
});
