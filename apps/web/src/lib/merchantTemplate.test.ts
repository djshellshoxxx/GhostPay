import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { merchantIdFor, parseFragment, signMerchantProfile, signerPublicKeyHex, type MerchantProfile } from '@ghostpay/invoice-schema';
import { buildMerchantTemplateInvoice, merchantTemplateAmount, merchantTemplateAssets } from './merchantTemplate';
import { MemoryKeyVaultStore, setKeyVaultStoreForTests } from './keyVault';
import { clearSession, importSession, markKeystoreDownloaded, captureSessionGuard, generateSession, withSessionSecrets, waiveSessionBackup, armSessionVault } from './session';

const NOW = 1_800_000_000;
const KEY = new Uint8Array(32).fill(5);
const signer = signerPublicKeyHex(KEY);
const TOKEN = '0x036cbd53842c5426634e7929541ec2318f3dcf7e';
function profile(over: Partial<MerchantProfile> = {}, key: Uint8Array = KEY): MerchantProfile {
  const signer = signerPublicKeyHex(key);
  return signMerchantProfile({ v: 1, merchantId: merchantIdFor(signer), name: 'Merchant', signer, chains: [84532], tokens: ['USDC'], origins: ['https://merchant.test'], templates: [{ id: 'order', amountMinor: '50000', currency: 'USD', expires: 1800 }], exp: NOW + 3600, ...over }, key);
}
function input(over = {}) { return { profile: profile(), templateId: 'order', chainId: 84532, token: TOKEN, tokenAmount: '1.25', feePolicy: 'seller_pays' as const, baseUrl: 'https://app.test/', nowSeconds: () => NOW, ...over }; }
beforeEach(() => { importSession({ spendingKeyHex: '01'.repeat(32), viewingKeyHex: '02'.repeat(32), signingKeyHex: '05'.repeat(32) }); });
afterEach(() => { clearSession(); setKeyVaultStoreForTests(undefined); });

