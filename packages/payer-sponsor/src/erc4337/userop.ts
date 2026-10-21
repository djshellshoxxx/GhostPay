import {
  concat,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  isAddressEqual,
  keccak256,
  numberToHex,
  parseAbi,
  parseAbiParameters,
  type Address,
  type Hex,
} from 'viem';
import { assertTestnet } from '../chainGuard.js';
import { PayerSponsorError, ensure } from '../errors.js';

/** ERC-4337 v0.7 packed user operation (field layout of the EntryPoint v0.7 ABI). */
export interface PackedUserOperation {
  readonly sender: Address;
  readonly nonce: bigint;
  readonly initCode: Hex;
  readonly callData: Hex;
  /** `verificationGasLimit` (16 bytes) || `callGasLimit` (16 bytes). */
  readonly accountGasLimits: Hex;
  readonly preVerificationGas: bigint;
  /** `maxPriorityFeePerGas` (16 bytes) || `maxFeePerGas` (16 bytes). */
  readonly gasFees: Hex;
  readonly paymasterAndData: Hex;
  readonly signature: Hex;
}

/** One call executed by `GhostPayPayerAccount.executeBatch`. */
export interface AccountCall {
  readonly target: Address;
  readonly value: bigint;
  readonly data: Hex;
}

/** Gas parameters of an operation. */
export interface UserOpGas {
  readonly verificationGasLimit: bigint;
  readonly callGasLimit: bigint;
  readonly preVerificationGas: bigint;
  readonly maxFeePerGas: bigint;
  readonly maxPriorityFeePerGas: bigint;
}

const U128 = 2n ** 128n;

/**
 * Packs two 128-bit values into one 32-byte word (`high || low`).
 *
 * @param high High 128 bits.
 * @param low Low 128 bits.
 * @returns 32-byte hex.
 */
export function packUint128Pair(high: bigint, low: bigint): Hex {
  ensure(high >= 0n && high < U128 && low >= 0n && low < U128, 'value does not fit in 128 bits');
  return concat([numberToHex(high, { size: 16 }), numberToHex(low, { size: 16 })]);
}

/**
 * Unpacks a 32-byte word into its two 128-bit halves.
 *
 * @param word 32-byte hex.
 * @returns `[high, low]`.
 */
export function unpackUint128Pair(word: Hex): readonly [bigint, bigint] {
  ensure(word.length === 66, 'expected 32 bytes');
  return [BigInt(`0x${word.slice(2, 34)}`), BigInt(`0x${word.slice(34)}`)];
}

const ACCOUNT_ABI = parseAbi([
  'struct Call { address target; uint256 value; bytes data; }',
  'function executeBatch(Call[] calls)',
]);

/**
 * Encodes `executeBatch(calls)` calldata.
 *
 * @param calls Calls executed in order as the account.
 * @returns Calldata.
 */
export function encodeExecuteBatch(calls: readonly AccountCall[]): Hex {
  ensure(calls.length > 0 && calls.length <= 8, 'batch must have 1..8 calls');
  return encodeFunctionData({ abi: ACCOUNT_ABI, functionName: 'executeBatch', args: [calls] });
}

/**
 * Decodes `executeBatch(calls)` calldata.
 *
 * @param data Account calldata.
 * @returns The calls.
 * @throws PayerSponsorError `PAYLOAD_MISMATCH` for any other calldata.
 */
export function decodeExecuteBatch(data: Hex): readonly AccountCall[] {
  try {
    const d = decodeFunctionData({ abi: ACCOUNT_ABI, data });
    return d.args[0].map((c) => ({ target: c.target, value: c.value, data: c.data }));
  } catch {
    throw new PayerSponsorError('PAYLOAD_MISMATCH', 'callData is not executeBatch');
  }
}

const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
]);

/** Inputs of {@link buildPayerCalls}. */
export interface PayerCallsArgs {
  readonly token: Address;
  readonly router: Address;
  readonly routerCalldata: Hex;
  readonly gross: bigint;
  readonly sponsorFee: bigint;
  readonly sponsorFeeTo: Address;
}

/**
 * The account batch of a PH-4 payment: `approve(router, gross)`, router call, `approve(router, 0)`,
 * and `transfer(sponsorFeeTo, sponsorFee)` when the fee is non-zero.
 *
 * @param a Call fields.
 * @returns The calls.
 */
export function buildPayerCalls(a: PayerCallsArgs): readonly AccountCall[] {
  ensure(a.gross > 0n, 'gross must be > 0');
  const calls: AccountCall[] = [
    { target: a.token, value: 0n, data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [a.router, a.gross] }) },
    { target: a.router, value: 0n, data: a.routerCalldata },
    { target: a.token, value: 0n, data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [a.router, 0n] }) },
  ];
  if (a.sponsorFee > 0n) {
    calls.push({
      target: a.token,
      value: 0n,
      data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'transfer', args: [a.sponsorFeeTo, a.sponsorFee] }),
    });
  }
  return calls;
}

/**
 * Review step for a PH-4 batch: it must be exactly the batch {@link buildPayerCalls} produces for
 * the given fields (no extra calls, no native value, same order).
 *
 * @param calls Decoded batch.
 * @param expected Fields the payer agreed to.
 * @throws PayerSponsorError `PAYLOAD_MISMATCH` on any difference.
 */
