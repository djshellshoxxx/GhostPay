// Seeded model-based stress of the encrypted reconciliation vault's replay rule (#742 / LATE-L1): which unverified
// records ask the scanner to resume from their block (`retryFrom`), and whether payment state can ever be overstated.
// A fixed-seed local PRNG builds every scenario: a registered invoice, payments at random heights (late, on time, not
// matching), per-payment re-verification behaviour, random quarantines, reorgs and invoice removals, and repeated
// resumed scan runs shaped like scanClient (pages, a floor that retryFrom lowers, a checkpoint saved after each page).
// The expected state comes from a model kept from the delivered observations alone, never from a vault read.
//
// Invariants: a record the vault reports `verified-at-scan` was verified by the latest delivered observation and not
// quarantined since; an orphaned (reorged) inclusion never comes back; an unverified record is never acceptable
// (`confirmProposal` refuses); `retryFrom` is only asked for a block of a stored unverified or lacking-depth record at or
// below the page end; a payment that keeps verifying is eventually released (the checkpoint passes it); a candidate that
// was never verified never pins the checkpoint; the same seed gives the identical run.
//
// Characterised, not asserted as a bug: a record that WAS verified and then can never be verified again pins the
// checkpoint at its block on every resumed run (linked records always did; #742 extends it to unlinked candidates of a
// registered invoice) until the invoice is removed, the block is replaced, or a rescan verifies it again.
import { describe, expect, it } from 'vitest';
import { routerNet } from '@ghostpay/chain-adapters';
import type { ReconciliationRecord } from './reconciliationLedger';
import { registrationFromInvoice } from './reconciliationMatch';
import { NOW, testInvoice } from './reconciliationMatch.testutil';
import { ReconciliationVault, type ReconciliationVaultStore } from './reconciliationVault';

