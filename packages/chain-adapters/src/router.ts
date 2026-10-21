import {
  NATIVE_TOKEN_ADDRESS,
  buildErc20Metadata,
  buildNativeMetadata,
  parseCompressedPoint,
  parseMetadata,
  type DerivedStealthPayment,
} from '@ghostpay/core-crypto';
import type { Invoice } from '@ghostpay/invoice-schema';
import { parseSignature } from 'viem';
import { bytesToHex, decodeFunctionData, encodeFunctionData, getAddress, hexToBytes, isAddress } from 'viem/utils';
import { ghostPayRouterAbi } from './abi/router.js';
import { requireEnabledChain, type ChainConfig } from './config/chains.js';
import { findToken, type TokenConfig } from './config/tokens.js';
import type { DeploymentManifest } from './deployments.js';
import { fail } from './errors.js';
import { MAX_ROUTER_GROSS, routerFee } from './fees.js';
import { MAX_UINT256, ZERO_ADDRESS, type Address, type Hex } from './types.js';

/** Router entry points supported by the builder. */
export type RouterMethod = 'payERC20' | 'payERC20WithPermit' | 'payNative' | 'payERC20WithBuffer';

/** Normalized, human-previewable description of a router call. Every field is checked against calldata. */
export interface PaymentPreview {
  readonly method: RouterMethod;
  readonly chainId: number;
  /** Router contract the transaction is sent to. */
  readonly router: Address;
  /** Token address (EIP-55) or `'native'`. */
  readonly token: Address | 'native';
  readonly stealth: Address;
  readonly gross: bigint;
  /** Protocol fee, `routerFee(gross)`. */
  readonly fee: bigint;
  /** `gross - fee`, delivered to the stealth address. */
  readonly net: bigint;
  readonly minNet: bigint;
  /** Unix seconds. */
  readonly deadline: bigint;
  /** 33-byte compressed ephemeral key. */
  readonly ephemeralPublicKey: Hex;
  /** 57-byte router metadata. */
  readonly metadata: Hex;
  /** `msg.value` of the transaction (gross for native, buffer for buffer payments, else 0). */
  readonly value: bigint;
  /** Only for `payERC20WithBuffer`. */
  readonly maxBufferWei?: bigint;
  /** Only for `payERC20WithPermit`. */
  readonly permit?: { readonly v: number; readonly r: Hex; readonly s: Hex };
}

/** A transaction request for the router. */
export interface PaymentTx {
  readonly to: Address;
  readonly data: Hex;
  readonly value: bigint;
}

/** Output of {@link buildPaymentTx}. */
export interface BuiltPayment {
  readonly tx: PaymentTx;
  readonly preview: PaymentPreview;
}

/** Inputs of {@link buildPaymentTx}. */
export interface BuildPaymentInput {
  readonly chain: ChainConfig;
  readonly deployment: DeploymentManifest;
  readonly invoice: Pick<Invoice, 'chainId' | 'token'>;
  readonly payment: Pick<DerivedStealthPayment, 'stealthAddress' | 'ephemeralPublicKey' | 'viewTag'>;
  /** Gross amount the payer's wallet spends (token base units, or wei for native). */
  readonly grossAmount: bigint;
  /** Slippage floor for the net amount; defaults to the exact net. Must satisfy `1 <= minNet <= net`. */
  readonly minNet?: bigint;
  /** Unix-seconds deadline (inclusive on-chain). */
  readonly deadline: bigint;
  /** Current unix seconds; when given, the deadline must be strictly in the future. */
  readonly now?: bigint;
  /** Use `payERC20WithPermit` with this 65-byte ERC-2612 signature (value = gross, spender = router, same deadline). */
  readonly permitSignature?: Hex;
  /** Use `payERC20WithBuffer`: native wei forwarded to the stealth address (no fee on it). */
  readonly buffer?: { readonly bufferWei: bigint; readonly maxBufferWei?: bigint };
  /** Override of the token allowlist (tests / future chains). Defaults to `config/tokens.ts`. */
  readonly findTokenFn?: (chainId: number, address: string) => TokenConfig | undefined;
}

