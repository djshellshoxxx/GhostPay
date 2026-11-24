// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../locales/en.json';
import es from '../../locales/es.json';
import { App } from '../App';
import { I18nProvider, useI18n } from '../i18n/context';
import * as languages from '../i18n/languages';
import { SOURCE_TRANSLATOR } from '../i18n/source';
import { SCAN_PRIVACY_KEY } from '../lib/scanPrivacy';
import { describeAnonymitySet } from '../lib/scanSpam';
import type { Services } from '../lib/services';
import { clearSession, generateSession } from '../lib/session';
import { SETTINGS_KEY } from '../lib/settings';
import { makeLog } from '../test/announcements';
import { FAKE_ANNOUNCER, FAKE_ROUTER } from '../test/fakeManifest';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { chainWithLogs } from '../test/mockChain';
import { makeServices, renderWith } from '../test/render';

const translated = {
  ...en.messages,
  'scanPrivacy.blocked.requirePrivatePath': 'ES: se requiere la ruta privada; el escaneo directo está bloqueado.',
  'error.scanPrivacy.scanBlockedThePrivateScanEndpointCouldNotBeUsed': 'ES: el punto privado falló; no se usó otro RPC.',
  'scanPrivacy.disclosure.rpcParty': 'RPC de escaneo',
  'scanPrivacy.disclosure.ipDirect': 'su dirección IP',
  'scanPrivacy.disclosure.ipProxyExit': 'la IP de salida del proxy',
  'scanPrivacy.disclosure.logsIndexer': 'los hashes de los bloques',
  'scanPrivacy.disclosure.logsRpc': 'anuncios y {windows}',
  'scanPrivacy.disclosure.windowsFixed': 'ventanas de {blocks} bloques',
  'scanPrivacy.disclosure.rpc': '{ip}; {logs}. ES: las lecturas y los recibos revelan actividad.',
  'scanPrivacy.disclosure.indexerParty': 'Operador del índice',
  'scanPrivacy.disclosure.indexer': '{ip}; {windows}. ES: el índice puede omitir anuncios.',
  'scanPrivacy.disclosure.proxyParty': 'Proxy local',
  'scanPrivacy.disclosure.proxy': 'ES: GhostPay no puede comprobar Tor.',
  'scanPrivacy.disclosure.secondParty': 'Segundo RPC',
  'scanPrivacy.disclosure.secondDirectIp': 'su IP mediante conexión directa',
  'scanPrivacy.disclosure.secondWindowsFixed': 'las mismas ventanas de {blocks} bloques',
  'scanPrivacy.disclosure.second': '{ip}; {windows}. ES: también ve las verificaciones.',
  'scanPrivacy.disclosure.everyoneParty': 'Todos',
  'scanPrivacy.disclosure.everyonePrivate': 'ES: los datos en cadena son públicos. {notice}',
  'scanPrivacy.disclosure.firstUseNotice': 'ES: Tor no oculta los datos enviados.',
  'scan.privacySet.body': 'ES conjunto: {level}; 7d {count7d}; 30d {count30d}; {partial, select, yes {cobertura parcial} other {cobertura completa}}.',
  'scan.privacySet.low': 'bajo',
};

function LocaleControl(): ReactNode {
  const { setPreference } = useI18n();
  return <><button type="button" onClick={() => { setPreference('es'); }}>Test Spanish</button><button type="button" onClick={() => { setPreference('en'); }}>Test English</button></>;
}

function mount(services: Services): void {
  renderWith(<I18nProvider initialPreference="en" target={null} onIssue={() => undefined} loader={(locale) => Promise.resolve(locale === 'es' ? { ...es, messages: translated } : en)}><LocaleControl /><App /></I18nProvider>, services);
}

const loaded: Services['loadManifest'] = (id) => Promise.resolve({ status: 'loaded', manifest: backedManifest(id), trust: 'unsigned-dev', warning: 'UNSIGNED DEV MANIFEST: test.' });
const settingsBytes = (): readonly (string | null)[] => [window.localStorage.getItem(SETTINGS_KEY), window.localStorage.getItem(SCAN_PRIVACY_KEY)];
const formValues = (section: HTMLElement): unknown => Array.from(section.querySelectorAll('input, select')).map((element) => {
  const control = element as HTMLInputElement | HTMLSelectElement;
  return { id: control.id, value: control.value, checked: control instanceof HTMLInputElement ? control.checked : undefined };
});

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  // Only this test loader simulates an approved translation to exercise current-locale rendering.
  vi.spyOn(languages, 'isReviewed').mockImplementation((locale) => locale === 'es');
});
afterEach(() => { vi.restoreAllMocks(); clearSession(); });

