import { keccak256, concatHex, toHex, pad, type Address, type Hex } from 'viem';
import { fail } from '../../errors.js';
import { asHex } from '../../hex.js';
import type { AssetId, LogLike, PreparedTx, TxReceiptLike } from '../../types.js';

/** Address every mock-pool transaction targets. Not a real contract. */
export const MOCK_POOL_ADDRESS: Address = '0x00000000000000000000000000000000000dEaD1';
/** topic0 of the mock `Deposited` log. */
export const MOCK_DEPOSITED_TOPIC: Hex = keccak256(toHex('MockDeposited(bytes32,bytes32,uint256)'));
const NATIVE_ZERO = '0x0000000000000000000000000000000000000000';

/** Deposit record in the mock ledger. */
export interface MockDeposit {
  readonly precommitment: Hex;
  readonly commitment: Hex;
  readonly depositor: Address;
  readonly asset: AssetId;
  readonly amount: bigint;
  readonly blockNumber: bigint;
  readonly txHash: Hex;
  readonly logIndex: number;
  spent: boolean;
}

/** Test-double failure (a switched-off third party). */
export class MockOperatorDown extends Error {
  public constructor(what: string) {
    super(`${what} is offline`);
    this.name = 'MockOperatorDown';
  }
}

/**
 * Deterministic in-memory "pool" (spec 6.5). No cryptography, no privacy. Switches simulate third parties
 * disappearing: relayer, indexer, approval list, and a sunset of the whole pool.
 */
export class MockPoolLedger {
  public blockNumber = 100n;
  public relayerOnline = true;
  public indexerOnline = true;
  public lifecycle: 'active' | 'deprecated' | 'sunset' | 'unknown' = 'active';
  /** Entry (vetting) fee in bps. */
  public entryFeeBps = 0;
  /** Relayer fee in bps. */
  public relayerFeeBps = 50;
  /** Minimum deposit. */
  public minDeposit = 1n;
  /** When true every deposit is approved on creation; tests can flip individual commitments. */
  public approveByDefault = true;
  public readonly deposits: MockDeposit[] = [];
  private readonly approved = new Set<string>();
  private readonly balances = new Map<string, bigint>();
  private txCounter = 0n;

  private bal(addr: string, asset: AssetId): string {
    return `${addr.toLowerCase()}|${asset.toLowerCase()}`;
  }

  /**
   * @param addr Account.
   * @param asset Asset.
   * @param amount Amount to add.
   */
  public fund(addr: Address, asset: AssetId, amount: bigint): void {
    const k = this.bal(addr, asset);
    this.balances.set(k, (this.balances.get(k) ?? 0n) + amount);
  }

  /** @returns The account balance. */
  public balanceOf(addr: Address, asset: AssetId): bigint {
    return this.balances.get(this.bal(addr, asset)) ?? 0n;
  }

  /** Mines `n` blocks. */
  public mine(n = 1): void {
    this.blockNumber += BigInt(n);
  }

  /** Sets whether a commitment is on the approval list. */
  public setApproved(commitment: Hex, ok: boolean): void {
    if (ok) this.approved.add(commitment.toLowerCase());
    else this.approved.delete(commitment.toLowerCase());
  }

  /** @returns Whether the commitment is on the approval list. */
  public isApproved(commitment: Hex): boolean {
    return this.approved.has(commitment.toLowerCase());
  }

  /** @returns Whether the precommitment was already used. */
  public precommitmentUsed(p: Hex): boolean {
    return this.deposits.some((d) => d.precommitment.toLowerCase() === p.toLowerCase());
  }

  /** @returns The deposit with this commitment. */
  public find(commitment: Hex): MockDeposit | undefined {
    return this.deposits.find((d) => d.commitment.toLowerCase() === commitment.toLowerCase());
  }

