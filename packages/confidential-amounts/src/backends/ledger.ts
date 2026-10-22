import { bytesToHex, decodeFunctionData, getAddress, keccak256, toHex, type Address, type Hex } from 'viem';
import { FEE_DIVISOR, ROUTER_ABI, TOKEN_ABI, UINT64_MAX } from '../abi.js';
import { CtError } from '../errors.js';
import { buildConfidentialMetadata } from '../metadata.js';
import type { CtTx } from '../types.js';

/** Seconds in the router's fee epoch. */
export const LEDGER_FEE_EPOCH = 7 * 24 * 3600;

/** An event emitted by a simulated transaction. */
export interface LedgerEvent {
  /** Event name (`Announcement`, `ConfidentialPayment`, `ConfidentialTransfer`, `UnwrapRequested`, `FeesFlushed`, `OperatorSet`). */
  readonly name: string;
  /** Decoded arguments. Handles are hex; no plaintext amounts appear in any event. */
  readonly args: Readonly<Record<string, unknown>>;
}

/** Result of {@link CleartextLedger.execute}. */
export interface LedgerReceipt {
  /** Events in emission order. */
  readonly events: readonly LedgerEvent[];
  /** Handle returned by the call, if any. */
  readonly returned: Hex | null;
}

interface HandleRec {
  value: bigint;
  readonly allowed: Set<string>;
  publicDecryptable: boolean;
}

interface TokenState {
  readonly balances: Map<string, bigint>;
  readonly balanceHandles: Map<string, Hex>;
  readonly operators: Map<string, Map<string, number>>;
  readonly unwrapRequests: Map<Hex, string>;
  readonly underlying: Map<string, bigint>;
}

interface RouterState {
  readonly feeRecipient: string;
  readonly tokens: Set<string>;
  readonly epochStart: Map<string, number>;
}

const lc = (a: string): string => a.toLowerCase();
const revert = (msg: string): never => {
  throw new CtError('LEDGER_REVERT', msg);
};

/**
 * CT-M: an in-memory simulation of `GhostPayConfidentialRouter` + an ERC-7984 wrapper token
 * (spec CT-M). It reproduces the contract's amount rules (fee `t/400`, silent zero transfer,
 * operator expiry, per-handle ACL, fee epoch) so client flows can be tested without fhEVM.
 * @security NO PRIVACY: values are plaintext in memory. Local development and tests only; never
 * select it in a production UI. Handles are random, but anyone holding the ledger object can read all values.
 */
export class CleartextLedger {
  readonly #handles = new Map<Hex, HandleRec>();
  readonly #inputs = new Map<Hex, { user: string; contract: string }>();
  readonly #tokens = new Map<string, TokenState>();
  readonly #routers = new Map<string, RouterState>();
  readonly #eth = new Map<string, bigint>();
  readonly #random: () => Uint8Array;

  /** @param random 32 fresh random bytes per call; default Web Crypto. Inject for deterministic tests. */
  public constructor(random?: () => Uint8Array) {
    this.#random = random ?? (() => globalThis.crypto.getRandomValues(new Uint8Array(32)));
  }