function sameAddr(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function checkedAddress(v: string, what: string): Address {
  if (!isAddress(v, { strict: true }) || sameAddr(v, ZERO_ADDRESS)) return fail('INVALID_INPUT', what);
  return getAddress(v);
}

function ephemeralHex(key: Uint8Array): Hex {
  try {
    return bytesToHex(parseCompressedPoint(key));
  } catch {
    return fail('INVALID_INPUT', 'ephemeral public key');
  }
}

/**
 * Builds typed calldata for the GhostPay router.
 *
 * @remarks Method selection: native invoice -> `payNative`; ERC-20 + `permitSignature` ->
 * `payERC20WithPermit`; ERC-20 + `buffer` -> `payERC20WithBuffer`; otherwise `payERC20`.
 * Permit and buffer are mutually exclusive. The net amount in the metadata is computed by
 * {@link routerFee}, identical to the contract. Fail-closed on: disabled/unknown chain, any
 * chain-id disagreement between chain, deployment and invoice, tokens off the allowlist, zero
 * addresses, invalid ephemeral key, gross outside `[1, MAX_ROUTER_GROSS]`, past deadlines.
 * No wallet address is baked in: router and fee recipient come from the manifest.
 *
 * @param input See {@link BuildPaymentInput}.
 * @returns The transaction request and its preview (checkable with {@link assertPreviewMatchesCalldata}).
 * @throws {ChainAdapterError} `CHAIN_DISABLED`, `CHAIN_MISMATCH`, `UNSUPPORTED_TOKEN`, `INVALID_INPUT`.
 */
export function buildPaymentTx(input: BuildPaymentInput): BuiltPayment {
  const chain = requireEnabledChain(input.chain.chainId);
  if (input.deployment.chainId !== chain.chainId || input.invoice.chainId !== chain.chainId) {
    return fail('CHAIN_MISMATCH', 'chain, deployment and invoice must agree');
  }
  const { grossAmount: gross, deadline } = input;
  if (typeof gross !== 'bigint' || gross < 1n || gross > MAX_ROUTER_GROSS) return fail('INVALID_INPUT', 'gross');
  if (typeof deadline !== 'bigint' || deadline < 1n || deadline > MAX_UINT256) return fail('INVALID_INPUT', 'deadline');
  if (input.now !== undefined && deadline <= input.now) return fail('INVALID_INPUT', 'deadline already passed');
  const fee = routerFee(gross);
  const net = gross - fee;
  const minNet = input.minNet ?? net;
  if (minNet < 1n || minNet > net) return fail('INVALID_INPUT', 'minNet');
  if (input.permitSignature !== undefined && input.buffer !== undefined) {
    return fail('INVALID_INPUT', 'permit and buffer are mutually exclusive');
  }

  const stealth = checkedAddress(input.payment.stealthAddress, 'stealth address');
  if (sameAddr(stealth, input.deployment.router) || sameAddr(stealth, input.deployment.feeRecipient)) {
    return fail('INVALID_INPUT', 'stealth address collides with router or fee recipient');
  }
  const ephemeral = ephemeralHex(input.payment.ephemeralPublicKey);
  const router = input.deployment.router;

  const isNative = input.invoice.token === 'native';
  let token: Address | 'native' = 'native';
  let metadata: Uint8Array;
  if (isNative) {
    if (input.permitSignature !== undefined || input.buffer !== undefined) {
      return fail('INVALID_INPUT', 'permit/buffer apply to ERC-20 payments only');
    }
    metadata = buildNativeMetadata(input.payment.viewTag, net);
  } else {
    const t = checkedAddress(input.invoice.token, 'token');
    const listed = (input.findTokenFn ?? findToken)(chain.chainId, t);
    if (listed === undefined) return fail('UNSUPPORTED_TOKEN', 'token is not on the allowlist');
    if (input.permitSignature !== undefined && !listed.permit) return fail('UNSUPPORTED_TOKEN', 'token has no ERC-2612 permit');
    token = t;
    metadata = buildErc20Metadata(input.payment.viewTag, t, net);
  }
  const metadataHex = bytesToHex(metadata);

  let method: RouterMethod;
  let data: Hex;
  let value = 0n;
  let extra: Pick<PaymentPreview, 'maxBufferWei' | 'permit'> = {};
  if (token === 'native') {
    method = 'payNative';
    value = gross;
    data = encodeFunctionData({ abi: ghostPayRouterAbi, functionName: 'payNative', args: [stealth, minNet, deadline, ephemeral, metadataHex] });
  } else if (input.permitSignature !== undefined) {
    method = 'payERC20WithPermit';
    const sig = parsePermitSignature(input.permitSignature);
    extra = { permit: sig };
    data = encodeFunctionData({
      abi: ghostPayRouterAbi,
      functionName: 'payERC20WithPermit',
      args: [token, stealth, gross, minNet, deadline, ephemeral, metadataHex, sig.v, sig.r, sig.s],
    });
  } else if (input.buffer !== undefined) {
    method = 'payERC20WithBuffer';
    const { bufferWei } = input.buffer;
    const maxBufferWei = input.buffer.maxBufferWei ?? bufferWei;
    if (bufferWei < 1n || bufferWei > MAX_UINT256) return fail('INVALID_INPUT', 'bufferWei');
    if (maxBufferWei < bufferWei || maxBufferWei > MAX_UINT256) return fail('INVALID_INPUT', 'maxBufferWei');
    value = bufferWei;
    extra = { maxBufferWei };
    data = encodeFunctionData({
      abi: ghostPayRouterAbi,
      functionName: 'payERC20WithBuffer',
      args: [token, stealth, gross, minNet, deadline, maxBufferWei, ephemeral, metadataHex],
    });
  } else {
    method = 'payERC20';
    data = encodeFunctionData({ abi: ghostPayRouterAbi, functionName: 'payERC20', args: [token, stealth, gross, minNet, deadline, ephemeral, metadataHex] });
  }

  const preview: PaymentPreview = {
    method, chainId: chain.chainId, router, token, stealth, gross, fee, net, minNet, deadline,
    ephemeralPublicKey: ephemeral, metadata: metadataHex, value, ...extra,
  };
  return { tx: { to: router, data, value }, preview };
}

/** @internal 65-byte signature to v/r/s; v normalized to 27/28; high-s is left to the token. */
function parsePermitSignature(sig: Hex): { v: number; r: Hex; s: Hex } {
  if (!/^0x[0-9a-fA-F]{130}$/.test(sig)) return fail('INVALID_INPUT', 'permit signature must be 65 bytes');
  const p = parseSignature(sig);
  const v = p.v !== undefined ? Number(p.v) : 27 + p.yParity;
  if (v !== 27 && v !== 28) return fail('INVALID_INPUT', 'permit signature v');
  return { v, r: p.r, s: p.s };
}

/**
 * Decodes and strictly validates router calldata into a preview.
 *
 * @remarks Rejects unknown selectors, non-canonical encodings (re-encode must equal the input
 * byte for byte, so trailing data or padding tricks fail), invalid ephemeral keys, metadata that
 * does not equal the router's required layout for this call (`token`, `net = gross - routerFee`),
 * `value` inconsistent with the method, and calls that the router itself would revert on for
 * static reasons (zero token, zero gross, `minNet > net`). Native `gross` is `value`.
 *
 * @param tx Target, calldata and value of the transaction as the wallet would send it.
 * @param chainId Chain the preview is for (stored in the preview; not in calldata).
 * @returns Normalized preview.
 * @throws {ChainAdapterError} `PREVIEW_MISMATCH` for any inconsistency, `INVALID_INPUT` for malformed hex.
 */
export function decodePaymentCalldata(tx: PaymentTx, chainId: number): PaymentPreview {
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(tx.data) || !isAddress(tx.to, { strict: true })) return fail('INVALID_INPUT', 'tx');
  if (typeof tx.value !== 'bigint' || tx.value < 0n) return fail('INVALID_INPUT', 'tx value');
  const router = getAddress(tx.to);
  let decoded: ReturnType<typeof decodeFunctionData<typeof ghostPayRouterAbi>>;
  try {
    decoded = decodeFunctionData({ abi: ghostPayRouterAbi, data: tx.data });
  } catch {
    return fail('PREVIEW_MISMATCH', 'unknown or malformed router calldata');
  }
  let preview: PaymentPreview;
  switch (decoded.functionName) {
    case 'payERC20': {
      const [token, stealth, gross, minNet, deadline, eph, meta] = decoded.args;
      preview = assemble('payERC20', { router, chainId, token, stealth, gross, minNet, deadline, eph, meta, value: tx.value });
      break;
    }
    case 'payERC20WithPermit': {
      const [token, stealth, gross, minNet, deadline, eph, meta, v, r, s] = decoded.args;
      preview = {
        ...assemble('payERC20WithPermit', { router, chainId, token, stealth, gross, minNet, deadline, eph, meta, value: tx.value }),
        permit: { v, r, s },
      };
      break;
    }
    case 'payERC20WithBuffer': {
      const [token, stealth, gross, minNet, deadline, maxBufferWei, eph, meta] = decoded.args;
      preview = {
        ...assemble('payERC20WithBuffer', { router, chainId, token, stealth, gross, minNet, deadline, eph, meta, value: tx.value }),
        maxBufferWei,
      };
      break;
    }
    case 'payNative': {
      const [stealth, minNet, deadline, eph, meta] = decoded.args;
      preview = assemble('payNative', { router, chainId, token: 'native', stealth, gross: tx.value, minNet, deadline, eph, meta, value: tx.value });
      break;
    }
    default:
      return fail('PREVIEW_MISMATCH', 'not a payment method');
  }
  // Canonical-encoding check: rebuild the calldata from the decoded values.
  if (reencode(preview).toLowerCase() !== tx.data.toLowerCase()) return fail('PREVIEW_MISMATCH', 'non-canonical calldata');
  return preview;
}

