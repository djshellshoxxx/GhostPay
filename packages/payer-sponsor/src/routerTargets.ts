import {
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  isAddressEqual,
  isHex,
  parseAbi,
  toFunctionSelector,
  type Address,
  type Hex,
} from 'viem';
import { PayerSponsorError, ensure } from './errors.js';

/** Router fee in basis points (`GhostPayRouter.FEE_BPS`, 25 bps, rounded down). */
export const ROUTER_FEE_BPS = 25n;
const BPS = 10_000n;

const ROUTER_ABI = parseAbi([
  'function payERC20(address token, address stealth, uint256 gross, uint256 minNet, uint256 deadline, bytes ephemeralPubKey, bytes metadata)',
]);

const POLICY_ROUTER_ABI = [
  {
    type: 'function',
    name: 'payERC20',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'stealth', type: 'address' },
      {
        name: 'policy',
        type: 'tuple',
        components: [
          { name: 'owner', type: 'address' },
          { name: 'policyHash', type: 'bytes32' },
        ],
      },
      { name: 'gross', type: 'uint256' },
      { name: 'minNet', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'ephemeralPubKey', type: 'bytes' },
      { name: 'metadata', type: 'bytes' },
    ],
    outputs: [],
  },
] as const;

/** Selector of `GhostPayRouter.payERC20`. */
export const SELECTOR_PLAIN: Hex = toFunctionSelector(ROUTER_ABI[0]);
/** Selector of `GhostPayPolicyRouter.payERC20`. */
export const SELECTOR_POLICY: Hex = toFunctionSelector(POLICY_ROUTER_ABI[0]);

/** Policy account reference of the policy router (`IGhostPayPolicyRouter.PolicyRef`). */
export interface PolicyRef {
  readonly owner: Address;
  readonly policyHash: Hex;
}

/** Which GhostPay router a payment targets. */
export type RouterTarget =
  | { readonly kind: 'ghostpay'; readonly address: Address }
  | { readonly kind: 'policy'; readonly address: Address; readonly policy: PolicyRef };

/** Arguments of `payERC20` common to both routers. */
export interface PayArgs {
  readonly token: Address;
  readonly stealth: Address;
  /** Amount the router pulls (router fee included). */
  readonly gross: bigint;
  readonly minNet: bigint;
  readonly deadline: bigint;
  /** 33-byte compressed ephemeral public key. */
  readonly ephemeralPubKey: Hex;
  /** 57-byte announcement metadata. */
  readonly metadata: Hex;
}

/**
 * Router fee for `gross`, floor-rounded (matches `GhostPayRouter`).
 *
 * @param gross Gross amount in base units.
 * @returns The fee.
 */
export function routerFee(gross: bigint): bigint {
  ensure(gross >= 0n, 'gross must be >= 0');
  return (gross * ROUTER_FEE_BPS) / BPS;
}

/**
 * Builds the 57-byte announcement metadata `viewTag || 0xa9059cbb || token || net` the routers require.
 *
 * @param viewTag View tag byte (0..255).
 * @param token Token address.
 * @param net Net amount (`gross - fee`).
 * @returns 57 bytes of hex.
 */
export function buildErc20Metadata(viewTag: number, token: Address, net: bigint): Hex {
  ensure(Number.isInteger(viewTag) && viewTag >= 0 && viewTag <= 255, 'viewTag must be a byte');
  ensure(net >= 0n && net < 2n ** 256n, 'net out of range');
  const tag = viewTag.toString(16).padStart(2, '0');
  return `0x${tag}a9059cbb${token.slice(2).toLowerCase()}${net.toString(16).padStart(64, '0')}`;
}

/**
 * Encodes `payERC20` calldata for either router.
 *
 * @param target Router kind and address.
 * @param args Payment arguments.
 * @returns Calldata (selector included).
 */
export function encodeRouterPay(target: RouterTarget, args: PayArgs): Hex {
  ensure(args.gross > 0n, 'gross must be > 0');
  if (target.kind === 'ghostpay') {
    return encodeFunctionData({
      abi: ROUTER_ABI,
      functionName: 'payERC20',
      args: [args.token, args.stealth, args.gross, args.minNet, args.deadline, args.ephemeralPubKey, args.metadata],
    });
  }
  return encodeFunctionData({
    abi: POLICY_ROUTER_ABI,
    functionName: 'payERC20',
    args: [
      args.token,
      args.stealth,
      target.policy,
      args.gross,
      args.minNet,
      args.deadline,
      args.ephemeralPubKey,
      args.metadata,
    ],
  });
}

