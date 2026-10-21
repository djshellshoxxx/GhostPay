import { encodeMetaAddress, generateKeySet, deriveStealthPayment, type StealthKeySet } from '@ghostpay/core-crypto';
import { getAddress } from 'viem/utils';
import type { Invoice } from '@ghostpay/invoice-schema';
import { findChain, type ChainConfig } from './config/chains.js';
import type { DeploymentManifest } from './deployments.js';
import type { Address } from './types.js';

export const SEPOLIA = findChain(11155111) as ChainConfig;
export const MAINNET = findChain(1) as ChainConfig;

/** Obviously fake addresses (never real deployments). */
export const FAKE = {
  announcer: getAddress('0x0000000000000000000000000000000000000a11'),
  router: getAddress('0x0000000000000000000000000000000000000b22'),
  relayer: getAddress('0x0000000000000000000000000000000000000c33'),
  feeRecipient: getAddress('0x0000000000000000000000000000000000000d44'),
};

export const USDC_SEPOLIA = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address;

export function manifestJson(chainId = 11155111): Record<string, unknown> {
  return {
    chainId,
    announcer: FAKE.announcer,
    router: FAKE.router,
    sweepRelayer: FAKE.relayer,
    feeRecipient: FAKE.feeRecipient,
    feeBps: 25,
    deployTx: { router: `0x${'1'.repeat(64)}`, sweepRelayer: `0x${'2'.repeat(64)}` },
    solcVersion: '0.8.28+commit.7893614a',
    commit: 'a'.repeat(40),
    bytecodeHashes: { router: `0x${'3'.repeat(64)}`, sweepRelayer: `0x${'4'.repeat(64)}` },
    date: '2026-01-01T00:00:00Z',
  };
}

export function manifest(chainId = 11155111): DeploymentManifest {
  const m = manifestJson(chainId) as unknown as DeploymentManifest;
  // addresses in the fixture are all-caps-hex fakes; the validator is the normalizer in tests that need it.
  return m;
}

export function recipient(): { keys: StealthKeySet; meta: string } {
  const keys = generateKeySet();
  return { keys, meta: encodeMetaAddress(keys) };
}

export function invoiceFor(meta: string, over: Partial<Invoice> = {}): Invoice {
  return {
    v: 1,
    chainId: 11155111,
    schemeId: 1,
    metaAddress: meta,
    nonce: '0'.repeat(32),
    fiat: { currency: 'USD', minorUnits: '1000' },
    token: USDC_SEPOLIA.toLowerCase(),
    amountPolicy: { mode: 'fixed_token', tokenAmount: '10000000' },
    quote: { source: 'chainlink:test', timestamp: 0, expiresAt: 1, maxSlippageBps: 50 },
    expiresAt: 4_000_000_000,
    lineItems: [],
    tax: { rateBps: 0, minorUnits: '0' },
    feePolicy: 'seller_pays',
    signer: `02${'11'.repeat(32)}`,
    ...over,
  };
}

export function payment(meta: string): ReturnType<typeof deriveStealthPayment> {
  return deriveStealthPayment(meta);
}

/** Manifest JSON including the optional policy-account fields (flat fee configurable). */
export function policyManifestJson(flatFee = '1000000', chainId = 11155111): Record<string, unknown> {
  const j = manifestJson(chainId);
  return {
    ...j,
    deployTx: { ...(j['deployTx'] as object), policyImplementation: `0x${'5'.repeat(64)}`, policyFactory: `0x${'6'.repeat(64)}` },
    bytecodeHashes: { ...(j['bytecodeHashes'] as object), policyImplementation: `0x${'7'.repeat(64)}`, policyFactory: `0x${'8'.repeat(64)}` },
    policyImplementation: '0x0000000000000000000000000000000000000e55',
    policyFactory: '0x0000000000000000000000000000000000000f66',
    policyFeeToken: USDC_SEPOLIA,
    policyFlatFee: flatFee,
    policyFeeRecipient: FAKE.feeRecipient,
  };
}
