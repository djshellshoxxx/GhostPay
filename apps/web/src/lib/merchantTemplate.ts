import { CHAINS, tokensForChain } from '@ghostpay/chain-adapters';
import { verifyMerchantProfile, type MerchantProfile } from '@ghostpay/invoice-schema';
import { UserFacingError } from './errors';
import { fiatDecimals, formatUnits, parseUnits } from './format';
import { buildInvoiceLink, type CreatedInvoice } from './invoiceCreate';
import { loadedKeysRecoverable } from './keyVault';
import { captureSessionGuard, getSessionBackup, getSessionPublic } from './session';

export interface MerchantTemplateAsset {
  readonly chainId: number;
  readonly chainName: string;
  readonly token: string;
  readonly symbol: string;
}

/** Both the signed profile and the application's enabled chain/token allowlist must permit the asset. */
export function merchantTemplateAssets(profile: MerchantProfile): readonly MerchantTemplateAsset[] {
  return CHAINS.filter((chain) => chain.enabled && profile.chains.includes(chain.chainId)).flatMap((chain) => {
    const choices = [
      { token: 'native', symbol: chain.nativeSymbol },
      ...tokensForChain(chain.chainId).map((token) => ({ token: token.address.toLowerCase(), symbol: token.symbol })),
    ];
    return choices.filter((choice) => profile.tokens.includes(choice.symbol)).map((choice) => ({ chainId: chain.chainId, chainName: chain.name, ...choice }));
  });
}

/** Amount requests are decimal fiat units, never token units, and require signed allowAmount. */
export function merchantTemplateAmount(profile: MerchantProfile, templateId: string, requestedAmount?: string): string | undefined {
  const template = profile.templates.find((value) => value.id === templateId);
  if (template === undefined) return undefined;
  if (requestedAmount === undefined) return template.amountMinor;
  if (profile.allowAmount !== true || !/^(0|[1-9][0-9]{0,29})(?:\.[0-9]{1,36})?$/.test(requestedAmount)) return undefined;
  const units = parseUnits(requestedAmount, fiatDecimals(template.currency));
  return units !== undefined && units > 0n && units.toString().length <= 39 ? units.toString() : undefined;
}

export interface MerchantTemplateInvoiceRequest {
  readonly profile: MerchantProfile;
  readonly templateId: string;
  readonly requestedAmount?: string;
  readonly chainId: number;
  readonly token: string;
  /** Separate, explicitly chosen fixed crypto amount. No fiat conversion is inferred. */
  readonly tokenAmount: string;
  readonly feePolicy: 'payer_pays' | 'seller_pays';
  readonly baseUrl: string;
  readonly nowSeconds: () => number;
  readonly isCurrent?: () => boolean;
}

/** Issues a new signed invoice locally. This neither edits an existing invoice nor sends secrets to another origin. */
export async function buildMerchantTemplateInvoice(input: MerchantTemplateInvoiceRequest): Promise<CreatedInvoice> {
  const invalid = (): never => { throw new UserFacingError({ key: 'merchantProfile.issue.invalid' }); };
  const { templateId, requestedAmount, chainId, token, tokenAmount, feePolicy, baseUrl, nowSeconds, isCurrent } = input;
  // Own a verified snapshot so an external object cannot change across custody/encoding awaits.
  const verified = verifyMerchantProfile(JSON.stringify(input.profile), nowSeconds());
  if (!verified.ok) return invalid();
  const profile = verified.profile;
  const template = profile.templates.find((value) => value.id === templateId);
  const amount = merchantTemplateAmount(profile, templateId, requestedAmount);
  if (template === undefined || amount === undefined || amount.length > 30 || !merchantTemplateAssets(profile).some((asset) => asset.chainId === chainId && asset.token === token)) return invalid();
  const session = getSessionPublic();
  if (session === undefined || session.signerPublicKey !== profile.signer) throw new UserFacingError({ key: 'merchantProfile.issue.signer' });
  const sessionGuard = captureSessionGuard();
  const current = (): void => {
    sessionGuard();
    if (isCurrent?.() === false) throw new UserFacingError({ key: 'merchantProfile.issue.changed' });
    if (!verifyMerchantProfile(profile, nowSeconds()).ok) return invalid();
  };
  const recoverable = await loadedKeysRecoverable();
  current();
  const backup = getSessionBackup();
  if (backup?.waived !== true && (!recoverable || backup?.verified !== true)) throw new UserFacingError({ key: 'merchantProfile.issue.backup' });
  const created = await buildInvoiceLink({
    chainId: chainId,
    token: token,
    currency: template.currency,
    lineItems: [{ description: profile.name, quantity: '1', unitPrice: formatUnits(BigInt(amount), fiatDecimals(template.currency)) }],
    taxRatePercent: '0', feePolicy: feePolicy, amountMode: 'fixed_token', tokenAmount: tokenAmount,
    expiryHours: 1, expirySeconds: template.expires, quoteTtlMinutes: Math.min(15, Math.floor(template.expires / 60)),
    maxSlippageBps: 0, memo: '', encrypt: false,
  }, baseUrl, nowSeconds());
  const finalRecoverable = await loadedKeysRecoverable();
  current();
  const finalBackup = getSessionBackup();
  if (finalBackup?.waived !== true && (!finalRecoverable || finalBackup?.verified !== true)) throw new UserFacingError({ key: 'merchantProfile.issue.backup' });
  return created;
}