/** Fields extracted from router calldata. */
export interface DecodedRouterPay {
  readonly kind: 'ghostpay' | 'policy';
  readonly token: Address;
  readonly stealth: Address;
  readonly gross: bigint;
  readonly minNet: bigint;
  readonly deadline: bigint;
}

/**
 * Decodes `payERC20` calldata of either router.
 *
 * @param data Router calldata.
 * @returns The decoded fields.
 * @throws PayerSponsorError `PAYLOAD_MISMATCH` for any other selector or malformed calldata.
 */
export function decodeRouterPay(data: Hex): DecodedRouterPay {
  if (!isHex(data) || data.length < 10) throw new PayerSponsorError('PAYLOAD_MISMATCH', 'calldata too short');
  const selector = data.slice(0, 10).toLowerCase();
  try {
    if (selector === SELECTOR_PLAIN) {
      const d = decodeFunctionData({ abi: ROUTER_ABI, data });
      const [token, stealth, gross, minNet, deadline] = d.args;
      return { kind: 'ghostpay', token, stealth, gross, minNet, deadline };
    }
    if (selector === SELECTOR_POLICY) {
      const d = decodeFunctionData({ abi: POLICY_ROUTER_ABI, data });
      const [token, stealth, , gross, minNet, deadline] = d.args;
      return { kind: 'policy', token, stealth, gross, minNet, deadline };
    }
  } catch {
    throw new PayerSponsorError('PAYLOAD_MISMATCH', 'calldata does not decode');
  }
  throw new PayerSponsorError('PAYLOAD_MISMATCH', 'selector is not a payERC20 selector');
}

/** The fields a signer commits to and the calldata must repeat (review step, PH-GEN-6). */
export interface SignedPayFields {
  readonly token: Address;
  readonly stealth: Address;
  readonly gross: bigint;
}

/**
 * Review step: the calldata must be a `payERC20` call of the declared router kind whose token,
 * stealth and gross equal the signed fields. Mirrors the on-chain check in `RouterCall.matches`.
 *
 * @param target Declared router.
 * @param routerCalldata Calldata to be relayed.
 * @param fields Signed fields.
 * @throws PayerSponsorError `PAYLOAD_MISMATCH` on any difference (also a policy reference mismatch).
 */
export function decodeAndCheckPayload(target: RouterTarget, routerCalldata: Hex, fields: SignedPayFields): void {
  const d = decodeRouterPay(routerCalldata);
  if (d.kind !== target.kind) throw new PayerSponsorError('PAYLOAD_MISMATCH', 'router kind differs');
  if (!isAddressEqual(d.token, fields.token)) throw new PayerSponsorError('PAYLOAD_MISMATCH', 'token differs');
  if (!isAddressEqual(d.stealth, fields.stealth)) throw new PayerSponsorError('PAYLOAD_MISMATCH', 'stealth differs');
  if (d.gross !== fields.gross) throw new PayerSponsorError('PAYLOAD_MISMATCH', 'gross differs');
  if (target.kind === 'policy') {
    const dd = decodeFunctionData({ abi: POLICY_ROUTER_ABI, data: routerCalldata });
    const ref = dd.args[2];
    if (!isAddressEqual(ref.owner, target.policy.owner) || ref.policyHash.toLowerCase() !== target.policy.policyHash.toLowerCase()) {
      throw new PayerSponsorError('PAYLOAD_MISMATCH', 'policy reference differs');
    }
  }
}

/**
 * Checksums an address argument.
 *
 * @param value Candidate.
 * @returns Checksummed address.
 * @throws PayerSponsorError `BAD_REQUEST` when not an address.
 */
export function parseAddress(value: unknown): Address {
  if (typeof value !== 'string') throw new PayerSponsorError('BAD_REQUEST', 'address expected');
  try {
    return getAddress(value);
  } catch {
    throw new PayerSponsorError('BAD_REQUEST', 'invalid address');
  }
}
