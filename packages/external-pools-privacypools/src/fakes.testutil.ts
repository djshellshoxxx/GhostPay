import { json, type ChainReader, type LogLike, type PreparedTx, type TxReceiptLike, type RecordedCall } from '@ghostpay/external-pools';
import {
  concatHex, decodeAbiParameters, getAddress, decodeFunctionData, encodeAbiParameters, encodeEventTopics, encodeFunctionResult, keccak256, pad, toHex, type Address, type Hex,
} from 'viem';
import { NATIVE_ASSET, entrypointAbi, erc20Abi, poolAbi, relayDataParams } from './abi.js';
import type { AspSource, PrivacyPoolsCrypto, ProofBundle } from './types.js';

export const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const ENTRYPOINT: Address = getAddress('0x00000000000000000000000000000000000e0001');
export const POOL: Address = getAddress('0x00000000000000000000000000000000000e0002');
export const TOKEN_POOL: Address = getAddress('0x00000000000000000000000000000000000e0003');
export const TOKEN: Address = getAddress('0x00000000000000000000000000000000000e0004');
export const FEE_RECEIVER: Address = getAddress('0x00000000000000000000000000000000000fee01');
export const ENTRY_CODE: Hex = '0x60aa60005260206000f3';
export const POOL_CODE: Hex = '0x60bb60005260206000f3';
export const TOKEN_POOL_CODE: Hex = '0x60cc60005260206000f3';

/** Deterministic stand-in hash (keccak mod field). Not Poseidon. */
export function h(...xs: (bigint | string)[]): bigint {
  return (
    BigInt(
      keccak256(
        concatHex(xs.map((x) => (typeof x === 'bigint' ? pad(toHex(x), { size: 32 }) : toHex(x)))),
      ),
    ) % FIELD
  );
}

export const rootOf = (leaves: readonly bigint[]): bigint => (leaves.length === 0 ? 0n : h('root', ...leaves));

/** Cheap fake of the SDK (no zero-knowledge). The proof field `pi_a[0]` authenticates the public signals. */
export class FakeCrypto implements PrivacyPoolsCrypto {
  public digests: Record<string, string> = {};
  public proveCalls = 0;
  public ragequitCalls = 0;
  public corrupt = false;
  public entropies: string[] = [];

  public depositSecrets(entropy: Uint8Array, scope: bigint, index: bigint): { nullifier: bigint; secret: bigint; precommitment: bigint } {
    const e = toHex(entropy);
    this.entropies.push(e);
    const nullifier = h('n', e, scope, index);
    const secret = h('s', e, scope, index);
    return { nullifier, secret, precommitment: h('pre', nullifier, secret) };
  }
  public withdrawalSecrets(entropy: Uint8Array, label: bigint, index: bigint): { nullifier: bigint; secret: bigint } {
    const e = toHex(entropy);
    return { nullifier: h('wn', e, label, index), secret: h('ws', e, label, index) };
  }
  public commitment(value: bigint, label: bigint, nullifier: bigint, secret: bigint): { hash: bigint; nullifierHash: bigint } {
    return { hash: h('c', value, label, h('pre', nullifier, secret)), nullifierHash: h('nh', nullifier) };
  }
  public calculateContext(w: { processooor: Hex; data: Hex }, scope: bigint): bigint {
    return h('ctx', w.processooor.toLowerCase(), w.data, scope);
  }
  private seal(signals: readonly string[]): ProofBundle {
    const tag = this.corrupt ? '0' : h('proof', ...signals.map((s) => BigInt(s))).toString();
    return { proof: { pi_a: [tag, '2', '1'], pi_b: [['3', '4'], ['5', '6'], ['1', '0']], pi_c: ['7', '8', '1'] }, publicSignals: signals };
  }
  public proveWithdrawal(i: Parameters<PrivacyPoolsCrypto['proveWithdrawal']>[0]): Promise<ProofBundle> {
    this.proveCalls += 1;
    const c = this.commitment(i.value, i.label, i.nullifier, i.secret);
    return Promise.resolve(
      this.seal([
        h('new', i.newNullifier, i.newSecret).toString(), c.nullifierHash.toString(), i.withdrawalAmount.toString(), rootOf(i.stateLeaves).toString(), '1',
        rootOf(i.aspLeaves).toString(), '1', i.context.toString(),
      ]),
    );
  }
  public verifyWithdrawal(p: ProofBundle): Promise<boolean> {
    return Promise.resolve(p.proof.pi_a[0] === h('proof', ...p.publicSignals.map((s) => BigInt(s))).toString());
  }
  public proveRagequit(i: Parameters<PrivacyPoolsCrypto['proveRagequit']>[0]): Promise<ProofBundle> {
    this.ragequitCalls += 1;
    const c = this.commitment(i.value, i.label, i.nullifier, i.secret);
    return Promise.resolve(this.seal([c.hash.toString(), c.nullifierHash.toString(), i.value.toString(), i.label.toString()]));
  }
  public artifactDigests(): Promise<Record<string, string>> {
    return Promise.resolve(this.digests);
  }
}

