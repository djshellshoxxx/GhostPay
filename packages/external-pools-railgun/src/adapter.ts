import {
  EXIT_ROUTE_INFO, assertAccounting, assertChainAllowed, assertSameAddress, computeNoteId, fail, feeFloor, findEntry, roundToHour, verifyCodeHashes,
  type AssetId, type ChainReader, type EntryQuote, type ExitOptions, type ExitQuote, type ExitResult, type ExitRouteInfo, type ExitTransport,
  type ExternalPoolAdapter, type ManifestEntry, type PoolLifecycle, type PoolManifest, type PoolNote, type PreparedTx, type RouteRequest, type ScanContext,
  type SupportResult, type TxReceiptLike,
} from '@ghostpay/external-pools';
import type { SecretBox } from '@ghostpay/secret-box';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { decodeEventLog, decodeFunctionData, decodeFunctionResult, encodeFunctionData, getAddress, pad, toEventSelector, type Address, type Hex } from 'viem';
import { MAX_UINT120, SNARK_SCALAR_FIELD, TOKEN_ERC20, UNSHIELD_NONE, erc20Abi, railgunAbi } from './abi.js';
import { withEntropy } from './derive.js';
import type { BroadcasterFee, PopulatedTx, PoiStatus, RailgunWalletPort, RgNoteData } from './types.js';

const SHIELD_TOPIC = toEventSelector(railgunAbi.find((x) => x.type === 'event') as never);

/** Dependencies of {@link RailgunAdapter}. All I/O is injected (EP-GEN-2). */
export interface RailgunDeps {
  readonly manifest: PoolManifest;
  readonly chain: ChainReader;
  readonly wallet: RailgunWalletPort;
  /** Upper bound for the on-chain shield and unshield fee in bps (EP-RG-4). Default 100. */
  readonly maxFeeBps?: number;
  /** Upper bound for the broadcaster fee in bps of the exited amount (EP-RG-5). Default 100. */
  readonly maxBroadcasterFeeBps?: number;
  /** Confirmations before a note is `confirmed`. Default 2. */
  readonly minConfirmations?: number;
  readonly clock?: () => number;
}

const big = (v: string, what: string): bigint => {
  if (!/^\d{1,78}$/.test(v)) return fail('INVALID_INPUT', `${what} is malformed`);
  return BigInt(v);
};

function rgData(bytes: Uint8Array): RgNoteData {
  try {
    const o = JSON.parse(new TextDecoder().decode(bytes)) as Partial<RgNoteData>;
    if (o.v !== 1 || typeof o.proxy !== 'string' || typeof o.token !== 'string' || typeof o.treeNumber !== 'string' || typeof o.position !== 'string' || typeof o.shieldFee !== 'string') throw new Error('shape');
    return o as RgNoteData;
  } catch {
    return fail('INVALID_INPUT', 'bad Railgun note data');
  }
}

/**
 * @param d Note data (no secrets).
 */
export function encodeRgData(d: RgNoteData): Uint8Array {
  return utf8ToBytes(JSON.stringify(d));
}

/**
 * @param bytes `PoolNote.adapterData`.
 * @throws ExternalPoolError INVALID_INPUT.
 */
export function decodeRgData(bytes: Uint8Array): RgNoteData {
  return rgData(bytes);
}

const sdkReject = (m: string): never => fail('SDK_OUTPUT_REJECTED', `Railgun SDK output rejected: ${m}`);

/**
 * `EP-2`: Railgun adapter.
 *
 * Entry is `approve(proxy, amount)` plus `RailgunSmartWallet.shield` sent by the stealth address S1. Because the SDK is
 * third-party code, every transaction it returns is decoded and compared with the request before it is handed on: target
 * contract, token, amount and (for unshields) the destination (EP-RG-2, EP-RG-5). Fees are read from the proxy and capped
 * (EP-RG-4). Only ERC-20 tokens are supported (native coin would need a wrap step that is not implemented).
 *
 * @security The real SDK glue is NOT part of this package and nothing here has run against a Railgun testnet, PPOI node or
 *   broadcaster [UNVERIFIED]. The Railgun contracts are upgradeable by Railgun governance and are not audited by GhostPay (N6).
 */
export class RailgunAdapter implements ExternalPoolAdapter {
  public readonly id = 'railgun' as const;
  public readonly schema = 1;
  private readonly clock: () => number;

