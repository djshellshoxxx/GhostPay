// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeServices, renderWith } from '../../test/render';
import { BACKUP_A, mockTron, walletA } from './fixtures.testutil';
import { NILE_GENESIS, SHASTA_GENESIS } from './network';
import { TronView } from './TronView';

describe('TRON view selected-network gate (TRON-4)', () => {
  it('refuses a Shasta endpoint while Nile is selected before scanning payments', async () => {
    const chain = mockTron(walletA());
    chain.genesis = SHASTA_GENESIS;
    const user = userEvent.setup();
    renderWith(<TronView />, makeServices({ fetchFn: chain.fetchFn }));
    await user.type(screen.getByLabelText(/Node URL/), 'https://test-node.example');
    await user.type(screen.getByLabelText(/Or import keys/), BACKUP_A);
    await user.click(screen.getByRole('button', { name: 'Import keys' }));
    await user.type(screen.getByLabelText(/First block/), '0');
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBeTruthy();
    });
    expect(chain.calls).not.toContain('/wallet/getnowblock');
    expect(screen.queryByText(/funded payment/)).toBeNull();
  });

  it('accepts the selected Nile genesis and completes a mocked scan', async () => {
    const chain = mockTron(walletA('nile'));
    chain.genesis = NILE_GENESIS;
    const user = userEvent.setup();
    renderWith(<TronView />, makeServices({ fetchFn: chain.fetchFn }));
    await user.type(screen.getByLabelText(/Node URL/), 'https://test-node.example');
    await user.type(screen.getByLabelText(/Or import keys/), BACKUP_A);
    await user.click(screen.getByRole('button', { name: 'Import keys' }));
    await user.type(screen.getByLabelText(/First block/), '0');
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 funded payment/);
    expect(chain.calls).toContain('/wallet/getnowblock');
  });
});