/** In-memory Entrypoint + pools + ASP + chain reader. */
export class PoolEnv implements AspSource {
  public readonly crypto = new FakeCrypto();
  public block = 1000n;
  public dead = false;
  public codes: Record<string, Hex> = {
    [ENTRYPOINT.toLowerCase()]: ENTRY_CODE,
    [POOL.toLowerCase()]: POOL_CODE,
    [TOKEN_POOL.toLowerCase()]: TOKEN_POOL_CODE,
  };
  public config = { min: 1000n, vetting: 100n, maxRelay: 100n };
  public used = new Set<bigint>();
  public leaves: Record<string, bigint[]> = { [POOL.toLowerCase()]: [], [TOKEN_POOL.toLowerCase()]: [] };
  public aspLeaves: bigint[] = [];
  public aspDown = false;
  public logs: LogLike[] = [];
  public balances = new Map<string, bigint>();
  public spent = new Set<bigint>();
  public depositors = new Map<bigint, Address>();
  public nonce = 0n;
  public txCounter = 0n;
  public staleLeaves = false;
  public calls: string[] = [];
  public logCalls = 0;
  public scopeOf: Record<string, bigint> = { [POOL.toLowerCase()]: 111n, [TOKEN_POOL.toLowerCase()]: 222n };
  public poolOverride: Address | undefined;
  public rootFn: (leaves: readonly bigint[]) => bigint = rootOf;
  public commitFn: (value: bigint, label: bigint, pre: bigint) => bigint = (v, l, p) => h('c', v, l, p);

  public reader(): ChainReader {
    return {
      getCode: (_c, a) => Promise.resolve(this.codes[a.toLowerCase()] ?? '0x'),
      getBlockNumber: () => Promise.resolve(this.block),
      call: (_c, to, data) => Promise.resolve(this.handleCall(to.toLowerCase(), data)),
      getLogs: (_c, f) => {
        this.logCalls += 1;
        return Promise.resolve(
          this.logs.filter((l) => {
            if (l.address.toLowerCase() !== f.address.toLowerCase()) return false;
            if ((l.blockNumber ?? 0n) < f.fromBlock || (l.blockNumber ?? 0n) > f.toBlock) return false;
            return (f.topics ?? []).every((t, i) => t === null || t === undefined || l.topics[i]?.toLowerCase() === t.toLowerCase());
          }),
        );
      },
    };
  }

