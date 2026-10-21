/* eslint-disable @typescript-eslint/require-await -- in-memory methods are async so that every failure is a rejection, never a synchronous throw */
import type { SecretBox } from '@ghostpay/secret-box';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { concatHex, keccak256, pad, toHex, type Hex } from 'viem';
import { assertAccounting, feeFloor } from '../../accounting.js';
import { fail } from '../../errors.js';
import { asHex } from '../../hex.js';
import { assertChainAllowed, ALLOWED_CHAIN_IDS } from '../../guard.js';
import { EXIT_ROUTE_INFO } from '../../info.js';
import type {
  AssetId, EntryQuote, ExitOptions, ExitQuote, ExitResult, ExitRouteInfo, ExitTransport, ExternalPoolAdapter, PoolLifecycle,
  PoolNote, PreparedTx, RouteRequest, ScanContext, SupportResult, TxReceiptLike,
} from '../../types.js';
import { computeNoteId, roundToHour } from '../../vault.js';
import { MOCK_DEPOSITED_TOPIC, MOCK_POOL_ADDRESS, MockOperatorDown, type MockPoolLedger } from './ledger.js';

const MAX_INDEX = 64;
const GAP_LIMIT = 5;
const CONFIRMATIONS = 2;

interface MockCreds {
  readonly index: number;
  readonly nullifier: Hex;
  readonly secret: Hex;
  readonly precommitment: Hex;
}

/** Decoded `adapterData` of a mock note (contains the note secrets; lives only in the vault). */
export interface MockNoteData extends MockCreds {
  readonly v: 1;
  readonly commitment: Hex;
}

/**
 * Derives the mock note secrets (nullifier, secret) from the root seed with HKDF-SHA256.
 *
 * @param seed Root seed.
 * @param chainId Chain.
 * @param index Deposit index.
 * @security Domain separated by the info string; different routes never share material (EP-PP-10 analogue).
 */
export function deriveMockCreds(seed: SecretBox, chainId: number, index: number): MockCreds {
  const okm = seed.use((s) => hkdf(sha256, s, undefined, utf8ToBytes(`ghostpay/ext-pools/mock-pool/v1|${String(chainId)}|${String(index)}`), 64));
  const nullifier = asHex(`0x${bytesToHex(okm.slice(0, 32))}`);
  const secret = asHex(`0x${bytesToHex(okm.slice(32))}`);
  okm.fill(0);
  return { index, nullifier, secret, precommitment: keccak256(concatHex([nullifier, secret])) };
}

function encodeData(d: MockNoteData): Uint8Array {
  return utf8ToBytes(JSON.stringify(d));
}

/**
 * Parses a mock note payload.
 *
 * @param bytes `PoolNote.adapterData`.
 * @throws ExternalPoolError INVALID_INPUT on a bad payload.
 */
export function decodeMockData(bytes: Uint8Array): MockNoteData {
  let o: Partial<MockNoteData>;
  try {
    o = JSON.parse(new TextDecoder().decode(bytes)) as Partial<MockNoteData>;
  } catch {
    return fail('INVALID_INPUT', 'bad mock note data');
  }
  if (o.v !== 1 || typeof o.index !== 'number' || typeof o.commitment !== 'string' || typeof o.precommitment !== 'string' || typeof o.nullifier !== 'string' || typeof o.secret !== 'string') {
    return fail('INVALID_INPUT', 'bad mock note data');
  }
  return o as MockNoteData;
}

/** Options for {@link MockPoolAdapter}. */
export interface MockPoolOptions {
  /** Unix-ms clock (default `Date.now`). */
  readonly clock?: () => number;
  /** Quote lifetime in ms (default 20 000, like the Privacy Pools relayer quote). */
  readonly quoteTtlMs?: number;
}

/**
 * `EP-M`: the CI target. Full {@link ExternalPoolAdapter} over a {@link MockPoolLedger}.
 *
 * @security Test double: provides NO privacy (commitments are plain keccak, no zero-knowledge). The UI labels it
 *   `test-double`. It still enforces the real invariants: chain allowlist, depositor identity, amounts from logs,
 *   exit accounting and an operator-free emergency exit.
 */
export class MockPoolAdapter implements ExternalPoolAdapter {
  public readonly id = 'mock-pool' as const;
  public readonly schema = 1;
  private readonly clock: () => number;
  private readonly ttl: number;