interface Raw {
  router: Address;
  chainId: number;
  token: string;
  stealth: string;
  gross: bigint;
  minNet: bigint;
  deadline: bigint;
  eph: Hex;
  meta: Hex;
  value: bigint;
}

function assemble(method: RouterMethod, r: Raw): PreviewBase {
  const native = r.token === 'native';
  if (!native && sameAddr(r.token, ZERO_ADDRESS)) return fail('PREVIEW_MISMATCH', 'zero token');
  if (r.gross < 1n || r.gross > MAX_ROUTER_GROSS) return fail('PREVIEW_MISMATCH', 'gross out of range');
  const fee = routerFee(r.gross);
  const net = r.gross - fee;
  if (r.minNet > net) return fail('PREVIEW_MISMATCH', 'minNet above net');
  if (method === 'payERC20WithBuffer') {
    if (r.value < 1n) return fail('PREVIEW_MISMATCH', 'buffer value missing');
  } else if (!native && r.value !== 0n) {
    return fail('PREVIEW_MISMATCH', 'unexpected msg.value');
  }
  try {
    parseCompressedPoint(hexToBytes(r.eph));
  } catch {
    return fail('PREVIEW_MISMATCH', 'ephemeral key invalid');
  }
  let meta;
  try {
    meta = parseMetadata(r.meta);
  } catch {
    return fail('PREVIEW_MISMATCH', 'metadata layout');
  }
  if (meta.netAmount !== net) return fail('PREVIEW_MISMATCH', 'metadata net differs from computed net');
  if (native ? meta.kind !== 'native' : meta.kind !== 'erc20' || !sameAddr(meta.token, r.token)) {
    return fail('PREVIEW_MISMATCH', 'metadata token');
  }
  if (sameAddr(r.stealth, ZERO_ADDRESS) || sameAddr(r.stealth, r.router)) return fail('PREVIEW_MISMATCH', 'stealth');
  return {
    method,
    chainId: r.chainId,
    router: r.router,
    token: native ? 'native' : getAddress(r.token),
    stealth: getAddress(r.stealth),
    gross: r.gross,
    fee,
    net,
    minNet: r.minNet,
    deadline: r.deadline,
    ephemeralPublicKey: r.eph.toLowerCase() as Hex,
    metadata: r.meta.toLowerCase() as Hex,
    value: r.value,
  };
}
type PreviewBase = PaymentPreview;

