// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { merchantIdFor, signMerchantProfile, signerPublicKeyHex, encodeBase64Url, type MerchantProfile } from '@ghostpay/invoice-schema';
import { MerchantProfilePanel } from './MerchantProfilePanel';
import { makeServices, renderWith } from '../test/render';
import { readMerchantKey, rememberMerchantKey } from '../lib/merchantIdentity';

const KEY = new Uint8Array(32).fill(5);
const NOW = 1_700_000_000;
const ORIGIN = 'https://merchant.test';
const URL = `${ORIGIN}/profile.json`;
function profile(key = KEY): MerchantProfile {
  const signer = signerPublicKeyHex(key);
  return signMerchantProfile({ v: 1, merchantId: merchantIdFor(signer), signer, name: 'Test merchant', chains: [1], tokens: ['ETH'], templates: [{ id: 'first', amountMinor: '50000', currency: 'USD', expires: 1800 }, { id: 'second', amountMinor: '9007199254740993123456', currency: 'JPY', expires: 3600 }], origins: [ORIGIN], exp: NOW + 100 }, key);
}
function mount(body = profile(), search = `?gpmu=${encodeURIComponent(URL)}&gpt=second`, fetchFn = vi.fn(() => Promise.resolve(new Response(JSON.stringify(body))))) {
  const view = renderWith(<MerchantProfilePanel search={search} />, makeServices({ nowMs: () => NOW * 1000, fetchFn }));
  return { ...view, fetchFn };
}
beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: {
    request: (_name: string, _options: unknown, action: (lock: object) => boolean) => Promise.resolve().then(() => action({})),
  } });
});

