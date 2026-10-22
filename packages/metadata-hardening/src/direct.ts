import { parseCompressedPoint } from '@ghostpay/core-crypto';
import { encodeFunctionData, isAddress, parseAbi } from 'viem';
import { assertTestnetChain, MetadataHardeningError, requireInput } from './guard.js';

const ANNOUNCER_ABI = parseAbi(['function announce(uint256 schemeId, address stealthAddress, bytes ephemeralPubKey, bytes metadata)']);
const ERC20_ABI = parseAbi(['function transfer(address to, uint256 amount) returns (bool)']);

/** One transaction request produced by {@link buildDirectPayment}. */
export interface DirectCall {
  readonly label: 'transfer' | 'announce';
  readonly to: string;
  readonly data: string;
  readonly value: bigint;
}

/** Input for {@link buildDirectPayment}. */
export interface DirectPaymentInput {
  readonly chainId: number;
  /** Standard ERC-5564 announcer from the manifest; never the router. */
  readonly announcer: string;
  /** The router address, so it can be refused as a target. */
  readonly routerAddress: string;
  readonly stealthAddress: string;
  readonly asset: { readonly kind: 'native' } | { readonly kind: 'erc20'; readonly token: string };
  readonly amount: bigint;
  /** 33-byte compressed ephemeral key. */
  readonly ephemeralPublicKey: Uint8Array;
  /** Metadata whose first byte is the view tag (1 byte for MH-ANN-3). */
  readonly metadata: Uint8Array;
}

/** Result of {@link buildDirectPayment}. */
export interface DirectPayment {
  /** Exactly the transfer call then the announce call. */
  readonly calls: readonly [DirectCall, DirectCall];
  /** Pre-signing warning (MH-FEE-1 R2). */
  readonly warning: string;
}

const WARNING =
  'No GhostPay fee, no router protection (no minimum-received or deadline check), and the amount is unverified by the receiver until read from the chain. ' +
  'Your wallet address, the amount, the token and the time stay public.';

function addr(a: string): string {
  if (!isAddress(a, { strict: true }) || /^0x0{40}$/.test(a)) {
    throw new MetadataHardeningError('INVALID_INPUT', 'invalid address');
  }
  return a;
}

/**
 * MH-FEE-1: builds the two calls of a direct (no router) payment: asset transfer to the stealth
 * address, then `announce(1, stealth, ephemeralPubKey, metadata)` on the standard announcer.
 *
 * @remarks Hides: the fee transfer/`FeeCollected` and router-topic enumeration (the log `caller` is
 * the payer). Does NOT hide payer, amount, token or time. Two txs can be separated in time.
 * Nothing is signed or sent here (pure calldata).
 *
 * @throws {MetadataHardeningError} `UNSUPPORTED_CHAIN`, `INVALID_INPUT`, `POLICY_REJECTED` if the
 * announcer or any target equals the router.
 * @security Testnet only. Builder output goes to the user's wallet for explicit approval.
 */
export function buildDirectPayment(input: DirectPaymentInput): DirectPayment {
  assertTestnetChain(input.chainId);
  const announcer = addr(input.announcer);
  const router = addr(input.routerAddress);
  const stealth = addr(input.stealthAddress);
  requireInput(input.amount > 0n, 'amount must be positive');
  parseCompressedPoint(input.ephemeralPublicKey);
  requireInput(input.metadata.length >= 1, 'metadata needs the view tag byte');
  const token = input.asset.kind === 'erc20' ? addr(input.asset.token) : undefined;
  const lower = (s: string): string => s.toLowerCase();
  if ([announcer, stealth, token].some((t) => t !== undefined && lower(t) === lower(router))) {
    throw new MetadataHardeningError('POLICY_REJECTED', 'direct payment must not target the router');
  }
  const hex = (b: Uint8Array): `0x${string}` => `0x${Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')}`;
  const transfer: DirectCall =
    token === undefined
      ? { label: 'transfer', to: stealth, data: '0x', value: input.amount }
      : {
          label: 'transfer',
          to: token,
          data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'transfer', args: [stealth as `0x${string}`, input.amount] }),
          value: 0n,
        };
  const announce: DirectCall = {
    label: 'announce',
    to: announcer,
    data: encodeFunctionData({
      abi: ANNOUNCER_ABI,
      functionName: 'announce',
      args: [1n, stealth as `0x${string}`, hex(input.ephemeralPublicKey), hex(input.metadata)],
    }),
    value: 0n,
  };
  return { calls: [transfer, announce], warning: WARNING };
}
