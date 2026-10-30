// @vitest-environment jsdom
import { ANNOUNCEMENT_TOPIC, ChainAdapterError, eip712DomainSeparator, erc20MetadataAbi, erc2612PermitAbi, ghostPaySweepRelayerAbi, type RpcLog } from '@ghostpay/chain-adapters';
import { buildNativeMetadata, deriveStealthPayment } from '@ghostpay/core-crypto';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { decodeFunctionData, encodeAbiParameters, encodeFunctionData, encodeFunctionResult, keccak256, parseAbi, parseTransaction } from 'viem/utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Services } from '../lib/services';
import { clearSession, generateSession } from '../lib/session';
import { notifyAppLock } from '../lib/appLock';
import * as appState from '../state';
import { MemoryKeyVaultStore, saveEncryptedVault, setKeyVaultStoreForTests } from '../lib/keyVault';
import { SETTINGS_KEY } from '../lib/settings';
import { SWEEP_JOURNAL_KEY } from '../lib/sweepAttemptJournal';
import { makeLog } from '../test/announcements';
import { FAKE_ANNOUNCER, FAKE_FEE_RECIPIENT, FAKE_ROUTER, FAKE_SWEEP_RELAYER } from '../test/fakeManifest';
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
const NONCE_USED_SELECTOR = encodeFunctionData({ abi: ghostPaySweepRelayerAbi, functionName: 'nonceUsed', args: [DEST, 0n] }).slice(0, 10);
const TOKEN = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const VAULT_PASS = 'violet comet maple lantern';
let vaultStore = new MemoryKeyVaultStore();

interface RawSink {
  raw?: string; sendFail?: boolean; sendHang?: boolean; receiptOk?: boolean; calls?: string[]; blockTimestamp?: number; nonceUsed?: boolean;
  /** Every raw transaction handed to the RPC, in order. */
  raws?: string[];
  /** The node rejects this many sends first (a JSON-RPC error: nothing enters the mempool). */
  failSends?: number;
  /** OP Stack L1 data fee: the GasPriceOracle quotes it and, like op-geth, the node refuses a tx whose cost plus this fee exceeds the balance. */
  l1Fee?: bigint;
  estimate?: string;
  gasPrice?: string;
  finalizedNonce?: string;
  /** The dry-run eth_call (transfer or plain value call) fails the way a node without eth_call support answers. */
  dryRunBlind?: boolean;
  /** Index in `raws` of the transaction that is mined: only its hash has a receipt (overrides `receiptOk`). */
  mined?: number;
}

const ORACLE = '0x420000000000000000000000000000000000000F';
const oracleAbi = parseAbi(['function getL1Fee(bytes _data) view returns (uint256)', 'function getOperatorFee(uint256 _gasUsed) view returns (uint256)']);

