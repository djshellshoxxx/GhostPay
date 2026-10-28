// @vitest-environment jsdom
import { ChainAdapterError, eip712DomainSeparator, erc20MetadataAbi, erc2612PermitAbi } from '@ghostpay/chain-adapters';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { encodeFunctionResult, keccak256 } from 'viem/utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Services } from '../lib/services';
import { clearSession, generateSession } from '../lib/session';
import * as appState from '../state';
import { MemoryKeyVaultStore, saveEncryptedVault, setKeyVaultStoreForTests } from '../lib/keyVault';
import { SETTINGS_KEY } from '../lib/settings';
import { SWEEP_JOURNAL_KEY } from '../lib/sweepAttemptJournal';
import { makeLog } from '../test/announcements';
import { FAKE_ANNOUNCER, FAKE_FEE_RECIPIENT, FAKE_ROUTER } from '../test/fakeManifest';
import { FAKE_CODE, backedManifest, withManifestChain } from '../test/manifestChain';
import { chainWithLogs } from '../test/mockChain';
import { makeServices, renderApp } from '../test/render';

beforeEach(() => {
  clearSession();
  vaultStore = new MemoryKeyVaultStore();
  setKeyVaultStoreForTests(vaultStore);
  window.localStorage.clear();
  window.sessionStorage.clear();
  appState.resetSweepAttemptsForTests();
  window.history.replaceState(null, '', '/');
});

afterEach(() => { setKeyVaultStoreForTests(undefined); });

const loaded: Services['loadManifest'] = (id) => Promise.resolve({ status: 'loaded', manifest: backedManifest(id) });
const DEST = '0x6666666666666666666666666666666666666666';
const TOKEN = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const VAULT_PASS = 'violet comet maple lantern';
let vaultStore = new MemoryKeyVaultStore();

interface RawSink { raw?: string; sendFail?: boolean; calls?: string[] }

function extra(balance: bigint, nativeBalance: bigint, rawSink: RawSink) {
  return (method: string, params: readonly unknown[]): unknown => {
    rawSink.calls?.push(method);
    switch (method) {
      case 'eth_getBalance':
        return `0x${nativeBalance.toString(16)}`;
      case 'eth_gasPrice':
        return '0x3b9aca00';
      case 'eth_getTransactionCount':
        return '0x0';
      case 'eth_estimateGas':
        return '0xc350';
      case 'eth_sendRawTransaction':
        rawSink.raw = params[0] as string;
        if (rawSink.sendFail === true) throw new ChainAdapterError('RPC_FAILURE', 'connection reset after write');
        return keccak256(params[0] as `0x${string}`);
      case 'eth_call': {
        const data = (params[0] as { data: string }).data;
        if (data.startsWith('0x70a08231')) return `0x${balance.toString(16).padStart(64, '0')}`;
        if (data.startsWith('0x06fdde03')) return encodeFunctionResult({ abi: erc20MetadataAbi, functionName: 'name', result: 'USDC' });
        if (data.startsWith('0x7ecebe00')) return encodeFunctionResult({ abi: erc2612PermitAbi, functionName: 'nonces', result: 0n });
        return eip712DomainSeparator({ name: 'USDC', version: '2', chainId: 84532, verifyingContract: TOKEN });
      }
      default:
        return undefined;
    }
  };
}

/** Scans one payment, then opens the Sweep view for it. */
async function toSweep(opts: { balance?: bigint; native?: bigint; relayer?: boolean; fetchFn?: Services['fetchFn']; raw?: RawSink; code?: Record<string, string>; unsigned?: boolean; vaultPass?: string } = {}): Promise<ReturnType<typeof userEvent.setup>> {
  const pub = generateSession();
  if (opts.vaultPass !== undefined) await saveEncryptedVault(opts.vaultPass, { N: 1 << 14 });
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' }, ...(opts.relayer === true ? { relayerUrl: 'https://relay.test' } : {}) }));
  const mine = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: pub.metaAddress, block: 50, index: 0, caller: FAKE_ROUTER, amount: 5_000_000n });
  const rpc = chainWithLogs(84532, 100, [mine.log], extra(opts.balance ?? 5_000_000n, opts.native ?? 10n ** 17n, opts.raw ?? {}));
  const user = userEvent.setup();
  renderApp(makeServices({ loadManifest: opts.unsigned === true ? (id) => Promise.resolve({ status: 'loaded', manifest: backedManifest(id), trust: 'unsigned-dev', warning: 'UNSIGNED DEV MANIFEST (test)' }) : loaded, createRpc: () => Promise.resolve(withManifestChain(rpc, { code: opts.code ?? FAKE_CODE })), ...(opts.fetchFn === undefined ? {} : { fetchFn: opts.fetchFn }) }));
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Scan and receive' }));
  await user.selectOptions(screen.getByLabelText('Chain'), screen.getByRole('option', { name: 'Base Sepolia' }));
  await user.type(screen.getByLabelText('Start block'), '0');
  await user.click(screen.getByRole('button', { name: 'Start scan' }));
  await user.click(await screen.findByRole('button', { name: 'Sweep this payment' }));
  return user;
}