  /**
   * Executes a prepared mock transaction as its `from` account.
   *
   * @param tx Transaction built by the mock adapter (selector 0x01 deposit, 0x02 ragequit).
   * @returns A receipt with `confirmations` 0 (call {@link receiptFor} later for more).
   */
  public execute(tx: PreparedTx): TxReceiptLike {
    if (tx.to.toLowerCase() !== MOCK_POOL_ADDRESS.toLowerCase()) fail('INVALID_INPUT', 'not a mock pool transaction');
    const data = tx.data.slice(2);
    const sel = data.slice(0, 2);
    this.blockNumber += 1n;
    this.txCounter += 1n;
    const txHash = pad(toHex(this.txCounter), { size: 32 });
    if (sel === '01') {
      const precommitment = asHex(`0x${data.slice(2, 66)}`);
      const assetRaw = asHex(`0x${data.slice(66, 106)}`);
      const amount = BigInt(`0x${data.slice(106, 170)}`);
      const asset: AssetId = assetRaw === NATIVE_ZERO ? 'native' : assetRaw;
      if (this.lifecycle !== 'active') fail('POOL_NOT_ACTIVE', 'mock pool is not active');
      if (amount < this.minDeposit) fail('INVALID_INPUT', 'below minimum deposit');
      if (this.precommitmentUsed(precommitment)) fail('INVALID_INPUT', 'precommitment already used');
      const k = this.bal(tx.from, asset);
      if ((this.balances.get(k) ?? 0n) < amount) fail('INVALID_INPUT', 'insufficient balance');
      this.balances.set(k, (this.balances.get(k) ?? 0n) - amount);
      const credited = amount - (amount * BigInt(this.entryFeeBps)) / 10_000n;
      const commitment = keccak256(concatHex([precommitment, pad(toHex(credited), { size: 32 })]));
      const d: MockDeposit = { precommitment, commitment, depositor: tx.from, asset, amount: credited, blockNumber: this.blockNumber, txHash, logIndex: 0, spent: false };
      this.deposits.push(d);
      if (this.approveByDefault) this.approved.add(commitment.toLowerCase());
      const log: LogLike = {
        address: MOCK_POOL_ADDRESS,
        topics: [MOCK_DEPOSITED_TOPIC, precommitment, commitment],
        data: pad(toHex(credited), { size: 32 }),
        logIndex: 0,
        blockNumber: this.blockNumber,
        transactionHash: txHash,
      };
      return { transactionHash: txHash, blockNumber: this.blockNumber, from: tx.from, to: MOCK_POOL_ADDRESS, status: 'success', logs: [log], confirmations: 0 };
    }
    if (sel === '02') {
      const commitment = asHex(`0x${data.slice(2, 66)}`);
      const d = this.find(commitment);
      if (d === undefined || d.spent) fail('NOTE_STATE', 'unknown or spent commitment');
      if (d.depositor.toLowerCase() !== tx.from.toLowerCase()) fail('DEPOSITOR_MISMATCH', 'only the original depositor can ragequit');
      d.spent = true;
      this.fund(d.depositor, d.asset, d.amount);
      return { transactionHash: txHash, blockNumber: this.blockNumber, from: tx.from, to: MOCK_POOL_ADDRESS, status: 'success', logs: [], confirmations: 0 };
    }
    return fail('INVALID_INPUT', 'unknown mock selector');
  }

  /** @returns The same receipt with `confirmations` set to the blocks mined since inclusion. */
  public receiptFor(r: TxReceiptLike): TxReceiptLike {
    return { ...r, confirmations: Number(this.blockNumber - r.blockNumber) };
  }

  /**
   * Relayed exit. Needs the relayer, an approved commitment and an unspent note.
   *
   * @returns `{ net, fee }` paid to the destination and the relayer.
   * @throws MockOperatorDown when the relayer is switched off; ExternalPoolError otherwise.
   */
  public relayedExit(commitment: Hex, destination: Address, feeBps: number): { net: bigint; fee: bigint; txHash: Hex } {
    if (!this.relayerOnline) throw new MockOperatorDown('relayer');
    const d = this.find(commitment);
    if (d === undefined || d.spent) return fail('NOTE_STATE', 'unknown or spent commitment');
    if (!this.isApproved(commitment)) return fail('NOTE_STATE', 'commitment is not on the approval list');
    if (feeBps > this.relayerFeeBps) return fail('FEE_TOO_HIGH', 'fee above relayer maximum');
    const fee = (d.amount * BigInt(feeBps)) / 10_000n;
    const net = d.amount - fee;
    d.spent = true;
    this.fund(destination, d.asset, net);
    this.blockNumber += 1n;
    this.txCounter += 1n;
    return { net, fee, txHash: pad(toHex(this.txCounter), { size: 32 }) };
  }

  /** Deposits visible to an indexer (empty list ordering by block). Throws when the indexer is off. */
  public indexedDeposits(): readonly MockDeposit[] {
    if (!this.indexerOnline) throw new MockOperatorDown('indexer');
    return this.deposits;
  }
}
