import {
  encodeFunctionData,
  hashTypedData,
  isAddressEqual,
  keccak256,
  parseAbi,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem';
import { assertTestnet } from '../chainGuard.js';
import { PayerSponsorError, ensure } from '../errors.js';
import { deploymentFor, type PayerHidingManifest } from '../manifest.js';
import { encodeRouterPay, type PayArgs, type RouterTarget } from '../routerTargets.js';

/** EIP-7702 constants (EIP-7702, Final; https://eips.ethereum.org/EIPS/eip-7702). */
export const EIP7702_CONSTANTS = {
  SET_CODE_TX_TYPE: 0x04,
  MAGIC: 0x05,
  PER_AUTH_BASE_COST: 12_500,
  PER_EMPTY_ACCOUNT_COST: 25_000,
  DELEGATION_PREFIX: '0xef0100',
} as const;

/** EIP-712 type list of `GhostPayPayerDelegate.PayIntent` (no payer field: the payer is `address(this)`). */
export const DELEGATE_TYPES = {
  PayIntent: [
    { name: 'router', type: 'address' },
    { name: 'token', type: 'address' },
    { name: 'stealth', type: 'address' },
    { name: 'gross', type: 'uint256' },
    { name: 'sponsorFee', type: 'uint256' },
    { name: 'sponsorFeeTo', type: 'address' },
    { name: 'deadline', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'payloadHash', type: 'bytes32' },
  ],
} as const;

/** The payer-signed order of `GhostPayPayerDelegate`. */
export interface DelegatePayIntent {
  readonly router: Address;
  readonly token: Address;
  readonly stealth: Address;
  readonly gross: bigint;
  readonly sponsorFee: bigint;
  readonly sponsorFeeTo: Address;
  readonly deadline: bigint;
  readonly nonce: bigint;
  readonly payloadHash: Hex;
}

/** An unsigned EIP-7702 authorization tuple (`[chain_id, address, nonce]`, to be signed by the payer). */
export interface AuthorizationRequest {
  readonly chainId: number;
  readonly address: Address;
  readonly nonce: number;
}

/**
 * EIP-712 domain of the delegate: `verifyingContract` is the PAYER EOA (the delegate runs as it).
 *
 * @param chainId Target chain id (testnet allowlist enforced).
 * @param payer The delegating EOA.
 * @returns Domain for `hashTypedData` / `signTypedData`.
 */
export function delegateDomain(chainId: number, payer: Address) {
  assertTestnet(chainId);
  return { name: 'GhostPayPayerDelegate', version: '1', chainId, verifyingContract: payer } as const;
}

/** Inputs of {@link buildDelegatePayIntent}. */
export interface BuildDelegatePayIntentArgs {
  readonly chainId: number;
  readonly manifest: PayerHidingManifest;
  /** Delegate implementation address the payer would authorise; MUST equal the manifest entry. */
  readonly delegate: Address;
  readonly payer: Address;
  /** The payer's CURRENT account nonce, read by the caller (PH-3-REQ-3). */
  readonly payerAccountNonce: number;
  readonly router: RouterTarget;
  readonly pay: PayArgs;
  readonly sponsorFee: bigint;
  readonly sponsorFeeTo: Address;
  readonly deadline: bigint;
  readonly nonce: bigint;
}

/** Typed data ready for `signTypedData`. */
export interface DelegateTypedData {
  readonly domain: ReturnType<typeof delegateDomain>;
  readonly types: typeof DELEGATE_TYPES;
  readonly primaryType: 'PayIntent';
  readonly message: DelegatePayIntent;
}

/**
 * Checks that `delegate` is the manifest's delegate for `chainId`.
 *
 * @param manifest Validated manifest.
 * @param chainId Target chain id.
 * @param delegate Address about to be authorised.
 * @throws PayerSponsorError `MANIFEST_MISMATCH` when the manifest has no delegate or a different one.
 */
export function assertDelegateInManifest(manifest: PayerHidingManifest, chainId: number, delegate: Address): void {
  const d = deploymentFor(manifest, chainId);
  if (d.delegate === undefined || !isAddressEqual(d.delegate, delegate)) {
    throw new PayerSponsorError('MANIFEST_MISMATCH', 'delegate is not the manifest delegate for this chain');
  }
}

/**
 * Builds the authorization the payer signs, the delegate order and its router calldata.
 *
 * @param a Order fields.
 * @returns Authorization request (chain id is the target chain, never 0), typed data, calldata, intent.
 * @throws PayerSponsorError `MAINNET_FORBIDDEN`, `MANIFEST_MISMATCH` or `INVALID_ARGUMENT`.
 * @security The authorization lets the delegate code run as the payer EOA: a poorly written delegate
 *   can give an attacker control of the EOA (EIP-7702 security considerations). The delegate address
 *   is refused unless it is in the manifest (PH-3-REQ-3).
 */
export function buildDelegatePayIntent(a: BuildDelegatePayIntentArgs): {
  readonly authorization: AuthorizationRequest;
  readonly typedData: DelegateTypedData;
  readonly routerCalldata: Hex;
  readonly intent: DelegatePayIntent;
} {
  assertTestnet(a.chainId);
  assertDelegateInManifest(a.manifest, a.chainId, a.delegate);
  ensure(Number.isSafeInteger(a.payerAccountNonce) && a.payerAccountNonce >= 0, 'payerAccountNonce must be a non-negative integer');
  ensure(a.sponsorFee >= 0n && a.sponsorFee < 2n ** 128n, 'sponsorFee out of range');
  ensure(a.nonce >= 0n && a.nonce < 2n ** 256n, 'nonce out of range');
  ensure(a.deadline > 0n, 'deadline must be set');
  ensure(a.sponsorFee === 0n || a.sponsorFeeTo !== zeroAddress, 'sponsorFeeTo required for a non-zero fee');
  const routerCalldata = encodeRouterPay(a.router, a.pay);
  const intent: DelegatePayIntent = {
    router: a.router.address,
    token: a.pay.token,
    stealth: a.pay.stealth,
    gross: a.pay.gross,
    sponsorFee: a.sponsorFee,
    sponsorFeeTo: a.sponsorFeeTo,
    deadline: a.deadline,
    nonce: a.nonce,
    payloadHash: keccak256(routerCalldata),
  };
  return {
    authorization: { chainId: a.chainId, address: a.delegate, nonce: a.payerAccountNonce },
    typedData: {
      domain: delegateDomain(a.chainId, a.payer),
      types: DELEGATE_TYPES,
      primaryType: 'PayIntent',
      message: intent,
    },
    routerCalldata,
    intent,
  };
}

/**
 * EIP-712 digest of a delegate order.
 *
 * @param typedData Typed data from {@link buildDelegatePayIntent}.
 * @returns 32-byte digest.
 */
export function delegateDigest(typedData: DelegateTypedData): Hex {
  return hashTypedData(typedData);
}

/**
 * Builds the clearing authorization (`address = 0x0`, EIP-7702) that removes the delegation.
 *
 * @param a Target chain and the payer's current account nonce (read by the caller).
 * @returns Authorization request for the payer to sign; the sponsor includes it in a later sponsored tx.
 */
export function buildClearingAuthorization(a: { readonly chainId: number; readonly payerAccountNonce: number }): AuthorizationRequest {
  assertTestnet(a.chainId);
  ensure(Number.isSafeInteger(a.payerAccountNonce) && a.payerAccountNonce >= 0, 'payerAccountNonce must be a non-negative integer');
  return { chainId: a.chainId, address: zeroAddress, nonce: a.payerAccountNonce };
}

/**
 * Whether account `code` is an EIP-7702 delegation designator to `delegate` (`0xef0100 || address`).
 *
 * @param code Account code from `eth_getCode`.
 * @param delegate Expected delegate.
 * @returns True iff `code` is exactly the 23-byte designator for `delegate`.
 */
export function isDelegatedTo(code: Hex, delegate: Address): boolean {
  return code.toLowerCase() === `${EIP7702_CONSTANTS.DELEGATION_PREFIX}${delegate.slice(2).toLowerCase()}`;
}

const DELEGATE_ABI = parseAbi([
  'struct PayIntent { address router; address token; address stealth; uint256 gross; uint256 sponsorFee; address sponsorFeeTo; uint256 deadline; uint256 nonce; bytes32 payloadHash; }',
  'function pay(PayIntent i, bytes routerCalldata, bytes sig)',
]);

/**
 * Encodes `GhostPayPayerDelegate.pay` calldata (sent TO the payer EOA in the type-4 transaction).
 *
 * @param intent The signed order.
 * @param routerCalldata Calldata bound by `intent.payloadHash`.
 * @param sig EIP-712 signature (65 bytes) of the order by the payer key.
 * @returns Calldata.
 */
export function encodeDelegatePay(intent: DelegatePayIntent, routerCalldata: Hex, sig: Hex): Hex {
  return encodeFunctionData({ abi: DELEGATE_ABI, functionName: 'pay', args: [intent, routerCalldata, sig] });
}
