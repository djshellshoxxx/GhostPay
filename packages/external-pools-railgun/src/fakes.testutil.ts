import { asHex, fakeChainReader, makeSeed, makeRequest, parseManifest, type ChainReader, type ExitTransport, type PoolManifest, type RouteRequest, type TxReceiptLike, type LogLike } from '@ghostpay/external-pools';
import { encodeEventTopics, encodeAbiParameters, encodeFunctionData, encodeFunctionResult, getAddress, keccak256, pad, toHex, type Address, type Hex } from 'viem';
import { railgunAbi, erc20Abi } from './abi.js';
import type { BroadcasterFee, PoiStatus, PopulatedTx, RailgunWalletPort, ScannedShield } from './types.js';

export const PROXY: Address = getAddress('0x00000000000000000000000000000000000a0001');
export const TOKEN: Address = getAddress('0x00000000000000000000000000000000000a0002');
export const OTHER_TOKEN: Address = getAddress('0x00000000000000000000000000000000000a0003');
export const PROXY_CODE: Hex = '0x60aa60005260206000f3';
export const S1: Address = getAddress('0x1111111111111111111111111111111111111111');
export const D1: Address = getAddress('0x2222222222222222222222222222222222222222');
export const D2: Address = getAddress('0x3333333333333333333333333333333333333333');
export const NPK: Hex = `0x${'00'.repeat(31)}07`;

export function manifestFor(over: Record<string, unknown> = {}): PoolManifest {
  return parseManifest({
    schema: 1,
    retrieved: '2026-10-21',
    entries: [{ route: 'railgun', chainId: 31337, status: 'verified', contracts: { proxy: PROXY }, codeHashes: { proxy: keccak256(PROXY_CODE) }, sources: ['test'], ...over }],
  });
}

const cipher = { encryptedBundle: [`0x${'00'.repeat(32)}`, `0x${'00'.repeat(32)}`, `0x${'00'.repeat(32)}`] as const, shieldKey: asHex(`0x${'00'.repeat(32)}`) };

export function shieldCalldata(token: Address, value: bigint, npk: Hex = NPK, extra: { tokenType?: number; subId?: bigint; two?: boolean } = {}): Hex {
  const one = { preimage: { npk, token: { tokenType: extra.tokenType ?? 0, tokenAddress: token, tokenSubID: extra.subId ?? 0n }, value }, ciphertext: cipher };
  return encodeFunctionData({ abi: railgunAbi, functionName: 'shield', args: [extra.two === true ? [one, one] : [one]] });
}

const zeroG1 = { x: 0n, y: 0n };
export function transactCalldata(o: { token: Address; dest: Address; value: bigint; chainId?: number; unshield?: number; tokenType?: number; count?: number; npk?: Hex }): Hex {
  const mk = (unshield: number) => ({
    proof: { a: zeroG1, b: { x: [0n, 0n] as const, y: [0n, 0n] as const }, c: zeroG1 },
    merkleRoot: `0x${'00'.repeat(32)}`,
    nullifiers: [] as Hex[],
    commitments: [] as Hex[],
    boundParams: { treeNumber: 0, minGasPrice: 0n, unshield, chainID: BigInt(o.chainId ?? 31337), adaptContract: '0x0000000000000000000000000000000000000000' as Address, adaptParams: `0x${'00'.repeat(32)}`, commitmentCiphertext: [] as never[] },
    unshieldPreimage: { npk: o.npk ?? pad(asHex(o.dest.toLowerCase()), { size: 32 }), token: { tokenType: o.tokenType ?? 0, tokenAddress: o.token, tokenSubID: 0n }, value: o.value },
  });
  const list = [mk(o.unshield ?? 1)];
  if (o.count === 2) list.push(mk(1));
  if (o.count === 0) list.length = 0;
  return encodeFunctionData({ abi: railgunAbi, functionName: 'transact', args: [list as never] });
}

export class FakeWallet implements RailgunWalletPort {
  public walletId = 'wallet-1';
  public opened: string[] = [];
  public shieldTo: Address = PROXY;
  public shieldData: ((token: Address, amount: bigint) => Hex) | undefined;
  public shieldValue = 0n;
  public broadcasterFee: BroadcasterFee | undefined = { feeToken: TOKEN, feeAmount: 100n };
  public poi: PoiStatus = 'valid';
  public unshieldTx: ((a: Parameters<RailgunWalletPort['populateUnshield']>[0], chainId: number) => PopulatedTx) | undefined;
  public broadcasts: PopulatedTx[] = [];
  public scanned: ScannedShield[] = [];
  public scanError: Error | undefined;
  public unshieldCalls: Parameters<RailgunWalletPort['populateUnshield']>[0][] = [];
  public signatures: Hex[] = [];
  public keys: Hex[] = [];
  public digests: Record<string, string> = {};

