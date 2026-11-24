// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeServices, renderWith } from '../../test/render';
import { DEST, SEED_A, mockChain, walletA, type MockChain } from './fixtures.testutil';
import { MAINNET_GENESIS } from './network';
import { SolanaView } from './SolanaView';

type User = ReturnType<typeof userEvent.setup>;

async function setup(over: Partial<Pick<MockChain, 'failMethod' | 'genesis'>> = {}) {
  const chain = mockChain('localnet', walletA());
  Object.assign(chain, over);
  const user = userEvent.setup();
  renderWith(<SolanaView />, makeServices({ fetchFn: chain.fetchFn }));
  await user.selectOptions(screen.getByLabelText('Network'), 'localnet');
  await user.type(screen.getByLabelText(/RPC server URL/), 'http://127.0.0.1:8899');
  return { chain, user };
}

async function importSeed(user: User) {
  await user.type(screen.getByLabelText(/Or import a seed/), SEED_A);
  await user.click(screen.getByRole('button', { name: 'Import seed' }));
}

async function scan(user: User) {
  await user.type(screen.getByLabelText(/First slot/), '0');
  await user.click(screen.getByRole('button', { name: 'Scan' }));
  await screen.findByText(/1 funded payment/);
}

async function review(user: User) {
  await user.type(screen.getByLabelText('Destination address'), DEST);
  await user.click(screen.getByRole('button', { name: 'Review sweep' }));
}