function reencode(p: PaymentPreview): Hex {
  const abi = ghostPayRouterAbi;
  switch (p.method) {
    case 'payNative':
      return encodeFunctionData({ abi, functionName: 'payNative', args: [p.stealth, p.minNet, p.deadline, p.ephemeralPublicKey, p.metadata] });
    case 'payERC20WithPermit': {
      const permit = p.permit as NonNullable<PaymentPreview['permit']>;
      return encodeFunctionData({ abi, functionName: 'payERC20WithPermit', args: [p.token as Address, p.stealth, p.gross, p.minNet, p.deadline, p.ephemeralPublicKey, p.metadata, permit.v, permit.r, permit.s] });
    }
    case 'payERC20WithBuffer':
      return encodeFunctionData({ abi, functionName: 'payERC20WithBuffer', args: [p.token as Address, p.stealth, p.gross, p.minNet, p.deadline, p.maxBufferWei as bigint, p.ephemeralPublicKey, p.metadata] });
    case 'payERC20':
      return encodeFunctionData({ abi, functionName: 'payERC20', args: [p.token as Address, p.stealth, p.gross, p.minNet, p.deadline, p.ephemeralPublicKey, p.metadata] });
  }
}

const COMPARED: readonly (keyof PaymentPreview)[] = [
  'method', 'chainId', 'router', 'token', 'stealth', 'gross', 'fee', 'net', 'minNet', 'deadline',
  'ephemeralPublicKey', 'metadata', 'value', 'maxBufferWei',
];