  private handleCall(to: string, data: Hex): Hex {
    this.calls.push(`${to}:${data.slice(0, 10)}`);
    const sel = data.slice(0, 10);
    const tryDecode = (abi: typeof entrypointAbi | typeof poolAbi | typeof erc20Abi): { functionName: string; args?: readonly unknown[] } | undefined => {
      try {
        return decodeFunctionData({ abi, data });
      } catch {
        return undefined;
      }
    };
    if (to === ENTRYPOINT.toLowerCase()) {
      const f = tryDecode(entrypointAbi);
      if (f?.functionName === 'assetConfig') {
        const asset = String((f.args as [Address])[0]).toLowerCase();
        const pool = this.poolOverride ?? (asset === NATIVE_ASSET.toLowerCase() ? POOL : asset === TOKEN.toLowerCase() ? TOKEN_POOL : ('0x0000000000000000000000000000000000000000'));
        return encodeFunctionResult({ abi: entrypointAbi, functionName: 'assetConfig', result: [pool, this.config.min, this.config.vetting, this.config.maxRelay] });
      }
      if (f?.functionName === 'usedPrecommitments') return encodeFunctionResult({ abi: entrypointAbi, functionName: 'usedPrecommitments', result: this.used.has((f.args as [bigint])[0]) });
      if (f?.functionName === 'latestRoot') return encodeFunctionResult({ abi: entrypointAbi, functionName: 'latestRoot', result: this.rootFn(this.aspLeaves) });
    } else if (to === POOL.toLowerCase() || to === TOKEN_POOL.toLowerCase()) {
      const f = tryDecode(poolAbi);
      const scope = this.scopeOf[to] ?? 0n;
      if (f?.functionName === 'SCOPE') return encodeFunctionResult({ abi: poolAbi, functionName: 'SCOPE', result: scope });
      if (f?.functionName === 'ASSET') return encodeFunctionResult({ abi: poolAbi, functionName: 'ASSET', result: to === POOL.toLowerCase() ? NATIVE_ASSET : TOKEN });
      if (f?.functionName === 'ENTRYPOINT') return encodeFunctionResult({ abi: poolAbi, functionName: 'ENTRYPOINT', result: ENTRYPOINT });
      if (f?.functionName === 'dead') return encodeFunctionResult({ abi: poolAbi, functionName: 'dead', result: this.dead });
      if (f?.functionName === 'currentRoot') {
        const ls = this.leaves[to] ?? [];
        return encodeFunctionResult({ abi: poolAbi, functionName: 'currentRoot', result: this.staleLeaves ? 1n : this.rootFn(ls) });
      }
    } else if (to === TOKEN.toLowerCase()) {
      const f = tryDecode(erc20Abi);
      if (f?.functionName === 'allowance') return encodeFunctionResult({ abi: erc20Abi, functionName: 'allowance', result: this.allowance });
    }
    throw new Error(`unhandled call ${to} ${sel}`);
  }
  public allowance = 0n;

  public fund(a: Address, v: bigint): void {
    this.balances.set(a.toLowerCase(), (this.balances.get(a.toLowerCase()) ?? 0n) + v);
  }
  public balance(a: Address): bigint {
    return this.balances.get(a.toLowerCase()) ?? 0n;
  }

  public getAssociationSet(): Promise<{ leaves: readonly bigint[] }> {
    if (this.aspDown) return Promise.reject(new Error('asp down'));
    return Promise.resolve({ leaves: this.aspLeaves });
  }

  private nextHash(): Hex {
    this.txCounter += 1n;
    return pad(toHex(this.txCounter), { size: 32 });
  }

  private mkLog(address: Address, abi: typeof poolAbi | typeof entrypointAbi, eventName: string, args: object, nonIndexed: { type: string }[], values: unknown[], txHash: Hex, idx: number): LogLike {
    const topics = // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- needed: `eventName` is a plain string here
    encodeEventTopics({ abi, eventName, args } as never) as Hex[];
    const data = nonIndexed.length === 0 ? '0x' : encodeAbiParameters(nonIndexed as never, values as never);
    return { address, topics, data, logIndex: idx, blockNumber: this.block, transactionHash: txHash };
  }