  /** @param d Dependencies. */
  public constructor(private readonly d: RailgunDeps) {
    this.clock = d.clock ?? (() => Date.now());
  }

  public info(): ExitRouteInfo {
    return { ...EXIT_ROUTE_INFO.railgun, chains: this.d.manifest.entries.filter((e) => e.route === 'railgun').map((e) => e.chainId) };
  }

  private entryFor(chainId: number): ManifestEntry {
    const e = findEntry(this.d.manifest, 'railgun', chainId);
    if (e === undefined) return fail('ROUTE_NOT_AVAILABLE', `Railgun has no manifest entry on chain ${String(chainId)}`);
    if (e.status !== 'verified') return fail('POOL_NOT_ACTIVE', 'Railgun manifest entry is unverified (code hashes not pinned)');
    return e;
  }

  private async proxy(chainId: number, verifyCode: boolean): Promise<{ entry: ManifestEntry; proxy: Address }> {
    const entry = this.entryFor(chainId);
    if (verifyCode) await verifyCodeHashes(this.d.chain, entry);
    const proxy = entry.contracts['proxy'];
    if (proxy === undefined) return fail('MANIFEST_MISMATCH', 'manifest has no proxy');
    return { entry, proxy };
  }

  private async fee(chainId: number, proxy: Address, which: 'shieldFee' | 'unshieldFee', capped: boolean): Promise<number> {
    const out = await this.d.chain.call(chainId, proxy, encodeFunctionData({ abi: railgunAbi, functionName: which }));
    const bps = decodeFunctionResult({ abi: railgunAbi, functionName: which, data: out });
    const cap = this.d.maxFeeBps ?? 100;
    if (capped && bps > BigInt(cap)) return fail('FEE_TOO_HIGH', `${which} of ${bps.toString()} bps exceeds the limit of ${String(cap)} bps`);
    return Number(bps);
  }

  public async health(chainId?: number): Promise<{ lifecycle: PoolLifecycle; reason?: string }> {
    if (chainId !== undefined) assertChainAllowed(chainId);
    const entries = this.d.manifest.entries.filter((e) => e.route === 'railgun' && (chainId === undefined || e.chainId === chainId));
    if (entries.length === 0) return { lifecycle: 'unknown', reason: 'no manifest entry' };
    if (entries.some((e) => e.status !== 'verified')) return { lifecycle: 'unknown', reason: 'manifest entry is unverified' };
    try {
      for (const e of entries) {
        await verifyCodeHashes(this.d.chain, e);
        await this.fee(e.chainId, e.contracts['proxy'] as Address, 'shieldFee', true);
      }
    } catch {
      return { lifecycle: 'unknown', reason: 'could not verify the deployment or its fees' };
    }
    return { lifecycle: 'active' };
  }

  public supports(q: { chainId: number; asset: AssetId }): Promise<SupportResult> {
    assertChainAllowed(q.chainId);
    if (q.asset === 'native') return Promise.resolve({ supported: false, reason: 'native coin must be wrapped first; the wrap step is not implemented' });
    if (findEntry(this.d.manifest, 'railgun', q.chainId) === undefined) return Promise.resolve({ supported: false, reason: 'no manifest entry on this chain' });
    return Promise.resolve({ supported: true });
  }

  /* ---------- entry ---------- */

  public async quoteEntry(r: RouteRequest): Promise<EntryQuote> {
    assertChainAllowed(r.chainId);
    if (r.asset === 'native') return fail('NOT_SUPPORTED', 'native coin must be wrapped first; the wrap step is not implemented');
    if (r.amount < 1n || r.amount > MAX_UINT120) return fail('INVALID_INPUT', 'amount must be in 1..2^120-1');
    const { proxy } = await this.proxy(r.chainId, true);
    const bps = await this.fee(r.chainId, proxy, 'shieldFee', true);
    const feeAmount = feeFloor(r.amount, bps);
    return {
      routeId: 'railgun', chainId: r.chainId, asset: r.asset, amount: r.amount, feeAmount, creditedAmount: r.amount - feeAmount,
      fee: { entryFeeBps: bps, exitFeeBps: null, relayerFeeBps: null, source: 'RailgunSmartWallet.shieldFee()' },
      adapterData: { proxy, token: r.asset, shieldFeeBps: String(bps) },
    };
  }

