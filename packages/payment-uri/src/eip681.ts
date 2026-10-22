import { fail } from './errors.js';
import { parseEvmAddress } from './addresses.js';
import { buildQuery, parseQuery, splitUri } from './query.js';
import { recipientInfo, type RecipientInfo } from './recipient.js';

const UINT256_MAX = (1n << 256n) - 1n;
const MAX_CHAIN_ID = Number.MAX_SAFE_INTEGER;
const NUM = /^([0-9]+)(?:\.([0-9]+))?(?:[eE]([0-9]{1,3}))?$/;

/**
 * Strict EIP-681 `number` to a non-negative integer. Signs are rejected, `.` needs digits both sides, `e` needs digits,
 * and the exponent must be >= the fraction digit count (so the result is an integer). Result must fit in uint256.
 */
export function parseEip681Number(s: string): bigint {
  const m = typeof s === 'string' && s.length <= 100 ? NUM.exec(s) : null;
  if (!m) return fail('INVALID_AMOUNT');
  const intPart = m[1]!;
  const frac = m[2] ?? '';
  const exp = m[3] === undefined ? 0 : Number(m[3]);
  if (exp > 77) return fail('AMOUNT_OVERFLOW');
  if (exp < frac.length) return fail('INVALID_AMOUNT');
  if (intPart.length > 1 && intPart.startsWith('0') && frac === '' ) return fail('INVALID_AMOUNT');
  const v = BigInt(intPart + frac) * 10n ** BigInt(exp - frac.length);
  if (v > UINT256_MAX) return fail('AMOUNT_OVERFLOW');
  return v;
}

/** Parsed EIP-681 request. */
export type Eip681Request =
  | {
      readonly kind: 'native';
      readonly chainId?: number;
      readonly recipient: RecipientInfo;
      /** wei */
      readonly value?: bigint;
      readonly gasLimit?: bigint;
      readonly gasPrice?: bigint;
      readonly checksummed: boolean;
      readonly legacyPayPrefix: boolean;
    }
  | {
      readonly kind: 'erc20-transfer';
      readonly chainId?: number;
      /** Token contract. */
      readonly token: RecipientInfo;
      /** Beneficiary of the transfer. */
      readonly recipient: RecipientInfo;
      /** Atomic token units. */
      readonly amount?: bigint;
      readonly gasLimit?: bigint;
      readonly gasPrice?: bigint;
      readonly checksummed: boolean;
      readonly legacyPayPrefix: boolean;
    };

/** Options for {@link parseEip681}. */
export interface Eip681Options {
  /** When set, the URI must carry exactly this chain id (a missing chain id is rejected too). */
  readonly expectedChainId?: number;
}

function parseChainId(s: string): number {
  if (!/^[1-9][0-9]{0,15}$/.test(s)) return fail('INVALID_CHAIN_ID');
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n > MAX_CHAIN_ID) return fail('INVALID_CHAIN_ID');
  return n;
}

/**
 * Strict EIP-681 parser (native transfers and ERC-20 `transfer`). ENS names, other functions, unknown/duplicate parameters,
 * `value` on token transfers, scientific-notation fractions, negative numbers and bad EIP-55 checksums are rejected.
 * Parameter keys are case-sensitive. `gas` and `gasLimit` are synonyms and may not both appear.
 */