  /** Executes a prepared transaction as its `from`; supports deposit, approve, ragequit, relay. */
  public execute(tx: PreparedTx, confirmations = 5): TxReceiptLike {
    this.block += 1n;
    const txHash = this.nextHash();
    const to = tx.to.toLowerCase();
    const base = { transactionHash: txHash, blockNumber: this.block, from: tx.from, to: tx.to, status: 'success' as const, confirmations };
    if (to === TOKEN.toLowerCase()) return { ...base, logs: [] };
    if (to === ENTRYPOINT.toLowerCase()) {
      const f = decodeFunctionData({ abi: entrypointAbi, data: tx.data });
      if (f.functionName === 'deposit') {
        const args = f.args as readonly unknown[];
        const native = args.length === 1;
        const pre = (native ? args[0] : args[2]) as bigint;
        const value = native ? tx.value : (args[1] as bigint);
        const pool = native ? POOL : TOKEN_POOL;
        if (this.used.has(pre)) throw new Error('PrecommitmentAlreadyUsed');
        if (value < this.config.min) throw new Error('MinimumDepositAmount');
        this.used.add(pre);
        const credited = value - (value * this.config.vetting) / 10_000n;
        this.nonce += 1n;
        const label = BigInt(keccak256(concatHex([pad(toHex(this.scopeOf[pool.toLowerCase()] ?? 0n), { size: 32 }), pad(toHex(this.nonce), { size: 32 })]))) % FIELD;
        const commitment = this.commitFn(credited, label, pre);
        this.depositors.set(label, tx.from);
        (this.leaves[pool.toLowerCase()] ??= []).push(commitment);
        const ls = this.leaves[pool.toLowerCase()] ?? [];
        const logs = [
          this.mkLog(pool, poolAbi, 'LeafInserted', {}, [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }], [BigInt(ls.length), commitment, this.rootFn(ls)], txHash, 0),
          this.mkLog(pool, poolAbi, 'Deposited', { _depositor: tx.from }, [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }], [commitment, label, credited, pre], txHash, 1),
          this.mkLog(ENTRYPOINT, entrypointAbi, 'Deposited', { _depositor: tx.from, _pool: pool }, [{ type: 'uint256' }, { type: 'uint256' }], [commitment, credited], txHash, 2),
        ];
        this.logs.push(...logs);
        return { ...base, logs };
      }
      if (f.functionName === 'relay') {
        const [w, proof, scope] = f.args as readonly [{ processooor: Address; data: Hex }, { pubSignals: readonly bigint[] }, bigint];
        const pool = scope === 111n ? POOL : TOKEN_POOL;
        const nh = proof.pubSignals[1] ?? 0n;
        if (this.spent.has(nh)) throw new Error('NullifierAlreadySpent');
        const [recipient, feeRecipient, bps] = decodeAbiParameters(relayDataParams, w.data) as [Address, Address, bigint];
        if (bps > this.config.maxRelay) throw new Error('RelayFeeGreaterThanMax');
        this.spent.add(nh);
        const amount = proof.pubSignals[2] ?? 0n;
        const fee = (amount * bps) / 10_000n;
        this.fund(recipient, amount - fee);
        this.fund(feeRecipient, fee);
        const log = this.mkLog(pool, poolAbi, 'Withdrawn', { _processooor: ENTRYPOINT }, [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }], [amount, nh, 0n], txHash, 0);
        this.logs.push(log);
        return { ...base, logs: [log] };
      }
    }
    if (to === POOL.toLowerCase() || to === TOKEN_POOL.toLowerCase()) {
      const f = decodeFunctionData({ abi: poolAbi, data: tx.data });
      if (f.functionName === 'ragequit') {
        const [p] = f.args as readonly [{ pubSignals: readonly bigint[] }];
        const [commitment, nh, value, label] = p.pubSignals as [bigint, bigint, bigint, bigint];
        if (this.depositors.get(label)?.toLowerCase() !== tx.from.toLowerCase()) throw new Error('OnlyOriginalDepositor');
        if (this.spent.has(nh)) throw new Error('NullifierAlreadySpent');
        this.spent.add(nh);
        this.fund(tx.from, value);
        const log = this.mkLog(tx.to, poolAbi, 'Ragequit', { _ragequitter: tx.from }, [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }], [commitment, label, value], txHash, 0);
        this.logs.push(log);
        return { ...base, logs: [log] };
      }
    }
    throw new Error('unsupported transaction');
  }

  /** Applies a relayed withdrawal as the relayer would (used by the fake relayer HTTP handler). */
  public relayerSubmit(body: { withdrawal: { processooor: Address; data: Hex }; proof: { pi_a: string[]; pi_b: string[][]; pi_c: string[] }; publicSignals: string[]; scope: string }): Hex {
    const nums = body.publicSignals.map((s) => BigInt(s));
    const tx = this.execute({
      from: FEE_RECEIVER,
      to: ENTRYPOINT,
      value: 0n,
      chainId: 31337,
      description: 'relay',
      data: encodeRelay(body.withdrawal, nums, BigInt(body.scope)),
    });
    return tx.transactionHash;
  }
}

