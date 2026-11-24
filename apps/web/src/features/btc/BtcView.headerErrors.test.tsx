// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeServices, renderWith } from '../../test/render';
import { BtcView } from './BtcView';
import { mockChain, SEED_A, walletA } from './fixtures.testutil';
import * as headers from './headers';

// Each failure code of a header check has its own copy (review L-c): the sync is replaced to fail with that code.
vi.mock('./headers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./headers')>();
  return { ...actual, syncHeaders: vi.fn() };
});

const partial = { tipHeight: 0, reorgFrom: undefined, lessWork: false, saved: true, refused: false, more: false };

async function failWith(code: 'FORK_TOO_DEEP' | 'FORK_UNRESOLVED' | 'INVALID_HEADER' | 'INVALID_RESPONSE' | 'UNSUPPORTED'): Promise<void> {
  vi.mocked(headers.syncHeaders).mockRejectedValue(new headers.HeaderSyncError(code, partial));
  const chain = mockChain('regtest', walletA());
  const user = userEvent.setup();
  renderWith(<BtcView headerStore={headers.memoryHeaderStore()} />, makeServices({ fetchFn: chain.fetchFn }));
  await user.selectOptions(screen.getByLabelText('Network'), 'regtest');
  await user.type(screen.getByLabelText(/Esplora server URL/), 'https://esplora.test/api');
  await user.type(screen.getByLabelText(/Or import a seed/), SEED_A);
  await user.click(screen.getByRole('button', { name: 'Import seed' }));
  await user.click(screen.getByRole('button', { name: 'Update headers' }));
  await screen.findByText(/^Header check failed:/);
}

describe('BtcView header failure messages', () => {
  it('FORK_TOO_DEEP names the replace budget', async () => {
    await failWith('FORK_TOO_DEEP');
    expect(screen.getByText(/competing chain could not be evaluated: it would replace more than 10080 checked headers/)).toBeTruthy();
    expect(screen.queryByText(/did not overtake/)).toBeNull();
    expect(screen.getByText(/If you changed servers on purpose/)).toBeTruthy();
  });

  it('FORK_UNRESOLVED says the longer branch did not overtake within the check', async () => {
    await failWith('FORK_UNRESOLVED');
    expect(screen.getByText(/longer competing chain that did not overtake the checked one within this check/)).toBeTruthy();
    expect(screen.queryByText(/would replace more than/)).toBeNull();
    expect(screen.getByText(/If you changed servers on purpose/)).toBeTruthy();
  });

  it('INVALID_HEADER, INVALID_RESPONSE and UNSUPPORTED keep their own copy', async () => {
    await failWith('INVALID_HEADER');
    expect(screen.getByText(/a header the server sent failed validation/)).toBeTruthy();
  });

  it('INVALID_RESPONSE is not reported as a chain-rule failure', async () => {
    await failWith('INVALID_RESPONSE');
    expect(screen.getByText(/The server returned data this app cannot trust/)).toBeTruthy();
    expect(screen.queryByText(/failed validation/)).toBeNull();
  });

  it('UNSUPPORTED names the size limit', async () => {
    await failWith('UNSUPPORTED');
    expect(screen.getByText(/longer than the 400000 headers this app keeps/)).toBeTruthy();
  });
});
