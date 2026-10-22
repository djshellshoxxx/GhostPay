import {
  ChainAdapterError,
  PERMIT_TYPES,
  SWEEP_DOMAIN_NAME,
  SWEEP_DOMAIN_VERSION,
  SWEEP_TYPES,
  decodePaymentCalldata,
  erc20Abi,
  ghostPayRouterAbi,
} from '@ghostpay/chain-adapters';
import {
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  isAddress,
  toFunctionSelector,
  type Abi,
  type AbiFunction,
} from 'viem';
import type {
  Address,
  DecodeFailureCode,
  Hex,
  Intent,
  RouterPaymentMethod,
  TxInput,
  TypedDataInput,
  UnknownIntent,
} from './types.js';

const MAX_UINT256 = (1n << 256n) - 1n;
const ZERO = '0x0000000000000000000000000000000000000000';

const unknown = (reason: DecodeFailureCode): UnknownIntent => ({ kind: 'unknown', reason });

type Family = 'router' | 'erc20';
const FAMILY_ABI: Record<Family, Abi> = { router: ghostPayRouterAbi, erc20: erc20Abi };

/** Fixed table: selector -> (ABI family, function name). Only these entry points are ever decoded. */
const SELECTORS: ReadonlyMap<string, { family: Family; name: string }> = (() => {
  const m = new Map<string, { family: Family; name: string }>();
  const add = (family: Family, name: string): void => {
    const item = FAMILY_ABI[family].find((i): i is AbiFunction => i.type === 'function' && i.name === name);
    if (item === undefined) throw new Error(`ABI lacks ${name}`);
    m.set(toFunctionSelector(item), { family, name });
  };
  for (const n of ['payERC20', 'payERC20WithPermit', 'payNative', 'payERC20WithBuffer']) add('router', n);
  for (const n of ['transfer', 'approve']) add('erc20', n);
  return m;
})();

const ROUTER_METHODS: Readonly<Record<string, RouterPaymentMethod>> = {
  payERC20: 'payERC20',
  payERC20WithPermit: 'payERC20WithPermit',
  payNative: 'payNative',
};

function isUint(v: unknown): v is bigint {
  return typeof v === 'bigint' && v >= 0n && v <= MAX_UINT256;
}

function strictAddress(v: unknown): Address | undefined {
  if (typeof v !== 'string' || !isAddress(v, { strict: true }) || v.toLowerCase() === ZERO) return undefined;
  return getAddress(v);
}

type Strict = { readonly name: string; readonly args: readonly unknown[] } | DecodeFailureCode;

/** Decodes with `abi` and requires the canonical re-encoding to equal `data` (trailing bytes, dirty padding). */
function decodeStrict(abi: Abi, data: Hex): Strict {
  let decoded: { functionName: string; args?: readonly unknown[] };
  try {
    decoded = decodeFunctionData({ abi, data }) as typeof decoded;
  } catch {
    return 'MALFORMED_CALLDATA';
  }
  const args = decoded.args ?? [];
  const canonical = encodeFunctionData({ abi, functionName: decoded.functionName, args }).toLowerCase();
  const lower = data.toLowerCase();
  if (lower === canonical) return { name: decoded.functionName, args };
  return lower.length > canonical.length && lower.startsWith(canonical) ? 'TRAILING_BYTES' : 'NON_CANONICAL_CALLDATA';
}

/**
 * Decodes the exact bytes of a transaction about to be signed into a closed {@link Intent}.
 *
 * @remarks Only GhostPay router payments (`payERC20`, `payERC20WithPermit`, `payNative`), ERC-20
 * `approve` and `transfer`, and empty-calldata native transfers decode; everything else is
 * `{ kind: 'unknown' }` with the reason (`setApprovalForAll`, `increaseAllowance`, Permit2 and every
 * other selector are `UNKNOWN_SELECTOR`; a transaction carrying an EIP-7702 `authorizationList` is
 * `UNSUPPORTED_TX_FEATURE`). `payERC20WithBuffer` is rejected outright (haiku L-04).
 * Calldata must re-encode byte for byte, so truncated data, trailing bytes and dirty padding fail.
 * A non-zero `value` on a call that does not take ETH fails. Native vs ERC-20 is decided from the
 * calldata shape only, never from announcement metadata (S3-09a); allowlisting happens in `review`.
 * Router payments are additionally validated by `decodePaymentCalldata` of chain-adapters.
 *
 * @security Decoding is not authorization: the result must be passed through `review` against
 * what the user was shown. Never sign when the result is `unknown`.
 * @param tx Unsigned transaction. `from`, `maxFeePerGas`, `maxPriorityFeePerGas` and `gasLimit`
 * are required only for direct sweeps.
 * @returns The intent or an {@link UnknownIntent}. Never throws.
 */
