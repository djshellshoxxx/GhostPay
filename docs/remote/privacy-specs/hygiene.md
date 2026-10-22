# Privacy spec: Own-leak hygiene (`@ghostpay/hygiene`)

Status: spec only, 2026-10-21. Branch `claude/remote-extensions-1`. Testnet PoC (Sepolia, Base Sepolia). Effort: S-M. Rank 1 and 2 of `docs/remote/anonymization-research.md` section 12 (roadmap).

Legal: deferred by the owner (ADR-0006, research section 11). This spec is address hygiene only, not an obfuscation service; it adds no fee and no custody. Noted once, not a blocker.

Evidence tags: [R] read in this repo, [P] primary source, [U] unverified/derived. No new standards are invented.

## 1. Goal

Stop GhostPay's own client from re-linking what the stealth scheme unlinked, with client-side defaults and one optional contract change:

1. Fresh, self-derived destination for every sweep (research L4/L5, D1).
2. No consolidation of several stealth addresses into one destination, in one block or ever (L5).
3. Receipt and balance verification that does not send a matched stealth address to the RPC (L7, D8, research 9.6).
4. Gas-buffer value rounded onto a coarse shared grid, plus dust handling and a self-funding guard (L9, L12, ERC-5564 funding rule).
5. Evaluate and, if worth it, reduce `Swept` event linkage (section 4.6; conclusion: little to gain).

## 2. Threat addressed, and what it does NOT protect

Addressed:

