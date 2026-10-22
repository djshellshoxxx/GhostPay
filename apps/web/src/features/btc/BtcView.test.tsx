// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bech32 } from '@scure/base';
import { describe, expect, it } from 'vitest';
import { makeServices, renderWith } from '../../test/render';
import { BtcView } from './BtcView';
import { mockChain, SEED_A, walletA } from './fixtures.testutil';

const BCRT = bech32.encode('bcrt', [0, ...bech32.toWords(new Uint8Array(20).fill(3))]);

async function setup(over: Partial<{ failPath: string }> = {}) {
  const chain = mockChain('regtest', walletA());
  if (over.failPath !== undefined) chain.failPath = over.failPath;
  const user = userEvent.setup();
  renderWith(<BtcView />, makeServices({ fetchFn: chain.fetchFn }));
  await user.selectOptions(screen.getByLabelText('Network'), 'regtest');
  await user.type(screen.getByLabelText(/Esplora server URL/), 'https://esplora.test/api');
  return { chain, user };
}

async function importSeed(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Or import a seed/), SEED_A);
  await user.click(screen.getByRole('button', { name: 'Import seed' }));
}

describe('BtcView', () => {
  it('shows test-only warning and keeps mainnet disabled', () => {
    renderWith(<BtcView />, makeServices());
    expect(screen.getByText(/Mainnet is disabled/)).toBeTruthy();
    expect(screen.getByRole<HTMLOptionElement>('option', { name: /mainnet/i }).disabled).toBe(true);
  });

  it('creates a wallet, shows the seed once, address, payment instructions, and locks', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Create new test wallet' }));
    expect(screen.getByText(/Backup seed/)).toBeTruthy();
    expect(screen.getByText(/^tsp1/)).toBeTruthy();
    expect(screen.getByText(/Payment instructions/)).toBeTruthy();
    await user.type(screen.getByLabelText(/Optional amount/), '0.001');
    expect(screen.getAllByText(/amount=0.001/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Hide seed' }));
    expect(screen.queryByText(/Backup seed/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Lock and forget keys' }));
    expect(screen.getByRole('button', { name: 'Create new test wallet' })).toBeTruthy();
  });

  it('rejects a malformed seed with a message', async () => {
    const { user } = await setup();
    await user.type(screen.getByLabelText(/Or import a seed/), 'abc');
    await user.click(screen.getByRole('button', { name: 'Import seed' }));
    expect(screen.getByRole('alert').textContent).toMatch(/64 hexadecimal/);
  });

  it('scans, reviews, requires approval, signs and broadcasts', async () => {
    const { chain, user } = await setup();
    await importSeed(user);
    expect(screen.queryByText(/Backup seed/)).toBeNull();
    await user.type(screen.getByLabelText(/First block height/), '0');
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 unspent payment/);
    expect(screen.getByText('0.0005 BTC')).toBeTruthy();
    expect(screen.getByText(/Output and spent status were checked with the configured Esplora provider/).textContent)
      .toMatch(/single-provider check, not independent verification/i);
    expect(screen.getByRole('checkbox', { name: /Sweep [0-9a-f]{64}:1/ })).toBeTruthy();
    expect(screen.getByText('Unique in this scan')).toBeTruthy();

    await user.type(screen.getByLabelText('Destination address'), BCRT);
    const fee = screen.getByLabelText(/Fee rate/);
    await user.clear(fee);
    await user.type(fee, '2');
    await user.click(screen.getByRole('button', { name: 'Review sweep' }));
    expect(screen.getByText('Review before signing')).toBeTruthy();
    expect(screen.getAllByText(BCRT).length).toBeGreaterThan(0);

    const sign = screen.getByRole('button', { name: 'Sign with software key' });
    expect((sign as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: /I checked the destination/ }));
    await user.click(sign);
    await screen.findByText('Signed transaction');
    expect(chain.broadcasts).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: /Broadcast to/ }));
    await screen.findByText(/The server accepted transaction/);
    expect(chain.broadcasts).toHaveLength(1);
    expect(chain.broadcasts[0]).toMatch(/^[0-9a-f]+$/);
  });

  it('validates scanned Bitcoin destinations for the selected test network before filling them', async () => {
    const { user } = await setup();
    await importSeed(user);
    await user.type(screen.getByLabelText(/First block height/), '0');
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 unspent payment/);

    const paste = screen.getByLabelText('Or paste QR text');
    await user.type(paste, 'tb1q000000000000000000000000000000000000000');
    await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/valid|network/i);
    expect(screen.getByLabelText<HTMLInputElement>('Destination address').value).toBe('');

    await user.clear(paste);
    await user.type(paste, BCRT);
    await user.click(screen.getByRole('button', { name: 'Use pasted text' }));
    expect(screen.getByLabelText<HTMLInputElement>('Destination address').value).toBe(BCRT);
  });

  it('reports a bad destination, deselected inputs and server failures', async () => {
    const { chain, user } = await setup();
    await importSeed(user);
    await user.type(screen.getByLabelText(/First block height/), '0');
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 unspent payment/);
    await user.type(screen.getByLabelText('Destination address'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Review sweep' }));
    expect(screen.getByRole('alert').textContent).toMatch(/not valid for this network/);

    await user.click(screen.getByRole('checkbox', { name: /^Sweep / }));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Review sweep' }).disabled).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: /^Sweep / }));

    chain.failPath = '/blocks/tip/height';
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/could not be reached|refused/); });
  });

  it('refuses a server on a different network', async () => {
    const chain = mockChain('signet', walletA('signet'));
    const user = userEvent.setup();
    renderWith(<BtcView />, makeServices({ fetchFn: chain.fetchFn }));
    await user.selectOptions(screen.getByLabelText('Network'), 'regtest');
    await user.type(screen.getByLabelText(/Esplora server URL/), 'https://esplora.test/api');
    await importSeed(user);
    await user.type(screen.getByLabelText(/First block height/), '0');
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/not on the network/); });
  });

  it('requires a numeric start height and a valid URL, and can fail to broadcast', async () => {
    const { chain, user } = await setup();
    await importSeed(user);
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/first block height/); });
    await user.type(screen.getByLabelText(/First block height/), '0');
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 unspent payment/);
    await user.type(screen.getByLabelText('Destination address'), BCRT);
    await user.click(screen.getByRole('button', { name: 'Review sweep' }));
    await user.click(screen.getByRole('checkbox', { name: /I checked the destination/ }));
    await user.click(screen.getByRole('button', { name: 'Sign with software key' }));
    chain.failPath = '/tx';
    await user.click(screen.getByRole('button', { name: /Broadcast to/ }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/could not be reached|refused/); });
    expect(screen.getByText('Signed transaction')).toBeTruthy();
  });
});
