// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { merchantIdFor, parseFragment, signMerchantProfile, signerPublicKeyHex } from '@ghostpay/invoice-schema';
import { MerchantTemplateIssuer } from './MerchantTemplateIssuer';
import { clearSession, importSession } from '../lib/session';
import { makeServices, renderWith } from '../test/render';

const NOW = 1_800_000_000;
const key = new Uint8Array(32).fill(5);
const signer = signerPublicKeyHex(key);
const profile = signMerchantProfile({ v: 1, signer, merchantId: merchantIdFor(signer), name: 'Merchant', chains: [84532], tokens: ['USDC'], origins: ['https://merchant.test'], templates: [{ id: 'order', amountMinor: '50000', currency: 'USD', expires: 1800 }], exp: NOW + 3600, allowAmount: true }, key);
const mount = () => renderWith(<MerchantTemplateIssuer profile={profile} templateId="order" />, makeServices({ nowMs: () => NOW * 1000 }));
afterEach(() => { clearSession(); });

describe('merchant template issuer', () => {
  it('requires the merchant signer and an explicit fixed amount before issuing', async () => {
    const first = mount();
    expect(screen.queryByRole('button', { name: 'Sign a new invoice from this template' })).toBeNull();
    first.unmount();
    importSession({ spendingKeyHex: '01'.repeat(32), viewingKeyHex: '02'.repeat(32), signingKeyHex: '05'.repeat(32) });
    mount();
    fireEvent.click(screen.getByText('Create a merchant invoice from this template'));
    expect(screen.getByText(/does not convert it automatically/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Fixed token amount to charge'), { target: { value: '1.25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign a new invoice from this template' }));
    const output = await screen.findByRole<HTMLTextAreaElement>('textbox', { name: 'New signed invoice link' });
    const parsed = await parseFragment(new URL(output.value).hash);
    expect(parsed.invoice.fiat.minorUnits).toBe('50000');
    expect(parsed.invoice.amountPolicy).toEqual({ mode: 'fixed_token', tokenAmount: '1250000' });
    expect(parsed.invoice.expiresAt).toBe(NOW + 1800);
    fireEvent.change(screen.getByLabelText('Fixed token amount to charge'), { target: { value: '2' } });
    expect(screen.queryByRole('textbox', { name: 'New signed invoice link' })).toBeNull();
  });
});