  /**
   * @param ledger In-memory pool state.
   * @param opts Options.
   */
  public constructor(private readonly ledger: MockPoolLedger, opts: MockPoolOptions = {}) {
    this.clock = opts.clock ?? (() => Date.now());
    this.ttl = opts.quoteTtlMs ?? 20_000;
  }

  public info(): ExitRouteInfo {
    return {
      ...EXIT_ROUTE_INFO['mock-pool'],
      chains: ALLOWED_CHAIN_IDS,
      lifecycle: this.ledger.lifecycle,
      feeDisclosure: { entryFeeBps: this.ledger.entryFeeBps, exitFeeBps: null, relayerFeeBps: this.ledger.relayerFeeBps, source: 'mock ledger' },
    };
  }

  public async health(): Promise<{ lifecycle: PoolLifecycle; reason?: string }> {
    return this.ledger.lifecycle === 'active' ? { lifecycle: 'active' } : { lifecycle: this.ledger.lifecycle, reason: 'mock pool switched off' };
  }

  public async supports(q: { chainId: number; asset: AssetId }): Promise<SupportResult> {
    assertChainAllowed(q.chainId);
    return { supported: true, minAmount: this.ledger.minDeposit };
  }

  public async quoteEntry(r: RouteRequest): Promise<EntryQuote> {
    assertChainAllowed(r.chainId);
    if (r.amount < this.ledger.minDeposit) fail('INVALID_INPUT', 'amount is below the pool minimum');
    let index = -1;
    for (let i = 0; i < MAX_INDEX; i++) {
      const c = deriveMockCreds(r.rootSeed, r.chainId, i);
      if (!this.ledger.precommitmentUsed(c.precommitment)) {
        index = i;
        break;
      }
    }
    if (index < 0) fail('PRECOMMITMENT_EXHAUSTED', 'no unused deposit index found');
    const feeAmount = feeFloor(r.amount, this.ledger.entryFeeBps);
    return {
      routeId: 'mock-pool',
      chainId: r.chainId,
      asset: r.asset,
      amount: r.amount,
      feeAmount,
      creditedAmount: r.amount - feeAmount,
      fee: { entryFeeBps: this.ledger.entryFeeBps, exitFeeBps: null, relayerFeeBps: this.ledger.relayerFeeBps, source: 'mock ledger' },
      adapterData: { index: String(index) },
    };
  }

  public async prepareEntry(r: RouteRequest, q: EntryQuote): Promise<PreparedTx[]> {
    assertChainAllowed(r.chainId);
    if (r.stealth.signer.address.toLowerCase() !== r.stealth.address.toLowerCase()) fail('DEPOSITOR_MISMATCH', 'signer is not the one-time address');
    const c = deriveMockCreds(r.rootSeed, r.chainId, Number(q.adapterData['index']));
    const asset = r.asset === 'native' ? '0x0000000000000000000000000000000000000000' : r.asset;
    const data = `0x01${c.precommitment.slice(2)}${asset.slice(2)}${pad(toHex(r.amount), { size: 32 }).slice(2)}` as Hex;
    return [
      { kind: 'deposit', from: r.stealth.address, to: MOCK_POOL_ADDRESS, data, value: 0n, chainId: r.chainId, description: 'Deposit into the mock pool from your one-time address' },
    ];
  }

  public async recordEntry(r: RouteRequest, q: EntryQuote, receipt: TxReceiptLike): Promise<PoolNote> {
    assertChainAllowed(r.chainId);
    if (receipt.status !== 'success') fail('RECEIPT_INVALID', 'deposit transaction reverted');
    if (receipt.from.toLowerCase() !== r.stealth.address.toLowerCase()) fail('DEPOSITOR_MISMATCH', 'deposit was not sent from the one-time address');
    const log = receipt.logs.find((l) => l.address.toLowerCase() === MOCK_POOL_ADDRESS.toLowerCase() && l.topics[0] === MOCK_DEPOSITED_TOPIC);
    const pre = log?.topics[1];
    const commitment = log?.topics[2];
    if (log === undefined || pre === undefined || commitment === undefined) return fail('RECEIPT_INVALID', 'no mock deposit log in the receipt');
    const c = deriveMockCreds(r.rootSeed, r.chainId, Number(q.adapterData['index']));
    if (c.precommitment.toLowerCase() !== pre.toLowerCase()) fail('RECEIPT_INVALID', 'deposit log does not match the derived precommitment');
    const credited = BigInt(log.data);
    const data: MockNoteData = { v: 1, ...c, commitment };
    return {
      noteId: computeNoteId('mock-pool', r.chainId, receipt.transactionHash, log.logIndex),
      routeId: 'mock-pool',
      chainId: r.chainId,
      asset: r.asset,
      depositedAmount: credited,
      depositor: r.stealth.address,
      depositTx: receipt.transactionHash,
      depositBlock: receipt.blockNumber,
      state: receipt.confirmations >= CONFIRMATIONS ? 'confirmed' : 'pending',
      adapterData: encodeData(data),
      createdAt: roundToHour(Math.floor(this.clock() / 1000)),
    };
  }