/**
 * Throws unless the preview shown to the payer is exactly what the transaction will do.
 *
 * @remarks Decodes `tx` independently with {@link decodePaymentCalldata} and compares method,
 * token, stealth, gross, minNet, fee, net, deadline, metadata, ephemeral key, router address
 * (`tx.to`), msg.value, buffer cap and permit v/r/s. The preview's own fee/net must equal
 * `routerFee`. The fee RECIPIENT is not part of calldata (router immutable) and is therefore not
 * checked here; it must be displayed from the verified manifest.
 *
 * @param preview Preview shown to the user.
 * @param tx Transaction about to be sent.
 * @param expectedChainId Chain the wallet will submit to (calldata cannot carry it, so the caller supplies it).
 * @throws {ChainAdapterError} `PREVIEW_MISMATCH` naming the first differing field.
 */
export function assertPreviewMatchesCalldata(preview: PaymentPreview, tx: PaymentTx, expectedChainId: number): void {
  if (preview.chainId !== expectedChainId) return fail('PREVIEW_MISMATCH', 'field chainId');
  const actual = decodePaymentCalldata(tx, expectedChainId);
  const a = actual as unknown as Record<string, unknown>;
  const p = preview as unknown as Record<string, unknown>;
  for (const k of COMPARED) {
    if (!sameValue(p[k], a[k])) return fail('PREVIEW_MISMATCH', `field ${k}`);
  }
  const pp = preview.permit;
  const ap = actual.permit;
  if ((pp === undefined) !== (ap === undefined)) return fail('PREVIEW_MISMATCH', 'field permit');
  if (pp !== undefined && ap !== undefined && (pp.v !== ap.v || !sameValue(pp.r, ap.r) || !sameValue(pp.s, ap.s))) {
    return fail('PREVIEW_MISMATCH', 'field permit');
  }
}

function sameValue(x: unknown, y: unknown): boolean {
  if (typeof x === 'string' && typeof y === 'string') return x.toLowerCase() === y.toLowerCase();
  return x === y;
}

/** Sentinel re-export so callers can compare against the router's native marker. */
export const ROUTER_NATIVE_MARKER: Address = NATIVE_TOKEN_ADDRESS;