  public async prepareEntry(r: RouteRequest, q: EntryQuote): Promise<PreparedTx[]> {
    assertChainAllowed(r.chainId);
    if (r.asset === 'native') return fail('NOT_SUPPORTED', 'native coin must be wrapped first; the wrap step is not implemented');
    const signer = r.stealth.signer;
    if (signer.address.toLowerCase() !== r.stealth.address.toLowerCase()) return fail('DEPOSITOR_MISMATCH', 'signer is not the one-time address');
    if (signer.signMessage === undefined) return fail('NOT_SUPPORTED', 'the stealth signer cannot sign messages (needed for the shield key)');
    if (q.routeId !== 'railgun' || q.chainId !== r.chainId || q.asset !== r.asset || q.amount !== r.amount) return fail('INVALID_INPUT', 'quote does not match the request');
    const { proxy } = await this.proxy(r.chainId, false);
    assertSameAddress('proxy', proxy, q.adapterData['proxy'] ?? '0x');
    const signature = await signer.signMessage(this.d.wallet.shieldMessage());
    const wallet = await withEntropy(r.rootSeed, (e) => this.d.wallet.openWallet(e));
    const tx = await this.d.wallet.populateShield({
      chainId: r.chainId, shieldPrivateKey: this.d.wallet.shieldKeyFromSignature(signature), railgunAddress: wallet.railgunAddress, token: r.asset, amount: r.amount,
    });
    this.checkShieldTx(tx, proxy, r.asset, r.amount);
    const from = r.stealth.address;
    return [
      {
        kind: 'approve', from, to: r.asset, value: 0n, chainId: r.chainId, description: 'Approve exactly this amount to the Railgun contract',
        data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [proxy, r.amount] }),
      },
      { kind: 'shield', from, to: proxy, data: tx.data, value: 0n, chainId: r.chainId, description: 'Shield into Railgun from your one-time address' },
    ];
  }

  /** EP-RG-2: the SDK's shield transaction must target the pinned proxy and shield exactly the requested token and amount. */
  private checkShieldTx(tx: PopulatedTx, proxy: Address, token: Address, amount: bigint): void {
    if (tx.to.toLowerCase() !== proxy.toLowerCase()) return fail('MANIFEST_MISMATCH', 'the SDK shield transaction does not target the pinned Railgun proxy');
    if (tx.value !== 0n) return sdkReject('shield transaction carries value');
    let reqs: readonly { preimage: { npk: Hex; token: { tokenType: number; tokenAddress: Address; tokenSubID: bigint }; value: bigint } }[];
    try {
      const f = decodeFunctionData({ abi: railgunAbi, data: tx.data });
      if (f.functionName !== 'shield') return sdkReject('not a shield call');
      reqs = f.args[0];
    } catch (e) {
      if (e instanceof Error && e.name === 'ExternalPoolError') throw e;
      return sdkReject('calldata does not decode as shield');
    }
    const only = reqs[0];
    if (reqs.length !== 1 || only === undefined) return sdkReject('expected exactly one shield request');
    const p = only.preimage;
    if (p.token.tokenType !== TOKEN_ERC20 || p.token.tokenSubID !== 0n) return sdkReject('not a plain ERC-20 shield');
    if (p.token.tokenAddress.toLowerCase() !== token.toLowerCase()) return sdkReject('token differs from the request');
    if (p.value !== amount) return sdkReject('amount differs from the request');
    const npk = BigInt(p.npk);
    if (npk === 0n || npk >= SNARK_SCALAR_FIELD) return sdkReject('note public key is out of range');
  }

  public async recordEntry(r: RouteRequest, q: EntryQuote, receipt: TxReceiptLike): Promise<PoolNote> {
    assertChainAllowed(r.chainId);
    if (r.asset === 'native') return fail('NOT_SUPPORTED', 'native coin must be wrapped first; the wrap step is not implemented');
    if (receipt.status !== 'success') return fail('RECEIPT_INVALID', 'shield transaction reverted');
    if (receipt.from.toLowerCase() !== r.stealth.address.toLowerCase() || r.stealth.signer.address.toLowerCase() !== r.stealth.address.toLowerCase()) {
      return fail('DEPOSITOR_MISMATCH', 'shield was not sent from the one-time address');
    }
    const { proxy } = await this.proxy(r.chainId, false);
    assertSameAddress('proxy', proxy, q.adapterData['proxy'] ?? '0x');
    const log = receipt.logs.find((l) => l.address.toLowerCase() === proxy.toLowerCase() && l.topics[0] === SHIELD_TOPIC);
    if (log === undefined) return fail('RECEIPT_INVALID', 'no Shield log from the pinned proxy');
    const ev = decodeEventLog({ abi: railgunAbi, eventName: 'Shield', data: log.data, topics: [...log.topics] as [Hex] });
    const args = ev.args;
    if (args === undefined) return fail('RECEIPT_INVALID', 'undecodable Shield log');
    const mine = args.commitments.map((c, i) => ({ c, i })).filter((x) => x.c.token.tokenAddress.toLowerCase() === r.asset.toLowerCase());
    const hit = mine[0];
    if (mine.length !== 1 || hit === undefined) return fail('RECEIPT_INVALID', 'expected exactly one shielded note for this token in the log');
    const credited = hit.c.value;
    if (credited > r.amount) return fail('RECEIPT_INVALID', 'credited value exceeds the amount sent');
    const fee = args.fees[hit.i] ?? 0n;
    const data: RgNoteData = { v: 1, proxy, token: r.asset, treeNumber: args.treeNumber.toString(), position: (args.startPosition + BigInt(hit.i)).toString(), shieldFee: fee.toString() };
    const shieldedToken = r.asset;
    const owned = await withEntropy(r.rootSeed, (e) => this.d.wallet.openWallet(e)).then((w) =>
      this.d.wallet.ownsShield({ walletId: w.walletId, chainId: r.chainId, txHash: receipt.transactionHash, token: shieldedToken }),
    );
    return {
      noteId: computeNoteId('railgun', r.chainId, receipt.transactionHash, log.logIndex),
      routeId: 'railgun', chainId: r.chainId, asset: r.asset, depositedAmount: credited, depositor: r.stealth.address,
      depositTx: receipt.transactionHash, depositBlock: receipt.blockNumber,
      state: owned && receipt.confirmations >= (this.d.minConfirmations ?? 2) ? 'confirmed' : 'pending',
      adapterData: encodeRgData(data), createdAt: roundToHour(Math.floor(this.clock() / 1000)),
    };
  }

  /* ---------- exit ---------- */

  private seedFrom(seed: SecretBox | undefined): SecretBox {
    if (seed === undefined) return fail('INVALID_INPUT', 'the root seed is needed to open the Railgun wallet');
    return seed;
  }

  /** EP-RG-5: bound the broadcaster's fee in token and amount. */
  private checkBroadcasterFee(bf: BroadcasterFee, token: Address, amount: bigint, userMaxBps: number | undefined): void {
    if (bf.feeToken.toLowerCase() !== token.toLowerCase()) return fail('FEE_TOO_HIGH', 'the broadcaster asks to be paid in another token');
    const cap = BigInt(Math.min(this.d.maxBroadcasterFeeBps ?? 100, userMaxBps ?? 10_000));
    if (bf.feeAmount < 0n || bf.feeAmount * 10_000n > cap * amount) return fail('FEE_TOO_HIGH', 'the broadcaster fee exceeds your limit');
  }

  /** EP-RG-5: the destination in the transaction the SDK built must be the one the user chose. */
  private checkUnshieldTx(tx: PopulatedTx, proxy: Address, chainId: number, token: Address, dest: Address, maxValue: bigint): bigint {
    if (tx.to.toLowerCase() !== proxy.toLowerCase()) return fail('MANIFEST_MISMATCH', 'the SDK unshield transaction does not target the pinned Railgun proxy');
    if (tx.value !== 0n) return sdkReject('unshield transaction carries value');
    let txs;
    try {
      const f = decodeFunctionData({ abi: railgunAbi, data: tx.data });
      if (f.functionName !== 'transact') return sdkReject('not a transact call');
      txs = f.args[0];
    } catch (e) {
      if (e instanceof Error && e.name === 'ExternalPoolError') throw e;
      return sdkReject('calldata does not decode as transact');
    }
    const unshields = txs.filter((t) => t.boundParams.unshield !== UNSHIELD_NONE);
    const u = unshields[0];
    if (unshields.length !== 1 || u === undefined) return sdkReject('expected exactly one unshield');
    if (BigInt(u.boundParams.chainID) !== BigInt(chainId)) return sdkReject('transaction is bound to another chain');
    if (u.unshieldPreimage.npk.toLowerCase() !== pad(dest.toLowerCase() as Hex, { size: 32 })) return sdkReject('the unshield destination is not the chosen address');
    if (u.unshieldPreimage.token.tokenType !== TOKEN_ERC20 || u.unshieldPreimage.token.tokenAddress.toLowerCase() !== token.toLowerCase()) return sdkReject('the unshield token differs from the note token');
    if (u.unshieldPreimage.value > maxValue || u.unshieldPreimage.value === 0n) return sdkReject('the unshield value is outside the note amount');
    return u.unshieldPreimage.value;
  }

  public async quoteExit(n: PoolNote, o: ExitOptions): Promise<ExitQuote> {
    assertChainAllowed(n.chainId);
    if (n.state !== 'confirmed') return fail('NOTE_STATE', 'note is not confirmed');
    const d = rgData(n.adapterData);
    const { proxy } = await this.proxy(n.chainId, false);
    assertSameAddress('proxy', proxy, d.proxy);
    const token = getAddress(d.token);
    const dest = getAddress(o.destination);
    const unshieldBps = await this.fee(n.chainId, proxy, 'unshieldFee', true);
    const unshieldFee = feeFloor(n.depositedAmount, unshieldBps);
    const wallet = await withEntropy(this.seedFrom(o.rootSeed), (e) => this.d.wallet.openWallet(e));
    if (o.selfBroadcast === true) {
      if (o.ackN3 !== true) return fail('ACK_REQUIRED', 'self-broadcast links the gas funding of the sending address to the destination (N3); acknowledge it first');
      return {
        noteId: n.noteId, routeId: 'railgun', destination: dest, grossAmount: n.depositedAmount, feeAmount: unshieldFee, netAmount: n.depositedAmount - unshieldFee,
        feeBps: unshieldBps, via: 'self', expiresAt: Number.MAX_SAFE_INTEGER,
        destinationSeen: 'The unshield transaction shows the destination, the amount and the gas-funding address on chain.',
        adapterData: { walletId: wallet.walletId, ppoiStatus: 'unsupported' },
      };
    }
    const bf = await this.d.wallet.quoteBroadcasterFee({ chainId: n.chainId, token, amount: n.depositedAmount });
    if (bf === undefined) return fail('RELAYER_NOT_ALLOWED', 'no broadcaster is reachable; use the emergency exit');
    this.checkBroadcasterFee(bf, token, n.depositedAmount, o.maxFeeBps);
    const total = unshieldFee + bf.feeAmount;
    const status: PoiStatus = await this.d.wallet.poiStatus({ walletId: wallet.walletId, chainId: n.chainId, token });
    return {
      noteId: n.noteId, routeId: 'railgun', destination: dest, grossAmount: n.depositedAmount, feeAmount: total, netAmount: n.depositedAmount - total,
      feeBps: Number((total * 10_000n) / n.depositedAmount), via: 'broadcaster', expiresAt: this.clock() + 60_000,
      destinationSeen: 'The broadcaster sees the destination, the amount and your network address (N4).',
      adapterData: { walletId: wallet.walletId, ppoiStatus: status, broadcasterFee: bf.feeAmount.toString(), feeToken: bf.feeToken },
    };
  }

  public async executeExit(n: PoolNote, q: ExitQuote, t: ExitTransport): Promise<ExitResult> {
    assertChainAllowed(n.chainId);
    if (q.noteId !== n.noteId || q.routeId !== 'railgun') return fail('NOTE_STATE', 'quote belongs to another note');
    if (n.state !== 'confirmed') return fail('NOTE_STATE', 'note is not confirmed');
    if (q.via === 'self') return fail('NOT_SUPPORTED', 'use prepareSelfUnshield for self-broadcast exits');
    if (t.now() > q.expiresAt) return fail('RELAYER_REJECTED', 'quote expired');
    const d = rgData(n.adapterData);
    const { proxy } = await this.proxy(n.chainId, false);
    assertSameAddress('proxy', proxy, d.proxy);
    const token = getAddress(d.token);
    const bf: BroadcasterFee = { feeToken: getAddress(q.adapterData['feeToken'] ?? '0x'), feeAmount: big(q.adapterData['broadcasterFee'] ?? '', 'broadcaster fee') };
    this.checkBroadcasterFee(bf, token, n.depositedAmount, undefined);
    if (q.adapterData['ppoiStatus'] === 'blocked') {
      return fail('NOTE_STATE', 'the proof-of-innocence lists block this note; only the emergency exit remains (whether it is accepted is UNVERIFIED)');
    }
    const unshieldBps = await this.fee(n.chainId, proxy, 'unshieldFee', true);
    const tx = await this.d.wallet.populateUnshield({
      walletId: q.adapterData['walletId'] ?? '', chainId: n.chainId, token, amount: n.depositedAmount, recipient: q.destination, broadcasterFee: bf, sendWithPublicWallet: false,
    });
    const unshieldValue = this.checkUnshieldTx(tx, proxy, n.chainId, token, q.destination, n.depositedAmount);
    const unshieldFee = feeFloor(unshieldValue, unshieldBps);
    const received = unshieldValue - unshieldFee;
    if (received !== q.netAmount || unshieldValue + bf.feeAmount !== n.depositedAmount) return fail('ACCOUNTING_MISMATCH', 'the unshield amounts differ from the quote');
    assertAccounting(n.depositedAmount, received, unshieldFee + bf.feeAmount);
    const txHash = await this.d.wallet.broadcast(tx, n.chainId);
    return { noteId: n.noteId, txHash, destination: q.destination, exitedAmount: received, feeAmount: unshieldFee + bf.feeAmount, newState: 'exited' };
  }

  private async selfUnshield(n: PoolNote, walletId: string, dest: Address, from: Address): Promise<PreparedTx[]> {
    const d = rgData(n.adapterData);
    const { proxy } = await this.proxy(n.chainId, false);
    assertSameAddress('proxy', proxy, d.proxy);
    const token = getAddress(d.token);
    const tx = await this.d.wallet.populateUnshield({ walletId, chainId: n.chainId, token, amount: n.depositedAmount, recipient: dest, sendWithPublicWallet: true });
    const value = this.checkUnshieldTx(tx, proxy, n.chainId, token, dest, n.depositedAmount);
    if (value !== n.depositedAmount) return sdkReject('a self-broadcast unshield must move the whole note');
    return [{ kind: 'unshield', from, to: proxy, data: tx.data, value: 0n, chainId: n.chainId, description: 'Unshield from Railgun with your own transaction (public)' }];
  }

  /**
   * Self-broadcast unshield for a quote made with `selfBroadcast` and `ackN3` (EP-RG-6).
   *
   * @param n Note.
   * @param q Quote with `via: 'self'`.
   * @param from Gas-funded address that will send the transaction (funding it links it to its funder, N3).
   */
  public async prepareSelfUnshield(n: PoolNote, q: ExitQuote, from: Address): Promise<PreparedTx[]> {
    assertChainAllowed(n.chainId);
    if (q.via !== 'self' || q.noteId !== n.noteId) return fail('NOTE_STATE', 'quote is not a self-broadcast quote for this note');
    return this.selfUnshield(n, q.adapterData['walletId'] ?? '', q.destination, from);
  }

  public async prepareEmergencyExit(n: PoolNote, seed?: SecretBox): Promise<PreparedTx[]> {
    assertChainAllowed(n.chainId);
    const wallet = await withEntropy(this.seedFrom(seed), (e) => this.d.wallet.openWallet(e));
    // Operator-free: no broadcaster, no PPOI call, no fee cap (a governance fee change must not trap the funds).
    return this.selfUnshield(n, wallet.walletId, n.depositor, n.depositor);
  }

  /* ---------- recovery ---------- */

  public async *recover(seed: SecretBox, scan: ScanContext): AsyncIterable<PoolNote> {
    assertChainAllowed(scan.chainId);
    const { proxy } = await this.proxy(scan.chainId, false);
    const wallet = await withEntropy(seed, (e) => this.d.wallet.openWallet(e));
    const mine = new Set(scan.stealthAddresses.map((a) => a.toLowerCase()));
    for await (const s of this.d.wallet.scanShields({ walletId: wallet.walletId, chainId: scan.chainId })) {
      if (!mine.has(s.depositor.toLowerCase())) continue;
      const data: RgNoteData = { v: 1, proxy, token: s.token, treeNumber: s.treeNumber.toString(), position: s.position.toString(), shieldFee: s.fee.toString() };
      yield {
        noteId: computeNoteId('railgun', scan.chainId, s.txHash, s.logIndex), routeId: 'railgun', chainId: scan.chainId, asset: getAddress(s.token), depositedAmount: s.amount,
        depositor: getAddress(s.depositor), depositTx: s.txHash, depositBlock: s.blockNumber, state: s.spent ? 'exited' : 'confirmed', adapterData: encodeRgData(data), createdAt: 0,
      };
    }
  }
}