export function decodeTx(tx: TxInput): Intent | UnknownIntent {
  if (!Number.isSafeInteger(tx.chainId) || tx.chainId < 1 || !isUint(tx.value)) return unknown('INVALID_TX_FIELD');
  if (tx.authorizationList !== undefined) return unknown('UNSUPPORTED_TX_FEATURE');
  const to = strictAddress(tx.to);
  if (to === undefined) return unknown('INVALID_TX_FIELD');
  if (typeof tx.data !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(tx.data)) return unknown('MALFORMED_CALLDATA');
  const data = tx.data.toLowerCase() as Hex;
  if (data === '0x') return nativeSweep(tx, to);
  if (data.length < 10) return unknown('MALFORMED_CALLDATA');
  const entry = SELECTORS.get(data.slice(0, 10));
  if (entry === undefined) return unknown('UNKNOWN_SELECTOR');
  if (entry.name === 'payERC20WithBuffer') return unknown('BUFFER_PAYMENT_UNSUPPORTED');
  const strict = decodeStrict(FAMILY_ABI[entry.family], data);
  if (typeof strict === 'string') return unknown(strict);
  if (entry.family === 'router') return routerPayment(tx, to, data, strict.name);
  if (tx.value !== 0n) return unknown('VALUE_UNEXPECTED');
  const [a0, a1] = strict.args as [string, bigint];
  const first = strictAddress(a0);
  if (first === undefined) return unknown('INVALID_TX_FIELD');
  if (strict.name === 'approve') return { kind: 'erc20_approve', chainId: tx.chainId, token: to, spender: first, amount: a1 };
  if (a1 === 0n) return unknown('INVALID_TX_FIELD');
  return directSweep(tx, to, first, a1);
}

function routerPayment(tx: TxInput, to: Address, data: Hex, name: string): Intent | UnknownIntent {
  const method = ROUTER_METHODS[name] as RouterPaymentMethod;
  if (method !== 'payNative' && tx.value !== 0n) return unknown('VALUE_UNEXPECTED');
  try {
    const p = decodePaymentCalldata({ to, data, value: tx.value }, tx.chainId);
    return {
      kind: 'router_payment',
      method,
      chainId: tx.chainId,
      router: p.router,
      token: p.token,
      stealth: p.stealth,
      gross: p.gross,
      minNet: p.minNet,
      fee: p.fee,
      deadline: p.deadline,
      metadata: p.metadata,
      ephemeralKey: p.ephemeralPublicKey,
    };
  } catch (e) {
    if (e instanceof ChainAdapterError) return unknown('INVALID_PAYMENT');
    /* c8 ignore next */
    throw e;
  }
}

function nativeSweep(tx: TxInput, to: Address): Intent | UnknownIntent {
  if (tx.value === 0n) return unknown('INVALID_TX_FIELD');
  return directSweep(tx, 'native', to, tx.value);
}

function directSweep(tx: TxInput, token: Address | 'native', dest: Address, amount: bigint): Intent | UnknownIntent {
  const { maxFeePerGas, maxPriorityFeePerGas, gasLimit } = tx;
  if (tx.from === undefined || maxFeePerGas === undefined || maxPriorityFeePerGas === undefined || gasLimit === undefined) {
    return unknown('MISSING_TX_FIELD');
  }
  const from = strictAddress(tx.from);
  if (from === undefined || !isUint(maxFeePerGas) || !isUint(maxPriorityFeePerGas) || !isUint(gasLimit) || gasLimit === 0n) {
    return unknown('INVALID_TX_FIELD');
  }
  return { kind: 'direct_sweep', chainId: tx.chainId, from, token, to: dest, amount, maxFeePerGas, maxPriorityFeePerGas, gasLimit };
}