export function parseEip681(uri: string, opts: Eip681Options = {}): Eip681Request {
  const { scheme, rest, query } = splitUri(uri);
  if (scheme !== 'ethereum') return fail('INVALID_SCHEME');
  let body = rest;
  let legacyPayPrefix = false;
  if (body.startsWith('pay-')) {
    legacyPayPrefix = true;
    body = body.slice(4);
  }
  const slash = body.indexOf('/');
  const head = slash === -1 ? body : body.slice(0, slash);
  const fn = slash === -1 ? undefined : body.slice(slash + 1);
  const at = head.indexOf('@');
  const addrText = at === -1 ? head : head.slice(0, at);
  const chainId = at === -1 ? undefined : parseChainId(head.slice(at + 1));
  const target = parseEvmAddress(addrText);
  if (opts.expectedChainId !== undefined && chainId !== opts.expectedChainId) return fail('CHAIN_MISMATCH');

  const params = query === undefined ? [] : parseQuery(query, { foldKeys: false });
  const get = new Map(params.map((p) => [p.key, p.value]));
  if (get.has('gas') && get.has('gasLimit')) return fail('DUPLICATE_PARAM');
  const gasText = get.get('gasLimit') ?? get.get('gas');
  const gasLimit = gasText === undefined ? undefined : parseEip681Number(gasText);
  const gasPrice = get.has('gasPrice') ? parseEip681Number(get.get('gasPrice')!) : undefined;
  const common = {
    ...(chainId === undefined ? {} : { chainId }),
    ...(gasLimit === undefined ? {} : { gasLimit }),
    ...(gasPrice === undefined ? {} : { gasPrice }),
    checksummed: target.checksummed,
    legacyPayPrefix,
  };

  if (fn === undefined) {
    for (const k of get.keys()) if (!['value', 'gas', 'gasLimit', 'gasPrice'].includes(k)) return fail('UNKNOWN_REQUIRED_PARAM');
    const value = get.has('value') ? parseEip681Number(get.get('value')!) : undefined;
    return { kind: 'native', recipient: recipientInfo('evm', target.address), ...(value === undefined ? {} : { value }), ...common };
  }
  if (fn !== 'transfer') return fail('UNSUPPORTED');
  for (const k of get.keys()) if (!['address', 'uint256', 'gas', 'gasLimit', 'gasPrice'].includes(k)) return fail('UNKNOWN_REQUIRED_PARAM');
  const to = get.get('address');
  if (to === undefined) return fail('INVALID_QUERY');
  const dest = parseEvmAddress(to);
  const amount = get.has('uint256') ? parseEip681Number(get.get('uint256')!) : undefined;
  return {
    kind: 'erc20-transfer',
    token: recipientInfo('evm', target.address),
    recipient: recipientInfo('evm', dest.address),
    ...(amount === undefined ? {} : { amount }),
    ...common,
    checksummed: target.checksummed && dest.checksummed,
  };
}

function checkUint(v: bigint | undefined, positive: boolean): void {
  if (v === undefined) return;
  if (typeof v !== 'bigint' || v > UINT256_MAX || v < (positive ? 1n : 0n)) fail('INVALID_AMOUNT');
}

/** Parameters for {@link buildEip681Native}. */
export interface BuildNativeParams {
  readonly address: string;
  readonly chainId?: number;
  /** wei, > 0 */
  readonly value?: bigint;
}

/** Parameters for {@link buildEip681Erc20}. */
export interface BuildErc20Params {
  readonly token: string;
  readonly recipient: string;
  readonly chainId?: number;
  /** atomic units, > 0 */
  readonly amount?: bigint;
}

function chainSuffix(chainId: number | undefined): string {
  if (chainId === undefined) return '';
  if (!Number.isSafeInteger(chainId) || chainId < 1) return fail('INVALID_CHAIN_ID');
  return `@${chainId}`;
}

/** Builds `ethereum:<EIP-55 address>[@chainId][?value=<wei>]`. Amount is a plain integer, never scientific notation. */
export function buildEip681Native(p: BuildNativeParams): string {
  const addr = parseEvmAddress(p.address).address;
  checkUint(p.value, true);
  const q = p.value === undefined ? '' : `?${buildQuery([['value', p.value.toString()]])}`;
  return `ethereum:${addr}${chainSuffix(p.chainId)}${q}`;
}

/** Builds `ethereum:<token>[@chainId]/transfer?address=<recipient>[&uint256=<units>]`. */
export function buildEip681Erc20(p: BuildErc20Params): string {
  const token = parseEvmAddress(p.token).address;
  const to = parseEvmAddress(p.recipient).address;
  checkUint(p.amount, true);
  const pairs: [string, string][] = [['address', to]];
  if (p.amount !== undefined) pairs.push(['uint256', p.amount.toString()]);
  return `ethereum:${token}${chainSuffix(p.chainId)}/transfer?${buildQuery(pairs)}`;
}