async function openScan(services: Services): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  mount(services);
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Scan and receive' }));
  await user.selectOptions(screen.getByLabelText('Chain'), screen.getByRole('option', { name: 'Base Sepolia' }));
  return user;
}

describe('supported scan privacy copy follows the current locale without replay', () => {
  it('updates Settings party names and nested disclosures while preserving unsaved fields and stored settings, without contacting either endpoint', async () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrlsSecondary: { '84532': 'https://secondary.test' } }));
    window.localStorage.setItem(SCAN_PRIVACY_KEY, JSON.stringify({ transport: 'direct', windowBlocks: 1000 }));
    const saved = settingsBytes();
    const services = makeServices();
    const fetch = vi.spyOn(services, 'fetchFn');
    const rpc = vi.spyOn(services, 'createRpc');
    const worker = vi.spyOn(services, 'createScanWorker');
    const user = userEvent.setup();
    mount(services);
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Settings' }));
    const section = screen.getByRole('group', { name: 'Scan privacy' });
    await user.selectOptions(within(section).getByLabelText('Scan transport'), 'local-proxy');
    await user.selectOptions(within(section).getByLabelText('Announcement source'), 'indexer');
    await user.type(within(section).getByLabelText('Base Sepolia scan endpoint'), 'http://127.0.0.1:8545/private-path');
    await user.type(within(section).getByLabelText('Base Sepolia indexer URL'), 'http://127.0.0.1:9000/indexer');
    await user.clear(within(section).getByLabelText('Fixed scan window (blocks, 0 = off)'));
    await user.type(within(section).getByLabelText('Fixed scan window (blocks, 0 = off)'), '1234');
    const values = formValues(section);
    const source = within(section).getByRole('list').textContent;
    expect(source).toContain('the same fixed 1234-block windows');
    expect(source).toContain('Your IP address (it is contacted directly, not through the proxy)');
    await user.click(screen.getByRole('button', { name: 'Test Spanish' }));
    expect(await within(section).findByText('RPC de escaneo:')).toBeTruthy();
    expect(within(section).getByRole('list').textContent).toContain('Operador del índice: la IP de salida del proxy; ventanas de 1234 bloques.');
    expect(within(section).getByRole('list').textContent).toContain('Segundo RPC: su IP mediante conexión directa; las mismas ventanas de 1234 bloques.');
    expect(within(section).getByRole('list').textContent).toContain('ES: Tor no oculta los datos enviados.');
    expect(formValues(section)).toEqual(values);
    expect(settingsBytes()).toEqual(saved);
    await user.click(screen.getByRole('button', { name: 'Test English' }));
    await waitFor(() => { expect(within(section).getByRole('list').textContent).toBe(source); });
    expect(formValues(section)).toEqual(values);
    expect(settingsBytes()).toEqual(saved);
    expect(fetch).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(worker).not.toHaveBeenCalled();
  });

  it('updates an already blocked scan and its disclosures without another scan or settings changes', async () => {
    generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' }, rpcUrlsSecondary: { '84532': 'https://secondary.test' } }));
    window.localStorage.setItem(SCAN_PRIVACY_KEY, JSON.stringify({ transport: 'direct', requireProxy: true }));
    const saved = settingsBytes();
    const services = makeServices({ loadManifest: loaded });
    const fetch = vi.spyOn(services, 'fetchFn');
    const rpc = vi.spyOn(services, 'createRpc');
    const worker = vi.spyOn(services, 'createScanWorker');
    const user = await openScan(services);
    await user.type(screen.getByLabelText('Start block'), '100');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    const source = SOURCE_TRANSLATOR.t('scanPrivacy.blocked.requirePrivatePath');
    expect(await screen.findByText(source)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Test Spanish' }));
    expect(await screen.findByText(translated['scanPrivacy.blocked.requirePrivatePath'])).toBeTruthy();
    expect(screen.getByText('RPC de escaneo:').parentElement?.textContent).toContain('su dirección IP; anuncios y ventanas de 1000 bloques.');
    expect(screen.getByLabelText<HTMLInputElement>('Start block').value).toBe('100');
    expect(settingsBytes()).toEqual(saved);
    await user.click(screen.getByRole('button', { name: 'Test English' }));
    expect(await screen.findByText(source)).toBeTruthy();
    expect(settingsBytes()).toEqual(saved);
    expect(fetch).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(worker).not.toHaveBeenCalled();
  });

  it('renders a private-endpoint failure settling after a language change with its safe descriptor and never falls back or retries for the locale', async () => {
    generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' }, rpcUrlsSecondary: { '84532': 'https://secondary.test' } }));
    window.localStorage.setItem(SCAN_PRIVACY_KEY, JSON.stringify({ transport: 'local-proxy', requireProxy: true, endpoints: { '84532': 'http://127.0.0.1:8545' } }));
    const saved = settingsBytes();
    let reject: ((error: Error) => void) | undefined;
    const response = new Promise<Response>((_resolve, fail) => { reject = fail; });
    const fetch = vi.fn<Services['fetchFn']>(() => response);
    const services = makeServices({ loadManifest: loaded, fetchFn: fetch });
    const rpc = vi.spyOn(services, 'createRpc');
    const worker = vi.spyOn(services, 'createScanWorker');
    const user = await openScan(services);
    await user.type(screen.getByLabelText('Start block'), '100');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    await waitFor(() => { expect(fetch).toHaveBeenCalledTimes(1); });
    await user.click(screen.getByRole('button', { name: 'Test Spanish' }));
    await screen.findByText('RPC de escaneo:');
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => { reject?.(new Error('sensitive endpoint response')); await Promise.resolve(); });
    expect(await screen.findByText(translated['error.scanPrivacy.scanBlockedThePrivateScanEndpointCouldNotBeUsed'])).toBeTruthy();
    expect(screen.queryByText(/sensitive endpoint response/)).toBeNull();
    // The transport retains its normal retry budget; every attempt stays on the configured private endpoint.
    const attempts = fetch.mock.calls.slice();
    expect(attempts.every(([url]) => url === 'http://127.0.0.1:8545/')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Test English' }));
    expect(await screen.findByText(SOURCE_TRANSLATOR.t('error.scanPrivacy.scanBlockedThePrivateScanEndpointCouldNotBeUsed'))).toBeTruthy();
    expect(fetch.mock.calls).toEqual(attempts);
    expect(rpc).not.toHaveBeenCalled();
    expect(worker).not.toHaveBeenCalled();
    expect(settingsBytes()).toEqual(saved);
  });

  it('updates a completed scan privacy-set statement without changing counts, checkpoints, requests or the selected range', async () => {
    const session = generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const saved = settingsBytes();
    const announcement = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: session.metaAddress, block: 1500, index: 0, caller: FAKE_ROUTER, wrongTag: true });
    const rpc = chainWithLogs(84532, 2500, [announcement.log]);
    const createRpc = vi.fn(() => Promise.resolve(withManifestChain(rpc)));
    const services = makeServices({ loadManifest: loaded, createRpc });
    const fetch = vi.spyOn(services, 'fetchFn');
    const worker = vi.spyOn(services, 'createScanWorker');
    const checkpoint = vi.spyOn(services.checkpoints, 'save');
    const user = await openScan(services);
    await user.type(screen.getByLabelText('Start block'), '1234');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    const source = describeAnonymitySet({ level: 'low', count7d: 1, count30d: 1, partial: true });
    expect(await screen.findByText(source)).toBeTruthy();
    const calls = rpc.calls.slice();
    const checkpoints = checkpoint.mock.calls.slice();
    const workers = worker.mock.calls.length;
    const connections = createRpc.mock.calls.length;
    expect(workers).toBe(1);
    expect(checkpoints.length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Test Spanish' }));
    expect(await screen.findByText('ES conjunto: bajo; 7d 1; 30d 1; cobertura parcial.')).toBeTruthy();
    expect(screen.getByText('RPC de escaneo:')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Test English' }));
    expect(await screen.findByText(source)).toBeTruthy();
    expect(rpc.calls).toEqual(calls);
    expect(checkpoint.mock.calls).toEqual(checkpoints);
    expect(worker).toHaveBeenCalledTimes(workers);
    expect(createRpc).toHaveBeenCalledTimes(connections);
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByLabelText<HTMLInputElement>('Start block').value).toBe('1234');
    expect(settingsBytes()).toEqual(saved);
  });
});
