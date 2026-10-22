import {
  EXIT_ROUTE_INFO, assertAccounting, assertArtifactHashes, assertChainAllowed, assertSameAddress, computeNoteId, fail,
  feeFloor, findEntry, roundToHour, verifyCodeHashes,
  type AssetId, type ChainReader, type EntryQuote, type ExitOptions, type ExitQuote, type ExitResult, type ExitRouteInfo, type ExitTransport,
  type ExternalPoolAdapter, type ManifestEntry, type PoolLifecycle, type PoolManifest, type PoolNote, type PreparedTx, type RouteRequest,
  type ScanContext, type SupportResult, type TxReceiptLike,
} from '@ghostpay/external-pools';
import type { SecretBox } from '@ghostpay/secret-box';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import {
  decodeAbiParameters, decodeEventLog, decodeFunctionResult, encodeAbiParameters, encodeFunctionData, getAddress, pad, toEventSelector,
  type Abi, type Address, type Hex,
} from 'viem';
import { NATIVE_ASSET, entrypointAbi, erc20Abi, poolAbi, relayDataParams } from './abi.js';
import { withEntropy } from './derive.js';
import { RelayerClient, type FeeCommitment } from './relayer.js';
import { readStateLeaves, decodeProofCache } from './state.js';
import type { AspSource, PpNoteData, PrivacyPoolsCrypto, ProofBundle } from './types.js';

const DEPOSITED_TOPIC = toEventSelector('Deposited(address indexed _depositor, uint256 _commitment, uint256 _label, uint256 _value, uint256 _precommitmentHash)');
const WITHDRAWN_TOPIC = toEventSelector('Withdrawn(address indexed _processooor, uint256 _value, uint256 _spentNullifier, uint256 _newCommitment)');
const RAGEQUIT_TOPIC = toEventSelector('Ragequit(address indexed _ragequitter, uint256 _commitment, uint256 _label, uint256 _value)');
const SCAN_CHUNK = 10_000n;
const GAP_LIMIT = 5;

/** Dependencies of {@link PrivacyPoolsAdapter}. Everything that touches the outside world is injected (EP-GEN-2). */
export interface PrivacyPoolsDeps {
  readonly manifest: PoolManifest;
  readonly chain: ChainReader;
  readonly transport: ExitTransport;
  readonly crypto: PrivacyPoolsCrypto;
  readonly asp: AspSource;
  /** Developer flag (EP-PP-9). Default false. */
  readonly allowCustomRelayer?: boolean;
  /** Force one relayer (must be in the manifest unless `allowCustomRelayer`). Default: lowest fee among manifest relayers. */
  readonly relayerUrl?: string;
  /** Confirmations before a note is `confirmed` (EP-PP-4). Default 2. */
  readonly minConfirmations?: number;
  /** First deposit index to probe; callers pass the number of notes they already hold. Default 0. */
  readonly startIndex?: number;
  /** Deposit indexes probed before giving up (EP-PP-2). Default 3. */
  readonly maxProbes?: number;
  /** Offline proof inputs (EP-VAULT-5): when it returns bytes from `Vault.getCache`, no chain or ASP read is needed. */
  readonly cache?: (noteId: string) => Promise<Uint8Array | undefined>;
  /** Unix-ms clock. Default `Date.now`. */
  readonly clock?: () => number;
}

interface Ctx {
  readonly entry: ManifestEntry;
  readonly entrypoint: Address;
  readonly pool: Address;
  readonly asset: Address;
  readonly scope: bigint;
  readonly minimumDeposit: bigint;
  readonly vettingFeeBps: number;
  readonly maxRelayFeeBps: number;
}

const assetKey = (a: AssetId): string => (a === 'native' ? 'pool:native' : `pool:${a.toLowerCase()}`);
const assetAddress = (a: AssetId): Address => (a === 'native' ? NATIVE_ASSET : a);
const big = (s: string | undefined, what: string): bigint => {
  if (s === undefined || !/^\d{1,78}$/.test(s)) return fail('INVALID_INPUT', `${what} is missing or malformed`);
  return BigInt(s);
};

/**
 * Serialises note data. Secrets inside: the result is only ever stored in the encrypted vault.
 *
 * @param d Note data.
 */
export function encodeNoteData(d: PpNoteData): Uint8Array {
  return utf8ToBytes(JSON.stringify(d, (_k, v: unknown) => (typeof v === 'bigint' ? { $b: v.toString() } : v)));
}

/**
 * @param bytes `PoolNote.adapterData`.
 * @throws ExternalPoolError INVALID_INPUT on a malformed payload.
 */
export function decodeNoteData(bytes: Uint8Array): PpNoteData {
  try {
    const o = JSON.parse(new TextDecoder().decode(bytes), (_k, v: unknown) => {
      if (typeof v === 'object' && v !== null && '$b' in v && typeof (v).$b === 'string') return BigInt((v as { $b: string }).$b);
      return v;
    }) as Record<string, unknown>;
    const ok =
      o['v'] === 1 && typeof o['entrypoint'] === 'string' && typeof o['pool'] === 'string' && typeof o['index'] === 'number' &&
      ['scope', 'label', 'value', 'nullifier', 'secret', 'commitment', 'nullifierHash', 'newNullifier', 'newSecret'].every((k) => typeof o[k] === 'bigint');
    if (!ok) throw new Error('shape');
    return o as unknown as PpNoteData;
  } catch {
    return fail('INVALID_INPUT', 'bad Privacy Pools note data');
  }
}