function extra(balance: bigint, nativeBalance: bigint, rawSink: RawSink) {
  return (method: string, params: readonly unknown[]): unknown => {
    rawSink.calls?.push(method);
    switch (method) {
      case 'eth_getBalance':
        return `0x${nativeBalance.toString(16)}`;
      case 'eth_gasPrice':
        return rawSink.gasPrice ?? '0x3b9aca00';
      case 'eth_getTransactionCount':
        return params[1] === 'finalized' && rawSink.finalizedNonce !== undefined ? rawSink.finalizedNonce : '0x0';
      case 'eth_estimateGas':
        return rawSink.estimate ?? '0xc350';
      case 'eth_sendRawTransaction': {
        rawSink.raw = params[0] as string;
        rawSink.raws?.push(rawSink.raw);
        if ((rawSink.failSends ?? 0) > 0) {
          rawSink.failSends = (rawSink.failSends ?? 0) - 1;
          throw new ChainAdapterError('RPC_FAILURE', 'json-rpc error -32000');
        }
        if (rawSink.l1Fee !== undefined) {
          // op-geth's txpool check: gas at the fee cap + value + L1 data fee must fit the balance.
          const tx = parseTransaction(rawSink.raw as `0x${string}`);
          if ((tx.gas ?? 0n) * (tx.maxFeePerGas ?? 0n) + (tx.value ?? 0n) + rawSink.l1Fee > nativeBalance) throw new ChainAdapterError('RPC_FAILURE', 'json-rpc error -32000');
        }
        if (rawSink.sendFail === true) throw new ChainAdapterError('RPC_FAILURE', 'connection reset after write');
        if (rawSink.sendHang === true) return new Promise(() => undefined);
        return keccak256(params[0] as `0x${string}`);
      }
      case 'eth_getBlockByNumber':
        if (params[0] === 'finalized' && rawSink.blockTimestamp !== undefined) return { hash: `0x${'f1'.repeat(32)}`, number: '0x64', timestamp: `0x${rawSink.blockTimestamp.toString(16)}` };
        if (params[0] === 'finalized') throw new ChainAdapterError('RPC_FAILURE', 'finalized not supported');
        return undefined;
      case 'eth_getTransactionReceipt': {
        if (rawSink.mined !== undefined) {
          const mined = rawSink.raws?.[rawSink.mined];
          return mined !== undefined && keccak256(mined as `0x${string}`) === params[0] ? { transactionHash: params[0], status: '0x1' } : null;
        }
        return rawSink.receiptOk === true && rawSink.raw !== undefined ? { transactionHash: keccak256(rawSink.raw as `0x${string}`), status: '0x1' } : null;
      }
      case 'eth_call': {
        const data = (params[0] as { data: string }).data;
        if ((params[0] as { to: string }).to === ORACLE) {
          const d = decodeFunctionData({ abi: oracleAbi, data: data as `0x${string}` });
          return encodeAbiParameters([{ type: 'uint256' }], [d.functionName === 'getL1Fee' ? (rawSink.l1Fee ?? 0n) : 0n]);
        }
        if (rawSink.dryRunBlind === true && (data === '0x' || data.startsWith('0xa9059cbb'))) throw new ChainAdapterError('RPC_FAILURE', 'json-rpc error -32601');
        if (data.startsWith(NONCE_USED_SELECTOR)) {
          if ((params[0] as { to: string }).to !== FAKE_SWEEP_RELAYER) throw new Error('nonceUsed must target the signed sweep relayer');
          return encodeFunctionResult({ abi: ghostPaySweepRelayerAbi, functionName: 'nonceUsed', result: rawSink.nonceUsed === true });
        }
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

/** A router announcement for a native-coin payment (the default invoice asset), as the RPC would return it. */
function nativeLog(metaAddress: string): RpcLog {
  const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  const word = (a: string): string => `0x${a.slice(2).toLowerCase().padStart(64, '0')}`;
  const p = deriveStealthPayment(metaAddress);
  return {
    address: FAKE_ANNOUNCER,
    topics: [ANNOUNCEMENT_TOPIC, `0x${'1'.padStart(64, '0')}`, word(p.stealthAddress), word(FAKE_ROUTER)],
    data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [`0x${hex(p.ephemeralPublicKey)}`, `0x${hex(buildNativeMetadata(p.viewTag, 10n ** 17n))}`]),
    blockNumber: '0x32',
    blockHash: `0x${(50).toString(16).padStart(64, '0')}`,
    logIndex: '0x0',
    transactionHash: `0x${'5'.repeat(64)}`,
  };
}

/** Scans one payment, then opens the Sweep view for it. */
async function toSweep(opts: { balance?: bigint; native?: bigint; relayer?: boolean; fetchFn?: Services['fetchFn']; raw?: RawSink; code?: Record<string, string>; unsigned?: boolean; vaultPass?: string; nativePayment?: boolean; wrongTag?: boolean } = {}): Promise<ReturnType<typeof userEvent.setup>> {
  const pub = generateSession();
  if (opts.vaultPass !== undefined) await saveEncryptedVault(opts.vaultPass, { N: 1 << 14 });
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' }, ...(opts.relayer === true ? { relayerUrl: 'https://relay.test' } : {}) }));
  const mine = opts.nativePayment === true
    ? { log: nativeLog(pub.metaAddress) }
    : makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: pub.metaAddress, block: 50, index: 0, caller: FAKE_ROUTER, amount: 5_000_000n, ...(opts.wrongTag === true ? { wrongTag: true } : {}) });
  const rpc = chainWithLogs(84532, 100, [mine.log], extra(opts.balance ?? 5_000_000n, opts.native ?? 10n ** 17n, opts.raw ?? {}));
  const user = userEvent.setup();
  renderApp(makeServices({ loadManifest: opts.unsigned === true ? (id) => Promise.resolve({ status: 'loaded', manifest: backedManifest(id), trust: 'unsigned-dev', warning: 'UNSIGNED DEV MANIFEST (test)' }) : loaded, createRpc: () => Promise.resolve(withManifestChain(rpc, { code: opts.code ?? FAKE_CODE })), ...(opts.fetchFn === undefined ? {} : { fetchFn: opts.fetchFn }) }));
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Scan and receive' }));
  await user.selectOptions(screen.getByLabelText('Chain'), screen.getByRole('option', { name: 'Base Sepolia' }));
  await user.type(screen.getByLabelText('Start block'), '0');
  if (opts.wrongTag === true) await user.click(screen.getByLabelText('Deep scan (also check wrong view tags)'));
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

  it('GP-SWEEP-OUTCOME-01: the lock is persisted before handoff, so a reload during a pending send stays disarmed; resolving it re-arms', async () => {
    const sink: RawSink = { sendHang: true, calls: [] };
    const user = await toSweep({ raw: sink });
    await screen.findByText('5 USDC');
    await user.click(screen.getByLabelText(/Directly/));
    await user.type(screen.getByLabelText('Destination address (your own wallet)'), DEST);
    await user.click(screen.getByRole('button', { name: 'Sign and broadcast directly' }));
    await waitFor(() => { expect(sink.calls).toContain('eth_sendRawTransaction'); });
    const expectedHash = keccak256(sink.raw as `0x${string}`);
    expect(window.sessionStorage.getItem(SWEEP_JOURNAL_KEY)).toContain(expectedHash);
    expect(window.sessionStorage.getItem(SWEEP_JOURNAL_KEY)).not.toContain(DEST.slice(2));

    // Reload while eth_sendRawTransaction is still pending.
    appState.resetSweepAttemptsForTests({ keepStorage: true });
    const nav = within(screen.getByRole('navigation', { name: 'Main' }));
    await user.click(nav.getByRole('button', { name: 'Scan and receive' }));
    await user.click(nav.getByRole('button', { name: 'Sweep' }));
    await screen.findByText('5 USDC');
    await user.click(screen.getByLabelText(/Directly/));
    expect(screen.getByText('Outcome unknown')).toBeTruthy();
    await user.type(screen.getByLabelText('Destination address (your own wallet)'), DEST);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign and broadcast directly' }).disabled).toBe(true);

    sink.receiptOk = true;
    await user.click(screen.getByRole('button', { name: 'Check status' }));
    expect(await screen.findByText('Included on chain')).toBeTruthy();
    expect(window.sessionStorage.getItem(SWEEP_JOURNAL_KEY)).toContain('"included"');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign and broadcast directly' }).disabled).toBe(false);
  });

  it('GP-SWEEP-OUTCOME-01: if the lock cannot be persisted before handoff, nothing is broadcast', async () => {
    const sink: RawSink = { calls: [] };
    const user = await toSweep({ raw: sink });
    await screen.findByText('5 USDC');
    await user.click(screen.getByLabelText(/Directly/));
    await user.type(screen.getByLabelText('Destination address (your own wallet)'), DEST);
    const proto = Object.getPrototypeOf(window.sessionStorage) as Storage;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'setItem')!;
    const original = descriptor.value as (this: Storage, k: string, v: string) => void;
    proto.setItem = function (this: Storage, k: string, v: string): void {
      if (k === SWEEP_JOURNAL_KEY) throw new DOMException('quota', 'QuotaExceededError');
      original.call(this, k, v);
    };
    try {
      await user.click(screen.getByRole('button', { name: 'Sign and broadcast directly' }));
      expect(await screen.findByText('Signing disabled in this tab')).toBeTruthy();
    } finally {
      Object.defineProperty(proto, 'setItem', descriptor);
    }
    expect(sink.calls ?? []).not.toContain('eth_sendRawTransaction');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign and broadcast directly' }).disabled).toBe(true);
  });

  describe('L2-F2: native sweeps on OP Stack, and unjamming a lock by a same-nonce replacement', () => {
    const fill = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
      await user.click(screen.getByLabelText(/Directly/));
      await user.type(screen.getByLabelText('Destination address (your own wallet)'), DEST);
    };
    const RESIGN = 'Sign a replacement with the same nonce';

    it('a native payment on Base Sepolia is swept with the L1 data fee kept back, so the node accepts it', async () => {
      const sink: RawSink = { calls: [], estimate: '0x5208', l1Fee: 3_000_000_000_000n };
      const user = await toSweep({ nativePayment: true, raw: sink });
      expect(await screen.findByText('0.1 ETH')).toBeTruthy();
      await fill(user);
      await user.click(screen.getByRole('button', { name: 'Sign and broadcast directly' }));
      expect(await screen.findByText('Submitted')).toBeTruthy();
      const tx = parseTransaction(sink.raw as `0x${string}`);
      expect(tx.value).toBe(10n ** 17n - 21_000n * 2_000_000_000n - 2n * 3_000_000_000_000n);
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign and broadcast directly' }).disabled).toBe(true);
    });

    it('B-R3: an ERC-20 sweep whose native coin covers the gas but not the L1 data fee is refused before signing, so no lock jams', async () => {
      const sink: RawSink = { calls: [], raws: [], l1Fee: 5_000_000_000_000n };
      const user = await toSweep({ raw: sink, native: 60_000n * 2_000_000_000n + 1n });
      await screen.findByText('5 USDC');
      await fill(user);
      await user.click(screen.getByRole('button', { name: 'Sign and broadcast directly' }));
      expect((await screen.findByRole('alert')).textContent).toMatch(/not hold enough native coin for the network fee, including the L1 data fee/);
      expect(sink.raws).toHaveLength(0);
      expect(screen.queryByText('Outcome unknown')).toBeNull();
      expect(window.sessionStorage.getItem(SWEEP_JOURNAL_KEY)).toBeNull();
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign and broadcast directly' }).disabled).toBe(false);
    });

    it('a sweep the node rejected keeps its lock; a replacement with the same nonce takes it over and can resolve it', async () => {
      const sink: RawSink = { calls: [], raws: [], failSends: 1 };
      const user = await toSweep({ raw: sink });
      await screen.findByText('5 USDC');
      await fill(user);
      await user.click(screen.getByRole('button', { name: 'Sign and broadcast directly' }));
      expect(await screen.findByText('Outcome unknown')).toBeTruthy();
      const first = keccak256(sink.raws?.[0] as `0x${string}`);
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign and broadcast directly' }).disabled).toBe(true);
      expect(screen.getByText(/so at most one of them can ever be included/)).toBeTruthy();

      sink.gasPrice = '0x77359400'; // the fee moved meanwhile, so the replacement differs from the first transaction
      await user.click(screen.getByRole('button', { name: RESIGN }));
      expect((await screen.findAllByText('Submitted')).length).toBeGreaterThan(0);
      expect(sink.raws).toHaveLength(2);
      const second = keccak256(sink.raws?.[1] as `0x${string}`);
      expect(second).not.toBe(first);
      expect(parseTransaction(sink.raws?.[1] as `0x${string}`).nonce).toBe(parseTransaction(sink.raws?.[0] as `0x${string}`).nonce);
      // B-R5: the lock tracks the replacement and still records the first transaction, which could be the one mined.
      expect(JSON.parse(window.sessionStorage.getItem(SWEEP_JOURNAL_KEY) ?? '')).toMatchObject([{ expectedHash: second, otherHashes: [first], status: 'submitted' }]);
      expect(screen.getByText(second)).toBeTruthy();
      // The node accepted the replacement: no further same-nonce re-sign is offered.
      expect(screen.queryByRole('button', { name: RESIGN })).toBeNull();
      // Still unresolved: a new sweep (another nonce) stays disarmed until the replacement's receipt is seen.
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign and broadcast directly' }).disabled).toBe(true);
      sink.receiptOk = true;
      await user.click(screen.getByRole('button', { name: 'Check status' }));
      expect(await screen.findByText('Included on chain')).toBeTruthy();
      expect(screen.queryByRole('button', { name: RESIGN })).toBeNull();
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign and broadcast directly' }).disabled).toBe(false);
    });

    it('B-R7: the unknown-outcome notice of a direct lock agrees with the same-nonce replacement it offers', async () => {
      const sink: RawSink = { calls: [], raws: [], failSends: 1 };
      const user = await toSweep({ raw: sink });
      await screen.findByText('5 USDC');
      await fill(user);
      await user.click(screen.getByRole('button', { name: 'Sign and broadcast directly' }));
      expect(await screen.findByText('Outcome unknown')).toBeTruthy();
      expect(screen.getByText(/so a new sweep is disabled; only a replacement with the same nonce can be signed/)).toBeTruthy();
      expect(screen.queryByText(/signing a new one is disabled/i)).toBeNull();
      expect(screen.getByRole('button', { name: RESIGN })).toBeTruthy();
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign and broadcast directly' }).disabled).toBe(true);
    });

    it('the replacement lock is persisted before handoff: a reload during its send shows the new hash and stays disarmed', async () => {
      const sink: RawSink = { calls: [], raws: [], failSends: 1, sendHang: true };
      const user = await toSweep({ raw: sink });
      await screen.findByText('5 USDC');
      await fill(user);
      await user.click(screen.getByRole('button', { name: 'Sign and broadcast directly' }));
      expect(await screen.findByText('Outcome unknown')).toBeTruthy();
      sink.gasPrice = '0x77359400';
      await user.click(screen.getByRole('button', { name: RESIGN }));
      await waitFor(() => { expect(sink.raws).toHaveLength(2); });
      const second = keccak256(sink.raws?.[1] as `0x${string}`);
      expect(JSON.parse(window.sessionStorage.getItem(SWEEP_JOURNAL_KEY) ?? '')).toMatchObject([{ expectedHash: second, otherHashes: [keccak256(sink.raws?.[0] as `0x${string}`)], status: 'unknown-after-handoff' }]);

      appState.resetSweepAttemptsForTests({ keepStorage: true });
      const nav = within(screen.getByRole('navigation', { name: 'Main' }));
      await user.click(nav.getByRole('button', { name: 'Scan and receive' }));
      await user.click(nav.getByRole('button', { name: 'Sweep' }));
      await screen.findByText('5 USDC');
      await user.click(screen.getByLabelText(/Directly/));
      expect(screen.getByText('Outcome unknown')).toBeTruthy();
      expect(screen.getByText(second)).toBeTruthy();
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign and broadcast directly' }).disabled).toBe(true);
    });

    it('if the replacement lock cannot be persisted, nothing is broadcast and signing is disarmed', async () => {
      const sink: RawSink = { calls: [], raws: [], failSends: 1 };
      const user = await toSweep({ raw: sink });
      await screen.findByText('5 USDC');
      await fill(user);
      await user.click(screen.getByRole('button', { name: 'Sign and broadcast directly' }));
      expect(await screen.findByText('Outcome unknown')).toBeTruthy();
      const proto = Object.getPrototypeOf(window.sessionStorage) as Storage;
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'setItem')!;
      const original = descriptor.value as (this: Storage, k: string, v: string) => void;
      proto.setItem = function (this: Storage, k: string, v: string): void {
        if (k === SWEEP_JOURNAL_KEY) throw new DOMException('quota', 'QuotaExceededError');
        original.call(this, k, v);
      };
      try {
        await user.click(screen.getByRole('button', { name: RESIGN }));
        expect(await screen.findByText('Signing disabled in this tab')).toBeTruthy();
      } finally {
        Object.defineProperty(proto, 'setItem', descriptor);
      }
      expect(sink.raws).toHaveLength(1);
      expect(screen.queryByRole('button', { name: RESIGN })).toBeNull();
    });

    it('B-R5: a direct sweep the node accepted (submitted) offers no same-nonce re-sign', async () => {
      const sink: RawSink = { calls: [], raws: [] };
      const user = await toSweep({ raw: sink });
      await screen.findByText('5 USDC');
      await fill(user);
      await user.click(screen.getByRole('button', { name: 'Sign and broadcast directly' }));
      expect((await screen.findAllByText('Submitted')).length).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: 'Check status' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: RESIGN })).toBeNull();
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign and broadcast directly' }).disabled).toBe(true);
    });

    it('B-R5: when the first transaction reached the network after all and is mined, the re-signed lock resolves as included', async () => {
      // The first send's answer is lost after the write: the transaction is in the mempool.
      const sink: RawSink = { calls: [], raws: [], sendFail: true };
      const user = await toSweep({ raw: sink });
      await screen.findByText('5 USDC');
      await fill(user);
      await user.click(screen.getByRole('button', { name: 'Sign and broadcast directly' }));
      expect(await screen.findByText('Outcome unknown')).toBeTruthy();
      const first = keccak256(sink.raws?.[0] as `0x${string}`);
      // The replacement pays 5 % more, so the node refuses it as underpriced; its outcome is unknown again.
      sink.sendFail = false;
      sink.failSends = 1;
      sink.gasPrice = '0x3e95ba80';
      await user.click(screen.getByRole('button', { name: RESIGN }));
      await waitFor(() => { expect(sink.raws).toHaveLength(2); });
      const second = keccak256(sink.raws?.[1] as `0x${string}`);
      expect(await screen.findByText(second)).toBeTruthy();
      expect(screen.getByText('Outcome unknown')).toBeTruthy();
      // The first transaction is mined (before its nonce is final).
      sink.mined = 0;
      await user.click(screen.getByRole('button', { name: 'Check status' }));
      expect(await screen.findByText('Included on chain')).toBeTruthy();
      expect(screen.getByText(first)).toBeTruthy();
      expect(screen.queryByText(second)).toBeNull();
      expect(JSON.parse(window.sessionStorage.getItem(SWEEP_JOURNAL_KEY) ?? '')).toMatchObject([{ expectedHash: first, otherHashes: [second], status: 'included' }]);
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign and broadcast directly' }).disabled).toBe(false);
    });

    it('Check status resolves the lock as replaced once its nonce is final without its own receipt', async () => {
      const sink: RawSink = { calls: [], raws: [], failSends: 1 };
      const user = await toSweep({ raw: sink });
      await screen.findByText('5 USDC');
      await fill(user);
      await user.click(screen.getByRole('button', { name: 'Sign and broadcast directly' }));
      expect(await screen.findByText('Outcome unknown')).toBeTruthy();
      await user.click(screen.getByRole('button', { name: 'Check status' }));
      expect(await screen.findByText(/No receipt found for this hash yet/)).toBeTruthy();
      sink.finalizedNonce = '0x1';
      await user.click(screen.getByRole('button', { name: 'Check status' }));
      expect(await screen.findByText('Replaced on chain')).toBeTruthy();
      expect(screen.getByText(/can never be included/)).toBeTruthy();
      expect(window.sessionStorage.getItem(SWEEP_JOURNAL_KEY)).toContain('"replaced"');
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign and broadcast directly' }).disabled).toBe(false);
    });

    it('a relayed order lock offers no direct replacement', async () => {
      const fetchFn: Services['fetchFn'] = (url) => {
        if (url.endsWith('/v1/quote')) return Promise.resolve(new Response(JSON.stringify({ fee: '25000', feeTo: FAKE_FEE_RECIPIENT, expiresAt: 1_800_000_100, quoteToken: 'tok' })));
        return Promise.reject(new TypeError('connection reset'));
      };
      const user = await toSweep({ relayer: true, fetchFn });
      await screen.findByText('5 USDC');
      await user.type(screen.getByLabelText('Destination address (your own wallet)'), DEST);
      await user.click(screen.getByRole('button', { name: 'Get relayer quote' }));
      await screen.findByText(/Relayer fee: 0\.025 USDC/);
      await user.click(screen.getByRole('button', { name: 'Sign and submit to relayer' }));
      expect(await screen.findByText('Outcome unknown')).toBeTruthy();
      expect(screen.queryByRole('button', { name: RESIGN })).toBeNull();
    });
  });

  it('L2-F1: a sweep whose dry run the RPC cannot run is still sent, with a visible warning', async () => {
    const sink: RawSink = { calls: [], dryRunBlind: true };
    const user = await toSweep({ raw: sink });
    await screen.findByText('5 USDC');
    await user.click(screen.getByLabelText(/Directly/));
    await user.type(screen.getByLabelText('Destination address (your own wallet)'), DEST);
    await user.click(screen.getByRole('button', { name: 'Sign and broadcast directly' }));
    expect(await screen.findByText('Submitted')).toBeTruthy();
    expect(screen.getByText(/could not dry-run this sweep/)).toBeTruthy();
  });

  it('B-R6: the skipped-dry-run warning is shown also when the outcome after handoff is unknown', async () => {
    const sink: RawSink = { calls: [], dryRunBlind: true, sendFail: true };
    const user = await toSweep({ raw: sink });
    await screen.findByText('5 USDC');
    await user.click(screen.getByLabelText(/Directly/));
    await user.type(screen.getByLabelText('Destination address (your own wallet)'), DEST);
    await user.click(screen.getByRole('button', { name: 'Sign and broadcast directly' }));
    expect(await screen.findByText('Outcome unknown')).toBeTruthy();
    expect(screen.getByText(/could not dry-run this sweep/)).toBeTruthy();
  });

  it('B-R6: an unknown outcome after a dry run that did run shows no skipped-dry-run warning', async () => {
    const sink: RawSink = { calls: [], sendFail: true };
    const user = await toSweep({ raw: sink });
    await screen.findByText('5 USDC');
    await user.click(screen.getByLabelText(/Directly/));
    await user.type(screen.getByLabelText('Destination address (your own wallet)'), DEST);
    await user.click(screen.getByRole('button', { name: 'Sign and broadcast directly' }));
    expect(await screen.findByText('Outcome unknown')).toBeTruthy();
    expect(screen.queryByText(/could not dry-run this sweep/)).toBeNull();
  });

  it('L4-02: a deep-scan payment whose announced view tag is wrong can be swept', async () => {
    const sink: RawSink = { calls: [] };
    const user = await toSweep({ raw: sink, wrongTag: true });
    await screen.findByText('5 USDC');
    await user.click(screen.getByLabelText(/Directly/));
    await user.type(screen.getByLabelText('Destination address (your own wallet)'), DEST);
    await user.click(screen.getByRole('button', { name: 'Sign and broadcast directly' }));
    expect(await screen.findByText('Submitted')).toBeTruthy();
    expect(sink.raw).toMatch(/^0x02/);
  });

  describe('M1: relayed sweep lock', () => {
    const DEADLINE = 1_800_000_000 + 1200;
    const quoteThen = (sweep: () => Promise<Response>): Services['fetchFn'] => (url) => {
      if (url.endsWith('/v1/quote')) return Promise.resolve(new Response(JSON.stringify({ fee: '25000', feeTo: FAKE_FEE_RECIPIENT, expiresAt: 1_800_000_100, quoteToken: 'tok' })));
      return sweep();
    };
    async function submitRelayed(fetchFn: Services['fetchFn'], sink: RawSink): Promise<ReturnType<typeof userEvent.setup>> {
      const user = await toSweep({ relayer: true, fetchFn, raw: sink });
      await screen.findByText('5 USDC');
      await user.type(screen.getByLabelText('Destination address (your own wallet)'), DEST);
      await user.click(screen.getByRole('button', { name: 'Get relayer quote' }));
      await screen.findByText(/Relayer fee: 0\.025 USDC/);
      await user.click(screen.getByRole('button', { name: 'Sign and submit to relayer' }));
      return user;
    }
    const directDisabled = async (user: ReturnType<typeof userEvent.setup>): Promise<boolean> => {
      await user.click(screen.getByLabelText(/Directly/));
      return screen.getByRole<HTMLButtonElement>('button', { name: 'Sign and broadcast directly' }).disabled;
    };

    it('an unreachable relayer keeps signing disarmed across a reload until the order is past deadline + margin', async () => {
      const sink: RawSink = { calls: [] };
      const user = await submitRelayed(quoteThen(() => Promise.reject(new TypeError('connection reset'))), sink);
      expect(await screen.findByText('Outcome unknown')).toBeTruthy();
      expect(screen.getByText(/signed order was handed to the relayer/)).toBeTruthy();
      const journal = window.sessionStorage.getItem(SWEEP_JOURNAL_KEY) ?? '';
      expect(journal).toContain(`"deadline":${String(DEADLINE)}`);
      expect(journal).not.toContain(DEST.slice(2));

      appState.resetSweepAttemptsForTests({ keepStorage: true });
      const nav = within(screen.getByRole('navigation', { name: 'Main' }));
      await user.click(nav.getByRole('button', { name: 'Scan and receive' }));
      await user.click(nav.getByRole('button', { name: 'Sweep' }));
      await screen.findByText('5 USDC');
      expect(screen.getByText('Outcome unknown')).toBeTruthy();
      expect(await directDisabled(user)).toBe(true);

      // Within the margin after the deadline the order is not yet final.
      sink.blockTimestamp = DEADLINE + 600;
      await user.click(screen.getByRole('button', { name: 'Check status' }));
      expect(await screen.findByText(/no finalized block is far enough past its deadline/)).toBeTruthy();
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign and broadcast directly' }).disabled).toBe(true);

      sink.blockTimestamp = DEADLINE + 601;
      await user.click(screen.getByRole('button', { name: 'Check status' }));
      expect(await screen.findByText('Order expired unused')).toBeTruthy();
      expect(window.sessionStorage.getItem(SWEEP_JOURNAL_KEY)).toContain('"expired"');
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign and broadcast directly' }).disabled).toBe(false);
    });

    it('a used order nonce resolves the lock as executed', async () => {
      const sink: RawSink = { calls: [] };
      const user = await submitRelayed(quoteThen(() => Promise.resolve(new Response(JSON.stringify({ error: 'send_failed' }), { status: 503 }))), sink);
      expect(await screen.findByText('Outcome unknown')).toBeTruthy();
      expect(await directDisabled(user)).toBe(true);
      // Without a finalized block the check fails honestly instead of claiming "not executed".
      await user.click(screen.getByRole('button', { name: 'Check status' }));
      expect(await screen.findByText(/Could not check the order on chain/)).toBeTruthy();
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign and broadcast directly' }).disabled).toBe(true);
      sink.blockTimestamp = 1_800_000_010;
      sink.nonceUsed = true;
      await user.click(screen.getByRole('button', { name: 'Check status' }));
      expect(await screen.findByText('Order executed on chain')).toBeTruthy();
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign and broadcast directly' }).disabled).toBe(false);
    });

    it.each([
      ['409 nonce_used', 409, JSON.stringify({ error: { code: 'nonce_used' } })],
      ['503 send_failed', 503, JSON.stringify({ error: { code: 'send_failed' } })],
      ['403 from a CDN/WAF without the relayer envelope', 403, '<html>blocked</html>'],
      ['422 with an unknown class', 422, JSON.stringify({ error: { code: 'brand_new_code' } })],
    ])('%s: the order may have been broadcast, so the lock stays', async (_n, status, body) => {
      const sink: RawSink = { calls: [] };
      const user = await submitRelayed(quoteThen(() => Promise.resolve(new Response(body, { status }))), sink);
      expect(await screen.findByText('Outcome unknown')).toBeTruthy();
      expect(await directDisabled(user)).toBe(true);
    });

    it('an accepted order keeps its lock until the chain shows it executed; the relayer hash is labelled unverified', async () => {
      const sink: RawSink = { calls: [] };
      const user = await submitRelayed(quoteThen(() => Promise.resolve(new Response(JSON.stringify({ txHash: `0x${'36'.repeat(32)}` }), { status: 200 }))), sink);
      expect((await screen.findAllByText('Submitted')).length).toBeGreaterThan(0);
      expect(screen.getByText(/reported by the relayer, not verified/)).toBeTruthy();
      expect(window.sessionStorage.getItem(SWEEP_JOURNAL_KEY)).toContain('"order"');
      expect(await directDisabled(user)).toBe(true);
      sink.blockTimestamp = 1_800_000_010;
      sink.nonceUsed = true;
      const before = (sink.calls ?? []).length;
      await user.click(screen.getByRole('button', { name: 'Check status' }));
      expect(await screen.findByText('Order executed on chain')).toBeTruthy();
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign and broadcast directly' }).disabled).toBe(false);
      expect((sink.calls ?? []).slice(before)).not.toContain('eth_getTransactionReceipt');
    });

    it('an explicit pre-broadcast refusal (HTTP 4xx) releases the lock', async () => {
      const sink: RawSink = { calls: [] };
      const user = await submitRelayed(quoteThen(() => Promise.resolve(new Response(JSON.stringify({ error: { code: 'quote_expired' } }), { status: 410 }))), sink);
      expect(await screen.findByText('Relayer refused the order')).toBeTruthy();
      expect(screen.getByText(/relies on the relayer/)).toBeTruthy();
      expect(screen.getByText(/HTTP 410 \(quote_expired\)/)).toBeTruthy();
      expect(window.sessionStorage.getItem(SWEEP_JOURNAL_KEY)).toContain('"refused"');
      expect(await directDisabled(user)).toBe(false);
    });

    it('nothing is posted to the relayer when the lock cannot be persisted', async () => {
      const posted: string[] = [];
      const fetchFn: Services['fetchFn'] = (url) => {
        posted.push(url);
        if (url.endsWith('/v1/quote')) return Promise.resolve(new Response(JSON.stringify({ fee: '25000', feeTo: FAKE_FEE_RECIPIENT, expiresAt: 1_800_000_100, quoteToken: 'tok' })));
        return Promise.resolve(new Response(JSON.stringify({ txHash: `0x${'34'.repeat(32)}` })));
      };
      const user = await toSweep({ relayer: true, fetchFn });
      await screen.findByText('5 USDC');
      await user.type(screen.getByLabelText('Destination address (your own wallet)'), DEST);
      await user.click(screen.getByRole('button', { name: 'Get relayer quote' }));
      await screen.findByText(/Relayer fee: 0\.025 USDC/);
      const proto = Object.getPrototypeOf(window.sessionStorage) as Storage;
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'setItem')!;
      const original = descriptor.value as (this: Storage, k: string, v: string) => void;
      proto.setItem = function (this: Storage, k: string, v: string): void {
        if (k === SWEEP_JOURNAL_KEY) throw new DOMException('quota', 'QuotaExceededError');
        original.call(this, k, v);
      };
      try {
        await user.click(screen.getByRole('button', { name: 'Sign and submit to relayer' }));
        expect(await screen.findByText('Signing disabled in this tab')).toBeTruthy();
      } finally {
        Object.defineProperty(proto, 'setItem', descriptor);
      }
      expect(posted).toEqual(['https://relay.test/v1/quote']);
    });
  });
});

