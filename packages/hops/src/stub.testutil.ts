import { getAddress } from 'viem/utils';
import { sha256 } from '@noble/hashes/sha2.js';
import { addressOfSecret, recoverSweepSigner } from './stub.sig.testutil.js';
import { randomScalar, secretScalarFromBytes, unsafeRevealSecret, zeroize, type SecretScalar } from '@ghostpay/core-crypto';
import type { Address } from '@ghostpay/chain-adapters';
import type {
  ChainReader, CryptoLike, HopAddressSource, HopDeps, HopQuote, PlanStore, RelayerClient, SweepSubmission,
} from './types.js';
import { createMemoryPlanStore } from './store.js';

/** Deterministic CSPRNG stand-in for tests only (SHA-256 counter mode). */
export function seededRng(seed: string): CryptoLike {
  let ctr = 0;
  const enc = new TextEncoder();
  return {
    getRandomValues: <T extends ArrayBufferView | null>(arr: T): T => {
      if (arr === null) return arr;
      const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
      let off = 0;
      while (off < u8.length) {
        const block = sha256(enc.encode(`${seed}:${ctr++}`));
        const n = Math.min(block.length, u8.length - off);
        u8.set(block.subarray(0, n), off);
        off += n;
      }
      return arr;
    },
  };
}

export interface Transfer { token: Address; from: Address; to: Address; amount: bigint; timeMs: number }

/** In-memory address source + chain + relayer, with a shared transfer ledger. */
export class SimEnv {
  public readonly keys: SecretScalar[] = [];
  public readonly addrList: Address[] = [];
  public readonly balances = new Map<string, bigint>();
  public readonly usedNonces = new Set<string>();
  public readonly ledger: Transfer[] = [];
  public readonly submissions: { relayerId: string; body: SweepSubmission }[] = [];
  public readonly quoteCalls: { relayerId: string; req: object }[] = [];
  public readonly zeroized: boolean[] = [];
  public nowMs = 1_700_000_000_000;
  public readonly feeTo: Address = getAddress('0x00000000000000000000000000000000000fee01');
  public readonly sweepRelayer: Address = getAddress('0x5ee9e5000000000000000000000000000000dead');
  public feeBps = 50n;
  public quoteTtlMs = 60_000;
  public failSubmit = false;
  public authorize = true;
  public readonly rng: CryptoLike;
  public store: PlanStore = createMemoryPlanStore();
  private readonly keyRng: CryptoLike;

  public constructor(seed = 'sim') {
    this.rng = seededRng(`${seed}:rng`);
    this.keyRng = seededRng(`${seed}:keys`);
  }

  public readonly addrs: HopAddressSource = {
    next: () => {
      const k = randomScalar(this.keyRng);
      this.keys.push(k);
      const address = addressOfSecret(k);
      this.addrList.push(address);
      return Promise.resolve({ index: this.keys.length - 1, address });
    },
    withSecretAt: async <T>(index: number, fn: (s: SecretScalar) => Promise<T>): Promise<T> => {
      const base = this.keys[index];
      if (base === undefined) throw new Error('no key');
      const copy = secretScalarFromBytes(unsafeRevealSecret(base));
      try {
        return await fn(copy);
      } finally {
        zeroize(copy);
        this.zeroized.push(copy.every((b) => b === 0));
      }
    },
  };

  public readonly chain: ChainReader = {
    tokenBalance: (_t, owner) => Promise.resolve(this.balances.get(owner) ?? 0n),
    nonceUsed: (owner, nonce) => Promise.resolve(this.usedNonces.has(`${owner}:${nonce}`)),
    permitReader: {
      name: () => Promise.resolve('Test Token'),
      version: () => Promise.resolve('1'),
      nonce: () => Promise.resolve(0n),
    },
  };

  public readonly relayer: RelayerClient = {
    quote: (relayerId, req): Promise<HopQuote> => {
      this.quoteCalls.push({ relayerId, req });
      const amount = BigInt(req.amount);
      return Promise.resolve({ fee: (amount * this.feeBps) / 10_000n, feeTo: this.feeTo, expiresAtMs: this.nowMs + this.quoteTtlMs });
    },
    submit: async (relayerId, body) => {
      this.submissions.push({ relayerId, body });
      if (this.failSubmit) throw new Error('relayer down');
      const o = body.order;
      const signer = await recoverSweepSigner(body, this.sweepRelayer);
      if (signer !== o.owner) throw new Error('bad signature');
      if (BigInt(o.deadline) <= BigInt(Math.floor(this.nowMs / 1000))) throw new Error('expired');
      const nk = `${o.owner}:${o.nonce}`;
      if (this.usedNonces.has(nk)) throw new Error('nonce used');
      const amount = BigInt(o.amount);
      if ((this.balances.get(o.owner) ?? 0n) < amount) throw new Error('insufficient');
      this.usedNonces.add(nk);
      this.settle(o.token, o.owner, o.destination, amount, BigInt(o.fee), o.feeTo);
      return { txHash: (`0x${(this.submissions.length).toString(16).padStart(64, '0')}`) };
    },
  };

  public fund(token: Address, to: Address, amount: bigint, from: Address = '0x00000000000000000000000000000000000fade1'): void {
    this.balances.set(to, (this.balances.get(to) ?? 0n) + amount);
    this.ledger.push({ token, from, to, amount, timeMs: this.nowMs });
  }

  private settle(token: Address, owner: Address, dest: Address, amount: bigint, fee: bigint, feeTo: Address): void {
    this.balances.set(owner, (this.balances.get(owner) ?? 0n) - amount);
    this.balances.set(dest, (this.balances.get(dest) ?? 0n) + amount - fee);
    this.balances.set(feeTo, (this.balances.get(feeTo) ?? 0n) + fee);
    this.ledger.push({ token, from: owner, to: dest, amount: amount - fee, timeMs: this.nowMs });
    this.ledger.push({ token, from: owner, to: feeTo, amount: fee, timeMs: this.nowMs });
  }

  public deps(overrides: Partial<HopDeps> = {}): HopDeps {
    return {
      addrs: this.addrs,
      relayer: this.relayer,
      chain: this.chain,
      store: this.store,
      wallClockMs: () => this.nowMs,
      signWithSession: { authorize: () => Promise.resolve(this.authorize) },
      sweepRelayer: this.sweepRelayer,
      rng: this.rng,
      ...overrides,
    };
  }
}