| ID | Leak | Observer | Fix here |
|---|---|---|---|
| L4 | `Swept(token, owner, destination, ...)` and ERC-20 `Transfer(owner, destination)` link S1 to the destination | Everyone | Destination is a fresh address never used elsewhere, so the link ends at a throwaway (HY-DST) |
| L5 | S1..Sk swept to one destination cluster as one owner | Everyone | One destination per source (HY-CON) |
| L7 | `eth_getBalance`/`eth_getTransactionCount`/`eth_call balanceOf` on S1 tell the RPC "this IP owns S1" ([R] `apps/web/src/lib/sweep.ts:54,171`, `Sweep.tsx:38`) | RPC provider | Address-free verification (HY-VER) |
| L9 | Buffer = `ceil(gas*maxFee*(10000+safety)/10000)` wei fingerprints the client and quote moment ([R] `chain-adapters/src/fees.ts:102`) | Everyone | Round up to a 1-2-5 grid (HY-BUF) |
| funding | Owner tops up S1 from a known wallet (ERC-5564 Security Considerations, status Final [P]: https://eips.ethereum.org/EIPS/eip-5564, retrieved 2026-10-21) | Everyone | Hard stop on known-wallet funding (HY-FUND) |

NOT protected (must be stated in UI and `docs/user/privacy-limits.md`):

- Payer still knows S1 and sees the sweep; a fresh destination only hides the destination from being already-known, it does not hide the S1 -> D link from the payer or any chain observer (D1). Fresh destination is address hygiene, not unlinkability. The research already says: "call it address hygiene, not anonymization" [R, anonymization-research 3.x].
- The relayer sees owner, destination, amount, timing, IP (PA-ADV3 [R]). Quote and sweep share the tuple (PO-COR-3).
- If the seller later spends D together with other funds, D is clustered with them. Hygiene stops at D.
- Timing (L10) is not addressed here; sweep jitter is a separate spec.
- A decoy-batched or block-scoped RPC read hides which address matters only against the RPC operator, not against a global observer, and not against an RPC that also sees your IP across sessions.
- The ERC-20 `Transfer` log is emitted by the token, so removing fields from `Swept` does not remove the S1 -> D link (section 4.6).

## 3. User-visible options

Settings -> "Sweep hygiene" (stored in `ghostpay.settings.v1`, non-secret):

| Option | Values | Default |
|---|---|---|
| Sweep destination | `self-derived` (default) / `external-fresh` (user pastes a new address; warned, not verifiable without an address-naming read) / `external-reuse` (advanced, typed confirmation, shows linked sources) | `self-derived` |
| Verification mode | `address-free` (default) / `direct` (per-address reads; labelled "tells your RPC which address is yours") | `address-free` |
| Buffer rounding | `grid125` (default) / `sig2` (2 significant figures) / `off` (exact; labelled "fingerprints this client") | `grid125` |
| Sweep native dust to the same destination | on / off | on |
| Known-wallet guard | on (default) / off | on |

Sweep view additions: destination row shows "Fresh address #n (derived from your keys)" with the full address; a "linked sources" list for any destination; a modal block when the chosen destination already received a sweep from another source.

## 4. Architecture

### 4.1 Fresh self-derived destination (HY-DST)

Derive D as an ordinary scheme-1 stealth address of the seller's own meta-address, so it is indistinguishable from any received payment and needs no announcement and no stored state.

```
seed   = HKDF-SHA256(ikm = spendingSecret, salt = "ghostpay/hygiene/v1", info = "dest" || u32be(chainId?) NOT USED || u32be(index), L = 32)
rng_i  = counter-mode byte stream: block_j = HKDF-Expand(seed, "rng" || u32be(j), 32)
D_i    = deriveStealthPayment(ownMetaAddress, rng_i).stealthAddress     // @ghostpay/core-crypto, [R] stealth.ts:111, RandomSource = Pick<Crypto,'getRandomValues'>
secret = deriveStealthSecret({stealthAddress, ephemeralPublicKey: R_i, metadata: viewTag}, keys)   // [R] stealth.ts:196
```

- Chain id is not mixed in: the same D on two chains would link them only if both are swept to it; HY-CON ledger is per `(chainId, D)` and the derivation index is global, so chains use disjoint indices from the ledger (allocation is by `nextIndex`, never reused).
- Index allocation: `nextIndex` = max(ledger index)+1 persisted in the encrypted keystore export (`apps/web/src/lib/keystore.ts`); recovery without the ledger: scan indices 0..N (default N=200) for balance via address-free log read (HY-VER-3).
- Recovery: because `rng_i` is a function of the spending secret and index, D_i's private key is rederivable from the seed phrase/keystore alone. No ephemeral key needs storing, no announcement posted. (If the user prefers scanner discoverability, an optional `announce` mode posts a normal ERC-5564 announcement; off by default because it costs gas and adds an on-chain object.)
- `spendingSecret` use stays inside `@ghostpay/secret-box`/`requireSession()` scope; the derivation function takes a `SecretScalar` callback, never returns the seed (see `docs/remote/specs/secret-box.md`).
- Client-only. No contract change.

### 4.2 No consolidation (HY-CON)

Local ledger `DestLedger` (IndexedDB via `idbStore.ts`, included in keystore export): rows `{chainId, destination, sources: Address[], firstUsedBlock?}`. Rules enforced in the client before signing:

- A destination may receive from exactly one source address. A second source to the same destination is refused (`self-derived`: structurally impossible since each index is used once; `external-*`: checked against the ledger).
- No batch UI: Sweep view sweeps one `(source, token)` at a time. "Sweep all" iterates sequentially, each to a new index, with a jitter gap taken from `apps/web/src/lib/jitter.ts` ([R] exists).
- Same-block guard: two sweeps by one session within the same block number (read from head, no address) are serialised by waiting >= 1 block + jitter. Rationale: same-block, same-relayer sweeps cluster by timing [U].
- Relayer: no batching today ([R] service.ts handles one sweep per tx); requirement HY-CON-5 keeps it that way.
- Client-only. No contract change.

### 4.3 Address-free verification (HY-VER)

Replace per-address reads with token/event-scoped reads keyed on public data the client already downloaded.

- Payment receipt (post-scan): for a matched announcement at block B in tx T, `eth_getLogs({address: token, fromBlock: B, toBlock: B, topics: [TRANSFER_TOPIC]})` (topic0 only, no `to` topic). Locally find the log with `transactionHash == T`, `to == stealth`, `value == metadata net`. The RPC learns "someone read Transfers of token X in block B", the same set it served for the scan range.
- Spent-check / balance for a router payment: balance(S1) = net received minus later outflows. Fetch Transfer logs of the token from B to head, topic0 only, filtered locally for `from == S1`; cap range (default 20 000 blocks; bandwidth cost proportional to token activity; on busy tokens such as test USDC the cap bites, then fall back to decoy mode). Direct sends to S1 not through the router are missed: shown as "may be incomplete".
- Native balance: no log exists. Use decoy mode (HY-VER-4) or rely on the buffer amount from the announcement metadata/tx.
- Post-sweep confirmation: after relayer returns `txHash`, poll `eth_getLogs` over `[head-3, head]` topic0 only and match `(from=S1, to=D, value=net)` locally; do NOT call `eth_getTransactionReceipt(txHash)` in address-free mode because a hash lets the RPC resolve from/to/destination ([R] `wallet.ts:277` does this for payer txs; leave unchanged). Fall back to the relayer's own status endpoint if present (it already knows the tuple).
- Decoy mode (`direct` reads unavoidable, e.g. nonce before a direct sweep, `sweep.ts:171`): batch the real read with k=7 decoy addresses drawn at random from other announcements' `stealthAddress` in the same scanned range [R research 9.6(c); U: effect depends on an unrelated-looking set], one JSON-RPC batch, response filtered locally. Decoys must be addresses the user does not own.
- `eth_getBlockReceipts` (non-EIP, client-dependent) is NOT used. [U] availability varies by provider; verify before ever relying on it.
- Client-only. Touches `packages/chain-adapters` (log helper) and `apps/web`.

### 4.4 Gas-buffer rounding, dust, self-funding guard (HY-BUF, HY-FUND)

`roundBuffer(raw: bigint, mode): bigint` rounds UP:

- `grid125`: smallest `m * 10^e` with `m in {1, 2, 5}` and `m*10^e >= raw`. Worst-case overshoot 2x (e.g. 2.01 -> 5). Anonymity set: all clients on the grid share values.
- `sig2`: round up to 2 significant figures. Max overshoot < 10%. Smaller set.
- `off`: raw value.
- Hard cap: result `<= 3 * raw` else error; `maxBufferWei` passed to `payERC20WithBuffer` ([R] CONTRACTS_SPEC 1) is set equal to the rounded value (router reverts `BufferTooLarge` above it).
- Where: composes with `calculateBuffer` in `packages/chain-adapters/src/fees.ts` (unchanged) at the call site in `apps/web/src/lib/pay.ts` / `views/Pay.tsx`.
- Residual: the payer (not the seller) chooses the buffer; the seller's invoice can publish a `bufferGrid` hint; payer clients that ignore it still leak. [U] No payer enforcement possible; router cannot know.
- Dust: after a sweep, `eth_getBalance` of S1 is unread in address-free mode; instead compute `bufferPaid - gasUsedBySweep` locally from relayer/direct-sweep gas figures. If > dust threshold (default 0.2 x one sweep's gas cost), offer a second sweep of native to the SAME destination D (same-destination send adds no new link). If below, leave it.
- Self-funding guard (HY-FUND): the Sweep and Scan views never offer "send ETH to this stealth address" and, if the user pastes a tx from a known wallet (wallet connected via `wallet.ts`, or addresses in ledger/saved), block with the ERC-5564 text. Pure UI. The only supported funding paths are payer buffer, relayer, or (future) 7702 sponsor.

### 4.5 Relayer

No protocol change. Required checks only:
- Relayer logs/metrics must not contain destination or owner (existing PO-LOG; add test AT-PO-12 [R] privacy-ops).
- Relayer must not batch multiple owners into one tx (HY-CON-5).
- Optional (SHOULD, S3-class): refuse a `Sweep` whose `destination` equals another owner's recently seen destination is NOT done: it would require retained state, which reopens PA5 (privacy-ops section 5). Client-side ledger is the enforcer.

### 4.6 `Swept` event linkage: contract change or not

Facts [R]: `event Swept(address indexed token, address indexed owner, address indexed destination, uint256 amount, uint256 fee)` and the token's own `Transfer(owner, destination, net)` are both emitted in the same tx. The Transfer log is unavoidable for any ERC-20 sweep.

- Removing `destination`/`owner` from `Swept` would not remove the link for anyone reading `Transfer`. Gain: only against tooling that indexes `Swept` specifically (it can topic-filter "all sweeps to D"). Marginal.
- Recommended: NO contract change for the PoC (option A, default). Contracts are immutable, redeploy per change; audit surface grows.
- Option B (optional, testnet-only, builds as a new contract so existing one is untouched): `GhostPaySweepRelayerV2` with `event Swept(address indexed token, uint256 fee)` (only what the relayer's operator needs for accounting: no owner, destination, amount). Everything else byte-identical (EIP-712 domain version stays signed over full tuple, domain `name = "GhostPaySweepRelayerV2"`). Stated benefit: removes a GhostPay-specific index label. Stated non-benefit: Transfer log link persists; amount hidden in event but visible in Transfer.
- Option C (rejected): sweeping via a pooled intermediary contract; out of scope, creates a mixer-like object (legal deferred, but also adds custody).

## 5. Package and directory ownership for the build

New package (owner: hygiene build agent; no overlap):

```
packages/hygiene/
  package.json            name @ghostpay/hygiene, private, UNLICENSED, type module; deps: @ghostpay/core-crypto, @ghostpay/chain-adapters (types), @noble/hashes 2.4.0 (same pin as core-crypto; do NOT introduce a second noble major, S3-24)
  tsconfig.json tsconfig.build.json vitest.config.ts README.md DEVIATIONS.md
  src/index.ts
  src/destination.ts      deriveFreshDestination, recoverDestinationKey, hkdfRng
  src/ledger.ts           DestLedger (pure in-memory model + (de)serialise; storage injected)
  src/consolidation.ts    assertNoConsolidation, sameBlockGate
  src/verify.ts           addressFreeReceipt, spentCheck, pickDecoys, buildDecoyBatch
  src/buffer.ts           roundBuffer, bufferDust
  src/guard.ts            fundingGuard
  src/*.test.ts
```

Optional contract (Option B only): `packages/contracts/src/GhostPaySweepRelayerV2.sol`, `packages/contracts/test/GhostPaySweepRelayerV2.t.sol`, `packages/contracts/test/GhostPaySweepRelayerV2.invariant.t.sol`. New files only.

Edits to existing code (listed separately; other contributors own these files, coordinate before merging):

| File | Edit |
|---|---|
| `apps/web/src/views/Sweep.tsx` | default destination from `deriveFreshDestination`; ledger checks; address-free balance (replace `readBalance` at line 38 per verification mode); dust prompt; hygiene notices |
| `apps/web/src/lib/sweep.ts` | `checkDestination` also takes ledger; `directSweep` nonce read uses decoy batch (line 171); `readBalance` gated by mode |
| `apps/web/src/views/Scan.tsx` | post-scan receipt check via `addressFreeReceipt` |
| `apps/web/src/views/Settings.tsx`, `apps/web/src/lib/settings.ts` | five options in section 3, `sanitizeSettings` fields |
| `apps/web/src/lib/pay.ts`, `apps/web/src/views/Pay.tsx` | apply `roundBuffer` before building `payERC20WithBuffer`; set `maxBufferWei` |
| `apps/web/src/lib/keystore.ts`, `idbStore.ts` | persist/export `DestLedger` |
| `packages/chain-adapters/src/logs.ts` (or new `transferLogs.ts`) | `fetchTransferLogs(client, token, from, to)` topic0-only helper; no address filter; same range/size caps as `fetchAnnouncements` |
| `docs/user/privacy-limits.md` | add the NOT-protected list of section 2 |
| `apps/relayer/src/*.test.ts` | add AT-HY-7 (no destination in logs/metrics); no source change |

## 6. Interfaces

```ts
// destination.ts
export interface FreshDestination { readonly index: number; readonly address: Address; readonly ephemeralPublicKey: Hex; readonly viewTag: Hex; }
export function deriveFreshDestination(ownMeta: string, withSeed: <T>(f: (seed: Uint8Array) => T) => T, index: number): FreshDestination;
export function recoverDestinationKey(keys: Pick<StealthKeySet,'viewingSecret'|'spendingSecret'>, d: FreshDestination): SecretScalar;
export function hkdfRng(seed: Uint8Array): Pick<Crypto,'getRandomValues'>;   // deterministic; rejection-sampling retries advance the counter

// ledger.ts
export interface LedgerRow { readonly chainId: number; readonly destination: Address; readonly sources: readonly Address[]; readonly index?: number; }
export class DestLedger {
  nextIndex(): number;
  canUse(chainId: number, destination: Address, source: Address): { ok: true } | { ok: false; reason: 'DEST_HAS_OTHER_SOURCE' | 'DEST_IS_OWN_SOURCE' | 'DEST_IS_PROTOCOL' };
  record(chainId: number, destination: Address, source: Address, index?: number): void;
  toJSON(): LedgerRow[]; static from(rows: unknown): DestLedger;   // strict parse, unknown fields rejected
}

// consolidation.ts
export function sameBlockGate(lastSweepBlock: bigint | undefined, head: bigint): { wait: boolean; minBlock: bigint };

// verify.ts
export interface TransferLog { readonly transactionHash: Hex; readonly blockNumber: bigint; readonly from: Address; readonly to: Address; readonly value: bigint; }
export function parseTransferLogs(raw: unknown): TransferLog[];                       // topic0 = keccak256("Transfer(address,address,uint256)"), 3 topics, 32-byte data; else ignored
export async function addressFreeReceipt(rpc: Pick<RpcClient,'request'>, a: { token: Address; block: bigint; txHash: Hex; stealth: Address; net: bigint }): Promise<'confirmed'|'mismatch'|'absent'>;
export async function sweepConfirmed(rpc: Pick<RpcClient,'request'>, a: { token: Address; from: Address; to: Address; net: bigint; head: bigint; lookback?: number }): Promise<boolean>;
export function pickDecoys(pool: readonly Address[], exclude: readonly Address[], k: number, rng: Pick<Crypto,'getRandomValues'>): Address[];
export async function batchedRead(rpc: Pick<RpcClient,'request'>, real: ReadCall, decoys: Address[]): Promise<unknown>;   // one batch, shuffled order, only the real answer returned

// buffer.ts
export type BufferRounding = 'grid125' | 'sig2' | 'off';
export function roundBuffer(raw: bigint, mode: BufferRounding): bigint;               // round up, throws if result > 3*raw or raw <= 0
export function bufferDust(paid: bigint, gasUsed: bigint, effectiveGasPrice: bigint): bigint;

// guard.ts
export function fundingGuard(from: Address, known: { wallets: readonly Address[]; destinations: readonly Address[] }): { allow: boolean; message?: string };
```

Contract ABI (Option B only) differs from [R] CONTRACTS_SPEC section 2 in one line:

```solidity
event Swept(address indexed token, uint256 fee);   // no owner, destination, amount
```

Functions `sweepWithPermit`, `sweep`, `nonceUsed`, `DOMAIN_SEPARATOR`, struct `Sweep`/`PermitSig`, errors, and SWEEP_TYPEHASH unchanged; domain name `"GhostPaySweepRelayerV2"`.

## 7. Requirements (numbered, testable)

Destination
- HY-DST-1 (MUST): Default destination is a self-derived stealth address; the client MUST NOT prefill any previously used address.
- HY-DST-2 (MUST): `deriveFreshDestination(meta, seed, i)` is deterministic: same inputs give same address; different `i` give different addresses.
- HY-DST-3 (MUST): The private key of D_i is recoverable from `(keys, i)` alone via `recoverDestinationKey`, and `addressOfSecret(secret) == D_i`.
- HY-DST-4 (MUST): D_i passes the same address validity as any stealth address (view tag byte matches `deriveStealthSecret`); no on-chain announcement is required.
- HY-DST-5 (MUST): `seed` and spending secret never leave the callback scope and are zeroized on return and on throw.
- HY-DST-6 (SHOULD): `nextIndex` is persisted in the keystore export; recovery scans 0..200 address-free.
- HY-DST-7 (MUST): Choosing `external-reuse` requires a typed confirmation and lists every prior source.

Consolidation
- HY-CON-1 (MUST): `DestLedger.canUse` rejects a destination already recorded with a different source on the same chain.
- HY-CON-2 (MUST): The sweep UI processes one `(source, token)` per action; "sweep all" is sequential, never one signature or tx for multiple sources.
- HY-CON-3 (MUST): `sameBlockGate` blocks a second sweep in the same block as the previous one by the same session.
- HY-CON-4 (MUST): `DestLedger.from(untrusted)` rejects unknown fields, bad addresses, duplicate (chain, destination) rows.
- HY-CON-5 (MUST): The relayer submits one sweep per transaction (no multicall of several owners).

Verification
- HY-VER-1 (MUST): In `address-free` mode, during receipt and post-sweep checks, no RPC request contains the stealth address, destination or owner in params (including `topics` and `address`) other than the token contract address.
- HY-VER-2 (MUST): `addressFreeReceipt` returns `mismatch` if the log's `value` differs from metadata `net` or `to != stealth`, `absent` if no matching tx hash log in block.
- HY-VER-3 (SHOULD): Spent-check by Transfer logs is range-capped (20 000 blocks) and reports "may be incomplete" if capped or if direct non-router sends are possible.
- HY-VER-4 (MUST): Where a per-address read is unavoidable, send it in one batch with k=7 decoys from other announcements, not owned by the user, shuffled; return only the real answer.
- HY-VER-5 (MUST): `direct` mode shows a persistent label "tells your RPC which address is yours".
- HY-VER-6 (MUST NOT): Do not use `eth_getBlockReceipts` or any non-standard method [U].
- HY-VER-7 (MUST): Log parsing is strict (topics length, hex lengths); malformed entries are dropped, not thrown into UI state.

Buffer
- HY-BUF-1 (MUST): `roundBuffer(raw, mode) >= raw` for every mode except it equals `raw` for `off`.
- HY-BUF-2 (MUST): `grid125` output is `m * 10^e` with `m in {1,2,5}`; `sig2` output has <= 2 significant digits.
- HY-BUF-3 (MUST): output `<= 3 * raw`, else throws `INVALID_INPUT`; `raw == 0` throws.
- HY-BUF-4 (MUST): `maxBufferWei` passed on-chain equals the rounded value; the on-chain `BufferTooLarge` path is never hit by the client.
- HY-BUF-5 (SHOULD): Default is `grid125`; UI shows exact raw, rounded, and extra cost.
- HY-DUST-1 (SHOULD): Native dust above threshold is swept only to the same destination as the token sweep.
- HY-FUND-1 (MUST): The app has no flow that sends native funds to a stealth address from a connected wallet; `fundingGuard` returns `allow=false` with the ERC-5564 text if the funder is a known wallet or a ledger destination.

Contract (Option B only)
- HY-CTR-1 (MUST): V2 emits `Swept(token, fee)` only; the recovered signer, nonce, deadline and balance-delta checks behave identically to V1 on a shared test vector set.
- HY-CTR-2 (MUST): A test asserts V2 logs contain no `owner`/`destination` topic or data, and that the token `Transfer` log still does (documents non-benefit).
- HY-CTR-3 (MUST): Fuzz and invariants from `docs/CONTRACTS_SPEC.md` section 5 re-run for V2 (single-use nonce; relayer cannot alter destination/amount/fee).

## 8. Test plan

Unit/property (vitest, `packages/hygiene`, fast-check):
- AT-HY-1 (HY-DST-2/3/4): vectors for 5 indices; recovered key matches address; property: all addresses distinct for 1000 indices; determinism across runs; deterministic RNG stream passes `randomScalar` rejection path (inject a stream returning an out-of-range block first).
- AT-HY-2 (HY-DST-5): secret zeroized after callback and after throw.
- AT-HY-3 (HY-CON-1/4): ledger rejects second source; strict-parse fuzz.
- AT-HY-4 (HY-BUF-1..3): property over `raw in [1, 2^128)`; boundary at exactly 1, 2, 5, 10; `3*raw` cap case.
- AT-HY-5 (HY-VER-1/2/7): mock `rpc.request` records all params; assert none contain the stealth/owner/destination strings (case-insensitive, also padded 32-byte topic form); malformed log fuzz.
- AT-HY-6 (HY-VER-4): decoys exclude owned, `k` distinct, order shuffled; real answer returned.
Integration:
- AT-HY-7 (HY-CON-5, PO-LOG): relayer anvil e2e (`apps/relayer/src/e2e.anvil.test.ts`, skips when anvil absent): two sweeps from two owners produce two txs; grep logs/metrics for destination/owner, none.
- AT-HY-8 (UI): Sweep.test.tsx: default destination shown, second sweep to same destination blocked, reuse needs typed confirmation, funding guard text rendered.
- AT-HY-9 (egress): extend Playwright egress test (privacy-ops AT-PO-1) with a request recorder; in `address-free` mode no request body contains the matched stealth address.
Contracts (Option B): V2 unit, fuzz 10 000, invariants 256x50, and event-shape test (HY-CTR-2).
Testnet trace (acceptance): one Base Sepolia end-to-end run captured with a logging RPC proxy.

## 9. PoC acceptance criteria

1. On Base Sepolia: pay 3 times from one payer to the same seller via router with buffer; sweep each to a different self-derived D; no two share a destination; on-chain, three `Swept`/`Transfer` pairs each with a distinct destination.
2. The recorded RPC trace for scan + receipt + post-sweep confirmation in `address-free` mode contains zero requests naming the matched stealth address or D.
3. Buffer values observed in the three payments are all on the 1-2-5 grid; `off` mode produces non-grid values (control).
4. D_i keys recoverable from the keystore alone after clearing site data (rederive and sign a dummy message).
5. Attempting to sweep a second source to an already used destination is refused in the UI.
6. All unit and property tests green; no new third-party dependency beyond `@noble/hashes` 2.4.0.
7. Section 2 NOT-protected text present in UI and `docs/user/privacy-limits.md`.

## 10. Effort

- Client-only (HY-DST, HY-CON, HY-VER, HY-BUF, HY-FUND): M (about 5-8 engineering days incl. UI and tests).
- Option B contract: S (about 1-2 days) but not recommended; included so the user can choose.
- Total PoC: M. Client-only is sufficient for everything except the `Swept` event.

## 11. Risks

- Address-free log reads cost bandwidth on busy tokens; cap and fall back to decoys.
- Decoy anonymity is weak against an RPC that sees repeated sessions from one IP [U]; use with Tor/OHTTP specs when available.
- Deterministic derivation couples D_i to the spending secret: spending-key theft also reveals all future/past D_i (they are the seller's own funds anyway). Domain separation via salt/info keeps them from colliding with scheme-1 payer derivations.
- 1-2-5 rounding costs up to 2x gas buffer paid by the payer; surplus becomes dust stranded in S1 unless swept.
- Payer-chosen buffers: hygiene is only as good as the payer's client.
- Ledger loss: an `external-*` user could consolidate unknowingly; self-derived mode has no such state.
- False sense of privacy: UI copy must keep "address hygiene, not anonymity" wording.

## 12. Open questions

- Q1. Should `announce` mode (post an ERC-5564 announcement for D) exist at all, given gas and a label on D?
- Q2. Default decoy count k=7 and spent-check cap 20 000 blocks are unmeasured guesses [U]; measure on Base Sepolia.
- Q3. Does the owner want Option B at all (marginal), or reserve the contract revision for the 7702 / Privacy Pools work?
- Q4. Can `external-fresh` be verified fresh without an address-naming read? Candidate: decoy batch of `eth_getTransactionCount` (HY-VER-4); unverified.
- Q5. Payer-side grid hint in the invoice schema (`packages/invoice-schema`): new optional field, versioning impact.

## 13. Sources

- ERC-5564 (Final), Security Considerations on funding: https://eips.ethereum.org/EIPS/eip-5564, retrieved 2026-10-21 (quoted via `docs/remote/anonymization-research.md` 4.4 [P]; not re-fetched in this run, treat as [U] until re-fetched).
- Repo: `packages/contracts/src/GhostPaySweepRelayer.sol` (`Swept`, `_execute`), `packages/contracts/src/GhostPayRouter.sol` (`payERC20WithBuffer`), `packages/chain-adapters/src/fees.ts`, `packages/core-crypto/src/stealth.ts`, `apps/web/src/lib/sweep.ts`, `apps/web/src/views/Sweep.tsx`.
- Research: `docs/remote/anonymization-research.md` 4.4, 9.6, 12; `docs/remote/security-specs/privacy-ops.md` PO-COR-*.