  public shieldMessage(): string {
    return 'Railgun shield test message';
  }
  public shieldKeyFromSignature(sig: Hex): Hex {
    this.signatures.push(sig);
    const k = keccak256(sig);
    this.keys.push(k);
    return k;
  }
  public openWallet(entropy: Uint8Array): Promise<{ walletId: string; railgunAddress: string }> {
    this.opened.push(toHex(entropy));
    return Promise.resolve({ walletId: this.walletId, railgunAddress: '0zk-test-address' });
  }
  public populateShield(a: Parameters<RailgunWalletPort['populateShield']>[0]): Promise<PopulatedTx> {
    return Promise.resolve({ to: this.shieldTo, value: this.shieldValue, data: this.shieldData?.(a.token, a.amount) ?? shieldCalldata(a.token, a.amount) });
  }
  public owns = true;
  public ownsShield(): Promise<boolean> {
    return Promise.resolve(this.owns);
  }
  public poiStatus(): Promise<PoiStatus> {
    return Promise.resolve(this.poi);
  }
  public quoteBroadcasterFee(): Promise<BroadcasterFee | undefined> {
    return Promise.resolve(this.broadcasterFee);
  }
  public populateUnshield(a: Parameters<RailgunWalletPort['populateUnshield']>[0]): Promise<PopulatedTx> {
    this.unshieldCalls.push(a);
    if (this.unshieldTx !== undefined) return Promise.resolve(this.unshieldTx(a, a.chainId));
    const fee = a.broadcasterFee?.feeAmount ?? 0n;
    return Promise.resolve({ to: PROXY, value: 0n, data: transactCalldata({ token: a.token, dest: a.recipient, value: a.amount - fee, chainId: a.chainId }) });
  }
  public broadcast(tx: PopulatedTx): Promise<Hex> {
    this.broadcasts.push(tx);
    return Promise.resolve(asHex(`0x${'ab'.repeat(32)}`));
  }
  public async *scanShields(): AsyncIterable<ScannedShield> {
    await Promise.resolve();
    if (this.scanError !== undefined) throw this.scanError;
    for (const s of this.scanned) yield s;
  }
  public artifactDigests(): Promise<Record<string, string>> {
    return Promise.resolve(this.digests);
  }
}

export interface Rig {
  adapterDeps: { manifest: PoolManifest; chain: ChainReader & { seen: string[] }; wallet: FakeWallet; clock: () => number };
  wallet: FakeWallet;
  clock: { now: number };
  req: RouteRequest;
  transport: ExitTransport;
  fees: { shield: bigint; unshield: bigint };
}

export function rig(over: { manifest?: PoolManifest; fees?: { shield: bigint; unshield: bigint }; code?: Hex } = {}): Rig & { chain: ChainReader & { seen: string[] } } {
  const fees = over.fees ?? { shield: 25n, unshield: 25n };
  const base = fakeChainReader({ codes: { [PROXY.toLowerCase()]: over.code ?? PROXY_CODE } });
  const chain: ChainReader & { seen: string[] } = {
    ...base,
    seen: base.seen,
    call: (_c, to, data) => {
      base.seen.push(`call:${to}`);
      if (to.toLowerCase() !== PROXY.toLowerCase()) return Promise.reject(new Error('unexpected target'));
      if (data === encodeFunctionData({ abi: railgunAbi, functionName: 'shieldFee' })) return Promise.resolve(encodeFunctionResult({ abi: railgunAbi, functionName: 'shieldFee', result: fees.shield }));
      if (data === encodeFunctionData({ abi: railgunAbi, functionName: 'unshieldFee' })) return Promise.resolve(encodeFunctionResult({ abi: railgunAbi, functionName: 'unshieldFee', result: fees.unshield }));
      return Promise.reject(new Error('unexpected call'));
    },
  };
  const wallet = new FakeWallet();
  const clock = { now: 1_700_000_000_000 };
  const transport: ExitTransport = { fetch: (() => Promise.reject(new Error('Railgun adapter must not use fetch'))), now: () => clock.now };
  const req = makeRequest({ chainId: 31337, asset: TOKEN, amount: 1_000_000n, rootSeed: makeSeed(4), destination: D1 });
  return { adapterDeps: { manifest: over.manifest ?? manifestFor(), chain, wallet, clock: () => clock.now }, chain, wallet, clock, req, transport, fees };
}

/** Builds the receipt the proxy would produce for a shield (inclusive fee, as in `RailgunLogic.getFee`). */
export function shieldReceipt(a: { from: Address; token: Address; amount: bigint; shieldFeeBps: bigint; confirmations?: number; treeNumber?: bigint; start?: bigint; extraToken?: boolean; to?: Address }): TxReceiptLike {
  const fee = (a.amount * a.shieldFeeBps) / 10_000n;
  const base = a.amount - fee;
  const commitments = [{ npk: NPK, token: { tokenType: 0, tokenAddress: a.token, tokenSubID: 0n }, value: base }];
  const fees = [fee];
  if (a.extraToken === true) {
    commitments.push({ npk: NPK, token: { tokenType: 0, tokenAddress: a.token, tokenSubID: 0n }, value: base });
    fees.push(fee);
  }
  const topics = encodeEventTopics({ abi: railgunAbi, eventName: 'Shield' }) as Hex[];
  const data = encodeAbiParameters(railgunAbi[4].inputs as never, [a.treeNumber ?? 0n, a.start ?? 5n, commitments, commitments.map(() => cipher), fees] as never);
  const log: LogLike = { address: a.to ?? PROXY, topics, data, logIndex: 3, blockNumber: 77n, transactionHash: `0x${'11'.repeat(32)}` };
  return { transactionHash: log.transactionHash as Hex, blockNumber: 77n, from: a.from, to: PROXY, status: 'success', logs: [log], confirmations: a.confirmations ?? 5 };
}

export const approveData = (spender: Address, amount: bigint): Hex => encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, amount] });
