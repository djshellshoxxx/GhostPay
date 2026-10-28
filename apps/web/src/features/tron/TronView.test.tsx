// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { hexToBytes } from '@noble/hashes/utils.js';
import { decodeRawTx } from '@ghostpay/tron-adapter';
import { describe, expect, it, vi } from 'vitest';
import { makeServices, renderWith } from '../../test/render';
import { BACKUP_A, DEST, mockTron, walletA, type MockTron } from './fixtures.testutil';
import { MAINNET_GENESIS } from './network';
import { TronView } from './TronView';

type User = ReturnType<typeof userEvent.setup>;

async function setup(over: Partial<Pick<MockTron, 'failPath' | 'genesis' | 'destActive'>> = {}) {
  const chain = mockTron(walletA());
  Object.assign(chain, over);
  const user = userEvent.setup();
  renderWith(<TronView />, makeServices({ fetchFn: chain.fetchFn }));
  await user.selectOptions(screen.getByLabelText('Network'), 'local');
  await user.type(screen.getByLabelText(/Node URL/), 'http://127.0.0.1:9090');
  return { chain, user };
}

async function importKeys(user: User) {
  await user.type(screen.getByLabelText(/Or import keys/), BACKUP_A);
  await user.click(screen.getByRole('button', { name: 'Import keys' }));
}

async function scan(user: User) {
  await user.type(screen.getByLabelText(/First block/), '0');
  await user.click(screen.getByRole('button', { name: 'Scan' }));
  await screen.findByText(/1 funded payment/);
}

async function review(user: User) {
  await user.type(screen.getByLabelText('Destination address'), DEST);
  await user.click(screen.getByRole('button', { name: 'Review sweep' }));
  await screen.findByText('Review before signing');
}