  public async quoteExit(n: PoolNote, o: ExitOptions): Promise<ExitQuote> {
    assertChainAllowed(n.chainId);
    if (n.state !== 'confirmed') fail('NOTE_STATE', 'note is not confirmed');
    if (o.selfBroadcast === true) fail('NOT_SUPPORTED', 'mock pool has no self-broadcast exit; use the emergency exit');
    const feeBps = this.ledger.relayerFeeBps;
    if (o.maxFeeBps !== undefined && feeBps > o.maxFeeBps) fail('FEE_TOO_HIGH', 'relayer fee exceeds your limit');
    const fee = feeFloor(n.depositedAmount, feeBps);
    return {
      noteId: n.noteId,
      routeId: 'mock-pool',
      destination: o.destination,
      grossAmount: n.depositedAmount,
      feeAmount: fee,
      netAmount: n.depositedAmount - fee,
      feeBps,
      via: 'relayer',
      expiresAt: this.clock() + this.ttl,
      destinationSeen: 'The mock relayer sees the destination, the amount and your address.',
      adapterData: {},
    };
  }

  public async executeExit(n: PoolNote, q: ExitQuote, t: ExitTransport): Promise<ExitResult> {
    assertChainAllowed(n.chainId);
    if (q.noteId !== n.noteId) fail('NOTE_STATE', 'quote belongs to another note');
    if (t.now() > q.expiresAt) fail('RELAYER_REJECTED', 'quote expired');
    const d = decodeMockData(n.adapterData);
    try {
      const r = this.ledger.relayedExit(d.commitment, q.destination, q.feeBps);
      assertAccounting(n.depositedAmount, r.net, r.fee);
      return { noteId: n.noteId, txHash: r.txHash, destination: q.destination, exitedAmount: r.net, feeAmount: r.fee, newState: 'exited' };
    } catch (e) {
      if (e instanceof MockOperatorDown) fail('RELAYER_REJECTED', 'relayer is offline');
      throw e;
    }
  }

  public async prepareEmergencyExit(n: PoolNote): Promise<PreparedTx[]> {
    assertChainAllowed(n.chainId);
    const d = decodeMockData(n.adapterData);
    return [
      {
        kind: 'ragequit',
        from: n.depositor,
        to: MOCK_POOL_ADDRESS,
        data: `0x02${d.commitment.slice(2)}` as Hex,
        value: 0n,
        chainId: n.chainId,
        description: 'Emergency exit: return the funds to the one-time address that deposited them (public)',
      },
    ];
  }

  public async *recover(seed: SecretBox, scan: ScanContext): AsyncIterable<PoolNote> {
    assertChainAllowed(scan.chainId);
    const deposits = this.ledger.indexedDeposits();
    const mine = new Set(scan.stealthAddresses.map((a) => a.toLowerCase()));
    let misses = 0;
    for (let i = 0; i < MAX_INDEX && misses < GAP_LIMIT; i++) {
      const c = deriveMockCreds(seed, scan.chainId, i);
      const d = deposits.find((x) => x.precommitment.toLowerCase() === c.precommitment.toLowerCase());
      if (d === undefined || !mine.has(d.depositor.toLowerCase())) {
        misses += 1;
        continue;
      }
      misses = 0;
      const data: MockNoteData = { v: 1, ...c, commitment: d.commitment };
      await Promise.resolve();
      yield {
        noteId: computeNoteId('mock-pool', scan.chainId, d.txHash, d.logIndex),
        routeId: 'mock-pool',
        chainId: scan.chainId,
        asset: d.asset,
        depositedAmount: d.amount,
        depositor: d.depositor,
        depositTx: d.txHash,
        depositBlock: d.blockNumber,
        state: d.spent ? 'exited' : 'confirmed',
        adapterData: encodeData(data),
        createdAt: 0,
      };
    }
  }
}

