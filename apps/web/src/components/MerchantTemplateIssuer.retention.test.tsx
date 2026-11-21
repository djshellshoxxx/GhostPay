// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { merchantIdFor, parseFragment, signMerchantProfile, signerPublicKeyHex } from '@ghostpay/invoice-schema';
import { beginAttempt } from '../lib/duplicateAttemptJournal';
import * as keyVault from '../lib/keyVault';
import { invoicePreviewRetention, RETENTION_KEY } from '../lib/metadataRetention';
import * as merchantTemplate from '../lib/merchantTemplate';
import { clearSession, getSessionBackup, getSessionPublic, importSession } from '../lib/session';
import { makeServices, renderWith } from '../test/render';
import { MerchantTemplateIssuer } from './MerchantTemplateIssuer';

const NOW = 1_800_000_000;
const key = new Uint8Array(32).fill(5);
const signer = signerPublicKeyHex(key);
const profile = signMerchantProfile({
  v: 1, signer, merchantId: merchantIdFor(signer), name: 'Retained merchant profile',
  chains: [84532], tokens: ['USDC'], origins: ['https://merchant.test'],
  templates: [{ id: 'order', amountMinor: '50000', currency: 'USD', expires: 1800 }],
  exp: NOW + 3600, allowAmount: true,
}, key);
const profileBytes = JSON.stringify(profile);
const output = (): HTMLTextAreaElement => screen.getByRole('textbox', { name: 'New signed invoice link' });
const issueButton = (): HTMLButtonElement => screen.getByRole('button', { name: 'Sign a new invoice from this template' });
const stored = () => ({ local: { ...localStorage }, session: { ...sessionStorage } });

function mount() {
  const fetchFn = vi.fn(() => Promise.reject(new Error('No network in retention test.')));
  const createRpc = vi.fn(() => Promise.reject(new Error('No RPC in retention test.')));
  const view = renderWith(<MerchantTemplateIssuer profile={profile} templateId="order" />, makeServices({
    nowMs: () => Date.now(), fetchFn, createRpc,
  }));
  fireEvent.click(screen.getByText('Create a merchant invoice from this template'));
  fireEvent.change(screen.getByLabelText('Fixed token amount to charge'), { target: { value: '1.25' } });
  fireEvent.change(screen.getByLabelText('Requested amount in template currency units'), { target: { value: '700.00' } });
  fireEvent.change(screen.getByLabelText('Invoice fee policy'), { target: { value: 'payer_pays' } });
  return { ...view, fetchFn, createRpc };
}

async function issue(): Promise<string> {
  fireEvent.click(issueButton());
  return (await screen.findByRole<HTMLTextAreaElement>('textbox', { name: 'New signed invoice link' })).value;
}

function heldRead(): { readonly promise: Promise<boolean>; readonly resolve: (value: boolean) => void } {
  let complete: (value: boolean) => void = () => { throw new Error('Pending read not initialized.'); };
  const promise = new Promise<boolean>((resolve) => { complete = resolve; });
  return { promise, resolve: complete };
}

beforeEach(() => {
  clearSession(); localStorage.clear(); sessionStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW * 1000);
  importSession({ spendingKeyHex: '01'.repeat(32), viewingKeyHex: '02'.repeat(32), signingKeyHex: '05'.repeat(32) });
  beginAttempt({ key: `0x${'ab'.repeat(32)}`, chainId: 84532, account: `0x${'11'.repeat(20)}`, kind: 'payment' });
});
afterEach(() => {
  cleanup(); clearSession(); vi.restoreAllMocks(); vi.useRealTimers();
  expect(invoicePreviewRetention.preview().count).toBe(0);
});