describe('L1-02: the vault step-up belongs to the loaded keys', () => {
  it('keeps asking for the vault passphrase after the saved vault is deleted', async () => {
    const raw: RawSink = {};
    const user = await toSweep({ raw, vaultPass: VAULT_PASS });
    await screen.findByText('5 USDC');
    await vaultStore.delete((await vaultStore.get())!);   // another tab, or "clear site data"
    // Leave and come back: the view now finds no saved vault, but these keys stay tied to it.
    const nav = within(screen.getByRole('navigation', { name: 'Main' }));
    await user.click(nav.getByRole('button', { name: 'Scan and receive' }));
    await user.click(nav.getByRole('button', { name: 'Sweep' }));
    await screen.findByText('5 USDC');
    expect(screen.getByLabelText('Vault passphrase (required for each sweep action)')).toBeTruthy();
    await user.click(screen.getByLabelText(/Directly/));
    await user.type(screen.getByLabelText('Destination address (your own wallet)'), DEST);
    await user.click(screen.getByRole('button', { name: 'Sign and broadcast directly' }));
    expect((await screen.findByRole('alert', {}, { timeout: 30_000 })).textContent).toMatch(/Wrong passphrase/);
    expect(raw.raw).toBeUndefined();
    await user.type(screen.getByLabelText('Vault passphrase (required for each sweep action)'), VAULT_PASS);
    await user.click(screen.getByRole('button', { name: 'Sign and broadcast directly' }));
    expect(await screen.findByText('Submitted', {}, { timeout: 30_000 })).toBeTruthy();
    expect(raw.raw).toMatch(/^0x02/);
  });
});

