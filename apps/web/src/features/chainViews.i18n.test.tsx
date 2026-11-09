// @vitest-environment jsdom
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { base58, bech32 } from '@scure/base';
import { tronAddressFromHex } from '@ghostpay/tron-adapter';
import * as btcSweep from './btc/sweep';
import * as solSweep from './solana/sweep';
import * as tronSweep from './tron/sweep';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, useI18n } from '../i18n/context';
import * as languages from '../i18n/languages';
import { makeServices, renderWith } from '../test/render';
import { BtcView } from './btc/BtcView';
import { mockChain as btcChain, SEED_A as BTC_SEED, walletA as btcWallet } from './btc/fixtures.testutil';
import { SolanaView } from './solana/SolanaView';
import { mockChain as solChain, SEED_A as SOL_SEED, DEST as SOL_DEST, walletA as solWallet } from './solana/fixtures.testutil';
import { TronView } from './tron/TronView';
import { mockTron, BACKUP_A, DEST as TRON_DEST, walletA as tronWallet } from './tron/fixtures.testutil';
import en from '../../locales/en.json';
import es from '../../locales/es.json';

const BCRT = bech32.encode('bcrt', [0, ...bech32.toWords(new Uint8Array(20).fill(3))]);
const PRIVATE_DIAGNOSTIC = 'private seed and provider credential must not reach UI state';
const WRONG_REFERENCE = 'f'.repeat(64);
type User = ReturnType<typeof userEvent.setup>;
type Chain = { readonly fetchFn: (url: string, init: RequestInit) => Promise<Response>; readonly calls: string[]; readonly broadcasts: string[] };
type Fixture = { readonly name: string; readonly prefix: string; readonly make: () => Chain; readonly view: ReactNode; readonly net: string; readonly endpointLabel: RegExp; readonly endpoint: string; readonly seed: string; readonly importLabel: RegExp; readonly importAction: string; readonly first: RegExp; readonly found: RegExp; readonly destination: string };
const FIXTURES: readonly Fixture[] = [
  { name: 'Bitcoin', prefix: 'btc', make: () => { const chain = btcChain('regtest', btcWallet()); return { ...chain, calls: chain.requests }; }, view: <BtcView />, net: 'regtest', endpointLabel: /Esplora server URL/, endpoint: 'https://esplora.test/api', seed: BTC_SEED, importLabel: /Or import a seed/, importAction: 'Import seed', first: /First block height/, found: /1 unspent payment/, destination: BCRT },
  { name: 'Solana', prefix: 'sol', make: () => solChain('localnet', solWallet()), view: <SolanaView />, net: 'localnet', endpointLabel: /RPC server URL/, endpoint: 'http://127.0.0.1:8899', seed: SOL_SEED, importLabel: /Or import a seed/, importAction: 'Import seed', first: /First slot/, found: /1 funded payment/, destination: SOL_DEST },
  { name: 'TRON', prefix: 'tron', make: () => mockTron(tronWallet()), view: <TronView />, net: 'local', endpointLabel: /Node URL/, endpoint: 'http://127.0.0.1:9090', seed: BACKUP_A, importLabel: /Or import keys/, importAction: 'Import keys', first: /First block/, found: /1 funded payment/, destination: TRON_DEST },
];
function LocaleControl(): ReactNode {
  const { setPreference } = useI18n();
  return <><button type="button" onClick={() => { setPreference('es'); }}>Test Spanish</button><button type="button" onClick={() => { setPreference('en'); }}>Test English</button></>;
}
function localized(view: ReactNode): ReactNode {
  return <I18nProvider initialPreference="en" onIssue={() => undefined} loader={(locale) => Promise.resolve(locale === 'es' ? {
    ...es, messages: {
      ...en.messages,
      'btc.scan.scanned': 'Bloques {from} a {to}.',
      'sol.scanned': 'Ranuras {from} a {to}.',
      'tron.scanned': 'Bloques TRON {from} a {to}.',
      'btc.headers.verified': 'Cabeceras comprobadas: {height}, {hash}.',
      'chainView.broadcast.attempted': 'Enviando transacción {reference}…',
      'chainView.broadcast.pending': 'Acuse de recibo para {reference}; falta confirmar.',
      'chainView.broadcast.unknown': 'Resultado desconocido para {reference}; comprobar antes de repetir.',
      'chainView.broadcast.mismatch': 'Referencia diferente; comprobar {reference}.',
    },
  } : en)}><LocaleControl />{view}</I18nProvider>;
}
beforeEach(() => {
  window.localStorage.clear();
  // Test-only reviewed copy proves deferred rendering. Production security translations remain unreviewed.
  vi.spyOn(languages, 'isReviewed').mockImplementation((locale) => locale === 'es');
});
afterEach(() => { vi.restoreAllMocks(); });
function isBroadcast(f: Fixture, url: string, init: RequestInit): boolean {
  if (f.prefix === 'btc') return new URL(url).pathname.endsWith('/tx') && init.method === 'POST';
  if (f.prefix === 'tron') return new URL(url).pathname.endsWith('/wallet/broadcasthex');
  return (JSON.parse(typeof init.body === 'string' ? init.body : '{}') as { method: string }).method === 'sendTransaction';
}
async function prepare(f: Fixture, fetchFn: Chain['fetchFn']): Promise<User> {
  const user = userEvent.setup();
  renderWith(localized(f.view), makeServices({ fetchFn }));
  await user.selectOptions(screen.getByLabelText('Network'), f.net);
  await user.type(screen.getByLabelText(f.endpointLabel), f.endpoint);
  await user.type(screen.getByLabelText(f.importLabel), f.seed);
  await user.click(screen.getByRole('button', { name: f.importAction }));
  await user.type(screen.getByLabelText(f.first), '0');
  await user.click(screen.getByRole('button', { name: 'Scan' }));
  await screen.findByText(f.found);
  return user;
}
async function review(f: Fixture, user: User, destination = f.destination): Promise<void> {
  if (f.prefix === 'btc') {
    const checkbox = screen.getByRole<HTMLInputElement>('checkbox', { name: /^Sweep / });
    if (!checkbox.checked) await user.click(checkbox);
  }
  await user.clear(screen.getByLabelText('Destination address'));
  await user.type(screen.getByLabelText('Destination address'), destination);
  await user.click(screen.getByRole('button', { name: 'Review sweep' }));
  await screen.findByText('Review before signing');
}
async function sign(f: Fixture, user: User, destination = f.destination): Promise<string> {
  await review(f, user, destination);
  await user.click(screen.getByRole('checkbox', { name: /I checked the destination/ }));
  await user.click(screen.getByRole('button', { name: 'Sign with software key' }));
  await screen.findByText('Signed transaction');
  const reference = document.getElementById(`${f.prefix}-signed-h`)?.parentElement?.querySelector('code')?.textContent;
  expect(reference).toBeTruthy();
  return reference ?? '';
}
describe.each(FIXTURES)('$name outcomes use the current locale without repeating authority actions', (f) => {
  it('rerenders completed scans, a pending broadcast and its acknowledgement without changing signed bytes or references', async () => {
    const chain = f.make();
    let release: (() => void) | undefined;
    const user = await prepare(f, async (url, init) => {
      const response = await chain.fetchFn(url, init);
      if (isBroadcast(f, url, init)) await new Promise<void>((resolve) => { release = resolve; });
      return response;
    });
    const scanCalls = [...chain.calls];
    await user.click(screen.getByRole('button', { name: 'Test Spanish' }));
    await screen.findByText(f.prefix === 'sol' ? /^Ranuras / : f.prefix === 'tron' ? /^Bloques TRON / : /^Bloques /);
    if (f.prefix === 'btc') expect(screen.getByText(/^Cabeceras comprobadas:/)).toBeTruthy();
    expect(chain.calls).toEqual(scanCalls);
    await user.click(screen.getByRole('button', { name: 'Test English' }));
    const reference = await sign(f, user);
    await user.click(screen.getByRole('button', { name: /Broadcast to/ }));
    await waitFor(() => { expect(release).toBeTypeOf('function'); });
    const sent = [...chain.broadcasts];
    const calls = [...chain.calls];
    expect(sent).toHaveLength(1);
    expect(document.querySelector('[data-transaction-phase="broadcast-attempted"]')).toBeTruthy();
    expect(screen.queryByText(en.messages['btc.signed.notSent'])).toBeNull();
    expect(screen.queryByText(en.messages['tron.signed.notSent'])).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Test Spanish' }));
    expect(await screen.findByText(`Enviando transacción ${reference}…`)).toBeTruthy();
    expect(chain.broadcasts).toEqual(sent);
    expect(chain.calls).toEqual(calls);
    await act(async () => { release?.(); await Promise.resolve(); });
    expect(await screen.findByText(`Acuse de recibo para ${reference}; falta confirmar.`)).toBeTruthy();
    expect(document.querySelector('[data-transaction-phase="pending-confirmation"]')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Test English' }));
    expect(await screen.findByText(`The server accepted transaction ${reference}. Inclusion and confirmation have not been checked.`)).toBeTruthy();
    expect(chain.broadcasts).toEqual(sent);
    expect(chain.calls).toEqual(calls);
  });
  it('retains an unknown broadcast result after a lost response, redacts its cause and changes its language without retrying', async () => {
    const chain = f.make();
    const user = await prepare(f, async (url, init) => {
      const response = await chain.fetchFn(url, init);
      if (isBroadcast(f, url, init)) throw new Error(PRIVATE_DIAGNOSTIC);
      return response;
    });
    const reference = await sign(f, user);
    await user.click(screen.getByRole('button', { name: /Broadcast to/ }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain('may have been sent'); });
    expect(screen.getByRole('alert').textContent).toContain(reference);
    expect(screen.getByRole('alert').textContent).not.toMatch(/nothing was sent/i);
    expect(document.body.textContent).not.toContain(PRIVATE_DIAGNOSTIC);
    const sent = [...chain.broadcasts];
    const calls = [...chain.calls];
    await user.click(screen.getByRole('button', { name: 'Test Spanish' }));
    expect(await screen.findByText(`Resultado desconocido para ${reference}; comprobar antes de repetir.`)).toBeTruthy();
    expect(document.querySelector('[data-transaction-phase="broadcast-unknown"]')).toBeTruthy();
    expect(screen.queryByText(en.messages['btc.signed.notSent'])).toBeNull();
    expect(screen.queryByText(en.messages['tron.signed.notSent'])).toBeNull();
    expect(chain.broadcasts).toEqual(sent);
    expect(sent).toHaveLength(1);
    expect(chain.calls).toEqual(calls);
  });
  it('drops a signing completion after its destination review was changed', async () => {
    const chain = f.make();
    const user = await prepare(f, chain.fetchFn);
    let release: (() => void) | undefined;
    async function hold<T>(operation: Promise<T>): Promise<T> {
      const result = await operation;
      await new Promise<void>((resolve) => { release = resolve; });
      return result;
    }
    if (f.prefix === 'btc') {
      const original = btcSweep.signSweep;
      vi.spyOn(btcSweep, 'signSweep').mockImplementationOnce((...args) => hold(original(...args)));
    } else if (f.prefix === 'sol') {
      const original = solSweep.signSweep;
      vi.spyOn(solSweep, 'signSweep').mockImplementationOnce((...args) => hold(original(...args)));
    } else {
      const original = tronSweep.signSweep;
      vi.spyOn(tronSweep, 'signSweep').mockImplementationOnce((...args) => hold(original(...args)));
    }
    await review(f, user);
    await user.click(screen.getByRole('checkbox', { name: /I checked the destination/ }));
    await user.click(screen.getByRole('button', { name: 'Sign with software key' }));
    await waitFor(() => { expect(release).toBeTypeOf('function'); });
    await user.clear(screen.getByLabelText('Destination address'));
    await act(async () => { release?.(); await Promise.resolve(); });
    expect(screen.queryByText('Signed transaction')).toBeNull();
    expect(screen.queryByRole('button', { name: /Broadcast to/ })).toBeNull();
    expect(chain.broadcasts).toHaveLength(0);
  });

  it('keeps an earlier broadcast reference separate when its destination is edited and a new transaction is signed', async () => {
    const chain = f.make();
    let release: (() => void) | undefined;
    const user = await prepare(f, async (url, init) => {
      const response = await chain.fetchFn(url, init);
      if (isBroadcast(f, url, init)) await new Promise<void>((resolve) => { release = resolve; });
      return response;
    });
    const first = await sign(f, user);
    await user.click(screen.getByRole('button', { name: /Broadcast to/ }));
    await waitFor(() => { expect(release).toBeTypeOf('function'); });
    await user.clear(screen.getByLabelText('Destination address'));
    expect(screen.getByRole('alert').textContent).toContain(first);
    expect(screen.getByRole('alert').textContent).toContain('may have been sent');
    await act(async () => { release?.(); await Promise.resolve(); });
    const destination = f.prefix === 'btc' ? bech32.encode('bcrt', [0, ...bech32.toWords(new Uint8Array(20).fill(4))])
      : f.prefix === 'sol' ? base58.encode(new Uint8Array(32).fill(10)) : tronAddressFromHex(`41${'0a'.repeat(20)}`);
    const second = await sign(f, user, destination);
    expect(second).not.toBe(first);
    expect(screen.getByRole('alert').textContent).toContain(first);
    expect(screen.getByRole('alert').textContent).not.toContain(second);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Broadcast to/ }).disabled).toBe(false);
    expect(screen.getByText(en.messages[f.prefix === 'tron' ? 'tron.signed.notSent' : 'btc.signed.notSent'])).toBeTruthy();
    expect(chain.broadcasts).toHaveLength(1);
    expect(document.querySelector('[data-transaction-phase="pending-confirmation"]')).toBeNull();
  });

  it('does not acknowledge a different server reference as the locally signed transaction', async () => {
    const chain = f.make();
    const user = await prepare(f, async (url, init) => {
      const response = await chain.fetchFn(url, init);
      if (!isBroadcast(f, url, init)) return response;
      if (f.prefix === 'btc') return new Response(WRONG_REFERENCE);
      if (f.prefix === 'tron') return Response.json({ result: true, txid: WRONG_REFERENCE });
      const reply = await response.json() as Record<string, unknown>;
      return Response.json({ ...reply, result: WRONG_REFERENCE });
    });
    const reference = await sign(f, user);
    await user.click(screen.getByRole('button', { name: /Broadcast to/ }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain('different transaction reference'); });
    expect(screen.getByRole('alert').textContent).toContain(reference);
    expect(screen.getByRole('alert').textContent).not.toContain(WRONG_REFERENCE);
    expect(document.querySelector('[data-transaction-phase="verification-incomplete"]')).toBeTruthy();
    expect(screen.queryByText(/The server accepted transaction/)).toBeNull();
    expect(chain.broadcasts).toHaveLength(1);
  });
});