describe('Sweep', () => {
  it('asks to choose a payment first', async () => {
    const user = userEvent.setup();
    renderApp(makeServices());
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Sweep' }));
    expect(screen.getByText('Choose a payment to sweep from Scan and receive.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Go to Scan and receive' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Scan and receive' })).toBeTruthy();
  });

  it('accepts a pasted destination only after the chain and address checks pass', async () => {
    const user = await toSweep();
    await screen.findByText('5 USDC');
    const paste = screen.getByLabelText('Or paste QR text');
    await user.type(paste, 'not-an-address');
    await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/valid destination/);
    expect(screen.getByLabelText<HTMLInputElement>('Destination address (your own wallet)').value).toBe('');
    await user.clear(paste);
    await user.type(paste, DEST);
    await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
    expect(screen.getByLabelText<HTMLInputElement>('Destination address (your own wallet)').value).toBe(DEST);
  });

  it('requires a fresh vault passphrase before spending from saved keys', async () => {
    const raw: { raw?: string } = {};
    const user = await toSweep({ raw, vaultPass: VAULT_PASS });
    await screen.findByText('5 USDC');
    await user.click(await screen.findByLabelText(/Directly/));
    await user.type(screen.getByLabelText('Destination address (your own wallet)'), DEST);
    await user.click(screen.getByRole('button', { name: 'Sign and broadcast directly' }));
    expect((await screen.findByRole('alert', {}, { timeout: 30_000 })).textContent).toMatch(/Wrong passphrase/);
    expect(raw.raw).toBeUndefined();

    await user.type(screen.getByLabelText('Vault passphrase (required for each sweep action)'), VAULT_PASS);
    await user.click(screen.getByRole('button', { name: 'Sign and broadcast directly' }));
    expect(await screen.findByText('Submitted', {}, { timeout: 30_000 })).toBeTruthy();
    expect(raw.raw).toMatch(/^0x02/);
    expect(screen.getByLabelText<HTMLInputElement>('Vault passphrase (required for each sweep action)').value).toBe('');
  });

  it('shows the on-chain balance, the linkability notice, and sweeps directly with a verified signed transaction', async () => {
    const raw: { raw?: string } = {};
    const user = await toSweep({ raw });
    expect(await screen.findByText('5 USDC')).toBeTruthy();
    expect(screen.getByText('The payer can follow this sweep')).toBeTruthy();
    expect(screen.getByText(/never shown or stored/)).toBeTruthy();
    await user.click(screen.getByLabelText(/Directly/));
    await user.type(screen.getByLabelText('Destination address (your own wallet)'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Sign and broadcast directly' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/valid destination/);
    await user.clear(screen.getByLabelText('Destination address (your own wallet)'));
    await user.type(screen.getByLabelText('Destination address (your own wallet)'), FAKE_ROUTER);
    await user.click(screen.getByRole('button', { name: 'Sign and broadcast directly' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/GhostPay contract or the fee recipient/);
    await user.clear(screen.getByLabelText('Destination address (your own wallet)'));
    await user.type(screen.getByLabelText('Destination address (your own wallet)'), DEST);
    await user.click(screen.getByRole('button', { name: 'Sign and broadcast directly' }));
    expect(await screen.findByText('Submitted')).toBeTruthy();
    expect(raw.raw).toMatch(/^0x02/);
    expect(screen.getByText(keccak256(raw.raw as `0x${string}`))).toBeTruthy();
  });

  it('WEB-APP-01: re-verifies the manifest on chain before signing and refuses on mismatch', async () => {
    const code: Record<string, string> = { ...FAKE_CODE };
    const raw: { raw?: string } = {};
    const user = await toSweep({ code, raw });
    await screen.findByText('5 USDC');
    for (const k of Object.keys(code)) code[k] = '0x00';
    await user.click(screen.getByLabelText(/Directly/));
    await user.type(screen.getByLabelText('Destination address (your own wallet)'), DEST);
    await user.click(screen.getByRole('button', { name: 'Sign and broadcast directly' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/do not match the deployment manifest/);
    expect(raw.raw).toBeUndefined();
  });

  it('WEB-APP-01: shows the unsigned-dev banner', async () => {
    await toSweep({ unsigned: true });
    expect(await screen.findByText('UNSIGNED DEV MANIFEST (test)')).toBeTruthy();
  });

  it('explains when the one-time address has no gas for a direct sweep', async () => {
    const user = await toSweep({ native: 0n });
    await screen.findByText('5 USDC');
    await user.click(screen.getByLabelText(/Directly/));
    await user.type(screen.getByLabelText('Destination address (your own wallet)'), DEST);
    await user.click(screen.getByRole('button', { name: 'Sign and broadcast directly' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/no native coin for gas/);
  });

  it('relayer path: shows the quoted fee and net, then signs and submits', async () => {
    const posted: string[] = [];
    const fetchFn: Services['fetchFn'] = (url) => {
      posted.push(url);
      if (url.endsWith('/v1/quote')) return Promise.resolve(new Response(JSON.stringify({ fee: '25000', feeTo: FAKE_FEE_RECIPIENT, expiresAt: 1_800_000_100, quoteToken: 'tok' })));
      return Promise.resolve(new Response(JSON.stringify({ txHash: `0x${'34'.repeat(32)}` }), { status: 200 }));
    };
    const user = await toSweep({ relayer: true, fetchFn });
    await screen.findByText('5 USDC');
    await user.type(screen.getByLabelText('Destination address (your own wallet)'), DEST);
    await user.click(screen.getByRole('button', { name: 'Get relayer quote' }));
    expect(await screen.findByText(/Relayer fee: 0\.025 USDC/)).toBeTruthy();
    expect(screen.getByText(/You receive: 4\.975 USDC/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Sign and submit to relayer' }));
    // The submitted hash is shown in the result and in the pending-attempt panel that keeps signing disarmed.
    expect((await screen.findAllByText('Submitted')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(`0x${'34'.repeat(32)}`).length).toBeGreaterThan(0);
    expect(posted).toEqual(['https://relay.test/v1/quote', 'https://relay.test/v1/sweep']);
  });

  it('relayer path: an accepted relayed sweep disarms direct signing until its status is resolved', async () => {
    const fetchFn: Services['fetchFn'] = (url) => {
      if (url.endsWith('/v1/quote')) return Promise.resolve(new Response(JSON.stringify({ fee: '25000', feeTo: FAKE_FEE_RECIPIENT, expiresAt: 1_800_000_100, quoteToken: 'tok' })));
      return Promise.resolve(new Response(JSON.stringify({ txHash: `0x${'35'.repeat(32)}` }), { status: 200 }));
    };
    const user = await toSweep({ relayer: true, fetchFn });
    await screen.findByText('5 USDC');
    await user.type(screen.getByLabelText('Destination address (your own wallet)'), DEST);
    await user.click(screen.getByRole('button', { name: 'Get relayer quote' }));
    await screen.findByText(/Relayer fee: 0\.025 USDC/);
    await user.click(screen.getByRole('button', { name: 'Sign and submit to relayer' }));
    expect((await screen.findAllByText('Submitted')).length).toBeGreaterThan(0);
    // The relayed transaction may still be pending: a fresh direct signature from the same address must not be offered.
    await user.click(screen.getByLabelText(/Directly/));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign and broadcast directly' }).disabled).toBe(true);
  });

  it('relayer path: refuses a fee above the published cap', async () => {
    const fetchFn: Services['fetchFn'] = () => Promise.resolve(new Response(JSON.stringify({ fee: '1000000', feeTo: FAKE_FEE_RECIPIENT, expiresAt: 1_800_000_100, quoteToken: 'tok' })));
    const user = await toSweep({ relayer: true, fetchFn });
    await screen.findByText('5 USDC');
    await user.type(screen.getByLabelText('Destination address (your own wallet)'), DEST);
    await user.click(screen.getByRole('button', { name: 'Get relayer quote' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/above the published cap/);
    expect(screen.queryByRole('button', { name: 'Sign and submit to relayer' })).toBeNull();
  });

  it('relayer mode is unavailable without a relayer URL', async () => {
    await toSweep();
    await screen.findByText('5 USDC');
    expect(screen.getByText(/Relayer sweeps need a relayer URL in Settings/)).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Get relayer quote' }).disabled).toBe(true);
  });

  it('tells the user when their keys are gone from memory', async () => {
    await toSweep();
    clearSession();
    await waitFor(() => { expect(screen.getByText(/Your keys are no longer in memory/)).toBeTruthy(); });
  });

  it('disables sweeping an empty balance', async () => {
    const user = await toSweep({ balance: 0n });
    await waitFor(() => { expect(screen.getByText('0 USDC')).toBeTruthy(); });
    await user.click(screen.getByLabelText(/Directly/));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign and broadcast directly' }).disabled).toBe(true);
  });
  it('GP-SWEEP-OUTCOME-01: an uncertain broadcast shows the expected hash and keeps signing disarmed across navigation', async () => {
    (appState as unknown as { resetSweepAttemptsForTests?: () => void }).resetSweepAttemptsForTests?.();
    const sink: RawSink = { sendFail: true, calls: [] };
    const user = await toSweep({ raw: sink });
    await screen.findByText('5 USDC');
    await user.click(screen.getByLabelText(/Directly/));
    await user.type(screen.getByLabelText('Destination address (your own wallet)'), DEST);
    const countOf = (m: string): number => (sink.calls ?? []).filter((c) => c === m).length;
    await user.click(screen.getByRole('button', { name: 'Sign and broadcast directly' }));
    expect(await screen.findByText('Outcome unknown')).toBeTruthy();
    const expectedHash = keccak256(sink.raw as `0x${string}`);
    expect(screen.getByText(expectedHash)).toBeTruthy();
    expect(screen.queryByText('Submitted')).toBeNull();
    const sends = countOf('eth_sendRawTransaction');
    const nonceReads = countOf('eth_getTransactionCount');
    expect(sends).toBe(1);
    const sign = screen.getByRole<HTMLButtonElement>('button', { name: 'Sign and broadcast directly' });
    expect(sign.disabled).toBe(true);
    await user.click(sign);
    expect(countOf('eth_sendRawTransaction')).toBe(sends);
    expect(countOf('eth_getTransactionCount')).toBe(nonceReads);

    const nav = within(screen.getByRole('navigation', { name: 'Main' }));
    await user.click(nav.getByRole('button', { name: 'Scan and receive' }));
    await user.click(nav.getByRole('button', { name: 'Sweep' }));
    await screen.findByText('5 USDC');
    await user.click(screen.getByLabelText(/Directly/));
    expect(screen.getByText('Outcome unknown')).toBeTruthy();
    expect(screen.getByText(expectedHash)).toBeTruthy();
    await user.type(screen.getByLabelText('Destination address (your own wallet)'), DEST);
    const again = screen.getByRole<HTMLButtonElement>('button', { name: 'Sign and broadcast directly' });
    expect(again.disabled).toBe(true);
    await user.click(again);
    expect(countOf('eth_sendRawTransaction')).toBe(sends);
    expect(countOf('eth_getTransactionCount')).toBe(nonceReads);
  });

  it('GP-SWEEP-OUTCOME-01: an uncertain broadcast keeps signing disarmed after the tab reloads', async () => {
    const sink: RawSink = { sendFail: true, calls: [] };
    const user = await toSweep({ raw: sink });
    await screen.findByText('5 USDC');
    await user.click(screen.getByLabelText(/Directly/));
    await user.type(screen.getByLabelText('Destination address (your own wallet)'), DEST);
    await user.click(screen.getByRole('button', { name: 'Sign and broadcast directly' }));
    expect(await screen.findByText('Outcome unknown')).toBeTruthy();
    const expectedHash = keccak256(sink.raw as `0x${string}`);
    const sends = (sink.calls ?? []).filter((c) => c === 'eth_sendRawTransaction').length;
    expect(window.sessionStorage.getItem(SWEEP_JOURNAL_KEY)).toContain(expectedHash);

    // Reload: in-memory state is gone, the tab journal remains.
    appState.resetSweepAttemptsForTests({ keepStorage: true });
    const nav = within(screen.getByRole('navigation', { name: 'Main' }));
    await user.click(nav.getByRole('button', { name: 'Scan and receive' }));
    await user.click(nav.getByRole('button', { name: 'Sweep' }));
    await screen.findByText('5 USDC');
    await user.click(screen.getByLabelText(/Directly/));
    expect(screen.getByText('Outcome unknown')).toBeTruthy();
    expect(screen.getByText(expectedHash)).toBeTruthy();
    await user.type(screen.getByLabelText('Destination address (your own wallet)'), DEST);
    const again = screen.getByRole<HTMLButtonElement>('button', { name: 'Sign and broadcast directly' });
    expect(again.disabled).toBe(true);
    await user.click(again);
    expect((sink.calls ?? []).filter((c) => c === 'eth_sendRawTransaction').length).toBe(sends);
  });

  it('GP-SWEEP-OUTCOME-01: an unreadable sweep journal disarms signing instead of trusting empty memory', async () => {
    window.sessionStorage.setItem(SWEEP_JOURNAL_KEY, '{not json');
    appState.resetSweepAttemptsForTests({ keepStorage: true });
    const sink: RawSink = { calls: [] };
    const user = await toSweep({ raw: sink });
    await screen.findByText('5 USDC');
    await user.click(screen.getByLabelText(/Directly/));
    await user.type(screen.getByLabelText('Destination address (your own wallet)'), DEST);
    expect(screen.getByText('Signing disabled in this tab')).toBeTruthy();
    const sign = screen.getByRole<HTMLButtonElement>('button', { name: 'Sign and broadcast directly' });
    expect(sign.disabled).toBe(true);
    await user.click(sign);
    expect(sink.calls ?? []).not.toContain('eth_sendRawTransaction');
  });
});
