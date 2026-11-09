// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockRpc } from '../test/mockRpc';
import { makeServices, renderApp } from '../test/render';

beforeEach(() => { window.localStorage.clear(); window.history.replaceState(null, '', '/'); });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

describe('RPC test result identity', () => {
  it('never labels a newly edited URL connected using an older pending response', async () => {
    const pending = deferred<ReturnType<typeof mockRpc>>();
    const user = userEvent.setup();
    renderApp(makeServices({ createRpc: () => pending.promise }));
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Settings' }));
    const field = screen.getByLabelText('Base Sepolia RPC URL');
    await user.type(field, 'https://old.example');
    await user.click(screen.getByRole('button', { name: 'Test Base Sepolia' }));
    expect(screen.getByText('Checking…')).toBeTruthy();
    await user.clear(field);
    await user.type(field, 'https://new.example');
    await act(async () => { pending.resolve(mockRpc(84532, () => '0x')); await Promise.resolve(); });
    expect(screen.queryByText('Connected. The endpoint reports the expected chain id.')).toBeNull();
    expect(screen.queryByText('Checking…')).toBeNull();
  });

  it('keeps the newest test outcome when older requests settle out of order', async () => {
    const old = deferred<ReturnType<typeof mockRpc>>();
    const recent = deferred<ReturnType<typeof mockRpc>>();
    let requests = 0;
    const user = userEvent.setup();
    renderApp(makeServices({ createRpc: () => ++requests === 1 ? old.promise : recent.promise }));
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Settings' }));
    await user.type(screen.getByLabelText('Base Sepolia RPC URL'), 'https://rpc.example');
    await user.click(screen.getByRole('button', { name: 'Test Base Sepolia' }));
    await user.click(screen.getByRole('button', { name: 'Test Base Sepolia' }));
    await act(async () => { recent.resolve(mockRpc(84532, () => '0x')); await Promise.resolve(); });
    await screen.findByText('Connected. The endpoint reports the expected chain id.');
    await act(async () => { old.reject(new Error('private endpoint diagnostic')); await Promise.resolve(); });
    await waitFor(() => { expect(screen.getByText('Connected. The endpoint reports the expected chain id.')).toBeTruthy(); });
    expect(document.body.textContent).not.toContain('private endpoint diagnostic');
  });
});