import { encodeFunctionData } from 'viem';
function encodeRelay(w: { processooor: Address; data: Hex }, signals: bigint[], scope: bigint): Hex {
  return encodeFunctionData({
    abi: entrypointAbi,
    functionName: 'relay',
    args: [w, { pA: [1n, 2n], pB: [[3n, 4n], [5n, 6n]], pC: [7n, 8n], pubSignals: signals as unknown as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint] }, scope],
  });
}

export interface RelayerOpts {
  recipientOverride?: Address;
  feeReceiverOverride?: Address;
  quoteBps?: string;
  detailsBps?: string;
  extraField?: boolean;
  status?: number;
  expired?: boolean;
  noCommitment?: boolean;
  badRequestResult?: object;
  reject?: boolean;
  noTxHash?: boolean;
  amountOverride?: string;
  assetOverride?: Address;
  extraGas?: boolean;
  big?: boolean;
  html?: boolean;
  minWithdraw?: string;
  detailsChainId?: number;
  detailsAsset?: Address;
  garbageWithdrawalData?: boolean;
}

/** HTTP handler that behaves like the upstream relayer unless told to misbehave. */
export function relayerHandler(env: PoolEnv, now: () => number, o: RelayerOpts = {}): (c: RecordedCall) => Response {
  return (c) => {
    if (o.status !== undefined) return new Response('boom', { status: o.status });
    if (o.html === true) return new Response('<html>', { status: 200 });
    if (o.big === true) return new Response('x'.repeat(70_000), { status: 200 });
    const url = new URL(c.url);
    if (url.pathname === '/relayer/details') {
      return json({
        feeBPS: o.detailsBps ?? '50',
        feeReceiverAddress: FEE_RECEIVER,
        chainId: o.detailsChainId ?? Number(url.searchParams.get('chainId')),
        assetAddress: o.detailsAsset ?? url.searchParams.get('assetAddress'),
        minWithdrawAmount: o.minWithdraw ?? '1000',
        maxGasPrice: null,
        ...(o.extraField === true ? { surprise: 1 } : {}),
      });
    }
    if (url.pathname === '/relayer/quote') {
      const b = JSON.parse(c.body ?? '{}') as { amount: string; asset: Address; recipient: Address; chainId: number };
      const bps = o.quoteBps ?? '50';
      const data = o.garbageWithdrawalData === true ? ('0x1234' as Hex) : encodeAbiParameters(relayDataParams, [o.recipientOverride ?? b.recipient, o.feeReceiverOverride ?? FEE_RECEIVER, BigInt(bps)]);
      return json({
        baseFeeBPS: '50',
        feeBPS: bps,
        gasPrice: '1000000000',
        detail: {},
        ...(o.noCommitment === true
          ? {}
          : {
              feeCommitment: {
                expiration: o.expired === true ? now() - 1 : now() + 60_000,
                withdrawalData: data,
                asset: o.assetOverride ?? b.asset,
                signedRelayerCommitment: `0x${'11'.repeat(65)}`,
                extraGas: o.extraGas === true,
                amount: o.amountOverride ?? b.amount,
              },
            }),
      });
    }
    if (url.pathname === '/relayer/request') {
      if (o.badRequestResult !== undefined) return json(o.badRequestResult);
      if (o.reject === true) return json({ success: false, timestamp: 1, requestId: 'r', error: 'nope\u0007' });
      const body = JSON.parse(c.body ?? '{}') as Parameters<PoolEnv['relayerSubmit']>[0];
      const txHash = env.relayerSubmit(body);
      return json({ success: true, timestamp: now(), requestId: 'req-1', ...(o.noTxHash === true ? {} : { txHash }) });
    }
    return new Response('not found', { status: 404 });
  };
}