describe('TronView', () => {
  it('shows the test-only warning and keeps mainnet disabled', () => {
    renderWith(<TronView />, makeServices());
    expect(screen.getByText(/Mainnet is disabled/)).toBeTruthy();
    expect(screen.getByRole<HTMLOptionElement>('option', { name: /mainnet/i }).disabled).toBe(true);
  });

  it('creates a wallet whose key backup stays hidden until asked for, the request QR, instructions, and locks', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Create new test wallet' }));
    // The backup is not in the page until asked for.
    expect(screen.queryByText(/^[0-9a-f]{128}$/)).toBeNull();
    expect(screen.getByText('Backup keys')).toBeTruthy();
    const meta = screen.getAllByText(/^st:trx:0x/)[0]?.textContent;
    expect(meta).toBeTruthy();
    expect(screen.getByText(/Payment instructions/)).toBeTruthy();
    expect(screen.getAllByText(/TRON stealth payment request/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Show backup keys' }));
    const backup = screen.getByText(/^[0-9a-f]{128}$/).textContent ?? '';
    await user.click(screen.getByRole('button', { name: 'Hide keys' }));
    expect(screen.queryByText(/^[0-9a-f]{128}$/)).toBeNull();
    // It can be shown again while the wallet is loaded, and it is this wallet's backup.
    await user.click(screen.getByRole('button', { name: 'Show backup keys' }));
    expect(screen.getByText(/^[0-9a-f]{128}$/).textContent).toBe(backup);
    await user.click(screen.getByRole('button', { name: 'Lock and forget keys' }));
    expect(screen.getByRole('button', { name: 'Create new test wallet' })).toBeTruthy();
    expect(screen.queryByText(/Payment instructions/)).toBeNull();
    await user.type(screen.getByLabelText(/Or import keys/), backup);
    await user.click(screen.getByRole('button', { name: 'Import keys' }));
    expect(screen.getAllByText(/^st:trx:0x/)[0]?.textContent).toBe(meta);
    expect(screen.queryByRole('button', { name: 'Show backup keys' })).toBeNull();
  });

  it('copies the key backup only after a warning, and Lock empties the clipboard again', async () => {
    const { user } = await setup();
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await user.click(screen.getByRole('button', { name: 'Create new test wallet' }));
    await user.click(screen.getByRole('button', { name: 'Show backup keys' }));
    const backup = screen.getByText(/^[0-9a-f]{128}$/).textContent;
    await user.click(screen.getByRole('button', { name: 'Copy keys' }));
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByText(/Other apps and web pages can read the clipboard/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Copy anyway' }));
    expect(writeText).toHaveBeenCalledExactlyOnceWith(backup);
    await user.click(screen.getByRole('button', { name: 'Lock and forget keys' }));
    expect(writeText).toHaveBeenLastCalledWith('');
    expect(writeText).toHaveBeenCalledTimes(2);
  });

  it('imports the same keys that a backup describes', async () => {
    const { user } = await setup();
    await importKeys(user);
    expect(screen.getAllByText(walletA().metaAddress).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Backup keys/)).toBeNull();
  });

  it('rejects malformed key backups with a message', async () => {
    const { user } = await setup();
    await user.type(screen.getByLabelText(/Or import keys/), 'abc');
    await user.click(screen.getByRole('button', { name: 'Import keys' }));
    expect(screen.getByRole('alert').textContent).toMatch(/128 hexadecimal/);
    await user.clear(screen.getByLabelText(/Or import keys/));
    await user.type(screen.getByLabelText(/Or import keys/), 'ff'.repeat(64));
    await user.click(screen.getByRole('button', { name: 'Import keys' }));
    expect(screen.getByRole('alert').textContent).toMatch(/not valid keys/);
  });

  it('scans, reviews, requires approval, signs and broadcasts the sweep', async () => {
    const { chain, user } = await setup();
    await importKeys(user);
    await scan(user);
    expect(screen.getByText('5 TRX')).toBeTruthy();
    expect(screen.getByText(/single-provider check, not independent verification/i)).toBeTruthy();
    expect(screen.getByRole('radio', { name: new RegExp(`Sweep ${chain.payment.stealthAddress}`) })).toBeTruthy();

    await review(user);
    expect(screen.getAllByText(DEST).length).toBeGreaterThan(0);
    const sign = screen.getByRole<HTMLButtonElement>('button', { name: 'Sign with software key' });
    expect(sign.disabled).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: /I checked the destination/ }));
    await user.click(sign);
    await screen.findByText('Signed transaction');
    expect(chain.broadcasts).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: /Broadcast to/ }));
    await screen.findByText(/The node accepted transaction/);
    expect(chain.broadcasts).toHaveLength(1);
    const bytes = hexToBytes(chain.broadcasts[0] as string);
    expect(bytes[0]).toBe(0x0a);
    let at = 1;
    let len = 0;
    for (let shift = 0; ; shift += 7) {
      const b = bytes[at++] as number;
      len |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
    }
    const raw = decodeRawTx(bytes.subarray(at, at + len));
    expect(raw.owner).toBe(chain.payment.stealthAddress);
    expect(raw.to).toBe(DEST);
    expect(raw.amount).toBeGreaterThan(3_000_000n);
    expect(raw.amount).toBeLessThan(5_000_000n);
  });

  it('warns that a never-used destination costs an activation fee', async () => {
    const { user } = await setup({ destActive: false });
    await importKeys(user);
    await scan(user);
    await review(user);
    expect(screen.getByText(/never been used on-chain/)).toBeTruthy();
  });

  it('validates scanned destinations before filling them', async () => {
    const { user } = await setup();
    await importKeys(user);
    await scan(user);
    const paste = screen.getByLabelText('Or paste QR text');
    await user.type(paste, 'not-an-address');
    await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/not a valid TRON address/);
    expect(screen.getByLabelText<HTMLInputElement>('Destination address').value).toBe('');

    await user.clear(paste);
    await user.type(paste, DEST);
    await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
    expect(screen.getByLabelText<HTMLInputElement>('Destination address').value).toBe(DEST);
  });

  it('reports a bad destination, sweeping to the one-time address itself, and node failures', async () => {
    const { chain, user } = await setup();
    await importKeys(user);
    await scan(user);
    await user.type(screen.getByLabelText('Destination address'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Review sweep' }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/not a valid TRON address/); });
    await user.clear(screen.getByLabelText('Destination address'));
    await user.type(screen.getByLabelText('Destination address'), chain.payment.stealthAddress);
    await user.click(screen.getByRole('button', { name: 'Review sweep' }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/different address/); });

    chain.failPath = '/wallet/getnowblock';
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/could not be reached|refused|failed/i); });
  });

  it('refuses a node that reports the mainnet genesis block', async () => {
    const { chain, user } = await setup({ genesis: MAINNET_GENESIS });
    await importKeys(user);
    await user.type(screen.getByLabelText(/First block/), '0');
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/mainnet/i); });
    expect(chain.calls).not.toContain('/wallet/getnowblock');
  });

  it('requires a numeric start block', async () => {
    const { user } = await setup();
    await importKeys(user);
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/first block/i); });
  });

  it('drops a scan that finishes after the keys were locked', async () => {
    const chain = mockTron(walletA());
    let release: () => void = () => undefined;
    chain.gate = new Promise<void>((r) => { release = r; });
    const user = userEvent.setup();
    renderWith(<TronView />, makeServices({ fetchFn: chain.fetchFn }));
    await user.selectOptions(screen.getByLabelText('Network'), 'local');
    await user.type(screen.getByLabelText(/Node URL/), 'http://127.0.0.1:9090');
    await importKeys(user);
    await user.type(screen.getByLabelText(/First block/), '0');
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await waitFor(() => { expect(chain.calls).toContain('/wallet/getnowblock'); });
    await user.click(screen.getByRole('button', { name: 'Lock and forget keys' }));
    release();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/funded payment/)).toBeNull();
    expect(screen.queryByText(/Scanned blocks/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Create new test wallet' })).toBeTruthy();
  });

  it('refuses to sign when the balance changed since the review', async () => {
    const { chain, user } = await setup();
    await importKeys(user);
    await scan(user);
    await review(user);
    await user.click(screen.getByRole('checkbox', { name: /I checked the destination/ }));
    chain.balanceSun = 1_000_000;
    await user.click(screen.getByRole('button', { name: 'Sign with software key' }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/balance changed/i); });
    expect(screen.queryByText('Signed transaction')).toBeNull();
  });

  it('can fail to broadcast and keeps the signed transaction', async () => {
    const { chain, user } = await setup();
    await importKeys(user);
    await scan(user);
    await review(user);
    await user.click(screen.getByRole('checkbox', { name: /I checked the destination/ }));
    await user.click(screen.getByRole('button', { name: 'Sign with software key' }));
    await screen.findByText('Signed transaction');
    chain.failPath = '/wallet/broadcasthex';
    await user.click(screen.getByRole('button', { name: /Broadcast to/ }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/could not be reached|refused|failed/i); });
    expect(screen.getByText('Signed transaction')).toBeTruthy();
  });
});

describe('plain payment request', () => {
  it('offers a TRON request QR with text and copy on a named network', async () => {
    const { user } = await setup();
    await user.selectOptions(screen.getByLabelText('Network'), 'nile');
    await user.click(screen.getByRole('button', { name: 'Create new test wallet' }));
    await user.type(screen.getByLabelText('Receive address'), DEST);
    expect(screen.getByTestId('payment-request-text').textContent).toMatch(/^tron:/);
    expect(screen.getByRole('button', { name: 'Copy payment request' })).toBeTruthy();
  });
});