describe.each(FIXTURES.filter((f) => f.prefix !== 'btc'))('$name authority edits', (f) => {
  it('does not broadcast through an old endpoint after that endpoint is edited during network validation', async () => {
    const chain = f.make();
    let pause = false;
    let release: (() => void) | undefined;
    const user = await prepare(f, async (url, init) => {
      const response = await chain.fetchFn(url, init);
      const body = typeof init.body === 'string' ? init.body : '{}';
      const networkCheck = f.prefix === 'sol' ? (JSON.parse(body) as { method: string }).method === 'getGenesisHash'
        : new URL(url).pathname.endsWith('/wallet/getblockbylimitnext');
      if (pause && networkCheck) await new Promise<void>((resolve) => { release = resolve; });
      return response;
    });
    await sign(f, user);
    pause = true;
    await user.click(screen.getByRole('button', { name: /Broadcast to/ }));
    await waitFor(() => { expect(release).toBeTypeOf('function'); });
    await user.clear(screen.getByLabelText(f.endpointLabel));
    await act(async () => { release?.(); await Promise.resolve(); });
    expect(chain.broadcasts).toHaveLength(0);
    expect(screen.queryByText('Signed transaction')).toBeNull();
    expect(screen.queryByRole('button', { name: /Broadcast to/ })).toBeNull();
  });
});