describe('merchant invoice presentation retention', () => {
  it('previews and cancels without clearing, then clears only the completed display while preserving its sources and shared link', async () => {
    const view = mount();
    const link = await issue();
    const seller = getSessionPublic();
    const custody = getSessionBackup();
    const before = stored();
    fireEvent.click(screen.getByRole('button', { name: 'Preview screen-data cleanup' }));
    expect(screen.getByText('Generated invoice previews to clear: 1')).toBeTruthy();
    expect(output().value).toBe(link);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel cleanup' }));
    expect(output().value).toBe(link);
    fireEvent.click(screen.getByRole('button', { name: 'Preview screen-data cleanup' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear previewed screen data' }));
    expect(screen.queryByRole('textbox', { name: 'New signed invoice link' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy new invoice link' })).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>('Fixed token amount to charge').value).toBe('1.25');
    expect(screen.getByLabelText<HTMLInputElement>('Requested amount in template currency units').value).toBe('700.00');
    expect(screen.getByLabelText<HTMLSelectElement>('Invoice fee policy').value).toBe('payer_pays');
    expect(getSessionPublic()).toBe(seller);
    expect(getSessionBackup()).toEqual(custody);
    expect(stored()).toEqual(before);
    expect(JSON.stringify(profile)).toBe(profileBytes);
    const shared = await parseFragment(new URL(link).hash);
    expect(shared.verification.signatureValid).toBe(true);
    expect(shared.invoice.fiat.minorUnits).toBe('70000');
    expect(shared.invoice.amountPolicy).toEqual({ mode: 'fixed_token', tokenAmount: '1250000' });
    expect(view.fetchFn).not.toHaveBeenCalled();
    expect(view.createRpc).not.toHaveBeenCalled();
  });

  it('withdraws prior-mode cleanup authority and clears only a newly minimized result while preserving its selected mode', async () => {
    const view = mount();
    const standard = await issue();
    const oldPlan = invoicePreviewRetention.preview();
    expect(oldPlan.count).toBe(1);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Minimize shared invoice metadata' }));
    expect(invoicePreviewRetention.preview().count).toBe(0);
    expect(screen.queryByRole('textbox', { name: 'New signed invoice link' })).toBeNull();
    const minimal = await issue();
    expect(invoicePreviewRetention.preview().count).toBe(1);
    expect(invoicePreviewRetention.confirm(oldPlan)).toEqual({ kind: 'stale' });
    expect(output().value).toBe(minimal);
    const seller = getSessionPublic();
    const custody = getSessionBackup();
    const before = stored();
    fireEvent.click(screen.getByRole('button', { name: 'Preview screen-data cleanup' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear previewed screen data' }));
    expect(screen.queryByRole('textbox', { name: 'New signed invoice link' })).toBeNull();
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Minimize shared invoice metadata' }).checked).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>('Fixed token amount to charge').value).toBe('1.25');
    expect(screen.getByLabelText<HTMLInputElement>('Requested amount in template currency units').value).toBe('700.00');
    expect(getSessionPublic()).toBe(seller);
    expect(getSessionBackup()).toEqual(custody);
    expect(stored()).toEqual(before);
    expect(JSON.stringify(profile)).toBe(profileBytes);
    const shared = await parseFragment(new URL(minimal).hash);
    expect(shared.verification.signatureValid).toBe(true);
    expect(shared.invoice.lineItems).toEqual([{ description: 'Item', quantity: '1', unitMinorUnits: '70000' }]);
    expect(shared.invoice.amountPolicy).toEqual({ mode: 'fixed_token', tokenAmount: '1250000' });
    expect(JSON.stringify(shared.invoice)).not.toContain(profile.name);
    expect((await parseFragment(new URL(standard).hash)).invoice.lineItems[0]?.description).toBe(profile.name);
    expect(view.fetchFn).not.toHaveBeenCalled();
    expect(view.createRpc).not.toHaveBeenCalled();
  });

  it('excludes pending issuance and rejects old cleanup authority while giving a replacement its own opt-in expiry', async () => {
    const view = mount();
    const first = await issue();
    expect(invoicePreviewRetention.preview().count).toBe(1);
    fireEvent.change(screen.getByLabelText('Clear generated invoice previews automatically'), { target: { value: '300000' } });
    expect(localStorage.getItem(RETENTION_KEY)).toBe('{"delay":300000}');
    const plan = invoicePreviewRetention.preview();
    const before = stored();
    const seller = getSessionPublic();
    const pending = heldRead();
    vi.spyOn(keyVault, 'loadedKeysRecoverable').mockReturnValueOnce(pending.promise);
    vi.setSystemTime((NOW * 1000) + 299_000);
    fireEvent.click(issueButton());
    expect(issueButton().disabled).toBe(true);
    expect(invoicePreviewRetention.preview().count).toBe(0);
    expect(invoicePreviewRetention.confirm(plan)).toEqual({ kind: 'stale' });
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(invoicePreviewRetention.preview().count).toBe(0);
    await act(async () => { pending.resolve(true); await pending.promise; });
    const replacement = (await screen.findByRole<HTMLTextAreaElement>('textbox', { name: 'New signed invoice link' })).value;
    expect(replacement).not.toBe(first);
    expect(invoicePreviewRetention.preview().count).toBe(1);
    act(() => { vi.setSystemTime((NOW * 1000) + 300_000); window.dispatchEvent(new Event('focus')); });
    expect(output().value).toBe(replacement);
    act(() => { vi.setSystemTime((NOW * 1000) + 599_000); window.dispatchEvent(new Event('focus')); });
    expect(screen.queryByRole('textbox', { name: 'New signed invoice link' })).toBeNull();
    expect(issueButton().disabled).toBe(false);
    expect(screen.getByLabelText<HTMLInputElement>('Fixed token amount to charge').value).toBe('1.25');
    expect(getSessionPublic()).toBe(seller);
    expect(stored()).toEqual(before);
    expect(JSON.stringify(profile)).toBe(profileBytes);
    expect(view.fetchFn).not.toHaveBeenCalled();
    expect(view.createRpc).not.toHaveBeenCalled();
  });

  it('withdraws a closed result and never registers an issuance that completes after its view unmounts', async () => {
    const view = mount();
    await issue();
    expect(invoicePreviewRetention.preview().count).toBe(1);
    const old = invoicePreviewRetention.preview();
    const pending = heldRead();
    vi.spyOn(keyVault, 'loadedKeysRecoverable').mockReturnValueOnce(pending.promise);
    const build = vi.spyOn(merchantTemplate, 'buildMerchantTemplateInvoice');
    fireEvent.click(issueButton());
    const result = build.mock.results[0];
    if (result?.type !== 'return') throw new Error('Expected the actual issuer operation.');
    const completion = result.value;
    expect(invoicePreviewRetention.preview().count).toBe(0);
    const seller = getSessionPublic();
    const before = stored();
    view.unmount();
    await act(async () => { pending.resolve(true); await expect(completion).rejects.toThrow(); });
    expect(invoicePreviewRetention.preview().count).toBe(0);
    expect(invoicePreviewRetention.confirm(old)).toEqual({ kind: 'stale' });
    expect(getSessionPublic()).toBe(seller);
    expect(stored()).toEqual(before);
    expect(JSON.stringify(profile)).toBe(profileBytes);
    expect(view.fetchFn).not.toHaveBeenCalled();
    expect(view.createRpc).not.toHaveBeenCalled();
  });
});
