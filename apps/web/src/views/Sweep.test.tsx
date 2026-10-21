// @vitest-environment jsdom
import { eip712DomainSeparator, erc20MetadataAbi, erc2612PermitAbi } from '@ghostpay/chain-adapters';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { encodeFunctionResult, keccak256 } from 'viem/utils';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Services } from '../lib/services';
import { clearSession, generateSession } from '../lib/session';
import { SETTINGS_KEY } from '../lib/settings';
import { makeLog } from '../test/announcements';
import { FAKE_ANNOUNCER, FAKE_ROUTER, fakeManifest } from '../test/fakeManifest';
import { chainWithLogs } from '../test/mockChain';
import { makeServices, renderApp } from '../test/render';

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

const loaded: Services['loadManifest'] = (id) => Promise.resolve({ status: 'loaded', manifest: fakeManifest(id) });
const DEST = '0x6666666666666666666666666666666666666666';
const TOKEN = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

function extra(balance: bigint, nativeBalance: bigint, rawSink: { raw?: string }) {
  return (method: string, params: readonly unknown[]): unknown => {
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
async function toSweep(opts: { balance?: bigint; native?: bigint; relayer?: boolean; fetchFn?: Services['fetchFn']; raw?: { raw?: string } } = {}): Promise<ReturnType<typeof userEvent.setup>> {
  const pub = generateSession();
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' }, ...(opts.relayer === true ? { relayerUrl: 'https://relay.test' } : {}) }));
  const mine = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: pub.metaAddress, block: 50, index: 0, caller: FAKE_ROUTER, amount: 5_000_000n });
  const rpc = chainWithLogs(84532, 100, [mine.log], extra(opts.balance ?? 5_000_000n, opts.native ?? 10n ** 17n, opts.raw ?? {}));
  const user = userEvent.setup();
  renderApp(makeServices({ loadManifest: loaded, createRpc: () => Promise.resolve(rpc), ...(opts.fetchFn === undefined ? {} : { fetchFn: opts.fetchFn }) }));
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

  it('shows the on-chain balance, the linkability notice, and sweeps directly with a verified signed transaction', async () => {
    const raw: { raw?: string } = {};
    const user = await toSweep({ raw });
    expect(await screen.findByText('5 USDC')).toBeTruthy();
    expect(screen.getByText('Linkability')).toBeTruthy();
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
      if (url.endsWith('/v1/quote')) return Promise.resolve(new Response(JSON.stringify({ fee: '25000', feeTo: '0x4444444444444444444444444444444444444444', expiresAt: 1_800_000_100, quoteToken: 'tok' })));
      return Promise.resolve(new Response(JSON.stringify({ txHash: `0x${'34'.repeat(32)}` }), { status: 200 }));
    };
    const user = await toSweep({ relayer: true, fetchFn });
    await screen.findByText('5 USDC');
    await user.type(screen.getByLabelText('Destination address (your own wallet)'), DEST);
    await user.click(screen.getByRole('button', { name: 'Get relayer quote' }));
    expect(await screen.findByText(/Relayer fee: 0\.025 USDC/)).toBeTruthy();
    expect(screen.getByText(/You receive: 4\.975 USDC/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Sign and submit to relayer' }));
    expect(await screen.findByText('Submitted')).toBeTruthy();
    expect(screen.getByText(`0x${'34'.repeat(32)}`)).toBeTruthy();
    expect(posted).toEqual(['https://relay.test/v1/quote', 'https://relay.test/v1/sweep']);
  });

  it('relayer path: refuses a fee above the published cap', async () => {
    const fetchFn: Services['fetchFn'] = () => Promise.resolve(new Response(JSON.stringify({ fee: '1000000', feeTo: '0x7777777777777777777777777777777777777777', expiresAt: 1_800_000_100, quoteToken: 'tok' })));
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
});