/**
 * `EP-1`: Privacy Pools (0xbow) adapter.
 *
 * Entry is a plain `Entrypoint.deposit` sent by the stealth address S1 (the only address that can later `ragequit`,
 * EP-PP-1). Exit goes through a manifest relayer with a locally verified Groth16 proof; the operator-free emergency
 * exit is `ragequit` from S1. Contract addresses, circuit digests and relayer hosts come only from the pinned
 * manifest (EP-GEN-3) and contract code is hash-checked before entry (EP-GEN-4).
 *
 * @security Live-network behaviour is UNVERIFIED: no Sepolia deployment was found (spec Q1), the ASP endpoint is
 *   unknown (Q3) and the relayer parsers follow the upstream source at `main` (2026-10-21), not a running service.
 *   Third-party contracts and circuits are not audited by GhostPay (N6).
 */
export class PrivacyPoolsAdapter implements ExternalPoolAdapter {
  public readonly id = 'privacy-pools' as const;
  public readonly schema = 1;
  private readonly clock: () => number;

  /** @param d Dependencies. */
  public constructor(private readonly d: PrivacyPoolsDeps) {
    this.clock = d.clock ?? (() => Date.now());
  }

  public info(): ExitRouteInfo {
    const chains = this.d.manifest.entries.filter((e) => e.route === 'privacy-pools').map((e) => e.chainId);
    return {
      ...EXIT_ROUTE_INFO['privacy-pools'],
      chains,
      // Reports exist in the upstream repository (Oxorio 2025-02/03/05, Auditware); they cover older commits than the one
      // pinned for tests and were written by third parties. GhostPay has not audited this code (N6).
      auditStatus: { reportUrl: 'https://github.com/0xbow-io/privacy-pools-core/blob/main/audit/contracts_audit_oxorio.md', retrieved: '2026-10-21' },
    };
  }

  /* ---------- chain reads ---------- */

  private async read(chainId: number, to: Address, abi: Abi, functionName: string, args: readonly unknown[] = []): Promise<unknown> {
    const data = encodeFunctionData({ abi, functionName, args });
    const out = await this.d.chain.call(chainId, to, data);
    return decodeFunctionResult({ abi, functionName, data: out });
  }

  private entryFor(chainId: number): ManifestEntry {
    const e = findEntry(this.d.manifest, 'privacy-pools', chainId);
    if (e === undefined) return fail('ROUTE_NOT_AVAILABLE', `Privacy Pools has no manifest entry on chain ${String(chainId)}`);
    if (e.status !== 'verified') return fail('POOL_NOT_ACTIVE', 'Privacy Pools manifest entry is unverified (no pinned addresses and code hashes)');
    return e;
  }

  private async resolve(chainId: number, asset: AssetId, opts: { verifyCode: boolean; requireAlive: boolean }): Promise<Ctx> {
    const entry = this.entryFor(chainId);
    if (opts.verifyCode) await verifyCodeHashes(this.d.chain, entry);
    const entrypoint = entry.contracts['entrypoint'];
    const pinnedPool = entry.contracts[assetKey(asset)];
    if (entrypoint === undefined) return fail('MANIFEST_MISMATCH', 'manifest has no entrypoint');
    if (pinnedPool === undefined) return fail('NOT_SUPPORTED', 'asset has no pool in the manifest');
    const a = assetAddress(asset);
    const cfg = (await this.read(chainId, entrypoint, entrypointAbi, 'assetConfig', [a])) as readonly [Address, bigint, bigint, bigint];
    assertSameAddress('pool', pinnedPool, cfg[0]);
    const [scope, poolAsset, poolEntry, dead] = (await Promise.all([
      this.read(chainId, pinnedPool, poolAbi, 'SCOPE'),
      this.read(chainId, pinnedPool, poolAbi, 'ASSET'),
      this.read(chainId, pinnedPool, poolAbi, 'ENTRYPOINT'),
      this.read(chainId, pinnedPool, poolAbi, 'dead'),
    ])) as [bigint, Address, Address, boolean];
    assertSameAddress('pool asset', a, poolAsset);
    assertSameAddress('pool entrypoint', entrypoint, poolEntry);
    if (dead && opts.requireAlive) return fail('POOL_NOT_ACTIVE', 'pool has been wound down');
    if (cfg[2] >= 10_000n || cfg[3] >= 10_000n) return fail('MANIFEST_MISMATCH', 'pool fee configuration is out of range');
    return { entry, entrypoint, pool: pinnedPool, asset: a, scope, minimumDeposit: cfg[1], vettingFeeBps: Number(cfg[2]), maxRelayFeeBps: Number(cfg[3]) };
  }