function sameTypes(actual: TypedDataInput['types'], expected: Readonly<Record<string, readonly { name: string; type: string }[]>>): boolean {
  const ak = Object.keys(actual);
  const ek = Object.keys(expected);
  if (ak.length !== ek.length) return false;
  return ek.every((k) => {
    const a = actual[k];
    const e = expected[k] as readonly { name: string; type: string }[];
    return a !== undefined && a.length === e.length && e.every((f, i) => a[i]?.name === f.name && a[i]?.type === f.type);
  });
}

function exactKeys(obj: object, keys: readonly string[]): boolean {
  const k = Object.keys(obj);
  return k.length === keys.length && keys.every((x) => Object.prototype.hasOwnProperty.call(obj, x));
}

/**
 * Decodes EIP-712 typed data into a closed {@link Intent}.
 *
 * @remarks Accepts exactly the GhostPaySweepRelayer `Sweep` order and the EIP-2612 `Permit`.
 * `types` must equal the fixed definitions (no extra types, fields or reordering), the domain must
 * have exactly name/version/chainId/verifyingContract (the sweep domain name/version are checked),
 * message keys must be exactly the struct fields, addresses valid and non-zero, numbers `bigint`
 * within uint256. Anything else is `unknown`.
 *
 * @security Signing typed data can move funds without a transaction. The decoded `verifyingContract`
 * and `spender` are what the signature binds; compare them with `review`, never with UI text.
 * @param td Payload as it would be handed to the signer.
 * @returns The intent or an {@link UnknownIntent}. Never throws.
 */
export function decodeTypedData(td: TypedDataInput): Intent | UnknownIntent {
  const isSweep = td.primaryType === 'Sweep';
  if (!isSweep && td.primaryType !== 'Permit') return unknown('UNKNOWN_TYPED_DATA');
  if (!sameTypes(td.types, isSweep ? SWEEP_TYPES : PERMIT_TYPES)) return unknown('INVALID_TYPED_DATA');
  const d = td.domain;
  const m = td.message;
  if (!exactKeys(d, ['name', 'version', 'chainId', 'verifyingContract'])) return unknown('INVALID_TYPED_DATA');
  const chainId = d['chainId'];
  const verifyingContract = strictAddress(d['verifyingContract']);
  if (typeof chainId !== 'number' || !Number.isSafeInteger(chainId) || chainId < 1 || verifyingContract === undefined) {
    return unknown('INVALID_TYPED_DATA');
  }
  const nameOk = typeof d['name'] === 'string' && d['name'] !== '';
  const versionOk = typeof d['version'] === 'string' && d['version'] !== '';
  if (isSweep) {
    if (d['name'] !== SWEEP_DOMAIN_NAME || d['version'] !== SWEEP_DOMAIN_VERSION) return unknown('INVALID_TYPED_DATA');
    if (!exactKeys(m, ['token', 'owner', 'destination', 'feeTo', 'amount', 'fee', 'deadline', 'nonce'])) return unknown('INVALID_TYPED_DATA');
    const token = strictAddress(m['token']);
    const owner = strictAddress(m['owner']);
    const destination = strictAddress(m['destination']);
    const feeTo = strictAddress(m['feeTo']);
    const { amount, fee, deadline, nonce } = m;
    if (token === undefined || owner === undefined || destination === undefined || feeTo === undefined) return unknown('INVALID_TYPED_DATA');
    if (!isUint(amount) || !isUint(fee) || !isUint(deadline) || !isUint(nonce)) return unknown('INVALID_TYPED_DATA');
    return { kind: 'relayed_sweep_sig', chainId, verifyingContract, owner, token, destination, amount, fee, feeTo, deadline, nonce };
  }
  if (!nameOk || !versionOk) return unknown('INVALID_TYPED_DATA');
  if (!exactKeys(m, ['owner', 'spender', 'value', 'nonce', 'deadline'])) return unknown('INVALID_TYPED_DATA');
  const owner = strictAddress(m['owner']);
  const spender = strictAddress(m['spender']);
  const { value, nonce, deadline } = m;
  if (owner === undefined || spender === undefined || !isUint(value) || !isUint(nonce) || !isUint(deadline)) return unknown('INVALID_TYPED_DATA');
  return { kind: 'permit_sig', chainId, token: verifyingContract, owner, spender, value, nonce, deadline };
}
