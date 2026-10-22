import type { Address } from 'viem';
import { assertTestnet } from './chainGuard.js';
import { PayerSponsorError } from './errors.js';

/** User selectable payer modes (spec section 1). */
export const PAYER_MODES = [
  'direct',
  'fresh-wallet',
  'permit-relay',
  'eip7702-sponsored',
  'erc4337-paymaster',
] as const;

/** One of {@link PAYER_MODES}. */
export type PayerMode = (typeof PAYER_MODES)[number];

/** Spec ids `PH-0` .. `PH-4`. */
export const PAYER_MODE_IDS: Readonly<Record<PayerMode, string>> = {
  direct: 'PH-0',
  'fresh-wallet': 'PH-1',
  'permit-relay': 'PH-2',
  'eip7702-sponsored': 'PH-3',
  'erc4337-paymaster': 'PH-4',
};

/** What a sponsor (relay operator, 7702 submitter, bundler and paymaster) can see. */
export type SponsorSees = 'payer' | 'stealth' | 'amount' | 'token' | 'ip' | 'timing';

/** What a mode removes from an observer's view. Never contains `'payer'` (PH-GEN-3). */
export type HidesFromObservers = 'gas-funding-link' | 'seller-sees-payer-as-transfer-sender';

/** Machine readable comparison row (spec section 5). */
export interface PayerModeInfo {
  readonly mode: PayerMode;
  readonly id: string;
  readonly label: string;
  readonly needsNativeGasOnPayer: boolean;
  readonly needsPermitToken: boolean;
  readonly needsChainFeature: 'none' | 'eip7702' | 'erc4337-entrypoint';
  readonly sponsorSees: readonly SponsorSees[];
  readonly hidesFromObservers: readonly HidesFromObservers[];
  readonly fingerprint: string;
  readonly effort: 'S' | 'M' | 'L';
  /** Who pays gas, shown before signing (spec section 5 a). */
  readonly gasPayerLine: string;
  /** Who sees the payer address and IP, shown before signing (spec section 5 b). */
  readonly observerLine: string;
}

/** Line shown in every mode before signing (spec section 5 d). */
export const PAYER_PUBLIC_LINE = 'The payer address is still public.';
/** Line shown for every non-direct mode (spec N2, PH-GEN-5). */
export const TOKEN_FUNDING_LINE =
  'The payer wallet still has to receive the payment tokens from somewhere, and that transfer stays visible on chain.';
/** Line shown for every sponsored mode (spec N3, PH-GEN-5). */
export const SPONSOR_TRUST_LINE =
  'The sponsor sees the payer address, the stealth address, the token, the amount, your network address and the timing, and can refuse to submit.';

const ALL_SPONSOR_SEES: readonly SponsorSees[] = ['payer', 'stealth', 'amount', 'token', 'ip', 'timing'];

/**
 * Comparison table rendered by the UI. `hidesFromObservers` never contains `'payer'`: no mode hides
 * the payer from a chain analyst (spec N1).
 */
export const PAYER_MODE_INFO: Readonly<Record<PayerMode, PayerModeInfo>> = {
  direct: {
    mode: 'direct',
    id: 'PH-0',
    label: 'Direct payment from your wallet',
    needsNativeGasOnPayer: true,
    needsPermitToken: false,
    needsChainFeature: 'none',
    sponsorSees: [],
    hidesFromObservers: [],
    fingerprint: 'none',
    effort: 'S',
    gasPayerLine: 'You pay the gas from the paying wallet.',
    observerLine: 'Anyone can see the paying wallet; your RPC provider sees your network address.',
  },
  'fresh-wallet': {
    mode: 'fresh-wallet',
    id: 'PH-1',
    label: 'One-time payer wallet',
    needsNativeGasOnPayer: true,
    needsPermitToken: false,
    needsChainFeature: 'none',
    sponsorSees: [],
    hidesFromObservers: [],
    fingerprint: 'none',
    effort: 'S',
    gasPayerLine: 'You fund gas into a new wallet; that funding transfer is public.',
    observerLine: 'Anyone can see the new wallet and who funded it; your RPC provider sees your network address.',
  },
  'permit-relay': {
    mode: 'permit-relay',
    id: 'PH-2',
    label: 'Sponsored payment through a relay contract (permit)',
    needsNativeGasOnPayer: false,
    needsPermitToken: true,
    needsChainFeature: 'none',
    sponsorSees: ALL_SPONSOR_SEES,
    hidesFromObservers: ['gas-funding-link', 'seller-sees-payer-as-transfer-sender'],
    fingerprint: 'relay contract address, sponsor key',
    effort: 'M',
    gasPayerLine: 'The sponsor pays the gas and is repaid in tokens out of your payment.',
    observerLine: 'The sponsor and anyone reading the transaction can see the payer address and the sponsor sees your network address.',
  },
  'eip7702-sponsored': {
    mode: 'eip7702-sponsored',
    id: 'PH-3',
    label: 'Sponsored payment by a delegated wallet (EIP-7702)',
    needsNativeGasOnPayer: false,
    needsPermitToken: false,
    needsChainFeature: 'eip7702',
    sponsorSees: ALL_SPONSOR_SEES,
    hidesFromObservers: ['gas-funding-link'],
    fingerprint: 'delegate code 0xef0100||address on the payer, sponsor key',
    effort: 'M',
    gasPayerLine: 'The sponsor pays the gas and is repaid in tokens out of your payment.',
    observerLine: 'The sponsor and anyone reading the transaction can see the payer address and the sponsor sees your network address.',
  },
  'erc4337-paymaster': {
    mode: 'erc4337-paymaster',
    id: 'PH-4',
    label: 'Sponsored payment by a smart account (ERC-4337)',
    needsNativeGasOnPayer: false,
    needsPermitToken: false,
    needsChainFeature: 'erc4337-entrypoint',
    sponsorSees: ALL_SPONSOR_SEES,
    hidesFromObservers: ['gas-funding-link'],
    fingerprint: 'account factory and account code, paymaster, bundler',
    effort: 'L',
    gasPayerLine: 'The paymaster pays the gas; the sponsor is repaid in tokens out of your payment.',
    observerLine: 'The sponsor, the bundler and anyone reading the transaction can see the payer account and the sponsor sees your network address.',
  },
};