  public async health(chainId?: number): Promise<{ lifecycle: PoolLifecycle; reason?: string }> {
    if (chainId !== undefined) assertChainAllowed(chainId);
    const entries = this.d.manifest.entries.filter((e) => e.route === 'privacy-pools' && (chainId === undefined || e.chainId === chainId));
    if (entries.length === 0) return { lifecycle: 'unknown', reason: 'no manifest entry' };
    for (const e of entries) {
      if (e.status !== 'verified') return { lifecycle: 'unknown', reason: 'manifest entry is unverified' };
    }
    try {
      for (const e of entries) {
        await verifyCodeHashes(this.d.chain, e);
        for (const [name, pool] of Object.entries(e.contracts)) {
          if (!name.startsWith('pool:')) continue;
          const dead = (await this.read(e.chainId, pool, poolAbi, 'dead')) as boolean;
          if (dead) return { lifecycle: 'sunset', reason: 'pool has been wound down; only ragequit remains' };
        }
      }
    } catch {
      return { lifecycle: 'unknown', reason: 'could not verify the deployment' };
    }
    return { lifecycle: 'active' };
  }

  public async supports(q: { chainId: number; asset: AssetId }): Promise<SupportResult> {
    assertChainAllowed(q.chainId);
    try {
      const c = await this.resolve(q.chainId, q.asset, { verifyCode: false, requireAlive: true });
      return { supported: true, minAmount: c.minimumDeposit };
    } catch (e) {
      return { supported: false, reason: e instanceof Error ? e.message : 'unsupported' };
    }
  }

  /* ---------- entry ---------- */

  public async quoteEntry(r: RouteRequest): Promise<EntryQuote> {
    assertChainAllowed(r.chainId);
    const c = await this.resolve(r.chainId, r.asset, { verifyCode: true, requireAlive: true });
    if (r.amount < c.minimumDeposit) return fail('NOT_SUPPORTED', 'amount is below the pool minimum deposit');
    const feeAmount = feeFloor(r.amount, c.vettingFeeBps);
    const start = this.d.startIndex ?? 0;
    const probes = this.d.maxProbes ?? 3;
    let found: { index: number; precommitment: bigint } | undefined;
    for (let i = start; i < start + probes && found === undefined; i++) {
      const p = withEntropy(r.rootSeed, (e) => this.d.crypto.depositSecrets(e, c.scope, BigInt(i))).precommitment;
      const used = (await this.read(r.chainId, c.entrypoint, entrypointAbi, 'usedPrecommitments', [p])) as boolean;
      if (!used) found = { index: i, precommitment: p };
    }
    if (found === undefined) return fail('PRECOMMITMENT_EXHAUSTED', 'every probed deposit index is already used');
    return {
      routeId: 'privacy-pools',
      chainId: r.chainId,
      asset: r.asset,
      amount: r.amount,
      feeAmount,
      creditedAmount: r.amount - feeAmount,
      fee: { entryFeeBps: c.vettingFeeBps, exitFeeBps: null, relayerFeeBps: c.maxRelayFeeBps, source: 'Entrypoint.assetConfig (relayerFeeBps is the on-chain maximum)' },
      adapterData: {
        index: String(found.index),
        scope: c.scope.toString(),
        pool: c.pool,
        entrypoint: c.entrypoint,
        precommitment: found.precommitment.toString(),
      },
    };
  }