describe('SolanaView', () => {
  it('shows the test-only warning and keeps mainnet disabled', () => {
    renderWith(<SolanaView />, makeServices());
    expect(screen.getByText(/Mainnet is disabled/)).toBeTruthy();
    expect(screen.getByRole<HTMLOptionElement>('option', { name: /mainnet/i }).disabled).toBe(true);
  });

  it('creates a wallet whose backup seed stays hidden until asked for, the request QR, instructions, and locks', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Create new test wallet' }));
    // The backup is not in the page until asked for.
    expect(screen.queryByText(/^[0-9a-f]{64}$/)).toBeNull();
    expect(screen.getByText('Backup seed')).toBeTruthy();
    const meta = screen.getAllByText(/^st:sol:/)[0]?.textContent;
    expect(meta).toBeTruthy();
    expect(screen.getByText(/Payment instructions/)).toBeTruthy();
    expect(screen.getAllByText(/Solana stealth payment request/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Show backup seed' }));
    const seed = screen.getByText(/^[0-9a-f]{64}$/).textContent ?? '';
    await user.click(screen.getByRole('button', { name: 'Hide seed' }));
    expect(screen.queryByText(/^[0-9a-f]{64}$/)).toBeNull();
    // It can be shown again while the wallet is loaded, and it is this wallet's seed.
    await user.click(screen.getByRole('button', { name: 'Show backup seed' }));
    expect(screen.getByText(/^[0-9a-f]{64}$/).textContent).toBe(seed);
    await user.click(screen.getByRole('button', { name: 'Lock and forget keys' }));
    expect(screen.getByRole('button', { name: 'Create new test wallet' })).toBeTruthy();
    expect(screen.queryByText(/Payment instructions/)).toBeNull();
    await user.type(screen.getByLabelText(/Or import a seed/), seed);
    await user.click(screen.getByRole('button', { name: 'Import seed' }));
    expect(screen.getAllByText(/^st:sol:/)[0]?.textContent).toBe(meta);
    expect(screen.queryByRole('button', { name: 'Show backup seed' })).toBeNull();
  });

  it('copies the backup seed only after a warning, and Lock empties the clipboard again', async () => {
    const { user } = await setup();
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await user.click(screen.getByRole('button', { name: 'Create new test wallet' }));
    await user.click(screen.getByRole('button', { name: 'Show backup seed' }));
    const seed = screen.getByText(/^[0-9a-f]{64}$/).textContent;
    await user.click(screen.getByRole('button', { name: 'Copy seed' }));
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByText(/Other apps and web pages can read the clipboard/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Copy anyway' }));
    expect(writeText).toHaveBeenCalledExactlyOnceWith(seed);
    await user.click(screen.getByRole('button', { name: 'Lock and forget keys' }));
    expect(writeText).toHaveBeenLastCalledWith('');
    expect(writeText).toHaveBeenCalledTimes(2);
  });

  it('rejects a malformed seed with a message', async () => {
    const { user } = await setup();
    await user.type(screen.getByLabelText(/Or import a seed/), 'abc');
    await user.click(screen.getByRole('button', { name: 'Import seed' }));
    expect(screen.getByRole('alert').textContent).toMatch(/64 hexadecimal/);
  });

  it('scans, reviews, requires approval, signs and broadcasts the sweep', async () => {
    const { chain, user } = await setup();
    await importSeed(user);
    expect(screen.queryByText(/Backup seed/)).toBeNull();
    await scan(user);
    expect(screen.getByText('0.002 SOL')).toBeTruthy();
    expect(screen.getByText(/single-provider check, not independent verification/i)).toBeTruthy();
    expect(screen.getByRole('radio', { name: new RegExp(`Sweep ${chain.payment.stealthAddress}`) })).toBeTruthy();

    await review(user);
    expect(screen.getByText('Review before signing')).toBeTruthy();
    expect(screen.getByText('0.001995 SOL')).toBeTruthy();
    expect(screen.getAllByText(DEST).length).toBeGreaterThan(0);

    const sign = screen.getByRole<HTMLButtonElement>('button', { name: 'Sign with software key' });
    expect(sign.disabled).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: /I checked the destination/ }));
    await user.click(sign);
    await screen.findByText('Signed transaction');
    expect(chain.broadcasts).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: /Broadcast to/ }));
    await screen.findByText(/The server accepted transaction/);
    expect(chain.broadcasts).toHaveLength(1);
    expect(chain.broadcasts[0]).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it('validates scanned destinations before filling them', async () => {
    const { user } = await setup();
    await importSeed(user);
    await scan(user);
    const paste = screen.getByLabelText('Or paste QR text');
    await user.type(paste, 'not-an-address');
    await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/not a valid Solana address/);
    expect(screen.getByLabelText<HTMLInputElement>('Destination address').value).toBe('');

    await user.clear(paste);
    await user.type(paste, `solana:${DEST}`);
    await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
    expect(screen.getByLabelText<HTMLInputElement>('Destination address').value).toBe(DEST);
  });

  it('reports a bad destination, sweeping to the stealth address itself, and server failures', async () => {
    const { chain, user } = await setup();
    await importSeed(user);
    await scan(user);
    await user.type(screen.getByLabelText('Destination address'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Review sweep' }));
    expect(screen.getByRole('alert').textContent).toMatch(/not a valid Solana address/);
    await user.clear(screen.getByLabelText('Destination address'));
    await user.type(screen.getByLabelText('Destination address'), chain.payment.stealthAddress);
    await user.click(screen.getByRole('button', { name: 'Review sweep' }));
    expect(screen.getByRole('alert').textContent).toMatch(/different address/);

    chain.failMethod = 'getSlot';
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/could not be reached|refused|failed/i); });
  });

  it('refuses a server on a different network and any server reporting mainnet', async () => {
    const { chain, user } = await setup();
    await user.selectOptions(screen.getByLabelText('Network'), 'devnet');
    await importSeed(user);
    await user.type(screen.getByLabelText(/First slot/), '0');
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/not on the network/); });
    expect(chain.calls).not.toContain('getSignaturesForAddress');
  });

  it('refuses a local validator that reports the mainnet genesis', async () => {
    const { user } = await setup({ genesis: MAINNET_GENESIS });
    await importSeed(user);
    await user.type(screen.getByLabelText(/First slot/), '0');
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/mainnet/i); });
  });

  it('requires a numeric start slot', async () => {
    const { user } = await setup();
    await importSeed(user);
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/first slot/i); });
  });

  it('drops a scan that finishes after the keys were locked', async () => {
    const chain = mockChain('localnet', walletA());
    let release: () => void = () => undefined;
    chain.gate = new Promise<void>((r) => { release = r; });
    const user = userEvent.setup();
    renderWith(<SolanaView />, makeServices({ fetchFn: chain.fetchFn }));
    await user.selectOptions(screen.getByLabelText('Network'), 'localnet');
    await user.type(screen.getByLabelText(/RPC server URL/), 'http://127.0.0.1:8899');
    await importSeed(user);
    await user.type(screen.getByLabelText(/First slot/), '0');
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await waitFor(() => { expect(chain.calls).toContain('getSlot'); });
    await user.click(screen.getByRole('button', { name: 'Lock and forget keys' }));
    release();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/funded payment/)).toBeNull();
    expect(screen.queryByText(/Scanned slots/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Create new test wallet' })).toBeTruthy();
  });

  it('refuses to sign when the balance changed since the scan', async () => {
    const { chain, user } = await setup();
    await importSeed(user);
    await scan(user);
    await review(user);
    await user.click(screen.getByRole('checkbox', { name: /I checked the destination/ }));
    chain.balance = 1_000_000n;
    await user.click(screen.getByRole('button', { name: 'Sign with software key' }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/balance changed/i); });
    expect(screen.queryByText('Signed transaction')).toBeNull();
  });

  it('can fail to broadcast and keeps the signed transaction', async () => {
    const { chain, user } = await setup();
    await importSeed(user);
    await scan(user);
    await review(user);
    await user.click(screen.getByRole('checkbox', { name: /I checked the destination/ }));
    await user.click(screen.getByRole('button', { name: 'Sign with software key' }));
    await screen.findByText('Signed transaction');
    chain.failMethod = 'sendTransaction';
    await user.click(screen.getByRole('button', { name: /Broadcast to/ }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/could not be reached|refused|failed/i); });
    expect(screen.getByText('Signed transaction')).toBeTruthy();
  });
});

describe('plain payment request', () => {
  it('offers a Solana Pay request QR with text and copy', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Create new test wallet' }));
    await user.type(screen.getByLabelText('Receive address'), DEST);
    expect(screen.getByTestId('payment-request-text').textContent).toMatch(/^solana:/);
    expect(screen.getByRole('button', { name: 'Copy payment request' })).toBeTruthy();
  });
});
