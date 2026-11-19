import {
  encodeFunctionData, parseTransaction, serializeTransaction, size, toHex, toRlp, zeroAddress,
  type Hex, type PublicClient, type TransactionReceipt,
} from 'viem';
import { findChain, ghostPaySweepRelayerAbi } from '@ghostpay/chain-adapters';

/** Same predeploy and reserve policy as the existing web direct-sweep fee helper. */
const ORACLE = '0x420000000000000000000000000000000000000F';
const RESERVE_MULTIPLIER = 2n;
const UINT256_MAX = (1n << 256n) - 1n;
const abi = [
  { type: 'function', name: 'getL1Fee', stateMutability: 'view', inputs: [{ type: 'bytes' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'getL1FeeUpperBound', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'getOperatorFee', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint256' }] },
] as const;

/** A valid uint256 native fee; zero is a real answer, never a substitute for missing data. */
export function isNativeFee(value: unknown): value is bigint {
  return typeof value === 'bigint' && value >= 0n && value <= UINT256_MAX;
}

/**
 * RLP size bound for the relayer's zero-value legacy sweep, including EIP-155 signing fields.
 * Quote requests do not yet contain the order nonce, deadline, signature or optional permit. Their values cannot
 * change ABI length: the admitted sweep signature is exactly 65 bytes and all other fields have fixed width.
 * Reserve 32 bytes for each variable transaction integer (nonce, gas price, gas limit), even though the supported
 * nonce is smaller. The oracle itself adds signature overhead; do not add it here or price placeholder compression.
 */
export function legacySweepSizeBound(chainId: number, withPermit: boolean): bigint {
  const sweep = { token: zeroAddress, owner: zeroAddress, destination: zeroAddress, feeTo: zeroAddress, amount: 0n, fee: 0n, deadline: 0n, nonce: 0n };
  const signature: Hex = `0x${'00'.repeat(65)}`;
  const data = withPermit
    ? encodeFunctionData({ abi: ghostPaySweepRelayerAbi, functionName: 'sweepWithPermit', args: [sweep, signature, { value: 0n, deadline: 0n, v: 27, r: toHex(0n, { size: 32 }), s: toHex(0n, { size: 32 }) }] })
    : encodeFunctionData({ abi: ghostPaySweepRelayerAbi, functionName: 'sweep', args: [sweep, signature] });
  const max = toHex(UINT256_MAX);
  return BigInt(size(toRlp([max, max, max, zeroAddress, '0x', data, toHex(chainId), '0x', '0x'])));
}

/** OP-only extra native costs; all reads use the chain's existing configured transport. */
export class OpStackFees {
  private readonly enabled: boolean;

  public constructor(private readonly pub: PublicClient, private readonly chainId: number) {
    this.enabled = findChain(chainId)?.opStack === true;
  }

  private async read(data: Hex, blockHash?: Hex): Promise<bigint> {
    const answer = await this.pub.call(blockHash === undefined
      ? { to: ORACLE, data }
      : { to: ORACLE, data, blockHash, requireCanonical: true });
    if (typeof answer.data !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(answer.data)) throw new Error('rpc_failure');
    return BigInt(answer.data);
  }

  private operatorFee(gas: bigint, blockHash?: Hex): Promise<bigint> {
    // The oracle selects its fork's formula, including a genuine zero before operator fees. A missing getter or
    // revert is not proof of zero: unsupported/failed oracles refuse the operation rather than guessing a fork.
    return this.read(encodeFunctionData({ abi, functionName: 'getOperatorFee', args: [gas] }), blockHash);
  }

  /** Conservative reserve before full signed bytes exist; non-OP chains make no fee-oracle calls. */
  public async estimate(gas: bigint, withPermit: boolean): Promise<bigint> {
    if (!this.enabled) return 0n;
    try {
      const l1 = await this.read(encodeFunctionData({ abi, functionName: 'getL1FeeUpperBound', args: [legacySweepSizeBound(this.chainId, withPermit)] }));
      return (l1 + await this.operatorFee(gas)) * RESERVE_MULTIPLIER;
    } catch {
      throw new Error('rpc_failure');
    }
  }

  /**
   * Reprices the actual signed legacy transaction immediately before the synchronous journal/broadcast hook.
   * getL1Fee accepts unsigned RLP and adds signature overhead itself: remove v/r/s from the parsed signed bytes,
   * retaining the exact remaining fields and EIP-155 chain id, so the signature is not charged twice.
   */
  public async checkSigned(raw: Hex, reserved: bigint | undefined): Promise<void> {
    if (!this.enabled) return;
    if (!isNativeFee(reserved)) throw new Error('rpc_failure');
    const tx = parseTransaction(raw);
    if (tx.type !== 'legacy' || tx.chainId !== this.chainId || tx.r === undefined || tx.s === undefined || tx.v === undefined || tx.gas === undefined)
      throw new Error('rpc_failure');
    const unsigned = serializeTransaction({
      type: 'legacy', chainId: tx.chainId, nonce: tx.nonce, gas: tx.gas, gasPrice: tx.gasPrice,
      to: tx.to, value: tx.value, data: tx.data,
    });
    const l1 = await this.read(encodeFunctionData({ abi, functionName: 'getL1Fee', args: [unsigned] }));
    const required = (l1 + await this.operatorFee(tx.gas)) * RESERVE_MULTIPLIER;
    if (required > reserved) throw new Error('rpc_failure');
  }

  /** Actual receipt fees, without the reserve multiplier; a fee lookup failure leaves the transaction unsettled. */
  public async receipt(receipt: TransactionReceipt): Promise<{ l1Fee?: bigint; operatorFee?: bigint }> {
    if (!this.enabled) return {};
    const raw: unknown = (receipt as TransactionReceipt & { l1Fee?: unknown }).l1Fee;
    const l1Fee = typeof raw === 'string' && /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$/.test(raw) ? BigInt(raw) : raw;
    if (!isNativeFee(l1Fee) || !isNativeFee(receipt.gasUsed) || !/^0x[0-9a-fA-F]{64}$/.test(receipt.blockHash))
      throw new Error('rpc_failure');
    return { l1Fee, operatorFee: await this.operatorFee(receipt.gasUsed, receipt.blockHash) };
  }
}
