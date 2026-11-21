// @vitest-environment jsdom
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeServices, renderWith } from '../../test/render';
import { BACKUP_A, DEST, mockTron, walletA } from './fixtures.testutil';
import { TronView } from './TronView';

describe('TRON review privacy consent (TM13)', () => {
  it.each([
    ['/wallet/getblockbylimitnext', 'lock'],
    ['/wallet/getaccount', 'lock'],
    ['/wallet/getchainparameters', 'lock'],
    ['/wallet/getblockbylimitnext', 'endpoint'],
    ['/wallet/getaccount', 'unmount'],
  ] as const)('stops new review requests after %s completes under %s cancellation', async (pausePath, cancel) => {
    const chain = mockTron(walletA());
    const requests: string[] = [];
    let armed = false;
    let paused = false;
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let pending: Promise<Response> | undefined;
    const user = userEvent.setup();
    const rendered = renderWith(<TronView />, makeServices({
      fetchFn: (url, init) => {
        const path = new URL(url).pathname;
        requests.push(path);
        if (armed && !paused && path === pausePath) {
          paused = true;
          // The provider deliberately ignores AbortSignal. Cancelling cannot recall this request;
          // the review flow must still refuse every later address/memo-bearing request.
          pending = gate.then(() => chain.fetchFn(url, init));
          return pending;
        }
        return chain.fetchFn(url, init);
      },
    }));
    await user.selectOptions(screen.getByLabelText('Network'), 'local');
    await user.type(screen.getByLabelText(/Node URL/), 'http://127.0.0.1:9090');
    await user.type(screen.getByLabelText(/Or import keys/), BACKUP_A);
    await user.click(screen.getByRole('button', { name: 'Import keys' }));
    await user.type(screen.getByLabelText(/First block/), '0');
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 payment\(s\) found/);
    expect(requests).not.toContain('/wallet/getaccount');
    expect(requests).not.toContain('/wallet/gettransactionbyid');
    await user.type(screen.getByLabelText('Destination address'), DEST);
    armed = true;
    await user.click(screen.getByRole('button', { name: 'Review sweep' }));
    await waitFor(() => { expect(paused).toBe(true); });
    const sentBeforeCancel = requests.length;
    if (cancel === 'lock') await user.click(screen.getByRole('button', { name: 'Lock and forget keys' }));
    else if (cancel === 'endpoint') await user.clear(screen.getByLabelText(/Node URL/));
    else rendered.unmount();
    await act(async () => {
      release();
      await pending;
    });
    expect(requests).toHaveLength(sentBeforeCancel);
    expect(screen.queryByText('Review before signing')).toBeNull();
    expect(chain.broadcasts).toEqual([]);
  });
});
