import {
  brandAddress,
  brandTxId,
  parseTestAddress,
  toTestAmount,
  type TestAddress,
  type TestAmount,
  type TestTxId,
} from './brand.js';
import { SandboxError } from './errors.js';

/** Injected randomness: returns exactly `length` bytes. Inject a seeded one in tests. */
export type RandomBytes = (length: number) => Uint8Array;
/** Injected clock in epoch milliseconds. */
export type Clock = () => number;

/** Mock chain options. */
export interface MockChainOptions {
  readonly rng: RandomBytes;
  readonly clock: Clock;
  /** Confirmations to reach `confirmed` (1..100, default 3). */
  readonly confirmationsRequired?: number;
  /** Max accounts (default 100). */
  readonly maxAccounts?: number;
  /** Max transactions (default 10000). */
  readonly maxTransactions?: number;
}

/** Transaction snapshot. `network` is always `sandbox-test`. */
export interface TestTx {
  readonly id: TestTxId;
  readonly network: 'sandbox-test';
  readonly kind: 'transfer' | 'faucet';
  readonly from: TestAddress | null;
  readonly to: TestAddress;
  readonly amount: TestAmount;
  readonly createdAt: number;
  readonly submittedHeight: number;
  readonly confirmations: number;
  readonly status: 'pending' | 'confirmed';
}

/** Account snapshot. */
export interface TestAccount {
  readonly address: TestAddress;
  readonly label: string;
  readonly balance: TestAmount;
}

/** Read `length` random bytes from the injected rng, validating the result. */
export function readRandom(rng: RandomBytes, length: number): Uint8Array {
  const out = rng(length);
  if (!(out instanceof Uint8Array) || out.length !== length) {
    throw new SandboxError('invalid-rng', 'rng must return a Uint8Array of requested length');
  }
  return out;
}

/** Hex encode. */
export function toHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

/** Read a validated timestamp from the injected clock. */
export function readClock(clock: Clock): number {
  const t = clock();
  if (!Number.isSafeInteger(t) || t < 0) throw new SandboxError('invalid-clock', 'bad clock value');
  return t;
}

function intOption(v: number | undefined, def: number, min: number, max: number, name: string): number {
  if (v === undefined) return def;
  if (!Number.isSafeInteger(v) || v < min || v > max) {
    throw new SandboxError('invalid-option', `${name} out of range`);
  }
  return v;
}

interface MutableTx {
  id: TestTxId;
  kind: 'transfer' | 'faucet';
  from: TestAddress | null;
  to: TestAddress;
  amount: TestAmount;
  createdAt: number;
  submittedHeight: number;
  confirmations: number;
  status: 'pending' | 'confirmed';
}

/**
 * In-memory mock chain. No network, no persistence, no real keys.
 * Transfers debit the sender immediately and credit the recipient on confirmation.
 * Invariant: sum(balances) + pending in flight === totalMinted.
 * @security Everything produced is branded as test data; ids derive only from the injected rng.
 */
export class MockChain {
  private readonly rng: RandomBytes;
  private readonly clock: Clock;
  private readonly required: number;
  private readonly maxAccounts: number;
  private readonly maxTx: number;
  private accounts = new Map<TestAddress, { label: string; balance: bigint }>();
  private txs = new Map<TestTxId, MutableTx>();
  private height = 0;
  private minted = 0n;

  public constructor(opts: MockChainOptions) {
    if (typeof opts.rng !== 'function') throw new SandboxError('invalid-option', 'rng required');
    if (typeof opts.clock !== 'function') throw new SandboxError('invalid-option', 'clock required');
    this.rng = opts.rng;
    this.clock = opts.clock;
    this.required = intOption(opts.confirmationsRequired, 3, 1, 100, 'confirmationsRequired');
    this.maxAccounts = intOption(opts.maxAccounts, 100, 1, 10_000, 'maxAccounts');
    this.maxTx = intOption(opts.maxTransactions, 10_000, 1, 1_000_000, 'maxTransactions');
  }

  /** Confirmations needed. */
  public get confirmationsRequired(): number {
    return this.required;
  }
  /** Current block height. */
  public get blockHeight(): number {
    return this.height;
  }
  /** Total fake units ever minted since reset. */
  public get totalMinted(): bigint {
    return this.minted;
  }

  /** Create an account with 0 balance. Label is trimmed, 1..40 chars, no control chars. */
  public createAccount(label = 'Test account'): TestAddress {
    if (
      typeof label !== 'string' ||
      label.trim().length < 1 ||
      label.length > 40 ||
      // eslint-disable-next-line no-control-regex
      /[\u0000-\u001f\u007f]/.test(label)
    ) {
      throw new SandboxError('invalid-option', 'bad label');
    }
    if (this.accounts.size >= this.maxAccounts) throw new SandboxError('limit-exceeded', 'too many accounts');
    for (let i = 0; i < 8; i++) {
      const addr = brandAddress(toHex(readRandom(this.rng, 16)));
      if (!this.accounts.has(addr)) {
        this.accounts.set(addr, { label: label.trim(), balance: 0n });
        return addr;
      }
    }
    throw new SandboxError('id-collision', 'could not allocate unique address');
  }