describe('G2-05: the vault passphrase field keeps nothing typed', () => {
  it('an idle lock clears a typed vault passphrase and its value attribute, also while the keys stay loaded', async () => {
    await toSweep({ vaultPass: VAULT_PASS });
    await screen.findByText('5 USDC');
    const field = screen.getByLabelText<HTMLInputElement>('Vault passphrase (required for each sweep action)');
    fireEvent.change(field, { target: { value: VAULT_PASS } });
    expect(field.getAttribute('value')).toBe(VAULT_PASS);
    act(() => { notifyAppLock('idle'); });
    expect(field.value).toBe('');
    expect(field.getAttribute('value') ?? '').toBe('');
  });
});

describe('G2-06: the sweep step-up is not offered to the browser password manager', () => {
  it('uses autocomplete="off" and a non-credential name, and says not to let the browser save it', async () => {
    await toSweep({ vaultPass: VAULT_PASS });
    await screen.findByText('5 USDC');
    const field = screen.getByLabelText('Vault passphrase (required for each sweep action)');
    expect(field.getAttribute('autocomplete')).toBe('off');
    expect(field.getAttribute('name')).toBe('ghostpay-step-up-sweep');
    expect(document.getElementById(field.getAttribute('aria-describedby') ?? '')?.textContent).toMatch(/Do not let your browser save it\.$/);
  });
});
