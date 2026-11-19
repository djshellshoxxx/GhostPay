// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeServices, renderWith } from '../../test/render';
import { BtcView } from './BtcView';
import { SEED_A } from './fixtures.testutil';
import { oracleFixture } from './oracle.testutil';

describe('explicit source selection', () => {
  it('makes no oracle request before consent, proves light results and invalidates them on source changes', async () => {
    const f = await oracleFixture(); const user = userEvent.setup();
    renderWith(<BtcView scanWorkerFactory={f.factory} />, makeServices({ fetchFn: f.fetchFn }));
    await user.selectOptions(screen.getByLabelText('Network'), 'regtest');
    await user.type(screen.getByLabelText(/Esplora server URL/), 'https://esplora.test/api');
    await user.selectOptions(screen.getByLabelText('Additional scan source'), 'http');
    await user.type(screen.getByLabelText('BlindBit oracle URL'), 'https://oracle.test');
    await user.click(screen.getByLabelText('Use light oracle scans with transaction inclusion proofs'));
    expect(screen.getByText(/The oracle can still omit payments/)).toBeTruthy();
    expect(f.calls).toHaveLength(0);
    await user.type(screen.getByLabelText(/Or import a seed/), SEED_A); await user.click(screen.getByRole('button', { name: 'Import seed' }));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Scan' }).disabled).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: /Allow required provider checks for this light scan/ }));
    await user.type(screen.getByLabelText(/First block height/), '1'); await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 unspent payment/);
    expect(f.chain.requests.some((path) => path.endsWith('/merkle-proof'))).toBe(true);
    await user.click(screen.getByText('What the scan checks, and what it does not'));
    expect(screen.getByText(/It does not verify witness data/)).toBeTruthy();
    expect(screen.queryByText(/coinbase witness commitment \(BIP-141\)/)).toBeNull();
    await user.type(screen.getByLabelText('BlindBit oracle URL'), '/other');
    await waitFor(() => expect(screen.queryByText(/1 unspent payment/)).toBeNull());
    expect(screen.queryByRole('checkbox', { name: /^Sweep / })).toBeNull();
  });
});