  /** Whether the address exists. */
  public hasAccount(addr: unknown): boolean {
    return typeof addr === 'string' && this.accounts.has(addr as TestAddress);
  }

  /** Account snapshot. */
  public getAccount(addr: unknown): TestAccount {
    const a = this.mustAccount(addr);
    return { address: addr as TestAddress, label: a.label, balance: a.balance as TestAmount };
  }

  /** Confirmed balance. */
  public getBalance(addr: unknown): TestAmount {
    return this.mustAccount(addr).balance as TestAmount;
  }

  /** All accounts, creation order. */
  public listAccounts(): readonly TestAccount[] {
    return [...this.accounts.keys()].map((a) => this.getAccount(a));
  }

  /** Submit a transfer. @throws SandboxError insufficient-funds, same-account, unknown-account. */
  public transfer(from: unknown, to: unknown, amount: bigint): TestTx {
    const f = parseTestAddress(from);
    const t = parseTestAddress(to);
    const amt = toTestAmount(amount);
    const src = this.mustAccount(f);
    this.mustAccount(t);
    if (f === t) throw new SandboxError('same-account', 'cannot send to self');
    if (src.balance < amt) throw new SandboxError('insufficient-funds', 'insufficient test balance');
    const tx = this.newTx('transfer', f, t, amt);
    src.balance -= amt;
    return this.snap(tx);
  }

  /**
   * Mint fake funds to an account (used by the faucet). Pending until confirmed.
   * @security Not reachable from real mode: Sandbox only exposes it in test mode.
   */
  public mintFaucet(to: unknown, amount: bigint): TestTx {
    const t = parseTestAddress(to);
    const amt = toTestAmount(amount);
    this.mustAccount(t);
    const tx = this.newTx('faucet', null, t, amt);
    this.minted += amt;
    return this.snap(tx);
  }

  /** Mine `blocks` (1..1000) blocks; returns ids that became confirmed. */
  public mine(blocks = 1): readonly TestTxId[] {
    if (!Number.isSafeInteger(blocks) || blocks < 1 || blocks > 1000) {
      throw new SandboxError('invalid-option', 'blocks out of range');
    }
    this.height += blocks;
    const done: TestTxId[] = [];
    for (const tx of this.txs.values()) {
      if (tx.status !== 'pending') continue;
      tx.confirmations = Math.min(this.required, this.height - tx.submittedHeight);
      if (tx.confirmations >= this.required) {
        tx.status = 'confirmed';
        this.accounts.get(tx.to)!.balance += tx.amount;
        done.push(tx.id);
      }
    }
    return done;
  }

  /** Transaction snapshot or undefined. */
  public getTx(id: unknown): TestTx | undefined {
    const tx = typeof id === 'string' ? this.txs.get(id as TestTxId) : undefined;
    return tx === undefined ? undefined : this.snap(tx);
  }

  /** All transactions, newest first. */
  public listTxs(): readonly TestTx[] {
    return [...this.txs.values()].reverse().map((t) => this.snap(t));
  }

  /** Sum of confirmed balances plus pending in-flight amounts; equals totalMinted. */
  public totalSupply(): bigint {
    let s = 0n;
    for (const a of this.accounts.values()) s += a.balance;
    for (const t of this.txs.values()) if (t.status === 'pending') s += t.amount;
    return s;
  }

  /** Drop all state. The injected rng/clock are untouched. */
  public reset(): void {
    this.accounts = new Map();
    this.txs = new Map();
    this.height = 0;
    this.minted = 0n;
  }

  private mustAccount(addr: unknown): { label: string; balance: bigint } {
    const a = this.accounts.get(parseTestAddress(addr));
    if (a === undefined) throw new SandboxError('unknown-account', 'unknown test account');
    return a;
  }

  private newTx(
    kind: 'transfer' | 'faucet',
    from: TestAddress | null,
    to: TestAddress,
    amount: TestAmount,
  ): MutableTx {
    if (this.txs.size >= this.maxTx) throw new SandboxError('limit-exceeded', 'too many transactions');
    const createdAt = readClock(this.clock);
    for (let i = 0; i < 8; i++) {
      const id = brandTxId(toHex(readRandom(this.rng, 16)));
      if (!this.txs.has(id)) {
        const tx: MutableTx = {
          id,
          kind,
          from,
          to,
          amount,
          createdAt,
          submittedHeight: this.height,
          confirmations: 0,
          status: 'pending',
        };
        this.txs.set(id, tx);
        return tx;
      }
    }
    throw new SandboxError('id-collision', 'could not allocate unique tx id');
  }

  private snap(t: MutableTx): TestTx {
    return Object.freeze({ ...t, network: 'sandbox-test' as const });
  }
}