  private checkQuote(r: RouteRequest, q: EntryQuote): { entrypoint: Address; pool: Address; precommitment: bigint; scope: bigint; index: number } {
    if (q.routeId !== 'privacy-pools' || q.chainId !== r.chainId || q.asset !== r.asset || q.amount !== r.amount) return fail('INVALID_INPUT', 'quote does not match the request');
    const entry = this.entryFor(r.chainId);
    const entrypoint = getAddress(q.adapterData['entrypoint'] ?? '0x');
    const pool = getAddress(q.adapterData['pool'] ?? '0x');
    const pinnedEntrypoint = entry.contracts['entrypoint'];
    const pinnedPool = entry.contracts[assetKey(r.asset)];
    if (pinnedEntrypoint === undefined || pinnedPool === undefined) return fail('MANIFEST_MISMATCH', 'manifest lacks the contracts of this quote');
    assertSameAddress('entrypoint', pinnedEntrypoint, entrypoint);
    assertSameAddress('pool', pinnedPool, pool);
    return { entrypoint, pool, precommitment: big(q.adapterData['precommitment'], 'precommitment'), scope: big(q.adapterData['scope'], 'scope'), index: Number(big(q.adapterData['index'], 'index')) };
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- async so that failures are rejections, never synchronous throws
  public async prepareEntry(r: RouteRequest, q: EntryQuote): Promise<PreparedTx[]> {
    assertChainAllowed(r.chainId);
    if (r.stealth.signer.address.toLowerCase() !== r.stealth.address.toLowerCase()) return fail('DEPOSITOR_MISMATCH', 'signer is not the one-time address');
    const k = this.checkQuote(r, q);
    const from = r.stealth.address;
    if (r.asset === 'native') {
      const data = encodeFunctionData({ abi: entrypointAbi, functionName: 'deposit', args: [k.precommitment] });
      return [{ kind: 'deposit', from, to: k.entrypoint, data, value: r.amount, chainId: r.chainId, description: 'Deposit into Privacy Pools from your one-time address' }];
    }
    const approve = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [k.entrypoint, r.amount] });
    const deposit = encodeFunctionData({ abi: entrypointAbi, functionName: 'deposit', args: [r.asset, r.amount, k.precommitment] });
    return [
      { kind: 'approve', from, to: r.asset, data: approve, value: 0n, chainId: r.chainId, description: 'Approve exactly this amount to the Privacy Pools entrypoint' },
      { kind: 'deposit', from, to: k.entrypoint, data: deposit, value: 0n, chainId: r.chainId, description: 'Deposit into Privacy Pools from your one-time address' },
    ];
  }

  /**
   * EP-PP-3: after a deposit, returns an `approve(entrypoint, 0)` transaction only if allowance remains.
   *
   * @param chainId Chain.
   * @param token ERC-20 token.
   * @param owner S1.
   * @returns Zero or one transaction.
   */
  public async prepareAllowanceCleanup(chainId: number, token: Address, owner: Address): Promise<PreparedTx[]> {
    assertChainAllowed(chainId);
    const entrypoint = this.entryFor(chainId).contracts['entrypoint'];
    if (entrypoint === undefined) return fail('MANIFEST_MISMATCH', 'manifest has no entrypoint');
    const left = (await this.read(chainId, token, erc20Abi, 'allowance', [owner, entrypoint])) as bigint;
    if (left === 0n) return [];
    return [{ kind: 'approve', from: owner, to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [entrypoint, 0n] }), value: 0n, chainId, description: 'Reset the leftover allowance to zero' }];
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- async so that failures are rejections, never synchronous throws
  public async recordEntry(r: RouteRequest, q: EntryQuote, receipt: TxReceiptLike): Promise<PoolNote> {
    assertChainAllowed(r.chainId);
    if (receipt.status !== 'success') return fail('RECEIPT_INVALID', 'deposit transaction reverted');
    if (receipt.from.toLowerCase() !== r.stealth.address.toLowerCase() || r.stealth.signer.address.toLowerCase() !== r.stealth.address.toLowerCase()) {
      return fail('DEPOSITOR_MISMATCH', 'deposit was not sent from the one-time address');
    }
    const k = this.checkQuote(r, q);
    const depositor = pad(r.stealth.address.toLowerCase() as Hex, { size: 32 });
    const log = receipt.logs.find((l) => l.address.toLowerCase() === k.pool.toLowerCase() && l.topics[0] === DEPOSITED_TOPIC && l.topics[1]?.toLowerCase() === depositor);
    if (log === undefined) return fail('RECEIPT_INVALID', 'no Deposited log from the pinned pool for this depositor');
    const ev = decodeEventLog({ abi: poolAbi, eventName: 'Deposited', data: log.data, topics: [...log.topics] as [Hex, Hex] });
    if (ev.args._precommitmentHash !== k.precommitment) return fail('RECEIPT_INVALID', 'deposit log does not match the derived precommitment');
    if (ev.args._value > r.amount) return fail('RECEIPT_INVALID', 'committed value exceeds the amount sent');
    const secrets = withEntropy(r.rootSeed, (e) => ({
      dep: this.d.crypto.depositSecrets(e, k.scope, BigInt(k.index)),
    }));
    const c = this.d.crypto.commitment(ev.args._value, ev.args._label, secrets.dep.nullifier, secrets.dep.secret);
    if (c.hash !== ev.args._commitment) return fail('RECEIPT_INVALID', 'derived commitment differs from the on-chain commitment');
    const w = withEntropy(r.rootSeed, (e) => this.d.crypto.withdrawalSecrets(e, ev.args._label, 0n));
    const data: PpNoteData = {
      v: 1, entrypoint: k.entrypoint, pool: k.pool, scope: k.scope, label: ev.args._label, value: ev.args._value,
      nullifier: secrets.dep.nullifier, secret: secrets.dep.secret, commitment: c.hash, nullifierHash: c.nullifierHash, index: k.index,
      newNullifier: w.nullifier, newSecret: w.secret,
    };
    return {
      noteId: computeNoteId('privacy-pools', r.chainId, receipt.transactionHash, log.logIndex),
      routeId: 'privacy-pools',
      chainId: r.chainId,
      asset: r.asset,
      depositedAmount: ev.args._value,
      depositor: r.stealth.address,
      depositTx: receipt.transactionHash,
      depositBlock: receipt.blockNumber,
      state: receipt.confirmations >= (this.d.minConfirmations ?? 2) ? 'confirmed' : 'pending',
      adapterData: encodeNoteData(data),
      createdAt: roundToHour(Math.floor(this.clock() / 1000)),
    };
  }

  /* ---------- exit ---------- */

  private relayerUrls(entry: ManifestEntry): readonly string[] {
    const list = entry.relayers ?? [];
    if (this.d.relayerUrl !== undefined) return [this.d.relayerUrl];
    return list;
  }

  private client(entry: ManifestEntry, baseUrl: string, transport: ExitTransport): RelayerClient {
    return new RelayerClient({ transport, baseUrl, allowed: entry.relayers ?? [], allowCustomRelayer: this.d.allowCustomRelayer === true });
  }

  private encodeData(recipient: Address, feeRecipient: Address, bps: bigint): Hex {
    return encodeAbiParameters(relayDataParams, [recipient, feeRecipient, bps]);
  }

  public async quoteExit(n: PoolNote, o: ExitOptions): Promise<ExitQuote> {
    assertChainAllowed(n.chainId);
    if (n.state !== 'confirmed') return fail('NOTE_STATE', 'note is not confirmed');
    const d = decodeNoteData(n.adapterData);
    const c = await this.resolve(n.chainId, n.asset, { verifyCode: false, requireAlive: false });
    assertSameAddress('pool', c.pool, d.pool);
    const dest = getAddress(o.destination);
    if (o.selfBroadcast === true) {
      if (o.ackN3 !== true) return fail('ACK_REQUIRED', 'self-broadcast links the gas funding of the sending address to the destination (N3); acknowledge it first');
      return {
        noteId: n.noteId, routeId: 'privacy-pools', destination: dest, grossAmount: d.value, feeAmount: 0n, netAmount: d.value, feeBps: 0, via: 'self',
        expiresAt: Number.MAX_SAFE_INTEGER, destinationSeen: 'The relay transaction shows the destination, the amount and the gas-funding address on chain.',
        adapterData: { withdrawalData: this.encodeData(dest, dest, 0n) },
      };
    }
    const urls = this.relayerUrls(c.entry);
    if (urls.length === 0) return fail('RELAYER_NOT_ALLOWED', 'the manifest lists no relayer');
    let best: { url: string; fee: bigint } | undefined;
    for (const url of urls) {
      try {
        const det = await this.client(c.entry, url, this.d.transport).details(n.chainId, c.asset);
        if ((best === undefined || det.feeBPS < best.fee) && det.feeBPS <= BigInt(c.maxRelayFeeBps)) best = { url, fee: det.feeBPS };
      } catch (e) {
        if (urls.length === 1) throw e;
      }
    }
    if (best === undefined) return fail('RELAYER_REJECTED', 'no relayer answered within the on-chain maximum fee');
    const client = this.client(c.entry, best.url, this.d.transport);
    const det = await client.details(n.chainId, c.asset);
    if (det.chainId !== undefined && det.chainId !== n.chainId) return fail('RELAYER_REJECTED', 'relayer details are for another chain');
    if (det.assetAddress !== undefined) assertSameAddress('relayer asset', c.asset, det.assetAddress);
    if (det.minWithdrawAmount !== undefined && d.value < det.minWithdrawAmount) return fail('NOT_SUPPORTED', 'amount is below the relayer minimum');
    const quote = await client.quote(n.chainId, d.value, c.asset, dest);
    const fc = quote.feeCommitment;
    if (fc === undefined) return fail('RELAYER_SCHEMA_DRIFT', 'relayer returned no fee commitment');
    if (quote.feeBPS > BigInt(c.maxRelayFeeBps)) return fail('FEE_TOO_HIGH', 'relayer fee exceeds the pool maximum');
    if (o.maxFeeBps !== undefined && quote.feeBPS > BigInt(o.maxFeeBps)) return fail('FEE_TOO_HIGH', 'relayer fee exceeds your limit');
    this.checkCommitment(fc, { value: d.value, asset: c.asset, dest, feeReceiver: det.feeReceiverAddress, bps: quote.feeBPS });
    if (fc.expiration <= this.clock()) return fail('RELAYER_REJECTED', 'quote already expired');
    const bps = Number(quote.feeBPS);
    const fee = feeFloor(d.value, bps);
    return {
      noteId: n.noteId, routeId: 'privacy-pools', destination: dest, grossAmount: d.value, feeAmount: fee, netAmount: d.value - fee, feeBps: bps, via: 'relayer',
      expiresAt: fc.expiration,
      destinationSeen: 'The relayer sees the destination, the amount and your network address (N4).',
      adapterData: {
        relayer: best.url, withdrawalData: fc.withdrawalData, expiration: String(fc.expiration), signed: fc.signedRelayerCommitment,
        asset: fc.asset, amount: fc.amount.toString(), feeReceiver: det.feeReceiverAddress,
      },
    };
  }

  /** EP-PP-8: the relayer must not be able to substitute the recipient, fee receiver or fee. */
  private checkCommitment(fc: FeeCommitment, w: { value: bigint; asset: Address; dest: Address; feeReceiver: Address; bps: bigint }): void {
    assertSameAddress('fee commitment asset', w.asset, fc.asset);
    if (fc.amount !== w.value || fc.extraGas) return fail('RELAYER_REJECTED', 'fee commitment is for another amount or requests extra gas');
    let rec: Address, feeRec: Address, bps: bigint;
    try {
      [rec, feeRec, bps] = decodeAbiParameters(relayDataParams, fc.withdrawalData) as [Address, Address, bigint];
    } catch {
      return fail('RELAYER_SCHEMA_DRIFT', 'withdrawal data does not decode as RelayData');
    }
    if (rec.toLowerCase() !== w.dest.toLowerCase()) return fail('RELAYER_REJECTED', 'relayer substituted the recipient');
    if (feeRec.toLowerCase() !== w.feeReceiver.toLowerCase()) return fail('RELAYER_REJECTED', 'relayer substituted the fee receiver');
    if (bps !== w.bps) return fail('RELAYER_REJECTED', 'relayer substituted the fee');
    if (this.encodeData(w.dest, w.feeReceiver, w.bps).toLowerCase() !== fc.withdrawalData.toLowerCase()) {
      return fail('RELAYER_REJECTED', 'withdrawal data is not the canonical encoding');
    }
  }

  private async proofInputs(n: PoolNote, c: Ctx, d: PpNoteData): Promise<{ stateLeaves: readonly bigint[]; aspLeaves: readonly bigint[] }> {
    const cached = await this.d.cache?.(n.noteId);
    if (cached !== undefined) return decodeProofCache(cached);
    const from = BigInt(c.entry.deploymentBlock ?? 0);
    const { leaves, lastRoot } = await readStateLeaves(this.d.chain, n.chainId, c.pool, from, SCAN_CHUNK);
    const onChain = (await this.read(n.chainId, c.pool, poolAbi, 'currentRoot')) as bigint;
    if (lastRoot !== onChain) return fail('STATE_UNAVAILABLE', 'state leaves do not match the on-chain root; retry');
    const asp = await this.d.asp.getAssociationSet(n.chainId, d.scope);
    return { stateLeaves: leaves, aspLeaves: asp.leaves };
  }

  private async buildProof(n: PoolNote, d: PpNoteData, c: Ctx, withdrawalData: Hex): Promise<{ bundle: ProofBundle; withdrawal: { processooor: Address; data: Hex } }> {
    assertArtifactHashes(c.entry, await this.d.crypto.artifactDigests());
    const withdrawal = { processooor: c.entrypoint, data: withdrawalData };
    const inputs = await this.proofInputs(n, c, d);
    if (!inputs.aspLeaves.includes(d.label)) return fail('ASP_UNAVAILABLE', 'this deposit is not in the association set; use the emergency exit (ragequit)');
    const context = this.d.crypto.calculateContext(withdrawal, d.scope);
    const bundle = await this.d.crypto.proveWithdrawal({
      value: d.value, label: d.label, nullifier: d.nullifier, secret: d.secret, context, withdrawalAmount: d.value,
      stateLeaves: inputs.stateLeaves, aspLeaves: inputs.aspLeaves, newNullifier: d.newNullifier, newSecret: d.newSecret,
    });
    if (!(await this.d.crypto.verifyWithdrawal(bundle))) return fail('PROOF_INVALID', 'the withdrawal proof did not verify locally');
    const s = bundle.publicSignals;
    if (s.length !== 8 || BigInt(s[2] ?? '-1') !== d.value || BigInt(s[7] ?? '-1') !== context) return fail('PROOF_INVALID', 'proof public signals do not match the withdrawal');
    if (!(this.d.cache !== undefined && (await this.d.cache(n.noteId)) !== undefined)) {
      const poolRoot = (await this.read(n.chainId, c.pool, poolAbi, 'currentRoot')) as bigint;
      const aspRoot = (await this.read(n.chainId, c.entrypoint, entrypointAbi, 'latestRoot')) as bigint;
      if (BigInt(s[3] ?? '-1') !== poolRoot) return fail('STATE_UNAVAILABLE', 'proof state root differs from the on-chain root');
      if (BigInt(s[5] ?? '-1') !== aspRoot) return fail('ASP_UNAVAILABLE', 'proof association root differs from Entrypoint.latestRoot');
    }
    return { bundle, withdrawal };
  }

  public async executeExit(n: PoolNote, q: ExitQuote, t: ExitTransport): Promise<ExitResult> {
    assertChainAllowed(n.chainId);
    if (q.noteId !== n.noteId || q.routeId !== 'privacy-pools') return fail('NOTE_STATE', 'quote belongs to another note');
    if (n.state !== 'confirmed') return fail('NOTE_STATE', 'note is not confirmed');
    if (q.via === 'self') return fail('NOT_SUPPORTED', 'use prepareSelfRelayExit for self-broadcast exits');
    if (t.now() > q.expiresAt) return fail('RELAYER_REJECTED', 'quote expired');
    const d = decodeNoteData(n.adapterData);
    const c = await this.resolve(n.chainId, n.asset, { verifyCode: false, requireAlive: false });
    assertSameAddress('pool', c.pool, d.pool);
    const ad = q.adapterData;
    const fc: FeeCommitment = {
      expiration: Number(big(ad['expiration'], 'expiration')),
      withdrawalData: (ad['withdrawalData'] ?? '0x') as Hex,
      asset: getAddress(ad['asset'] ?? '0x'),
      signedRelayerCommitment: (ad['signed'] ?? '0x') as Hex,
      extraGas: false,
      amount: big(ad['amount'], 'amount'),
    };
    const feeReceiver = getAddress(ad['feeReceiver'] ?? '0x');
    this.checkCommitment(fc, { value: d.value, asset: c.asset, dest: q.destination, feeReceiver, bps: BigInt(q.feeBps) });
    if (q.grossAmount !== d.value || q.feeAmount !== feeFloor(d.value, q.feeBps) || q.netAmount !== d.value - q.feeAmount) return fail('ACCOUNTING_MISMATCH', 'quote amounts are inconsistent');
    const { bundle, withdrawal } = await this.buildProof(n, d, c, fc.withdrawalData);
    const client = this.client(c.entry, ad['relayer'] ?? '', t);
    const res = await client.request({ chainId: n.chainId, scope: d.scope, withdrawal, proof: bundle.proof, publicSignals: bundle.publicSignals, feeCommitment: fc });
    if (!res.success) return fail('RELAYER_REJECTED', `relayer refused the request${res.error === undefined ? '' : `: ${res.error.replace(/[^\x20-\x7e]/g, '?')}`}`);
    if (res.txHash === undefined) return fail('RELAYER_SCHEMA_DRIFT', 'relayer reported success without a transaction hash');
    assertAccounting(d.value, q.netAmount, q.feeAmount);
    return { noteId: n.noteId, txHash: res.txHash, destination: q.destination, exitedAmount: q.netAmount, feeAmount: q.feeAmount, newState: 'exited' };
  }

  /**
   * Self-relay exit (N3 acknowledged in {@link quoteExit}): builds `Entrypoint.relay` for a fresh, gas-funded address.
   *
   * @param n Note.
   * @param q Quote from `quoteExit` with `selfBroadcast` and `ackN3`.
   * @param from Address that will pay gas and send the transaction.
   * @returns One unsigned transaction.
   * @security Funding `from` links it to its funder (N3). The proof is verified locally before the transaction is returned.
   */
  public async prepareSelfRelayExit(n: PoolNote, q: ExitQuote, from: Address): Promise<PreparedTx[]> {
    assertChainAllowed(n.chainId);
    if (q.via !== 'self' || q.noteId !== n.noteId) return fail('NOTE_STATE', 'quote is not a self-broadcast quote for this note');
    const d = decodeNoteData(n.adapterData);
    const c = await this.resolve(n.chainId, n.asset, { verifyCode: false, requireAlive: false });
    assertSameAddress('pool', c.pool, d.pool);
    const data = this.encodeData(q.destination, q.destination, 0n);
    if (q.adapterData['withdrawalData'] !== data) return fail('RELAYER_REJECTED', 'quote withdrawal data does not match the destination');
    const { bundle, withdrawal } = await this.buildProof(n, d, c, data);
    const call = encodeFunctionData({ abi: entrypointAbi, functionName: 'relay', args: [withdrawal, formatProof(bundle, 8) as never, d.scope] });
    return [{ kind: 'exit', from, to: c.entrypoint, data: call, value: 0n, chainId: n.chainId, description: 'Withdraw from Privacy Pools to your destination (self-broadcast)' }];
  }

  public async prepareEmergencyExit(n: PoolNote): Promise<PreparedTx[]> {
    assertChainAllowed(n.chainId);
    const d = decodeNoteData(n.adapterData);
    const entry = this.entryFor(n.chainId);
    const pinned = entry.contracts[assetKey(n.asset)];
    if (pinned === undefined) return fail('MANIFEST_MISMATCH', 'manifest has no pool for this note');
    assertSameAddress('pool', pinned, d.pool);
    assertArtifactHashes(entry, await this.d.crypto.artifactDigests());
    const bundle = await this.d.crypto.proveRagequit({ value: d.value, label: d.label, nullifier: d.nullifier, secret: d.secret });
    const s = bundle.publicSignals;
    if (s.length !== 4 || BigInt(s[0] ?? '-1') !== d.commitment || BigInt(s[2] ?? '-1') !== d.value || BigInt(s[3] ?? '-1') !== d.label) {
      return fail('PROOF_INVALID', 'ragequit proof public signals do not match the note');
    }
    const data = encodeFunctionData({ abi: poolAbi, functionName: 'ragequit', args: [formatProof(bundle, 4) as never] });
    return [
      { kind: 'ragequit', from: n.depositor, to: pinned, data, value: 0n, chainId: n.chainId, description: 'Emergency exit (ragequit): return the funds to the one-time address that deposited them (public)' },
    ];
  }

  /* ---------- recovery ---------- */

  public async *recover(seed: SecretBox, scan: ScanContext): AsyncIterable<PoolNote> {
    assertChainAllowed(scan.chainId);
    const entry = this.entryFor(scan.chainId);
    const mine = new Set(scan.stealthAddresses.map((a) => a.toLowerCase()));
    const head = scan.toBlock ?? (await scan.chain.getBlockNumber(scan.chainId));
    for (const [name, pool] of Object.entries(entry.contracts)) {
      if (!name.startsWith('pool:')) continue;
      const asset: AssetId = name === 'pool:native' ? 'native' : getAddress(name.slice(5));
      const entrypoint = entry.contracts['entrypoint'];
      if (entrypoint === undefined) return fail('MANIFEST_MISMATCH', 'manifest has no entrypoint');
      const scope = (await this.read(scan.chainId, pool, poolAbi, 'SCOPE')) as bigint;
      const logs = [];
      for (const depositor of mine) {
        for (let from = scan.fromBlock; from <= head; from += SCAN_CHUNK) {
          const to = from + SCAN_CHUNK - 1n > head ? head : from + SCAN_CHUNK - 1n;
          logs.push(...(await scan.chain.getLogs(scan.chainId, { address: pool, topics: [DEPOSITED_TOPIC, pad(depositor as Hex, { size: 32 })], fromBlock: from, toBlock: to })));
        }
      }
      const spent = new Set<bigint>();
      const quit = new Set<bigint>();
      for (let from = scan.fromBlock; from <= head; from += SCAN_CHUNK) {
        const to = from + SCAN_CHUNK - 1n > head ? head : from + SCAN_CHUNK - 1n;
        for (const l of await scan.chain.getLogs(scan.chainId, { address: pool, topics: [WITHDRAWN_TOPIC], fromBlock: from, toBlock: to })) {
          spent.add(decodeEventLog({ abi: poolAbi, eventName: 'Withdrawn', data: l.data, topics: [...l.topics] as [Hex, Hex] }).args._spentNullifier);
        }
        for (const l of await scan.chain.getLogs(scan.chainId, { address: pool, topics: [RAGEQUIT_TOPIC], fromBlock: from, toBlock: to })) {
          quit.add(decodeEventLog({ abi: poolAbi, eventName: 'Ragequit', data: l.data, topics: [...l.topics] as [Hex, Hex] }).args._label);
        }
      }
      const byPre = new Map<bigint, { log: (typeof logs)[number]; ev: { _commitment: bigint; _label: bigint; _value: bigint; _depositor: Address } }>();
      for (const log of logs) {
        const ev = decodeEventLog({ abi: poolAbi, eventName: 'Deposited', data: log.data, topics: [...log.topics] as [Hex, Hex] });
        byPre.set(ev.args._precommitmentHash, { log, ev: ev.args });
      }
      let misses = 0;
      for (let i = 0; misses < GAP_LIMIT; i++) {
        const dep = withEntropy(seed, (e) => this.d.crypto.depositSecrets(e, scope, BigInt(i)));
        const hit = byPre.get(dep.precommitment);
        if (hit === undefined) {
          misses += 1;
          continue;
        }
        misses = 0;
        const c = this.d.crypto.commitment(hit.ev._value, hit.ev._label, dep.nullifier, dep.secret);
        if (c.hash !== hit.ev._commitment) continue;
        const w = withEntropy(seed, (e) => this.d.crypto.withdrawalSecrets(e, hit.ev._label, 0n));
        const data: PpNoteData = {
          v: 1, entrypoint, pool, scope, label: hit.ev._label, value: hit.ev._value, nullifier: dep.nullifier, secret: dep.secret, commitment: c.hash,
          nullifierHash: c.nullifierHash, index: i, newNullifier: w.nullifier, newSecret: w.secret,
        };
        const txHash = hit.log.transactionHash;
        if (txHash === undefined) return fail('RECEIPT_INVALID', 'log without transaction hash');
        yield {
          noteId: computeNoteId('privacy-pools', scan.chainId, txHash, hit.log.logIndex),
          routeId: 'privacy-pools',
          chainId: scan.chainId,
          asset,
          depositedAmount: hit.ev._value,
          depositor: getAddress(hit.ev._depositor),
          depositTx: txHash,
          depositBlock: hit.log.blockNumber ?? 0n,
          state: quit.has(hit.ev._label) ? 'ragequit' : spent.has(c.nullifierHash) ? 'exited' : 'confirmed',
          adapterData: encodeNoteData(data),
          createdAt: 0,
        };
      }
    }
  }
}