describe('merchant profile panel', () => {
  it('requires a user action before networking and shows exact signed template fields', async () => {
    const h = mount();
    expect(h.fetchFn).not.toHaveBeenCalled();
    expect(screen.getByText(/reveals your IP address/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Load profile' }));
    await screen.findByText('Test merchant');
    expect(h.fetchFn).toHaveBeenCalledTimes(1);
    expect(screen.getByText('9007199254740993123456')).toBeTruthy();
    expect(screen.getByText('JPY')).toBeTruthy();
    expect(screen.getByText(/do not create, modify or authorize an invoice/)).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Enter the full signer public key verified through an independent channel' })).toBeTruthy();
    expect(readMerchantKey(ORIGIN)).toEqual({ kind: 'absent' });
  });
  it('pins only after full-key confirmation and reports rotation without replacing the key', async () => {
    const original = profile();
    const h = mount(original);
    fireEvent.click(screen.getByRole('button', { name: 'Load profile' }));
    await screen.findByText('Test merchant');
    const save = screen.getByRole('button', { name: 'Remember verified key for this origin' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Enter the full signer public key verified through an independent channel'), { target: { value: original.signer } });
    fireEvent.click(save);
    expect(await screen.findByText('Profile key matches your saved key for this origin.')).toBeTruthy();
    expect(readMerchantKey(ORIGIN)).toEqual({ kind: 'saved', signer: original.signer });
    h.unmount();
    const rotated = profile(new Uint8Array(32).fill(6));
    mount(rotated);
    fireEvent.click(screen.getByRole('button', { name: 'Load profile' }));
    await screen.findByText(/This origin now presents a different key/);
    expect(readMerchantKey(ORIGIN)).toEqual({ kind: 'saved', signer: original.signer });
    expect(screen.queryByRole('button', { name: 'Remember verified key for this origin' })).toBeNull();
  });
  it('cannot remove a changed pin from a stale panel and updates on cross-tab storage events', async () => {
    const p = profile();
    await rememberMerchantKey(ORIGIN, p.signer, p.signer);
    mount(p);
    fireEvent.click(screen.getByRole('button', { name: 'Load profile' }));
    await screen.findByText(/matches your saved key/);
    window.localStorage.clear();
    const next = profile(new Uint8Array(32).fill(6));
    await rememberMerchantKey(ORIGIN, next.signer, next.signer);
    fireEvent.click(screen.getByRole('checkbox', { name: /forgetting this key removes change detection/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Forget the previously saved key' }));
    expect((await screen.findByRole('alert')).textContent).toContain('No trust change was accepted');
    expect(readMerchantKey(ORIGIN)).toEqual({ kind: 'saved', signer: next.signer });
    window.localStorage.clear();
    fireEvent(window, new StorageEvent('storage', { key: null }));
    expect(screen.queryByText(/different key/)).toBeNull();
  });
  it('cancels loading and ignores responses from a superseded URL', async () => {
    let resolve: ((response: Response) => void) | undefined;
    const fetchFn = vi.fn(() => new Promise<Response>((r) => { resolve = r; }));
    const h = mount(profile(), undefined, fetchFn);
    fireEvent.click(screen.getByRole('button', { name: 'Load profile' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Profile URL' }), { target: { value: 'https://other.test/p' } });
    resolve?.(new Response(JSON.stringify(profile())));
    await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Load profile' }).disabled).toBe(false); });
    expect(screen.queryByText('Test merchant')).toBeNull();
    expect(h.fetchFn).toHaveBeenCalledTimes(1);
  });
  it('does not present absent templates as a signed selection', async () => {
    mount(profile(), `?gpmu=${encodeURIComponent(URL)}&gpt=missing`);
    fireEvent.click(screen.getByRole('button', { name: 'Load profile' }));
    await screen.findByText(/requested template is not in this signed profile/);
    expect(within(screen.getByRole('combobox', { name: 'Template' })).getAllByRole('option')).toHaveLength(3);
  });
  it('displays inline profiles without silently pinning a claimed origin', () => {
    const encoded = encodeBase64Url(new TextEncoder().encode(JSON.stringify(profile())));
    const h = mount(profile(), `?gpm=${encoded}`);
    expect(screen.getByText('Test merchant')).toBeTruthy();
    expect(screen.getByText(/Inline profiles have no authenticated source origin/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remember verified key for this origin' })).toBeNull();
    expect(h.fetchFn).not.toHaveBeenCalled();
  });
  it('rechecks expiry after a slow response and before remembering a key', async () => {
    let now = NOW;
    let finish: ((response: Response) => void) | undefined;
    const fetchFn = () => new Promise<Response>((resolve) => { finish = resolve; });
    const services = makeServices({ nowMs: () => now * 1000, fetchFn });
    const view = renderWith(<MerchantProfilePanel search={`?gpmu=${encodeURIComponent(URL)}`} />, services);
    fireEvent.click(screen.getByRole('button', { name: 'Load profile' }));
    now += 101;
    finish?.(new Response(JSON.stringify(profile())));
    await screen.findByText(/profile could not be loaded or verified/);
    expect(screen.queryByText('Test merchant')).toBeNull();
    view.unmount();
    now = NOW;
    renderWith(<MerchantProfilePanel search={`?gpmu=${encodeURIComponent(URL)}`} />, services);
    fireEvent.click(screen.getByRole('button', { name: 'Load profile' }));
    finish?.(new Response(JSON.stringify(profile())));
    await screen.findByText('Test merchant');
    fireEvent.change(screen.getByLabelText('Enter the full signer public key verified through an independent channel'), { target: { value: profile().signer } });
    now += 101;
    fireEvent.click(screen.getByRole('button', { name: 'Remember verified key for this origin' }));
    expect(readMerchantKey(ORIGIN)).toEqual({ kind: 'absent' });
    expect((await screen.findByRole('alert')).textContent).toContain('No trust change was accepted');
  });

  it('rechecks key confirmation and removal consent after origin lock acquisition', async () => {
    const p = profile();
    mount(p);
    fireEvent.click(screen.getByRole('button', { name: 'Load profile' }));
    await screen.findByText('Test merchant');
    let run: (() => void) | undefined;
    Object.defineProperty(navigator, 'locks', { configurable: true, value: {
      request: (_name: string, _options: unknown, action: (lock: object) => boolean) => new Promise<boolean>((resolve) => { run = () => { resolve(action({})); }; }),
    } });
    fireEvent.change(screen.getByLabelText('Enter the full signer public key verified through an independent channel'), { target: { value: p.signer } });
    fireEvent.click(screen.getByRole('button', { name: 'Remember verified key for this origin' }));
    fireEvent.change(screen.getByLabelText('Enter the full signer public key verified through an independent channel'), { target: { value: '' } });
    run?.();
    await waitFor(() => { expect(readMerchantKey(ORIGIN)).toEqual({ kind: 'absent' }); });
    // A fresh, explicit confirmation can still save the key.
    fireEvent.change(screen.getByLabelText('Enter the full signer public key verified through an independent channel'), { target: { value: p.signer } });
    fireEvent.click(screen.getByRole('button', { name: 'Remember verified key for this origin' }));
    run?.();
    await screen.findByText(/matches your saved key/);
    fireEvent.click(screen.getByRole('checkbox', { name: /forgetting this key removes change detection/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Forget the previously saved key' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /forgetting this key removes change detection/ }));
    run?.();
    await waitFor(() => { expect(readMerchantKey(ORIGIN)).toEqual({ kind: 'saved', signer: p.signer }); });
  });

});