/**
 * Notices that must be shown before signing in `mode` (PH-GEN-5): who pays gas, who sees what, the
 * public payer line and, for non-direct modes, the token-funding and sponsor-trust lines.
 *
 * @param mode Selected mode.
 * @returns Display lines, each a complete sentence.
 */
export function modeNotices(mode: PayerMode): readonly string[] {
  const info = PAYER_MODE_INFO[mode];
  const lines = [info.gasPayerLine, info.observerLine];
  if (mode !== 'direct') lines.push(TOKEN_FUNDING_LINE);
  if (info.sponsorSees.length > 0) lines.push(SPONSOR_TRUST_LINE);
  lines.push(PAYER_PUBLIC_LINE);
  return lines;
}

/** Facts about one chain a mode needs (from the deployment manifest and a capability probe). */
export interface ChainCapabilities {
  readonly chainId: number;
  /** Result of a type-4 transaction capability probe or a manifest allowlist. */
  readonly supports7702: boolean;
  readonly relay?: Address | undefined;
  readonly delegate?: Address | undefined;
  readonly entryPoint?: Address | undefined;
  readonly accountFactory?: Address | undefined;
  readonly paymaster?: Address | undefined;
}

/** Availability of a mode on a chain. */
export type ModeAvailability =
  | { readonly available: true }
  | { readonly available: false; readonly reason: 'NO_7702' | 'NO_RELAY' | 'NO_ENTRYPOINT' | 'NO_DELEGATE' };

/**
 * Whether `mode` can run on `caps.chainId` (PH-3-REQ-6).
 *
 * @param mode Selected mode.
 * @param caps Chain facts.
 * @returns Availability with a machine readable reason when unavailable.
 * @throws PayerSponsorError `MAINNET_FORBIDDEN` for a non-testnet chain id.
 */
export function modeAvailability(mode: PayerMode, caps: ChainCapabilities): ModeAvailability {
  assertTestnet(caps.chainId);
  switch (mode) {
    case 'direct':
    case 'fresh-wallet':
      return { available: true };
    case 'permit-relay':
      return caps.relay === undefined ? { available: false, reason: 'NO_RELAY' } : { available: true };
    case 'eip7702-sponsored':
      if (!caps.supports7702) return { available: false, reason: 'NO_7702' };
      return caps.delegate === undefined ? { available: false, reason: 'NO_DELEGATE' } : { available: true };
    case 'erc4337-paymaster':
      return caps.entryPoint === undefined || caps.accountFactory === undefined || caps.paymaster === undefined
        ? { available: false, reason: 'NO_ENTRYPOINT' }
        : { available: true };
  }
}

/**
 * Parses a user supplied mode string.
 *
 * @param value Candidate mode.
 * @returns The mode.
 * @throws PayerSponsorError `BAD_REQUEST` when unknown.
 */
export function parsePayerMode(value: unknown): PayerMode {
  if (typeof value === 'string' && (PAYER_MODES as readonly string[]).includes(value)) return value as PayerMode;
  throw new PayerSponsorError('BAD_REQUEST', 'unknown payer mode');
}