/**
 * Mirrors the SDK's `ContractInteractionsService.formatProof`: the G2 coordinates of `pB` are swapped for Solidity.
 *
 * @param p Proof bundle.
 * @param nSignals Expected public signal count (8 for withdrawals, 4 for ragequit).
 * @throws ExternalPoolError PROOF_INVALID when the shape is wrong.
 */
export function formatProof(p: ProofBundle, nSignals: 4 | 8): { pA: [bigint, bigint]; pB: [[bigint, bigint], [bigint, bigint]]; pC: [bigint, bigint]; pubSignals: bigint[] } {
  const a = p.proof.pi_a, b = p.proof.pi_b, cc = p.proof.pi_c;
  if (a.length < 2 || b.length < 2 || (b[0]?.length ?? 0) < 2 || (b[1]?.length ?? 0) < 2 || cc.length < 2 || p.publicSignals.length !== nSignals) return fail('PROOF_INVALID', 'proof has an unexpected shape');
  const n = (s: string | undefined): bigint => {
    if (s === undefined || !/^\d{1,78}$/.test(s)) return fail('PROOF_INVALID', 'proof element is not a decimal integer');
    return BigInt(s);
  };
  return {
    pA: [n(a[0]), n(a[1])],
    pB: [[n(b[0]?.[1]), n(b[0]?.[0])], [n(b[1]?.[1]), n(b[1]?.[0])]],
    pC: [n(cc[0]), n(cc[1])],
    pubSignals: p.publicSignals.map(n),
  };
}
