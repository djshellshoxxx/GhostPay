import { ChainAdapterError, findChain, type Address, type Hex, type RpcClient } from '@ghostpay/chain-adapters';
import { encodeFunctionData, serializeTransaction } from 'viem/utils';
import { UserFacingError } from './errors';

/**
 * Fees a direct sweep pays outside `gas * gasPrice`, shared by the sweep (sweep.ts `directSweep`) and the payer-funded gas
 * buffer quote (pay.ts `quoteBuffer`, `assertBufferStillSufficient`), so both size it with one formula (R04-2).
 */

type Rpc = Pick<RpcClient, 'request'>;

/** OP Stack GasPriceOracle predeploy: prices a transaction's L1 data fee and operator fee. */
export const OP_STACK_GAS_PRICE_ORACLE = '0x420000000000000000000000000000000000000F' as Address;

/**
 * A direct sweep on an OP Stack chain keeps back this multiple of the fees the oracle quotes now, because the L1 base fee
 * and blob fee can rise before inclusion. The unused part stays at the one-time address.
 */
export const OP_STACK_FEE_RESERVE_MULTIPLIER = 2n;

const gasPriceOracleAbi = [
  { type: 'function', name: 'getL1Fee', stateMutability: 'view', inputs: [{ name: '_data', type: 'bytes' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'getOperatorFee', stateMutability: 'view', inputs: [{ name: '_gasUsed', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }] },
] as const;

async function readFeeOracle(rpc: Rpc, data: Hex): Promise<bigint> {
  const raw = await rpc.request('eth_call', [{ to: OP_STACK_GAS_PRICE_ORACLE, data }, 'latest']);
  if (typeof raw !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(raw)) throw new Error('invalid fee oracle answer');
  return BigInt(raw);
}

/**
 * The operator fee for `gas`. An OP Stack chain before the Isthmus upgrade has no `getOperatorFee`, so the call
 * reverts there; such a chain charges no operator fee. Any other failure is no answer and propagates.
 */
async function readOperatorFee(rpc: Rpc, gas: bigint): Promise<bigint> {
  try {
    return await readFeeOracle(rpc, encodeFunctionData({ abi: gasPriceOracleAbi, functionName: 'getOperatorFee', args: [gas] }));
  } catch (e) {
    if (e instanceof ChainAdapterError && e.executionReverted) return 0n;
    throw e;
  }
}

/** Fee fields a direct sweep signs for an `eth_gasPrice` reading: twice the price as the cap, a tenth as the tip. */
export function sweepFeeFields(gasPrice: bigint): { readonly maxFeePerGas: bigint; readonly maxPriorityFeePerGas: bigint } {
  const maxFeePerGas = gasPrice * 2n;
  const tip = gasPrice / 10n;
  return { maxFeePerGas, maxPriorityFeePerGas: tip > maxFeePerGas ? maxFeePerGas : tip };
}

/** The unsigned EIP-1559 transaction a direct sweep signs. */
export interface SweepTxFields {
  readonly chainId: number;
  readonly nonce: number;
  readonly maxFeePerGas: bigint;
  readonly maxPriorityFeePerGas: bigint;
  readonly gas: bigint;
  readonly to: Address;
  readonly value: bigint;
  readonly data: Hex;
}

/**
 * Native coin a direct sweep needs beyond `gas * maxFeePerGas`. On an OP Stack chain: the L1 data fee of the unsigned
 * serialized transaction (the oracle adds the signature's size) and the operator fee for its gas limit (none where the
 * oracle has no `getOperatorFee`), read from the GasPriceOracle, times {@link OP_STACK_FEE_RESERVE_MULTIPLIER}. On any
 * other chain `0n`, without an RPC call.
 * @throws {UserFacingError} when the oracle cannot be read: the fee, and for a native sweep the amount to send, is then
 *   unknown, so nothing is signed (or quoted).
 */
export async function sweepFeeReserve(rpc: Rpc, tx: SweepTxFields): Promise<bigint> {
  if (findChain(tx.chainId)?.opStack !== true) return 0n;
  const unsignedTx = serializeTransaction({ type: 'eip1559', ...tx });
  try {
    const l1 = await readFeeOracle(rpc, encodeFunctionData({ abi: gasPriceOracleAbi, functionName: 'getL1Fee', args: [unsignedTx] }));
    const operator = await readOperatorFee(rpc, tx.gas);
    return (l1 + operator) * OP_STACK_FEE_RESERVE_MULTIPLIER;
  } catch {
    throw new UserFacingError({ key: 'error.sweep.couldNotReadTheL1DataFeeFromThisChain' });
  }
}

// i18n-use: error.sweep.couldNotReadTheL1DataFeeFromThisChain
