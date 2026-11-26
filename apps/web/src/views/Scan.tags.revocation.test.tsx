// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, generateSession, revealViewingKey } from '../lib/session';
import { SETTINGS_KEY } from '../lib/settings';
import { MemoryTagStore, TagVault, type TagPayload } from '../lib/tags';
import { makeLog } from '../test/announcements';
import { FAKE_ANNOUNCER, FAKE_ROUTER } from '../test/fakeManifest';
import { chainWithLogs } from '../test/mockChain';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { makeServices, renderApp } from '../test/render';

beforeEach(() => { clearSession(); localStorage.clear(); history.replaceState(null, '', '/'); });
afterEach(() => { cleanup(); clearSession(); vi.restoreAllMocks(); });

async function openTaggedPayment() {
  const session = generateSession();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
  const mine = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: session.metaAddress, block: 120, index: 0, caller: FAKE_ROUTER, amount: 2_500_000n });
  const rpc = chainWithLogs(84532, 500, [mine.log]);
  const store = new MemoryTagStore();
  const vault = new TagVault(store);
  const tag: TagPayload = { stealthAddress: mine.stealthAddress, announcementId: `${mine.log.transactionHash}:0`, logIndex: 0, clientLabel: 'Persisted private client' };
  await vault.unlock(revealViewingKey());
  await vault.save(84532, tag);
  vault.lock();
  const user = userEvent.setup();
  renderApp(makeServices({ vault, loadManifest: (id) => Promise.resolve({ status: 'loaded', manifest: backedManifest(id) }), createRpc: () => Promise.resolve(withManifestChain(rpc)) }));
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Scan and receive' }));
  await user.selectOptions(screen.getByLabelText('Chain'), '84532');
  fireEvent.change(screen.getByLabelText('Start block'), { target: { value: '100' } });
  await user.click(screen.getByRole('button', { name: 'Start scan' }));
  await screen.findByText('Payments found');
  return { user, store, vault, tag };
}

async function unlock(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Unlock tags' }));
  await screen.findByRole('button', { name: 'Lock tags' });
}

describe('Scan tag presentation access intervals', () => {
  it('hides decrypted labels and clears unsaved drafts on lock, then reloads only saved labels after explicit unlock', async () => {
    const { user, store } = await openTaggedPayment();
    await unlock(user);
    await screen.findByText('Persisted private client', { selector: 'strong' });
    fireEvent.change(screen.getByLabelText('Client tag (stored encrypted on this device)'), { target: { value: 'Unsaved private draft' } });
    const ciphertext = await store.getSnapshot();
    await user.click(screen.getByRole('button', { name: 'Lock tags' }));
    expect(screen.queryByText('Persisted private client')).toBeNull();
    expect(screen.queryByDisplayValue('Unsaved private draft')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save tag' })).toBeNull();
    expect(await store.getSnapshot()).toEqual(ciphertext);
    await unlock(user);
    await screen.findByText('Persisted private client', { selector: 'strong' });
    expect(screen.getByLabelText<HTMLInputElement>('Client tag (stored encrypted on this device)').value).toBe('');
    expect(await store.getSnapshot()).toEqual(ciphertext);
  });

  it.each(['find', 'list'] as const)('does not repaint an obsolete %s read after a new access interval is opened', async (kind) => {
    const { user, store, vault, tag } = await openTaggedPayment();
    let finish!: () => void;
    const stale = { ...tag, clientLabel: 'Obsolete private readback' };
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const read = kind === 'find'
      ? vi.spyOn(vault, 'find').mockImplementationOnce(async () => { await pending; return stale; })
      : vi.spyOn(vault, 'list').mockImplementationOnce(async () => { await pending; return [stale]; });
    await unlock(user);
    await waitFor(() => { expect(read).toHaveBeenCalled(); });
    await user.click(screen.getByRole('button', { name: 'Lock tags' }));
    await unlock(user);
    await screen.findByText('Persisted private client', { selector: 'strong' });
    const ciphertext = await store.getSnapshot();
    await act(async () => { finish(); await pending; });
    expect(screen.queryByText('Obsolete private readback')).toBeNull();
    expect(screen.getByText('Persisted private client', { selector: 'strong' })).toBeTruthy();
    expect(await store.getSnapshot()).toEqual(ciphertext);
  });

  it('does not replace a new access interval label when an older completed save reports back late', async () => {
    const { user, store, vault } = await openTaggedPayment();
    await unlock(user);
    await screen.findByText('Persisted private client', { selector: 'strong' });
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const save = vault.save.bind(vault);
    let committed = false;
    vi.spyOn(vault, 'save').mockImplementationOnce(async (chainId, payload) => { await save(chainId, payload); committed = true; await pending; });
    fireEvent.change(screen.getByLabelText('Client tag (stored encrypted on this device)'), { target: { value: 'Old completed save' } });
    await user.click(screen.getByRole('button', { name: 'Save tag' }));
    await waitFor(() => { expect(committed).toBe(true); });
    await user.click(screen.getByRole('button', { name: 'Lock tags' }));
    await unlock(user);
    await screen.findByText('Old completed save', { selector: 'strong' });
    fireEvent.change(screen.getByLabelText('Client tag (stored encrypted on this device)'), { target: { value: 'Current access label' } });
    await user.click(screen.getByRole('button', { name: 'Save tag' }));
    await screen.findByText('Current access label', { selector: 'strong' });
    const ciphertext = await store.getSnapshot();
    await act(async () => { finish(); await pending; });
    expect(screen.queryByText('Old completed save', { selector: 'strong' })).toBeNull();
    expect(screen.getByText('Current access label', { selector: 'strong' })).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('Client tag (stored encrypted on this device)').value).toBe('Current access label');
    expect(await store.getSnapshot()).toEqual(ciphertext);
  });
});