function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rand = () => number;
const int = (r: Rand, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T>(r: Rand, xs: readonly T[]): T => xs[int(r, 0, xs.length - 1)] as T;

class Store implements ReconciliationVaultStore {
  readonly data = new Map<string, string>();
  read(key: string): Promise<string | null> { return Promise.resolve(this.data.get(key) ?? null); }
  compareAndSwap(key: string, expected: string | null, next: string, guard: () => void): Promise<boolean> {
    guard();
    if ((this.data.get(key) ?? null) !== expected) return Promise.resolve(false);
    this.data.set(key, next);
    return Promise.resolve(true);
  }
}
const scope = { sellerKeyId: 'a'.repeat(64), chainId: 84532 };
const DEPTH = 5;
const MATCHING_NET = routerNet(1_000_000n).toString();

const canonicalAt = (height: number): string => `0x${(height + 0xa000).toString(16).padStart(64, '0')}`;
const REPLACED = `0x${'f'.repeat(64)}`;

function payment(n: number, height: number, matching: boolean, late: boolean, invoiceExpiresAt: number): ReconciliationRecord {
  const tx = `0x${n.toString(16).padStart(64, '0')}`;
  const base = {
    version: 1 as const, sellerKeyId: scope.sellerKeyId, chainId: scope.chainId, transactionHash: tx,
    // One canonical hash per block: payments in the same block share it (review 7221525657).
    blockHash: canonicalAt(height), blockNumber: String(height),
    blockTimestamp: String(late ? invoiceExpiresAt + 5 : NOW + 60), stealthAddress: `0x${'d'.repeat(40)}`, logIndex: 0,
    asset: 'native', amountMinorUnits: matching ? MATCHING_NET : String(1 + n), viewTagMatched: true, recordedAt: (NOW + 60) * 1000,
    evidenceStatus: 'verified-at-scan' as const, evidenceSource: 'verified-router-scan' as const,
  };
  return { ...base, id: `${base.sellerKeyId}:${String(base.chainId)}:${tx}:${base.stealthAddress}:${base.blockHash}:0` };
}
const claimed = (p: ReconciliationRecord): ReconciliationRecord => ({ ...p, evidenceStatus: 'unverified-at-scan', evidenceSource: 'router-scan-candidate' });
const pending = (p: ReconciliationRecord): ReconciliationRecord => ({ ...p, evidenceStatus: 'pending-at-scan', evidenceSource: 'router-scan-candidate' });

/** How a payment answers every later scan after its first verified delivery. */
type Behaviour = 'good' | 'flaky' | 'pendingFirst' | 'never' | 'neverVerified';
interface Sim { readonly matching: boolean; readonly rec: ReconciliationRecord; readonly height: number; readonly behaviour: Behaviour; readonly flakes: number; tries: number; reorged: boolean; verifiedNow: boolean; everVerified: boolean }

const decisionTime = (NOW + 7200) * 1000;
const key = new Uint8Array(32).fill(7);

interface Outcome { readonly log: string[]; readonly checkpoints: number[]; readonly pinned: boolean; readonly releasedAll: boolean;
  readonly exactPins: number; readonly passedAlone: number; readonly passedBelowPin: number; readonly sharedBlocks: number }

async function scenario(seed: number): Promise<Outcome> {
  const log: string[] = [];
  try { return await scenarioBody(seed, log); } catch (e) { console.log(`SCENARIO ${String(seed)}\n${log.join('\n')}`); throw e; }
}
async function scenarioBody(seed: number, log: string[]): Promise<Outcome> {
  const r = prng(seed);
  const store = new Store();
  const vault = new ReconciliationVault(store, scope, () => undefined, () => decisionTime);
  await vault.unlock(key);
  const invoice = registrationFromInvoice(testInvoice(), 1);
  await vault.registerInvoice(invoice);
  let invoiceRegistered = true;
  const count = int(r, 1, 5);
  // Half of the scenarios plant the reviewer's case: a late (so stored), matching payment that verifies once and never again.
  const planted = r() < 0.5;
  const sims: Sim[] = Array.from({ length: count }, (_, i) => {
    const forced = planted && i === 0;
    const matching = forced || r() < 0.8;
    const behaviour = forced ? 'never' : pick(r, ['good', 'good', 'flaky', 'pendingFirst', 'never', 'neverVerified'] as const);
    return {
      matching, rec: payment(i + 1, 200 + int(r, 0, 150), matching, forced || r() < 0.4, invoice.expiresAt), height: 0, behaviour,
      flakes: int(r, 1, 3), tries: 0, reorged: false, verifiedNow: false, everVerified: false,
    };
  }).map((s) => ({ ...s, height: Number(s.rec.blockNumber) }));
  const tombstoned = new Set<string>();
  let head = 200;
  let checkpoint = 0;
  const checkpoints: number[] = [];
  // Which final checks ran, so the seeded runs can be shown to reach them (review 7221525657).
  let exactPins = 0;
  let passedAlone = 0;
  let passedBelowPin = 0;
  // A reorg replaces the whole block: every payment at that height is reorged together.
  const hashAt = (height: number): string => sims.some((x) => x.height === height && x.reorged) ? REPLACED : canonicalAt(height);

  /** What a scan of `s` delivers now, advancing its behaviour. `undefined` = not in the page. */
  const observe = (s: Sim, finalizedThrough: number): ReconciliationRecord | undefined => {
    if (s.reorged) return undefined; // the replaced block holds no such log
    s.tries++;
    let out: ReconciliationRecord;
    switch (s.behaviour) {
      case 'good': out = s.rec; break;
      case 'flaky': out = s.tries > s.flakes + (s.everVerified ? 0 : 0) || !s.everVerified ? s.rec : claimed(s.rec); break;
      case 'pendingFirst': out = s.height > finalizedThrough ? pending(s.rec) : s.rec; break;
      case 'never': out = s.everVerified ? claimed(s.rec) : s.rec; break; // verified once, then never again
      default: out = claimed(s.rec); break; // an indirect router call: never verified
    }
    s.verifiedNow = out.evidenceStatus === 'verified-at-scan';
    if (s.verifiedNow) s.everVerified = true;
    return out;
  };

  /** One resumed run from `checkpoint` to `head`, in pages, like runScan: a floor that retryFrom lowers, a save per page. */
  const run = async (): Promise<void> => {
    const resumed = checkpoint > 0;
    let from = checkpoint;
    let floor = from;
    let retry: number | undefined;
    // Even with nothing new to read (checkpoint beyond the head) one empty page is handed over, as runScan does.
    for (let guard = 0; guard < 200; guard++) {
      const through = Math.max(from - 1, Math.min(head, from + int(r, 8, 60)));
      const finalizedThrough = head - DEPTH + 1;
      const delivered = sims.filter((s) => s.height >= from && s.height <= through).flatMap((s) => {
        const o = observe(s, finalizedThrough);
        return o === undefined ? [] : [o];
      });
      const asked: number[] = [];
      await vault.observeInvoicePayments(delivered, undefined, {
        from: BigInt(from), through: BigInt(through), finalizedThrough: BigInt(finalizedThrough), resumed,
        canonicalHash: (h) => Promise.resolve(hashAt(Number(h))),
        retryFrom: (h) => { asked.push(Number(h)); },
      });
      // Reorged payments whose block hash now differs are tombstoned for good by the vault: mirror what it can know.
      for (const s of sims) if (s.reorged && s.height >= from && s.height <= through && (delivered.every((d) => d.id !== s.rec.id))) s.verifiedNow = false;
      const state = await vault.read();
      for (const height of asked) {
        // Only a stored, unverified (or lacking depth) record at or below the page end can ask for a replay.
        // Above the finalized depth a record asks for a replay whichever page it is not on (lacking depth); below it, only
        // from a page that reaches it.
        if (height <= finalizedThrough) expect(height).toBeLessThanOrEqual(through);
        const stored = state.filter((x) => Number(x.blockNumber) === height);
        expect(stored.length).toBeGreaterThan(0);
        // Unverified, or (above the finalized depth) pending or verified: never an orphaned inclusion.
        expect(stored.some((x) => x.evidenceStatus !== 'invalidated-after-reorg')).toBe(true);
        for (const x of stored) if (x.evidenceStatus === 'verified-at-scan' || x.evidenceStatus === 'pending-at-scan') expect(height).toBeGreaterThan(finalizedThrough);
      }
      for (const height of asked) {
        if (retry === undefined || height < retry) retry = height;
        if ((resumed || height > finalizedThrough) && height < floor) floor = height;
      }
      let next = through + 1;
      if (retry !== undefined && retry < next) next = retry;
      if (next < floor) next = floor;
      checkpoint = next;
      if (through >= head) break;
      from = through + 1;
    }
    checkpoints.push(checkpoint);
    log.push(`run head=${String(head)} -> checkpoint=${String(checkpoint)} retry=${String(retry)} vault=${(await vault.read()).map((x) => `${x.blockNumber}:${x.evidenceStatus.slice(0, 5)}:${x.evidenceSource.slice(0, 3)}${x.invoiceDigest === undefined ? '' : ':L'}`).join(',')} sims=${sims.map((x) => `${String(x.height)}${x.behaviour[0] as string}${x.matching ? 'm' : ''}${x.verifiedNow ? 'V' : ''}`).join(',')}`);
  };

  const audit = async (): Promise<void> => {
    const records = await vault.read();
    for (const rec of records) {
      const s = sims.find((x) => x.rec.id === rec.id);
      if (s === undefined) continue;
      if (rec.evidenceStatus === 'verified-at-scan') {
        // Never overstated: the latest delivered observation verified it, and it was not orphaned or quarantined since.
        expect(s.verifiedNow, `payment ${String(s.height)} ${s.behaviour} reported verified`).toBe(true);
        expect(s.reorged).toBe(false);
        expect(tombstoned.has(rec.id)).toBe(false);
      }
      if (tombstoned.has(rec.id)) expect(rec.evidenceStatus).toBe('invalidated-after-reorg');
      if (rec.evidenceStatus === 'unverified-at-scan' && rec.invoiceDigest === undefined && invoiceRegistered) {
        // An unverified observation can never be accepted: confirmProposal refuses it.
        await expect(vault.confirmProposal(rec, invoice.invoiceDigest, { current: [rec], acceptLate: true })).rejects.toThrow();
      }
    }
  };

  for (let step = 0; step < 14; step++) {
    const roll = r();
    if (roll < 0.45) {
      head += int(r, 0, 30);
      await run();
    } else if (roll < 0.62) {
      const from = pick(r, sims).height - int(r, 0, 3);
      await vault.quarantineInvoicePayments(BigInt(Math.max(0, from)));
      // The vault quarantines only what it could still credit: a record of a registered invoice (or a linked one).
      for (const s of sims) if (s.height >= from && invoiceRegistered && s.matching) s.verifiedNow = false;
      log.push(`quarantine ${String(from)}`);
    } else if (roll < 0.74) {
      const s = pick(r, sims);
      if (!s.reorged) {
        for (const x of sims.filter((y) => y.height === s.height)) {
          x.reorged = true;
          x.verifiedNow = false;
          tombstoned.add(x.rec.id);
        }
        await vault.invalidateFrom(BigInt(s.height), [], (h) => Promise.resolve(hashAt(Number(h))));
        log.push(`reorg ${String(s.height)}`);
      }
    } else if (roll < 0.8 && invoiceRegistered) {
      await vault.removeInvoice(invoice.invoiceDigest);
      invoiceRegistered = false;
      log.push('invoice removed');
    } else {
      // A delayed duplicate or contradictory delivery of an old observation.
      // (A stale delivery for a block already reorged away is characterised separately below.)
      const s = pick(r, sims.filter((x) => !x.reorged).length === 0 ? sims : sims.filter((x) => !x.reorged));
      if (s.reorged) continue;
      const stale = r() < 0.5 ? [s.rec, s.rec] : [s.rec, { ...s.rec, amountMinorUnits: String(BigInt(s.rec.amountMinorUnits) + 1n) }];
      let accepted = true;
      try { await vault.observeInvoicePayments(stale); } catch (e) { accepted = false; expect((e as Error).message).toBeTruthy(); }
      // A contradictory page quarantines instead of crediting; a clean duplicate of a verified observation is a verification.
      if (stale[1] !== s.rec) s.verifiedNow = false;
      else if (accepted && !s.reorged) { s.verifiedNow = true; s.everVerified = true; }
      log.push(`stale delivery ${String(s.height)}`);
    }
    await audit();
  }

  // Liveness: with the head fixed and nothing else happening, repeated resumed runs release every payment that can
  // verify. Only a stored record that was verified once and now never verifies (its invoice still registered, its block
  // not replaced) may pin the checkpoint, and then at or below its block.
  for (let k = 0; k < 8; k++) await run();
  await audit();
  const finalRecords = await vault.read();
  // Which records can legitimately pin is read from what the vault actually stored: an unverified record whose evidence
  // source is `verified-router-scan` (an on-time verified match is never stored, so it cannot be one), for a payment
  // that answers `claimed` from now on. Everything else must have been released.
  const stillPinning = sims.filter((s) => (s.behaviour === 'never' || s.behaviour === 'neverVerified') && !s.reorged && invoiceRegistered &&
    finalRecords.some((x) => x.id === s.rec.id && x.evidenceStatus === 'unverified-at-scan' && x.evidenceSource === 'verified-router-scan'));
  const lowest = stillPinning.length === 0 ? undefined : Math.min(...stillPinning.map((s) => s.height));
  const finalizedThrough = head - DEPTH + 1;
  if (lowest === undefined) {
    // Nothing can legitimately pin: the checkpoint must have passed the settled part of the chain.
    expect(checkpoint, `seed ${String(seed)} checkpoint after releasing runs`).toBeGreaterThanOrEqual(head - DEPTH);
  } else if (lowest <= finalizedThrough) {
    // Settled: the earliest legitimate pin is exactly where the run stops (lacking-depth asks are all above it).
    expect(checkpoint, `seed ${String(seed)} checkpoint at the earliest legitimate pin`).toBe(lowest);
    exactPins++;
  } else {
    expect(checkpoint).toBeLessThanOrEqual(lowest);
  }
  // A settled candidate that was never verified never pins: the checkpoint passes it unless a legitimate pin is at or
  // below it (review 7221525657: the earlier form of this check compared the checkpoint with itself).
  for (const s of sims.filter((x) => x.behaviour === 'neverVerified')) {
    const rec = finalRecords.find((x) => x.id === s.rec.id);
    if (rec?.evidenceSource !== 'router-scan-candidate' || s.height > finalizedThrough) continue;
    if (lowest !== undefined && lowest <= s.height) continue;
    expect(checkpoint, `seed ${String(seed)} passes never-verified ${String(s.height)}`).toBeGreaterThan(s.height);
    if (lowest === undefined) passedAlone++; else passedBelowPin++;
  }
  const sharedBlocks = new Set(sims.filter((s) => sims.some((x) => x !== s && x.height === s.height)).map((s) => s.height)).size;
  return { log, checkpoints, pinned: lowest !== undefined, releasedAll: lowest === undefined, exactPins, passedAlone, passedBelowPin, sharedBlocks };
}

const SEEDS = [742, 20261127, 5150];
const PER_SEED = 18;

let pinnedScenarios = 0;
const reached = { exactPins: 0, passedAlone: 0, passedBelowPin: 0, sharedBlocks: 0 };
describe('reconciliation vault replay rule, seeded model-based stress (LATE-L1)', () => {
  for (const base of SEEDS) {
    it(`seed ${String(base)}: ${String(PER_SEED)} scenarios never overstate payment state and keep replay bounded`, async () => {
      let pinned = 0;
      let released = 0;
      for (let i = 0; i < PER_SEED; i++) {
        const outcome = await scenario(base * 1000 + i);
        if (outcome.pinned) { pinned++; pinnedScenarios++; }
        if (outcome.releasedAll) released++;
        reached.exactPins += outcome.exactPins;
        reached.passedAlone += outcome.passedAlone;
        reached.passedBelowPin += outcome.passedBelowPin;
        reached.sharedBlocks += outcome.sharedBlocks;
      }
      expect(released).toBeGreaterThan(PER_SEED / 4);
      // Informational: how many scenarios kept an un-reverifiable verified record pinning the checkpoint.
      expect(pinned).toBeGreaterThanOrEqual(0);
    }, 120_000);
  }

  it('the stress exercised both outcomes: scenarios that released everything and scenarios that stayed pinned', () => {
    expect(pinnedScenarios).toBeGreaterThan(0);
    // Each final check ran at least once: an exact settled pin, a never-verified candidate passed with no pin and below a
    // higher legitimate pin, and payments that share a block (on 2026-11-27 the 54 scenarios gave 4 exact pins, 3 and 1
    // passed candidates, and 2 shared blocks).
    expect(reached.exactPins).toBeGreaterThan(0);
    expect(reached.passedAlone).toBeGreaterThan(0);
    expect(reached.passedBelowPin).toBeGreaterThan(0);
    expect(reached.sharedBlocks).toBeGreaterThan(0);
  });

  it('is deterministic: the same seed gives the identical run', async () => {
    expect(await scenario(31337)).toEqual(await scenario(31337));
  }, 60_000);

  // Observation: invalidateFrom tombstones only records that exist (stored or passed in). A verified delivery for a block
  // that was reorged away BEFORE the vault ever stored it (a second tab's scan that finished after the first tab's
  // invalidation) is stored as verified, with no tombstone. Self-healing: the next page that covers its block finds the
  // stored record missing from the observations, reads the canonical hash and invalidates it. The window is a late
  // payment on a replaced block until that page runs.
  it('characterises a stale verified delivery for an already reorged block: stored, then healed by the next covering scan', async () => {
    const store = new Store();
    const vault = new ReconciliationVault(store, scope, () => undefined, () => decisionTime);
    await vault.unlock(key);
    const invoice = registrationFromInvoice(testInvoice(), 1);
    await vault.registerInvoice(invoice);
    const p = payment(1, 300, true, true, invoice.expiresAt);
    const replaced = `0x${'e'.repeat(64)}`;
    await vault.invalidateFrom(300n, [], () => Promise.resolve(replaced));
    await vault.observeInvoicePayments([p]);
    expect(await vault.read()).toMatchObject([{ id: p.id, evidenceStatus: 'verified-at-scan' }]);
    // The next page that covers the block, without that observation in it, reads the canonical hash and invalidates it.
    const page = { from: 290n, through: 320n, finalizedThrough: 295n, resumed: true, canonicalHash: () => Promise.resolve(replaced) };
    await vault.observeInvoicePayments([], undefined, page);
    expect(await vault.read()).toMatchObject([{ id: p.id, evidenceStatus: 'invalidated-after-reorg' }]);
    // And it cannot be revived afterwards.
    await vault.observeInvoicePayments([p]);
    expect(await vault.read()).toMatchObject([{ id: p.id, evidenceStatus: 'invalidated-after-reorg' }]);
  }, 60_000);

  // Review 7221525657: an isolated never-verified candidate, and one below a legitimate pin, never ask for a replay; the
  // earliest legitimate retry height is exactly the pinning record's block.
  it.each([
    ['on its own', false],
    ['below a legitimate pin', true],
  ] as const)('never replays a never-verified candidate %s, and asks exactly for the earliest legitimate pin', async (_label, mixed) => {
    const store = new Store();
    const vault = new ReconciliationVault(store, scope, () => undefined, () => decisionTime);
    await vault.unlock(key);
    const invoice = registrationFromInvoice(testInvoice(), 1);
    await vault.registerInvoice(invoice);
    const neverVerified = claimed(payment(1, 300, true, true, invoice.expiresAt));
    const pin = payment(2, 320, true, true, invoice.expiresAt);
    await vault.observeInvoicePayments(mixed ? [neverVerified, pin] : [neverVerified]);
    if (mixed) await vault.quarantineInvoicePayments(320n);
    expect((await vault.read()).find((x) => x.id === neverVerified.id)).toMatchObject({ evidenceStatus: 'unverified-at-scan', evidenceSource: 'router-scan-candidate' });
    const asks: number[] = [];
    for (let run = 0; run < 6; run++) {
      await vault.observeInvoicePayments(mixed ? [neverVerified, claimed(pin)] : [neverVerified], undefined, {
        from: 300n, through: 350n, finalizedThrough: 345n, resumed: true,
        canonicalHash: (h) => Promise.resolve(canonicalAt(Number(h))), retryFrom: (h) => { asks.push(Number(h)); },
      });
    }
    expect(asks).toEqual(mixed ? [320, 320, 320, 320, 320, 320] : []);
  }, 60_000);

  // Reviewer note (unverified): an unlinked `verified-router-scan` candidate that never re-verifies may pin retryFrom
  // forever. CONFIRMED by this characterisation: it pins on every resumed run, at its own block, until the invoice is
  // removed or the block is replaced. Linked records (invoiceDigest set) behaved the same before #742.
  it('characterises the pin: a verified-then-never-verifiable unlinked candidate holds the checkpoint on every run', async () => {
    const store = new Store();
    const vault = new ReconciliationVault(store, scope, () => undefined, () => decisionTime);
    await vault.unlock(key);
    const invoice = registrationFromInvoice(testInvoice(), 1);
    await vault.registerInvoice(invoice);
    const p = payment(1, 300, true, true, invoice.expiresAt);
    await vault.observeInvoicePayments([p]);
    await vault.quarantineInvoicePayments(300n);
    const asks: number[] = [];
    const pageAt = (from: number): Parameters<typeof vault.observeInvoicePayments>[2] => ({
      from: BigInt(from), through: BigInt(from + 50), finalizedThrough: BigInt(from + 45), resumed: true,
      canonicalHash: () => Promise.resolve(p.blockHash), retryFrom: (h) => { asks.push(Number(h)); },
    });
    // 25 resumed runs that each find the transfer unverifiable again: every one asks to resume from block 300.
    for (let run = 0; run < 25; run++) await vault.observeInvoicePayments([claimed(p)], undefined, pageAt(300 + run * 7));
    expect(asks).toHaveLength(25);
    expect(new Set(asks)).toEqual(new Set([300]));
    // Released by removing the invoice, or by one run that verifies it again.
    await vault.removeInvoice(invoice.invoiceDigest);
    asks.length = 0;
    await vault.observeInvoicePayments([], undefined, pageAt(400));
    expect(asks).toEqual([]);
  }, 60_000);
});
