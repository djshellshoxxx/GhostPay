// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { merchantIdFor, parseFragment, signMerchantProfile, signerPublicKeyHex } from '@ghostpay/invoice-schema';
import { MerchantTemplateIssuer } from './MerchantTemplateIssuer';
import * as merchantTemplate from '../lib/merchantTemplate';
import type { CreatedInvoice } from '../lib/invoiceCreate';
import { clearSession, importSession } from '../lib/session';
import { makeServices, renderWith } from '../test/render';

const NOW = 1_800_000_000;
const KEY = new Uint8Array(32).fill(5);
const SIGNER = signerPublicKeyHex(KEY);
const NAME = 'Private merchant department';
const OPTION = 'Minimize shared invoice metadata';
const ACTION = 'Sign a new invoice from this template';
const OUTPUT = 'New signed invoice link';
const TOKEN = '0x036cbd53842c5426634e7929541ec2318f3dcf7e';
const KEYS = { spendingKeyHex: '01'.repeat(32), viewingKeyHex: '02'.repeat(32), signingKeyHex: '05'.repeat(32) };
const PROFILE = signMerchantProfile({
  v: 1, signer: SIGNER, merchantId: merchantIdFor(SIGNER), name: NAME,
  chains: [84532], tokens: ['USDC'], origins: ['https://merchant.test'],
  templates: [{ id: 'order', amountMinor: '50000', currency: 'USD', expires: 1800 }],
  exp: NOW + 3600, allowAmount: true,
}, KEY);

beforeEach(() => { importSession(KEYS); window.localStorage.clear(); window.sessionStorage.clear(); });
afterEach(() => { clearSession(); vi.restoreAllMocks(); });

function mount() {
  const fetchFn = vi.fn(() => Promise.reject(new Error('No network expected.')));
  renderWith(<MerchantTemplateIssuer profile={PROFILE} templateId="order" />, makeServices({ nowMs: () => NOW * 1000, fetchFn }));
  fireEvent.click(screen.getByText('Create a merchant invoice from this template'));
  fireEvent.change(screen.getByLabelText('Fixed token amount to charge'), { target: { value: '1.25' } });
  return { user: userEvent.setup(), fetchFn };
}

async function currentInvoice() {
  const output = await screen.findByRole<HTMLTextAreaElement>('textbox', { name: OUTPUT });
  return parseFragment(new URL(output.value).hash);
}

describe('merchant issuer minimal metadata choice', () => {
  it('offers a deliberate keyboard-operable choice and signs the minimized metadata locally', async () => {
    const { user, fetchFn } = mount();
    const option = screen.getByRole<HTMLInputElement>('checkbox', { name: OPTION });
    expect(option.checked).toBe(false);
    const describedBy = option.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy ?? '')?.textContent).toContain('It does not hide on-chain amounts or transaction history.');
    option.focus();
    await user.keyboard('[Space]');
    expect(option.checked).toBe(true);
    await user.click(screen.getByRole('button', { name: ACTION }));
    const parsed = await currentInvoice();
    expect(parsed.verification.signatureValid).toBe(true);
    expect(parsed.invoice.lineItems).toEqual([{ description: 'Item', quantity: '1', unitMinorUnits: '50000' }]);
    expect(parsed.invoice.amountPolicy).toEqual({ mode: 'fixed_token', tokenAmount: '1250000' });
    expect(parsed.invoice.expiresAt).toBe(NOW + 1800);
    expect(JSON.stringify(parsed.invoice)).not.toContain(NAME);
    expect(screen.getByText('This link was signed with minimized metadata. Required payment fields remain included.')).toBeTruthy();
    expect(fetchFn).not.toHaveBeenCalled();
    for (const storage of [window.localStorage, window.sessionStorage]) {
      expect(JSON.stringify(storage)).not.toContain(NAME);
      expect(JSON.stringify(storage)).not.toContain('metadataMode');
    }
  });

  it('removes the previous link and copy control on either mode change while preserving the explicit token amount', async () => {
    const { user } = mount();
    await user.click(screen.getByRole('button', { name: ACTION }));
    expect((await currentInvoice()).invoice.lineItems[0]?.description).toBe(NAME);
    await user.click(screen.getByRole('checkbox', { name: OPTION }));
    expect(screen.queryByRole('textbox', { name: OUTPUT })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy new invoice link' })).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>('Fixed token amount to charge').value).toBe('1.25');
    await user.click(screen.getByRole('button', { name: ACTION }));
    expect((await currentInvoice()).invoice.lineItems[0]?.description).toBe('Item');
    await user.click(screen.getByRole('checkbox', { name: OPTION }));
    expect(screen.queryByRole('textbox', { name: OUTPUT })).toBeNull();
    await user.click(screen.getByRole('button', { name: ACTION }));
    const parsed = await currentInvoice();
    expect(parsed.invoice.lineItems[0]?.description).toBe(NAME);
    expect(parsed.verification.signatureValid).toBe(true);
  });

  it('discards a late prior-mode result and allows a fresh minimal request', async () => {
    const { user } = mount();
    const ready = await merchantTemplate.buildMerchantTemplateInvoice({
      profile: PROFILE, templateId: 'order', chainId: 84532, token: TOKEN,
      tokenAmount: '1.25', feePolicy: 'seller_pays', baseUrl: 'https://app.test/', nowSeconds: () => NOW,
    });
    let finish: (created: CreatedInvoice) => void = () => { throw new Error('Request has not started.'); };
    const pending = new Promise<CreatedInvoice>((resolve) => { finish = resolve; });
    vi.spyOn(merchantTemplate, 'buildMerchantTemplateInvoice').mockReturnValueOnce(pending);
    await user.click(screen.getByRole('button', { name: ACTION }));
    await user.click(screen.getByRole('checkbox', { name: OPTION }));
    await act(async () => { finish(ready); await pending; });
    expect(screen.queryByRole('textbox', { name: OUTPUT })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy new invoice link' })).toBeNull();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: ACTION }).disabled).toBe(false);
    await user.click(screen.getByRole('button', { name: ACTION }));
    expect((await currentInvoice()).invoice.lineItems[0]?.description).toBe('Item');
  });

  it('resets the metadata choice and prior output for a replacement seller session', async () => {
    const { user } = mount();
    await user.click(screen.getByRole('checkbox', { name: OPTION }));
    await user.click(screen.getByRole('button', { name: ACTION }));
    await currentInvoice();
    act(() => { importSession(KEYS); });
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: OPTION }).checked).toBe(false);
    expect(screen.queryByRole('textbox', { name: OUTPUT })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy new invoice link' })).toBeNull();
  });
});
