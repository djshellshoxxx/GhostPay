import {
  encodeFunctionData,
  hashTypedData,
  keccak256,
  parseAbi,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem';
import { assertTestnet } from '../chainGuard.js';
import { ensure } from '../errors.js';
import { encodeRouterPay, type PayArgs, type RouterTarget } from '../routerTargets.js';

/** EIP-712 type list of `GhostPayPayRelay.PayIntent` (must match `PAYINTENT_TYPEHASH`). */
export const RELAY_TYPES = {
  PayIntent: [
    { name: 'payer', type: 'address' },
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

/** The payer-signed order of `GhostPayPayRelay`. */
export interface RelayPayIntent {
  readonly payer: Address;
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

/** ERC-2612 permit values passed to `GhostPayPayRelay.pay` (`deadline == 0n` means no permit). */
export interface RelayPermit {
  readonly value: bigint;
  readonly deadline: bigint;
  readonly v: number;
  readonly r: Hex;
  readonly s: Hex;
}

/** The "no permit" value: the payer pre-approved the relay. */
export const NO_PERMIT: RelayPermit = {
  value: 0n,
  deadline: 0n,
  v: 0,
  r: `0x${'00'.repeat(32)}`,
  s: `0x${'00'.repeat(32)}`,
};

/**
 * EIP-712 domain of the relay.
 *
 * @param chainId Target chain id (testnet allowlist enforced).
 * @param relay Relay contract address.
 * @returns Domain for `hashTypedData` / `signTypedData`.
 */
export function relayDomain(chainId: number, relay: Address) {
  assertTestnet(chainId);
  return { name: 'GhostPayPayRelay', version: '1', chainId, verifyingContract: relay } as const;
}

/** Inputs of {@link buildRelayIntent}. */
export interface BuildRelayIntentArgs {
  readonly chainId: number;
  readonly relay: Address;
  readonly payer: Address;
  readonly router: RouterTarget;
  readonly pay: PayArgs;
  readonly sponsorFee: bigint;
  readonly sponsorFeeTo: Address;
  readonly deadline: bigint;
  readonly nonce: bigint;
}

/** Typed data ready for `signTypedData`. */
export interface RelayTypedData {
  readonly domain: ReturnType<typeof relayDomain>;
  readonly types: typeof RELAY_TYPES;
  readonly primaryType: 'PayIntent';
  readonly message: RelayPayIntent;
}

/**
 * Builds the relay order, the router calldata it commits to and the EIP-712 typed data. Holds no keys.
 *
 * @param a Order fields.
 * @returns Intent, calldata and typed data. The signer must display `routerCalldata` through the
 *   review step (`decodeAndCheckPayload`) before signing.
 * @throws PayerSponsorError `MAINNET_FORBIDDEN` or `INVALID_ARGUMENT`.
 */
export function buildRelayIntent(a: BuildRelayIntentArgs): {
  readonly typedData: RelayTypedData;
  readonly routerCalldata: Hex;
  readonly intent: RelayPayIntent;
} {
  assertTestnet(a.chainId);
  ensure(a.sponsorFee >= 0n && a.sponsorFee < 2n ** 128n, 'sponsorFee out of range');
  ensure(a.nonce >= 0n && a.nonce < 2n ** 256n, 'nonce out of range');
  ensure(a.deadline > 0n, 'deadline must be set');
  ensure(a.sponsorFee === 0n || a.sponsorFeeTo !== zeroAddress, 'sponsorFeeTo required for a non-zero fee');
  const routerCalldata = encodeRouterPay(a.router, a.pay);
  const intent: RelayPayIntent = {
    payer: a.payer,
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
  const typedData: RelayTypedData = {
    domain: relayDomain(a.chainId, a.relay),
    types: RELAY_TYPES,
    primaryType: 'PayIntent',
    message: intent,
  };
  return { typedData, routerCalldata, intent };
}

/**
 * EIP-712 digest of a relay order (what the payer's wallet signs).
 *
 * @param typedData Typed data from {@link buildRelayIntent}.
 * @returns 32-byte digest.
 */
export function relayDigest(typedData: RelayTypedData): Hex {
  return hashTypedData(typedData);
}

const RELAY_ABI = parseAbi([
  'struct PayIntent { address payer; address router; address token; address stealth; uint256 gross; uint256 sponsorFee; address sponsorFeeTo; uint256 deadline; uint256 nonce; bytes32 payloadHash; }',
  'struct PermitSig { uint256 value; uint256 deadline; uint8 v; bytes32 r; bytes32 s; }',
  'function pay(PayIntent i, bytes routerCalldata, bytes sig, PermitSig permit)',
  'function nonceUsed(address payer, uint256 nonce) view returns (bool)',
]);

/**
 * Encodes `GhostPayPayRelay.pay` calldata.
 *
 * @param intent The signed order.
 * @param routerCalldata Calldata bound by `intent.payloadHash`.
 * @param sig EIP-712 signature (65 bytes) of the order.
 * @param permit ERC-2612 permit or {@link NO_PERMIT}.
 * @returns Calldata for the relay.
 */
export function encodeRelayPay(intent: RelayPayIntent, routerCalldata: Hex, sig: Hex, permit: RelayPermit): Hex {
  return encodeFunctionData({ abi: RELAY_ABI, functionName: 'pay', args: [intent, routerCalldata, sig, permit] });
}

/**
 * Typed data of an ERC-2612 `permit` granting `value` of `token` to the relay.
 *
 * @param a Permit fields. `name` and `version` must be the token's own EIP-712 domain values.
 * @returns Typed data for `signTypedData`.
 */
export function buildPermitTypedData(a: {
  readonly chainId: number;
  readonly token: Address;
  readonly tokenName: string;
  readonly tokenVersion: string;
  readonly owner: Address;
  readonly spender: Address;
  readonly value: bigint;
  readonly nonce: bigint;
  readonly deadline: bigint;
}) {
  assertTestnet(a.chainId);
  return {
    domain: { name: a.tokenName, version: a.tokenVersion, chainId: a.chainId, verifyingContract: a.token },
    types: {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'Permit',
    message: { owner: a.owner, spender: a.spender, value: a.value, nonce: a.nonce, deadline: a.deadline },
  } as const;
}

/**
 * Turns a 65-byte permit signature into the relay's `PermitSig`.
 *
 * @param signature 65-byte signature `r || s || v` with `v` in `{0, 1, 27, 28}`.
 * @param value Permit value.
 * @param deadline Permit deadline.
 * @returns Permit struct (`v` normalised to 27 or 28).
 * @throws PayerSponsorError `INVALID_ARGUMENT` for a wrong length or recovery id.
 */
export function toRelayPermit(signature: Hex, value: bigint, deadline: bigint): RelayPermit {
  ensure(signature.length === 132, 'signature must be 65 bytes');
  const raw = parseInt(signature.slice(130), 16);
  ensure(raw === 0 || raw === 1 || raw === 27 || raw === 28, 'invalid recovery id');
  return { value, deadline, v: raw < 27 ? raw + 27 : raw, r: `0x${signature.slice(2, 66)}`, s: `0x${signature.slice(66, 130)}` };
}

/**
 * Random 256-bit nonce from the platform CSPRNG.
 *
 * @param fill Byte source (defaults to `crypto.getRandomValues`); injectable for tests.
 * @returns A uniformly random nonce.
 */
export function randomNonce(fill: (b: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): bigint {
  const bytes = fill(new Uint8Array(32));
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n;
}
