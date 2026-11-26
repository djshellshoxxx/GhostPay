// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, generateSession } from '../lib/session';
import type { TagPayload } from '../lib/tags';
import { makeServices, renderApp } from '../test/render';
import type { Services } from '../lib/services';

const tag = (clientLabel: string): TagPayload => ({
  stealthAddress: `0x${'1'.repeat(40)}`,
  announcementId: `fixture:${clientLabel}`,
  logIndex: 0,
  clientLabel,
});

/** Keep the component's real unlock/refresh UI and provide deterministic, network-free vault readbacks. */
function controlledVault(services: Services): void {
  let unlocked = false;
  vi.spyOn(services.vault, 'unlocked', 'get').mockImplementation(() => unlocked);
  vi.spyOn(services.vault, 'unlock').mockImplementation((key) => {
    key.fill(0);
    unlocked = true;
    return Promise.resolve();
  });
  vi.spyOn(services.vault, 'lock').mockImplementation(() => { unlocked = false; });
}

async function openTags(services: Services): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  renderApp(services);
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Scan and receive' }));
  await user.selectOptions(screen.getByLabelText('Chain'), '84532');
  await user.click(screen.getByRole('button', { name: 'Unlock tags' }));
  return user;
}

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(() => { vi.restoreAllMocks(); clearSession(); });

describe('chain-scoped encrypted tag display (GP-BUG-03)', () => {
  it('drops a prior chain list immediately and reloads the selected chain and returning chain', async () => {
    generateSession();
    const services = makeServices();
    controlledVault(services);
    const list = vi.spyOn(services.vault, 'list').mockImplementation((id) =>
      Promise.resolve(id === 84532 ? [tag('Base customer only')] : [tag('Sepolia customer only')]));
    const user = await openTags(services);
    expect(await screen.findByText('Base customer only')).toBeTruthy();

    await user.selectOptions(screen.getByLabelText('Chain'), '11155111');
    expect(screen.queryByText('Base customer only')).toBeNull();
    expect(await screen.findByText('Sepolia customer only')).toBeTruthy();

    await user.selectOptions(screen.getByLabelText('Chain'), '84532');
    expect(screen.queryByText('Sepolia customer only')).toBeNull();
    expect(await screen.findByText('Base customer only')).toBeTruthy();
    expect(list.mock.calls.filter(([chain]) => chain === 84532).length).toBeGreaterThanOrEqual(2);
  });

  it('does not inherit displayed tags after a seller-session replacement on the same chain', async () => {
    generateSession();
    const services = makeServices();
    controlledVault(services);
    let owner = 'Original seller tag';
    const list = vi.spyOn(services.vault, 'list').mockImplementation(() => Promise.resolve([tag(owner)]));
    await openTags(services);
    expect(await screen.findByText('Original seller tag')).toBeTruthy();

    act(() => {
      owner = 'Replacement seller tag';
      clearSession();
      generateSession();
    });
    expect(screen.queryByText('Original seller tag')).toBeNull();
    // A new seller session must require fresh authorization before exposing its tags.
    expect(screen.queryByText('Replacement seller tag')).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Unlock tags' }));
    expect(await screen.findByText('Replacement seller tag')).toBeTruthy();
    expect(list.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('ignores an obsolete chain readback even when it finishes after the new chain', async () => {
    generateSession();
    const services = makeServices();
    controlledVault(services);
    let completeBase!: (value: readonly TagPayload[]) => void;
    const pendingBase = new Promise<readonly TagPayload[]>((resolve) => { completeBase = resolve; });
    let baseReads = 0;
    const list = vi.spyOn(services.vault, 'list').mockImplementation((id) => {
      if (id === 84532 && ++baseReads === 1) return pendingBase;
      return Promise.resolve(id === 84532 ? [tag('Fresh Base tag')] : [tag('Current Sepolia tag')]);
    });
    const user = await openTags(services);
    await waitFor(() => expect(list.mock.calls.some(([chain]) => chain === 84532)).toBe(true));

    await user.selectOptions(screen.getByLabelText('Chain'), '11155111');
    expect(await screen.findByText('Current Sepolia tag')).toBeTruthy();
    await act(async () => { completeBase([tag('Obsolete Base tag')]); await pendingBase; });
    expect(screen.queryByText('Obsolete Base tag')).toBeNull();
    expect(screen.getByText('Current Sepolia tag')).toBeTruthy();

    await user.selectOptions(screen.getByLabelText('Chain'), '84532');
    expect(await screen.findByText('Fresh Base tag')).toBeTruthy();
    expect(screen.queryByText('Current Sepolia tag')).toBeNull();
    expect(baseReads).toBeGreaterThanOrEqual(2);
  });
});
