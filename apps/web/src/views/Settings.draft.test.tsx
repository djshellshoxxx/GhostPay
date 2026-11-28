// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SETTINGS_KEY } from '../lib/settings';
import { DEFAULT_SCAN_PRIVACY, SCAN_PRIVACY_KEY } from '../lib/scanPrivacy';
import { DEFAULT_SCAN_LANES, SCAN_LANES_KEY } from '../lib/scanSpam';
import { makeServices, renderApp } from '../test/render';
import { mockRpc } from '../test/mockRpc';

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});
const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
beforeAll(() => {
  // jsdom has the element but does not implement native top-layer presentation.
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.open = false; } });
});
afterAll(() => {
  for (const [key, old] of [['showModal', originalShow], ['close', originalClose]] as const) {
    if (old) Object.defineProperty(HTMLDialogElement.prototype, key, old);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, key);
  }
});
afterEach(() => { vi.restoreAllMocks(); });

async function open(services = makeServices()) {
  const user = userEvent.setup();
  renderApp(services);
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Settings' }));
  return user;
}

function navigate() {
  const callbacks = { proceed: vi.fn(), cancel: vi.fn() };
  act(() => {
    const event = new CustomEvent('ghostpay:settings-navigation', { detail: callbacks, cancelable: true });
    if (window.dispatchEvent(event)) callbacks.proceed();
  });
  return callbacks;
}

describe('Settings drafts', () => {
  it('protects general changes, validates on leave, and restores a clean state after normalization', async () => {
    const user = await open();
    expect(navigate().proceed).toHaveBeenCalledOnce();
    const rpc = screen.getByLabelText('Base Sepolia RPC URL');
    fireEvent.change(rpc, { target: { value: 'http://bad.example' } });
    expect(screen.getByText('Unsaved changes.')).toBeTruthy();
    const stay = navigate();
    await user.click(screen.getByRole('button', { name: 'Stay here' }));
    expect(stay.cancel).toHaveBeenCalledOnce();
    const invalid = navigate();
    await user.click(screen.getByRole('button', { name: 'Save and leave' }));
    expect(invalid.cancel).toHaveBeenCalledOnce();
    const alert = screen.getByRole('alert');
    expect(rpc.getAttribute('aria-describedby')?.split(' ')).toContain(alert.id);
    expect(rpc.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(rpc);
    fireEvent.change(rpc, { target: { value: 'https://good.example' } });
    const discard = navigate();
    await user.click(screen.getByRole('button', { name: 'Discard and leave' }));
    expect(discard.proceed).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem(SETTINGS_KEY)).toBeNull();
    const save = navigate();
    await user.click(screen.getByRole('button', { name: 'Save and leave' }));
    expect(save.proceed).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem(SETTINGS_KEY)).toContain('https://good.example/');
    expect(screen.queryByText('Unsaved changes.')).toBeNull();
    fireEvent.change(rpc, { target: { value: '' } });
    expect(screen.queryByText('Settings saved.')).toBeNull();
  });

  it('leaves scan drafts independent of the general save, and refuses navigation after a storage failure', async () => {
    const user = await open();
    const windowInput = screen.getByLabelText(/lookback window|window.*blocks/i);
    fireEvent.change(windowInput, { target: { value: '213' } });
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(window.localStorage.getItem(SCAN_PRIVACY_KEY)).toBeNull();
    const save = navigate();
    const fail = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('unavailable'); });
    await user.click(screen.getByRole('button', { name: 'Save and leave' }));
    expect(save.cancel).toHaveBeenCalledOnce();
    expect(screen.getByText('Unsaved changes.')).toBeTruthy();
    fail.mockRestore();
    const retry = navigate();
    await user.click(screen.getByRole('button', { name: 'Save and leave' }));
    expect(retry.proceed).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem(SCAN_PRIVACY_KEY)).toContain('213');
    expect(screen.queryByText('Unsaved changes.')).toBeNull();
  });

  it('lets an untouched scan form follow the other tab without prompting to discard anything', async () => {
    await open();
    window.localStorage.setItem(SCAN_LANES_KEY, JSON.stringify({ ...DEFAULT_SCAN_LANES, matchCover: true }));
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: SCAN_LANES_KEY })); });
    expect(screen.getByLabelText<HTMLInputElement>(/Blur which payments matched/).checked).toBe(true);
    expect(screen.queryByText('Unsaved changes.')).toBeNull();
    expect(navigate().proceed).toHaveBeenCalledOnce();
  });

  it('returns to the updated scan form if a second tab saves while the leave dialog is open', async () => {
    const user = await open();
    const endpoint = screen.getByLabelText<HTMLInputElement>('Base Sepolia scan endpoint');
    fireEvent.change(endpoint, { target: { value: 'https://draft.example/' } });
    const pending = navigate();
    const elsewhere = JSON.stringify({ ...DEFAULT_SCAN_PRIVACY, windowBlocks: 320 });
    window.localStorage.setItem(SCAN_PRIVACY_KEY, elsewhere);
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: SCAN_PRIVACY_KEY })); });
    await user.click(screen.getByRole('button', { name: 'Save and leave' }));
    expect(pending.cancel).toHaveBeenCalledOnce();
    expect(pending.proceed).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(SCAN_PRIVACY_KEY)).toBe(elsewhere);
    expect(screen.getByLabelText<HTMLInputElement>(/Fixed scan window/).value).toBe('320');
    expect(endpoint.value).toBe('https://draft.example/');
    const reviewed = navigate();
    await user.click(screen.getByRole('button', { name: 'Save and leave' }));
    expect(reviewed.proceed).toHaveBeenCalledOnce();
    expect(JSON.parse(window.localStorage.getItem(SCAN_PRIVACY_KEY)!)).toMatchObject({
      windowBlocks: 320, endpoints: { '84532': 'https://draft.example/' },
    });
  });

  it('tests the selected secondary URL and ignores its stale result while preserving the primary result', async () => {
    let finish: (() => void) | undefined;
    const rpc = mockRpc(84532, () => '0x');
    const createRpc = vi.fn<ReturnType<typeof makeServices>['createRpc']>((_chain, url) =>
      url.includes('second') ? new Promise((resolve) => { finish = () => resolve(rpc); }) : Promise.resolve(rpc));
    const user = await open(makeServices({ createRpc }));
    const primary = screen.getByLabelText('Base Sepolia RPC URL');
    const secondary = screen.getByLabelText('Base Sepolia second RPC URL (optional)');
    fireEvent.change(primary, { target: { value: 'https://first.example' } });
    fireEvent.change(secondary, { target: { value: 'https://second.example' } });
    await user.click(screen.getByRole('button', { name: 'Test primary RPC for Base Sepolia' }));
    await user.click(screen.getByRole('button', { name: 'Test second Base Sepolia RPC' }));
    expect(createRpc.mock.calls.map(([, url]) => url)).toEqual(['https://first.example/', 'https://second.example/']);
    fireEvent.change(secondary, { target: { value: 'https://replacement.example' } });
    await act(async () => { finish?.(); await Promise.resolve(); });
    expect(screen.getByRole('status', { name: 'Test primary RPC for Base Sepolia' }).textContent).toMatch(/Connected/);
    expect(screen.getByRole('status', { name: 'Test second Base Sepolia RPC' }).textContent).toBe('');
  });
});
