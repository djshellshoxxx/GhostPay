import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { merchantIdFor, parseFragment, signMerchantProfile, signerPublicKeyHex, verifyMerchantProfile, type Invoice } from '@ghostpay/invoice-schema';
import { buildMerchantTemplateInvoice, type MerchantTemplateInvoiceRequest } from './merchantTemplate';
import { clearSession, importSession } from './session';

const NOW = 1_800_000_000;
const KEY = new Uint8Array(32).fill(5);
const SIGNER = signerPublicKeyHex(KEY);
const NAME = 'Private merchant department';
const TOKEN = '0x036cbd53842c5426634e7929541ec2318f3dcf7e';

function request(expires = 1800) {
  return {
    profile: signMerchantProfile({
      v: 1, signer: SIGNER, merchantId: merchantIdFor(SIGNER), name: NAME,
      chains: [84532], tokens: ['USDC'], origins: ['https://merchant.test'],
      templates: [{ id: 'order', amountMinor: '50000', currency: 'USD', expires }],
      exp: NOW + 3600, allowAmount: true,
    }, KEY),
    templateId: 'order', chainId: 84532, token: TOKEN, tokenAmount: '1.25',
    feePolicy: 'seller_pays' as const, baseUrl: 'https://app.test/', nowSeconds: () => NOW,
  };
}

/** New invoices deliberately have fresh random nonces; compare every other required field. */
function requiredFields(invoice: Invoice): Omit<Invoice, 'lineItems' | 'memo' | 'nonce'> {
  const { lineItems, memo, nonce, ...required } = invoice;
  void lineItems; void memo; void nonce;
  return required;
}

beforeEach(() => { importSession({ spendingKeyHex: '01'.repeat(32), viewingKeyHex: '02'.repeat(32), signingKeyHex: '05'.repeat(32) }); });
afterEach(() => { clearSession(); });

describe('merchant template metadata policy', () => {
  it('minimizes the newly signed invoice while preserving the verified profile and every required payment field', async () => {
    const input = request();
    const original = JSON.stringify(input.profile);
    const standard = await buildMerchantTemplateInvoice(input);
    const minimal = await buildMerchantTemplateInvoice({ ...input, metadataMode: 'minimal' });
    const parsed = await parseFragment(minimal.fragment);
    expect(parsed.verification.signatureValid).toBe(true);
    expect(parsed.invoice).toEqual(minimal.invoice);
    expect(parsed.encrypted).toBe(false);
    expect(standard.invoice.lineItems[0]?.description).toBe(NAME);
    expect(parsed.invoice.lineItems).toEqual([{ description: 'Item', quantity: '1', unitMinorUnits: '50000' }]);
    expect(Object.hasOwn(parsed.invoice, 'memo')).toBe(false);
    expect(JSON.stringify(parsed.invoice)).not.toContain(NAME);
    expect(requiredFields(minimal.invoice)).toEqual(requiredFields(standard.invoice));
    expect(minimal.invoice.nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(minimal.invoice.nonce).not.toBe(standard.invoice.nonce);
    expect(minimal.invoice.amountPolicy).toEqual({ mode: 'fixed_token', tokenAmount: '1250000' });
    expect(minimal.invoice.expiresAt).toBe(NOW + 1800);
    expect(JSON.stringify(input.profile)).toBe(original);
    expect(verifyMerchantProfile(input.profile, NOW).ok).toBe(true);
  });

  it('preserves a signed amount override, payer fee policy and exact short template expiry in minimal mode', async () => {
    const input = request(60);
    const minimal = await buildMerchantTemplateInvoice({
      ...input, requestedAmount: '9007199254740993.25', feePolicy: 'payer_pays', metadataMode: 'minimal',
    });
    expect(minimal.invoice.lineItems).toEqual([{ description: 'Item', quantity: '1', unitMinorUnits: '900719925474099325' }]);
    expect(minimal.invoice.fiat.minorUnits).toBe('900719925474099325');
    expect(minimal.invoice.feePolicy).toBe('payer_pays');
    expect(minimal.invoice.amountPolicy).toEqual({ mode: 'fixed_token', tokenAmount: '1250000' });
    expect(minimal.invoice.expiresAt).toBe(NOW + 60);
    expect((await parseFragment(minimal.fragment)).verification.signatureValid).toBe(true);
  });

  it.each(['standard', 'minimal'] as const)('captures %s mode before asynchronous custody checks', async (metadataMode) => {
    const input = { ...request(), metadataMode };
    const pending = buildMerchantTemplateInvoice(input);
    input.metadataMode = metadataMode === 'minimal' ? 'standard' : 'minimal';
    const created = await pending;
    expect(created.invoice.lineItems[0]?.description).toBe(metadataMode === 'minimal' ? 'Item' : NAME);
  });

  it.each(['minimal ', '', null, false, 1, {}])('rejects unsupported runtime metadata mode %j without reflecting it', async (metadataMode) => {
    const input = { ...request(), metadataMode } as MerchantTemplateInvoiceRequest;
    await expect(buildMerchantTemplateInvoice(input)).rejects.toThrow('Choose a supported invoice metadata mode.');
  });

  it('does not let minimal mode bypass signed profile or asset authority', async () => {
    const input = { ...request(), metadataMode: 'minimal' as const };
    await expect(buildMerchantTemplateInvoice({ ...input, profile: { ...input.profile, name: 'Forged' } })).rejects.toThrow();
    await expect(buildMerchantTemplateInvoice({ ...input, token: 'native' })).rejects.toThrow();
    await expect(buildMerchantTemplateInvoice({ ...input, templateId: 'absent' })).rejects.toThrow();
  });
});