export function assertPayerCalls(calls: readonly AccountCall[], expected: PayerCallsArgs): void {
  const want = buildPayerCalls(expected);
  if (calls.length !== want.length) throw new PayerSponsorError('PAYLOAD_MISMATCH', 'batch length differs');
  for (let i = 0; i < want.length; i++) {
    const c = calls[i];
    const w = want[i];
    if (c === undefined || w === undefined) throw new PayerSponsorError('PAYLOAD_MISMATCH', 'batch length differs');
    if (!isAddressEqual(c.target, w.target) || c.value !== w.value || c.data.toLowerCase() !== w.data.toLowerCase()) {
      throw new PayerSponsorError('PAYLOAD_MISMATCH', `batch call ${i} differs`);
    }
  }
}

/**
 * `UserOperationLib.hash` of EntryPoint v0.7 (keccak of the packed fields with hashed byte arrays).
 *
 * @param op The operation.
 * @returns 32-byte hash.
 */
export function packedUserOpHash(op: PackedUserOperation): Hex {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters('address, uint256, bytes32, bytes32, bytes32, uint256, bytes32, bytes32'),
      [
        op.sender,
        op.nonce,
        keccak256(op.initCode),
        keccak256(op.callData),
        op.accountGasLimits,
        op.preVerificationGas,
        op.gasFees,
        keccak256(op.paymasterAndData),
      ],
    ),
  );
}

/**
 * `EntryPoint.getUserOpHash` of EntryPoint v0.7: `keccak256(abi.encode(hash(op), entryPoint, chainId))`.
 * (EntryPoint v0.8 uses an EIP-712 domain and is NOT supported here.)
 *
 * @param op The operation.
 * @param entryPoint EntryPoint address.
 * @param chainId Chain id (testnet allowlist enforced).
 * @returns The hash the account owner signs.
 */
export function getUserOpHashV07(op: PackedUserOperation, entryPoint: Address, chainId: number): Hex {
  assertTestnet(chainId);
  return keccak256(
    encodeAbiParameters(parseAbiParameters('bytes32, address, uint256'), [packedUserOpHash(op), entryPoint, BigInt(chainId)]),
  );
}

/** Inputs of {@link buildUserOperation}. */
export interface BuildUserOperationArgs {
  readonly chainId: number;
  readonly entryPoint: Address;
  /** Counterfactual or deployed account address. */
  readonly sender: Address;
  /** `initCode` (empty for an already deployed account), see {@link buildInitCode}. */
  readonly initCode: Hex;
  /** EntryPoint nonce (key in the high 192 bits). */
  readonly nonce: bigint;
  readonly calls: readonly AccountCall[];
  readonly gas: UserOpGas;
}

/**
 * Builds an unsigned, un-sponsored operation and its hash (the paymaster fields and signature are
 * filled in later).
 *
 * @param a Operation fields.
 * @returns The operation (empty `paymasterAndData` and `signature`) and its v0.7 `userOpHash`.
 */
export function buildUserOperation(a: BuildUserOperationArgs): { readonly userOp: PackedUserOperation; readonly userOpHash: Hex } {
  assertTestnet(a.chainId);
  ensure(a.nonce >= 0n && a.nonce < 2n ** 256n, 'nonce out of range');
  const userOp: PackedUserOperation = {
    sender: getAddress(a.sender),
    nonce: a.nonce,
    initCode: a.initCode,
    callData: encodeExecuteBatch(a.calls),
    accountGasLimits: packUint128Pair(a.gas.verificationGasLimit, a.gas.callGasLimit),
    preVerificationGas: a.gas.preVerificationGas,
    gasFees: packUint128Pair(a.gas.maxPriorityFeePerGas, a.gas.maxFeePerGas),
    paymasterAndData: '0x',
    signature: '0x',
  };
  return { userOp, userOpHash: getUserOpHashV07(userOp, a.entryPoint, a.chainId) };
}

const ENTRYPOINT_ABI = parseAbi([
  'struct PackedUserOperation { address sender; uint256 nonce; bytes initCode; bytes callData; bytes32 accountGasLimits; uint256 preVerificationGas; bytes32 gasFees; bytes paymasterAndData; bytes signature; }',
  'function handleOps(PackedUserOperation[] ops, address beneficiary)',
  'function getNonce(address sender, uint192 key) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
]);

/**
 * Encodes `EntryPoint.handleOps([op], beneficiary)`.
 *
 * @param op Signed operation.
 * @param beneficiary Receiver of the gas compensation (the bundler / sponsor).
 * @returns Calldata for the EntryPoint.
 */
export function encodeHandleOps(op: PackedUserOperation, beneficiary: Address): Hex {
  return encodeFunctionData({ abi: ENTRYPOINT_ABI, functionName: 'handleOps', args: [[op], beneficiary] });
}

/**
 * Encodes `EntryPoint.getNonce(sender, key)`.
 *
 * @param sender Account.
 * @param key Nonce key (0 for the default sequence).
 * @returns Calldata.
 */
export function encodeGetNonce(sender: Address, key = 0n): Hex {
  return encodeFunctionData({ abi: ENTRYPOINT_ABI, functionName: 'getNonce', args: [sender, key] });
}