describe('merchant template invoice issuance', () => {
  it('uses existing signing path without confusing fiat minor units with token units', async () => {
    const result = await buildMerchantTemplateInvoice(input());
    const parsed = await parseFragment(result.fragment);
    expect(parsed.verification.signatureValid).toBe(true);
    expect(parsed.invoice.signer).toBe(signer);
    expect(parsed.invoice.fiat).toEqual({ currency: 'USD', minorUnits: '50000' });
    expect(parsed.invoice.lineItems[0]).toMatchObject({ quantity: '1', unitMinorUnits: '50000' });
    expect(parsed.invoice.amountPolicy).toEqual({ mode: 'fixed_token', tokenAmount: '1250000' });
    expect(parsed.invoice.feePolicy).toBe('seller_pays');
    expect(parsed.invoice.expiresAt).toBe(NOW + 1800);
  });
  it('preserves the invoice protocol amount limit exactly and refuses larger signed templates without truncation', async () => {
    const minor = '9'.repeat(30);
    const p = profile({ templates: [{ id: 'order', amountMinor: minor, currency: 'USD', expires: 60 }] });
    const result = await buildMerchantTemplateInvoice(input({ profile: p }));
    expect(result.invoice.fiat.minorUnits).toBe(minor);
    expect(result.invoice.lineItems[0]?.unitMinorUnits).toBe(minor);
    expect(result.invoice.expiresAt).toBe(NOW + 60);
    for (const digits of [31, 39]) {
      const oversized = profile({ templates: [{ id: 'order', amountMinor: '9'.repeat(digits), currency: 'USD', expires: 60 }] });
      await expect(buildMerchantTemplateInvoice(input({ profile: oversized }))).rejects.toThrow();
    }
  });

  it('permits only explicit signed allowAmount overrides and preserves exact large values', async () => {
    expect(merchantTemplateAmount(profile(), 'order', '2.00')).toBeUndefined();
    const p = profile({ allowAmount: true });
    expect(merchantTemplateAmount(p, 'order', '9007199254740993.25')).toBe('900719925474099325');
    for (const raw of ['0', '-1', '1e2', '01.2', '1.001', '1 ', 'NaN']) expect(merchantTemplateAmount(p, 'order', raw)).toBeUndefined();
    const result = await buildMerchantTemplateInvoice(input({ profile: p, requestedAmount: '9007199254740993.25', feePolicy: 'payer_pays' }));
    expect(result.invoice.fiat.minorUnits).toBe('900719925474099325');
    expect(result.invoice.amountPolicy).toEqual({ mode: 'fixed_token', tokenAmount: '1250000' });
    expect(result.invoice.feePolicy).toBe('payer_pays');
  });
  it('fails closed for other keys, absent keys, unverified backup, forged/expired profiles and unlisted assets', async () => {
    await expect(buildMerchantTemplateInvoice(input({ profile: { ...profile(), name: 'Forged' } }))).rejects.toThrow();
    await expect(buildMerchantTemplateInvoice(input({ profile: profile({ exp: NOW }) }))).rejects.toThrow();
    await expect(buildMerchantTemplateInvoice(input({ chainId: 1 }))).rejects.toThrow();
    await expect(buildMerchantTemplateInvoice(input({ token: 'native' }))).rejects.toThrow();
    await expect(buildMerchantTemplateInvoice(input({ templateId: 'absent' }))).rejects.toThrow();
    await expect(buildMerchantTemplateInvoice(input({ requestedAmount: '2' }))).rejects.toThrow();
    clearSession();
    await expect(buildMerchantTemplateInvoice(input())).rejects.toThrow();
    generateSession();
    await expect(buildMerchantTemplateInvoice(input())).rejects.toThrow();
    markKeystoreDownloaded(captureSessionGuard());
    const own = withSessionSecrets((secrets) => profile({}, secrets.signingKey));
    await expect(buildMerchantTemplateInvoice(input({ profile: own }))).rejects.toThrow();
  });
  it('honors the existing explicit waiver but fails closed on unreadable vault-only backup', async () => {
    generateSession();
    const own = withSessionSecrets((secrets) => profile({}, secrets.signingKey));
    await expect(buildMerchantTemplateInvoice(input({ profile: own }))).rejects.toThrow();
    waiveSessionBackup();
    expect((await buildMerchantTemplateInvoice(input({ profile: own }))).invoice.signer).toBe(own.signer);
    generateSession();
    const vaultOnly = withSessionSecrets((secrets) => profile({}, secrets.signingKey));
    armSessionVault('test-public-placeholder', captureSessionGuard(), { stored: true });
    class DeniedStore extends MemoryKeyVaultStore {
      override get(): Promise<string | undefined> { return Promise.reject(new Error('unavailable')); }
    }
    setKeyVaultStoreForTests(new DeniedStore());
    await expect(buildMerchantTemplateInvoice(input({ profile: vaultOnly }))).rejects.toThrow();
  });

  it('refuses stale requests after asynchronous custody readback', async () => {
    let current = true;
    const pending = buildMerchantTemplateInvoice(input({ isCurrent: () => current }));
    current = false;
    await expect(pending).rejects.toThrow();
    const changed = buildMerchantTemplateInvoice(input());
    clearSession();
    await expect(changed).rejects.toThrow();
  });
  it('preserves the validated request snapshot and rechecks profile expiry before returning', async () => {
    const request = { ...input(), minimalMetadata: true };
    const pending = buildMerchantTemplateInvoice(request);
    request.token = 'native';
    request.tokenAmount = '99';
    request.minimalMetadata = false;
    const created = await pending;
    expect(created.invoice.token).toBe(TOKEN);
    expect(created.invoice.lineItems).toEqual([]);
    expect(created.invoice.amountPolicy).toEqual({ mode: 'fixed_token', tokenAmount: '1250000' });
    let now = NOW;
    const expires = buildMerchantTemplateInvoice(input({ nowSeconds: () => now }));
    await Promise.resolve();
    now += 3601;
    await expect(expires).rejects.toThrow();
  });

  it('lists only enabled allowlisted assets named in the signed profile', () => {
    expect(merchantTemplateAssets(profile())).toEqual(expect.arrayContaining([expect.objectContaining({ chainId: 84532, token: TOKEN, symbol: 'USDC' })]));
    expect(merchantTemplateAssets(profile({ chains: [1] }))).toEqual([]);
    expect(merchantTemplateAssets(profile({ tokens: ['UNKNOWN'] }))).toEqual([]);
  });
});