  /** Registers a confidential token that holds balances for addresses. */
  public deployToken(token: Address): void {
    this.#tokens.set(lc(token), {
      balances: new Map(),
      balanceHandles: new Map(),
      operators: new Map(),
      unwrapRequests: new Map(),
      underlying: new Map(),
    });
  }

  /** Registers a router with an immutable fee recipient and accepted-token set. */
  public deployRouter(router: Address, feeRecipient: Address, tokens: readonly Address[]): void {
    this.#routers.set(lc(router), { feeRecipient: lc(feeRecipient), tokens: new Set(tokens.map(lc)), epochStart: new Map() });
  }

  /** Test helper: wraps `amount` underlying tokens into confidential `token` for `to` (public amount in reality). */
  public wrap(token: Address, to: Address, amount: bigint): void {
    const t = this.#token(token);
    if (amount < 0n || amount > UINT64_MAX) revert('amount out of range');
    this.#credit(t, token, lc(to), amount);
  }

  /** Test helper: cleartext balance. @security Not available on a real backend. */
  public balanceOf(token: Address, who: Address): bigint {
    return this.#token(token).balances.get(lc(who)) ?? 0n;
  }

  /** Test helper: underlying ERC-20 balance returned by finished unwraps. */
  public underlyingOf(token: Address, who: Address): bigint {
    return this.#token(token).underlying.get(lc(who)) ?? 0n;
  }

  /** Test helper: ETH received by an address through gas buffers. */
  public ethOf(who: Address): bigint {
    return this.#eth.get(lc(who)) ?? 0n;
  }

  /** Test helper: cleartext value of a handle, ignoring ACL. */
  public peek(handle: Hex): bigint {
    return this.#rec(handle).value;
  }

  /** Test helper: whether `who` is ACL-allowed on `handle`. */
  public isAllowed(handle: Hex, who: Address): boolean {
    return this.#rec(handle).allowed.has(lc(who));
  }

  /** Current balance handle of `who` (allowed to `who` and the token). Zero hash if never funded. */
  public confidentialBalanceOf(token: Address, who: Address): Hex {
    return this.#token(token).balanceHandles.get(lc(who)) ?? toHex(0n, { size: 32 });
  }

  /** Registers an encrypted input bound to `(contract, user)` and returns its handle and proof. */
  public registerInput(user: Address, contract: Address, amount: bigint): { handle: Hex; inputProof: Hex } {
    if (amount < 0n || amount > UINT64_MAX) revert('amount out of range');
    const handle = this.#newHandle(amount, []);
    this.#inputs.set(handle, { user: lc(user), contract: lc(contract) });
    return { handle, inputProof: keccak256(`${handle}${lc(user)}${lc(contract)}` as Hex) };
  }

  /**
   * User decryption: requires both `user` and `contract` to be ACL-allowed on the handle (as in the fhEVM mock).
   * The zero handle decrypts to 0 without ACL.
   */
  public userDecrypt(handle: Hex, user: Address, contract: Address): bigint {
    if (BigInt(handle) === 0n) return 0n;
    const r = this.#rec(handle);
    if (!r.allowed.has(lc(user)) || !r.allowed.has(lc(contract))) {
      throw new CtError('ACL_DENIED', 'user or contract is not allowed to decrypt this handle');
    }
    return r.value;
  }

  /** Public decryption (only for handles made publicly decryptable, e.g. unwrap requests). Returns value and a proof. */
  public publicDecrypt(handle: Hex): { cleartext: bigint; proof: Hex } {
    const r = this.#rec(handle);
    if (!r.publicDecryptable) throw new CtError('ACL_DENIED', 'handle is not publicly decryptable');
    return { cleartext: r.value, proof: keccak256(`${handle}:${r.value}` as Hex) };
  }

  /**
   * Applies a transaction as the real contracts would (decoding the same calldata the backend emits).
   * @param tx Transaction request.
   * @param from Sender (`msg.sender`).
   * @param nowSec Block timestamp.
   * @throws {CtError} `LEDGER_REVERT` with the contract's error name for every revert path.
   */
  public execute(tx: CtTx, from: Address, nowSec: number): LedgerReceipt {
    const sender = lc(from);
    const to = lc(tx.to);
    const router = this.#routers.get(to);
    if (router) return this.#routerCall(to, router, tx, sender, nowSec);
    const token = this.#tokens.get(to);
    if (token) return this.#tokenCall(to, token, tx, sender, nowSec);
    return revert('call to unknown contract');
  }

  // ---- router -------------------------------------------------------------------------------

  #routerCall(routerAddr: string, router: RouterState, tx: CtTx, sender: string, now: number): LedgerReceipt {
    const call = decodeFunctionData({ abi: ROUTER_ABI, data: tx.data });
    if (call.functionName === 'flushFees') {
      const [tokenArg] = call.args;
      return this.#flush(routerAddr, router, lc(tokenArg), now);
    }
    if (call.functionName !== 'payConfidential') return revert('unknown router function');
    const [tokenArg, stealthArg, encGross, inputProof, deadline, maxBuffer, eph, viewTag] = call.args;
    const tokenAddr = lc(tokenArg);
    const stealth = lc(stealthArg);
    if (BigInt(now) > deadline) revert('Expired');
    if (BigInt(stealth) === 0n || stealth === routerAddr || stealth === router.feeRecipient) revert('InvalidStealth');
    if (!/^0x0[23][0-9a-f]{64}$/.test(eph)) revert('InvalidEphemeralKey');
    if (tx.value > maxBuffer) revert('BufferTooLarge');
    if (!router.tokens.has(tokenAddr)) revert('TokenNotAllowed');
    const token = this.#token(tokenAddr);
    if (!this.#isOperator(token, sender, routerAddr, now)) revert('NotOperator');

    const input = this.#inputs.get(encGross);
    if (!input || input.user !== sender || input.contract !== routerAddr) revert('invalid input proof');
    if (inputProof !== keccak256(`${encGross}${sender}${routerAddr}` as Hex)) revert('invalid input proof');
    const events: LedgerEvent[] = [];
    const gross = this.#rec(encGross).value;

    const t = this.#move(token, tokenAddr, sender, routerAddr, gross, events);
    this.#allow(t, [sender, routerAddr, tokenAddr]);
    const tv = this.#rec(t).value;
    const fee = tv / FEE_DIVISOR;
    const net = tv - fee;
    const netSent = this.#move(token, tokenAddr, routerAddr, stealth, net, events);
    this.#allow(netSent, [sender, routerAddr]);

    if (!router.epochStart.has(tokenAddr)) router.epochStart.set(tokenAddr, now);
    if (tx.value > 0n) this.#eth.set(stealth, (this.#eth.get(stealth) ?? 0n) + tx.value);

    const metadata = bytesToHex(buildConfidentialMetadata(Number.parseInt(viewTag.slice(2, 4), 16), getAddress(tokenAddr), netSent));
    events.push({ name: 'Announcement', args: { schemeId: 1n, stealthAddress: getAddress(stealth), caller: getAddress(routerAddr), ephemeralPubKey: eph, metadata } });
    events.push({ name: 'ConfidentialPayment', args: { token: getAddress(tokenAddr), netHandle: netSent } });
    return { events, returned: netSent };
  }

  #flush(routerAddr: string, router: RouterState, tokenAddr: string, now: number): LedgerReceipt {
    if (!router.tokens.has(tokenAddr)) revert('TokenNotAllowed');
    const start = router.epochStart.get(tokenAddr);
    if (start === undefined || now < start + LEDGER_FEE_EPOCH) revert('FlushTooEarly');
    const token = this.#token(tokenAddr);
    router.epochStart.delete(tokenAddr);
    const events: LedgerEvent[] = [];
    const bal = token.balances.get(routerAddr) ?? 0n;
    const sent = this.#move(token, tokenAddr, routerAddr, router.feeRecipient, bal, events);
    events.push({ name: 'FeesFlushed', args: { token: getAddress(tokenAddr), feeHandle: sent } });
    return { events, returned: sent };
  }

  // ---- token --------------------------------------------------------------------------------

  #tokenCall(tokenAddr: string, token: TokenState, tx: CtTx, sender: string, now: number): LedgerReceipt {
    const call = decodeFunctionData({ abi: TOKEN_ABI, data: tx.data });
    const events: LedgerEvent[] = [];
    switch (call.functionName) {
      case 'setOperator': {
        const [operator, until] = call.args;
        let ops = token.operators.get(sender);
        if (!ops) {
          ops = new Map();
          token.operators.set(sender, ops);
        }
        ops.set(lc(operator), until);
        events.push({ name: 'OperatorSet', args: { holder: getAddress(sender), operator, until } });
        return { events, returned: null };
      }
      case 'confidentialTransfer': {
        const [to, amount] = call.args;
        if (!this.#rec(amount).allowed.has(sender)) revert('ERC7984UnauthorizedUseOfEncryptedAmount');
        const h = this.#move(token, tokenAddr, sender, lc(to), this.#rec(amount).value, events);
        return { events, returned: h };
      }
      case 'unwrap': {
        const [from, to, amount] = call.args;
        if (!this.#rec(amount).allowed.has(sender)) revert('ERC7984UnauthorizedUseOfEncryptedAmount');
        if (lc(from) !== sender && !this.#isOperator(token, lc(from), sender, now)) revert('ERC7984UnauthorizedSpender');
        const burned = this.#move(token, tokenAddr, lc(from), null, this.#rec(amount).value, events);
        this.#rec(burned).publicDecryptable = true;
        token.unwrapRequests.set(burned, lc(to));
        events.push({ name: 'UnwrapRequested', args: { receiver: to, unwrapRequestId: burned, amount: burned } });
        return { events, returned: burned };
      }
      case 'finalizeUnwrap': {
        const [id, cleartext, proof] = call.args;
        const receiver = token.unwrapRequests.get(id);
        if (receiver === undefined) revert('InvalidUnwrapRequest');
        token.unwrapRequests.delete(id);
        const pd = this.publicDecrypt(id);
        if (proof !== pd.proof || cleartext !== pd.cleartext) revert('invalid decryption proof');
        const r = receiver as string;
        token.underlying.set(r, (token.underlying.get(r) ?? 0n) + cleartext);
        return { events, returned: null };
      }
      default:
        return revert('unsupported token function');
    }
  }

  // ---- primitives -----------------------------------------------------------------------------

  #token(addr: string): TokenState {
    const t = this.#tokens.get(lc(addr));
    if (!t) return revert('unknown token');
    return t;
  }

  #rec(handle: Hex): HandleRec {
    const r = this.#handles.get(handle);
    if (!r) return revert('unknown handle');
    return r;
  }

  #newHandle(value: bigint, allowed: readonly string[]): Hex {
    const handle = bytesToHex(this.#random());
    if (this.#handles.has(handle)) return revert('handle collision');
    this.#handles.set(handle, { value, allowed: new Set(allowed), publicDecryptable: false });
    return handle;
  }

  #allow(handle: Hex, who: readonly string[]): void {
    const r = this.#rec(handle);
    for (const w of who) r.allowed.add(w);
  }

  #isOperator(token: TokenState, holder: string, spender: string, now: number): boolean {
    return holder === spender || now <= (token.operators.get(holder)?.get(spender) ?? 0);
  }

  #credit(token: TokenState, tokenAddr: string, to: string, amount: bigint): void {
    token.balances.set(to, (token.balances.get(to) ?? 0n) + amount);
    this.#refreshHandle(token, tokenAddr, to);
  }

  #refreshHandle(token: TokenState, tokenAddr: string, who: string): void {
    const h = this.#newHandle(token.balances.get(who) ?? 0n, [who, tokenAddr]);
    token.balanceHandles.set(who, h);
  }

  /** ERC-7984 `_update`: moves `min(amount, balance ? amount : 0)`; `to === null` burns. Returns the transferred handle. */
  #move(token: TokenState, tokenAddr: string, from: string, to: string | null, amount: bigint, events: LedgerEvent[]): Hex {
    const bal = token.balances.get(from) ?? 0n;
    const moved = bal >= amount ? amount : 0n;
    token.balances.set(from, bal - moved);
    this.#refreshHandle(token, tokenAddr, from);
    if (to !== null) this.#credit(token, tokenAddr, to, moved);
    const transferred = this.#newHandle(moved, [from, tokenAddr, ...(to === null ? [] : [to])]);
    events.push({ name: 'ConfidentialTransfer', args: { from: getAddress(from), to: to === null ? '0x0000000000000000000000000000000000000000' : getAddress(to), amount: transferred } });
    return transferred;
  }
}
