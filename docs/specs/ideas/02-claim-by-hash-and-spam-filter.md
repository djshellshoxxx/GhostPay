# Idea 02 (B7): claim-by-transaction-hash, tag-ignoring deep scan, and inbox spam filter

Status: draft spec | Priority: shortlist #3 (ideas.md) | Effort: M (7-9 d; ideas.md said S, which did not include amount verification or the deep scan) | Owner: core-crypto + chain-adapters + apps/web | Date: 2026-10-21
Closes: THREAT_MODEL D4 (payer-controlled view tag hides a payment) and, together with section 6, S3-02 (forged announcement amounts). Implements and corrects spec 02 rules 2-3. Plan: [../../remote/plans/ideas/02-claim-by-hash-and-spam-filter.md](../../remote/plans/ideas/02-claim-by-hash-and-spam-filter.md)

Facts below were read from the repo on 2026-10-21: `packages/core-crypto/src/{stealth,keys,metadata,secret}.ts`, `packages/chain-adapters/src/{logs,rpc}.ts`, `config/tokens.ts`, `apps/web/src/lib/{scannerCore,scanClient,payExec,tags,session}.ts`, `views/Scan.tsx`, `docs/CONTRACTS_SPEC.md` (router rules), `docs/threat-model/THREAT_MODEL.md` (D3, D4, S3-02), ADR-0001/0003/0011. Anything else is marked UNVERIFIED.

**Hard constraint.** Everything runs in the seller's or payer's browser from static files. The only network counterparts are the RPC endpoint(s) the user configured (and the optional proxy of spec 10). No GhostPay-run lookup service, relay, mailbox or indexer exists or is introduced. The payer hands the claim code to the seller over whatever channel they already use (email, chat, paper). Anything that would need a server is rejected in section 13.

---

## 1. Problem (what is true today)

1. `checkAnnouncement` (core-crypto) computes `S = v*R`, compares `keccak256(S)[0]` with `metadata[0]`, and returns `{matches:false}` on mismatch **before** deriving the address. `deriveStealthSecret` throws `VIEW_TAG_MISMATCH`. So a payment whose announcement carries a wrong tag is invisible to the scanner **and cannot be swept by the app even if the seller finds it by hand**.
2. The router enforces `metadata.length == 57`, selector, token and `net` against measured balance deltas, but `metadata[0]` (tag) and the curve validity of `R` are unconstrained (CONTRACTS_SPEC rules). A direct payer (no router) controls everything: tag, metadata amount, token field, whether it announces at all, and in which transaction.
3. Scan matches show the amount decoded from metadata (`Scan.tsx describe()`), for router and non-router announcements alike. For non-router announcements this is an unverified payer claim (S3-02). Non-allowlisted tokens are shown with their raw amount.
4. `docs/user/receive-and-scan.md` tells sellers to "ask for the transaction hash and look at the transaction", but the app has no way to test a transaction against the keys.
5. **Correction to spec 02 rule 2.** Spec 02 says the scanner should "derive stealth address from invoice nonce/ephemeral" for active invoices. That is not implementable: the ephemeral scalar `r` is sampled by the payer at pay time (`deriveStealthPayment` -> `randomScalar`), and the invoice schema (`packages/invoice-schema/src/schema.ts`) carries no ephemeral key or expected stealth address. The seller cannot know the one-time address until it sees `R`. This spec replaces rule 2 with (a) a bounded tag-ignoring **deep scan** and (b) **claim-by-hash**. Spec 02 must be amended to point here.

### 1.1 Cases this spec must handle

| # | What happened on chain | Today | After this spec |
|---|---|---|---|
| C1 | Router payment, correct tag | found | found, amount `verified-by-router` |
| C2 | Announcement with valid `R` but wrong tag (any emitter path) | missed; unsweepable | found by deep scan or claim; sweepable (address equality still enforced) |
| C3 | Announcement in a different tx than the transfer (direct payer) | found by tag if tag right; amount unverified | claim accepts both hashes; amount verified from the transfer tx |
| C4 | Transfer to the stealth address, **no announcement** or `R` invalid/off-curve | missed | found only if the payer supplies `R` in the claim code; otherwise reported as `needs-ephemeral` |
| C5 | Payer never kept `r` and never published `R` | missed | **unrecoverable** for anyone (honest failure; section 9) |
| C6 | Forged announcement: right tag, claimed amount, no transfer | shown as paid | `unverified` category, amount not shown as received |
| C7 | Dust or unknown token sent to a real stealth address of the seller (anyone holding one invoice can do this) | shown like a payment | `dust` / `unknown-token` category, hidden from the default view, sweep blocked by default |
| C8 | Non-allowlisted token contract that emits fake `Transfer` events | amount shown | never `verified`; `unknown-token` |

## 2. Goals and non-goals

Goals
- G1. A seller can paste a claim code or bare tx hash and get a definite answer: yours / not yours / not found / needs `R` / reverted / pending, with a verified amount when possible.
- G2. A payment with a wrong view tag is sweepable once found; the safety check is the address equality, not the tag.
- G3. Optional deep scan over a bounded block window ignores the tag, at a measured, displayed CPU cost.
- G4. No amount is displayed as "received" unless verified by one of the rules in section 6.
- G5. A local, reversible inbox filter separates dust, unknown tokens, unverified claims and reverted claims from verified payments. Nothing is ever deleted; hidden counts are always shown.
- G6. Payer side: the Pay success screen and the local receipt carry a claim code with `R`, block and stealth address, so a GhostPay payer can always prove where they paid.
- G7. 100% client-side; key material stays inside the scanner worker exactly as today.

Non-goals
- No server lookup, no push from payer to seller, no on-chain change, no new contract.
- Not a third-party proof of receipt (that is B6 selective-disclosure receipts; B7 only convinces the seller's own app).
- Does not make case C5 recoverable. Does not reduce download size or per-announcement ECDH cost for unrelated announcements (spec 05 handles spam at the announcement level; deep scan *adds* cost).
- Does not classify payers or addresses as malicious; the filter is about what reached the seller's own addresses.
- Does not add a fiat-denominated dust threshold (feeds are disabled, ADR-0012); thresholds are in token units.

## 3. UX

### 3.1 Payer (Pay view, after submit)
- New card "Payment reference for the seller" under the receipt status, shown only after the receipt is known (`status: included`). Shows the claim code (monospace, wrapped), Copy button, QR (existing `QrView`), and text: "Send this to the seller only if they cannot find your payment. It contains the transaction hash and the one-time address you paid. Anyone who sees it can link this payment to this invoice."
- The downloaded local receipt becomes version 2 (section 4.2) and contains the claim code.
- No claim code is shown before inclusion (a pending hash can be dropped or replaced).

### 3.2 Seller (Scan view), panel "Find a payment by transaction hash"
Fields: chain (preselected from Scan), text area "Claim code or transaction hash", optional "Block number" (prefilled from the code; helper text: "With a block number the app asks your RPC for the whole block, so it does not learn which transaction you care about"), optional second tx hash ("Transfer transaction, if different"), button "Check".
Result card states (one, exact copy in the copy deck):
- **Found, amount confirmed**: "This payment is yours: 12.50 USDC received at 0xAbc... in block N (k of K confirmations)." Badge `tag ok` / `wrong view tag` (explains: "The payer published a wrong view tag. Normal scans would not have found it.").
- **Found, amount not confirmed**: "This announcement is addressed to you, but no matching token transfer was found in this transaction. Treat it as not paid." Shows the claimed amount struck through.
- **Not yours**: "None of the announcements or transfers in this transaction are addressed to your keys." (never reveals which keys were tried).
- **Needs the payer's ephemeral key**: "This transaction sends tokens to addresses but publishes no usable announcement. Ask the payer for the full claim code from their GhostPay receipt (it contains the key `r=`). Without it nobody can tell whether the payment is yours." Lists recipient addresses.
- **Reverted** / **Not found on your RPC** / **Pending (k of K confirmations)** / **Wrong chain**.
Button on found results: "Add to payments" (merges into the in-memory match list, deduped by id) and the existing tag form.

### 3.3 Seller (Scan view), deep scan
Checkbox under Start scan: "Also check announcements with a wrong view tag (slower)". When ticked, a range control appears: "From block / to block" (defaults: last checkpoint minus `deepScanDefaultBlocks`) and a live estimate: "About X announcements x Y children; estimated extra CPU Z s on this device" (estimate uses a 200-operation micro-benchmark run once per session in the worker, section 7). Hard caps from settings (section 4.6). Results found only by deep scan carry the `wrong view tag` badge.

### 3.4 Inbox filter
Above "Payments found": segmented filter `Payments (n) | Unverified (n) | Dust (n) | Unknown tokens (n) | Reverted (n) | All`. Default `Payments`. A line "k items hidden by filters" is always visible when k > 0. Settings page "Inbox" section: dust threshold per allowlisted token and per native asset (token units, decimals from `TOKENS`), toggle "Show unknown tokens in Payments" (default off). A tagged match (tag vault record) is never put in `dust` (the seller labelled it, so it matters), but can still be `unverified`/`unknown-token`.

### 3.5 Sweep view
- Sweeping a match in `unknown-token` is blocked by default; an "I understand" override explains: "Sweeping calls this token's contract. It is not on the allowlist; it may revert, waste gas, or behave unexpectedly. Sweeping also links this address to your destination on chain."
- Sweeping a `dust` match shows: "This amount is below your dust threshold. Sweeping it costs gas and links this one-time address to your destination. Unsolicited dust is a known tracking technique."
- Sweeping an `unverified` match is impossible for ERC-20 (balance would be zero anyway; the sweep path reads `balanceOf` first, `sweep.ts readBalance`).

### 3.6 Copy rules
Never "spam" as a label for allowlisted verified payments above threshold; never "safe", "private", "anonymous". Use "not confirmed", never "fake" (the seller cannot know intent).

## 4. Formats, types and APIs

### 4.1 Claim code (text, version 1)
```
ghostpay-claim:1?c=<chainId>&tx=<txhash>[&tx2=<txhash>][&b=<block>][&li=<logIndex>][&r=<ephemeral>][&a=<stealth>]
```
Grammar (strict; the parser rejects anything else):
- Prefix exactly `ghostpay-claim:1?`. Keys in exactly the order above; each at most once; unknown keys rejected.
- `c`: decimal, 1-10 digits, no leading zero, must be a chain known to `findChain`.
- `tx`, `tx2`: `0x` + 64 lowercase hex. `tx2` = transfer transaction when it differs from the announcement transaction (case C3).
- `b`: decimal block number of `tx`, 1-15 digits, no leading zero (or `0`).
- `li`: decimal log index of the announcement within the block, 1-6 digits.
- `r`: `0x` + 66 lowercase hex, compressed point `02|03`, validated by `parseCompressedPoint` (case C4).
- `a`: `0x` + 40 lowercase hex (the payer's view of the stealth address; a hint, never trusted).
- Total length <= 400 characters. Surrounding whitespace trimmed; internal whitespace and line breaks removed before parsing (QR/email wrapping). Case: prefix and keys lowercase only.
- A bare `0x` + 64 hex input is accepted as `{tx}` with the chain from the selector.
- The code is **never** an app URL or fragment and the app never opens it as a link (consistent with A1 paste-to-import; avoids browser history and link-preview leaks).

```ts
// apps/web/src/lib/claimCode.ts
export interface ClaimInput {
  readonly chainId: number;
  readonly txHash: Hex;
  readonly transferTxHash?: Hex;
  readonly blockHint?: bigint;
  readonly logIndex?: number;
  readonly ephemeralPublicKey?: Hex;   // 33-byte compressed, lowercase
  readonly stealthHint?: Address;      // lowercase
}
export function parseClaimCode(text: string, fallbackChainId?: number): ClaimInput; // throws UserFacingError('This is not a valid payment reference.')
export function formatClaimCode(i: ClaimInput): string;                         // canonical; parse(format(x)) == x
```

### 4.2 Local receipt v2 (payer)
`LocalReceipt` (`payExec.ts`) gains a version 2 with these extra fields; v1 files stay readable by any future importer.
```ts
interface LocalReceiptV2 extends Omit<LocalReceipt, 'version'> {
  readonly version: 2;
  readonly blockNumber?: string;          // decimal, when included
  readonly stealthAddress: Address;       // from BuiltPayment
  readonly ephemeralPublicKey: Hex;       // R, 33 bytes; public on chain for router payments anyway
  readonly announcementLogIndex?: number; // from the receipt logs, when found
  readonly claimCode?: string;            // formatClaimCode(...) when included
}
```
Rationale for including `R`: for router payments `R` is already public in the announcement; including it makes case C4 recoverable for GhostPay-built payments that were later re-sent manually, and it costs nothing in privacy beyond what the receipt already says (amount, time, tx). The UI already warns before download.

### 4.3 core-crypto changes (`stealth.ts`)
```ts
export interface MatchOptions {
  /** Default false. When true, the tag is not used to reject; the address comparison decides. */
  readonly ignoreViewTag?: boolean;
}
export type AnnouncementCheck =
  | { readonly matches: false }
  | { readonly matches: true; readonly stealthAddress: Address; readonly tagMismatch: boolean };

export function checkAnnouncement(a: PublicAnnouncement, viewingSecret: SecretScalar,
  spendingPublicKey: CompressedPoint, opts?: MatchOptions): AnnouncementCheck;

/** Tests an ephemeral key against candidate addresses (claim case C4). Never throws on bad R. */
export function matchEphemeral(ephemeralPublicKey: Uint8Array, candidates: readonly string[],
  viewingSecret: SecretScalar, spendingPublicKey: CompressedPoint): AnnouncementCheck;

export interface DeriveOptions { readonly allowTagMismatch?: boolean }
export function deriveStealthSecret(a: PublicAnnouncement,
  keys: Pick<StealthKeySet, 'viewingSecret' | 'spendingSecret'>, opts?: DeriveOptions): SecretScalar;
/** Same, from (R, expected address) without metadata (case C4 sweep). */
export function deriveStealthSecretFromEphemeral(ephemeralPublicKey: Uint8Array, expected: string,
  keys: Pick<StealthKeySet, 'viewingSecret' | 'spendingSecret'>): SecretScalar;
```
Rules: defaults keep today's behaviour bit-for-bit (existing vectors unchanged). `tagMismatch` is `false` whenever the tag matched. With `ignoreViewTag`/`allowTagMismatch`, the address equality check (already present: derived key -> public key -> address == announced address) remains mandatory and is the only acceptance criterion. `ZERO_HASH`, `INFINITY_POINT` and `ZERO_STEALTH_KEY` handling is unchanged. Empty metadata (no tag byte at all) is acceptable only with `ignoreViewTag` (direct payers may announce with zero-length metadata). `logs.ts validateAnnouncementLog` currently skips logs whose metadata is shorter than 1 byte; it gains an option `{ allowEmptyMetadata: true }` used only by the claim and deep-scan paths, so the normal scan keeps skipping them.

### 4.4 chain-adapters additions (`src/claim.ts`, `src/verify.ts`)
```ts
export interface TransferLog { readonly token: Address; readonly from: Address; readonly to: Address;
  readonly value: bigint; readonly logIndex: number; readonly id: string /* blockHash:logIndex */ }

export interface ClaimEvidence {
  readonly chainId: number;
  readonly txHash: Hex;
  readonly blockNumber: bigint;
  readonly blockHash: Hex;
  readonly status: 'success' | 'reverted';
  readonly txTo: Address | null;
  readonly txValue: bigint;
  readonly confirmations: bigint;
  /** Announcements in this receipt whose emitter is the manifest announcer (validated by validateAnnouncementLog). */
  readonly announcements: readonly ScannedAnnouncement[];
  /** ERC-20 Transfer(address,address,uint256) logs from ANY emitter (trust decided later). */
  readonly transfers: readonly TransferLog[];
  readonly mode: 'by-hash' | 'by-block';
}

export interface ClaimFetchOptions {
  readonly chain: ChainConfig; readonly client: RpcClient; readonly secondary?: RpcClient;
  readonly announcer: Address; readonly txHash: Hex; readonly blockHint?: bigint;
  /** Default true when blockHint is set: use eth_getBlockReceipts and select locally. */
  readonly preferBlockMode?: boolean;
  readonly maxLogs?: number; // default 2000; above it -> CLAIM_TOO_LARGE
}
export async function fetchClaimEvidence(o: ClaimFetchOptions): Promise<ClaimEvidence>;
```
Fetch rules:
1. **by-block** (privacy-padded, used when `blockHint` is known): `eth_getBlockReceipts(blockHint)`; find the receipt whose `transactionHash == txHash`; if absent -> `NOT_FOUND_IN_BLOCK` (offer by-hash with explicit consent copy). If the method is unsupported (`-32601` or `-32602`) -> `BLOCK_MODE_UNSUPPORTED`; the UI asks before falling back to by-hash, never silently. Support of `eth_getBlockReceipts` across providers is **UNVERIFIED**; test against anvil and at least two public providers before claiming it in copy. The tx itself (`to`, `value`) comes from `eth_getBlockByNumber(b, true)` in the same mode, so the RPC still only learns the block.
2. **by-hash**: `eth_getTransactionReceipt(txHash)` and `eth_getTransactionByHash(txHash)`.
3. Both modes: `receipt.blockHash` must equal `getBlock(blockNumber).hash` (canonical-chain check, detects a reorged-away or fabricated receipt); `receipt.transactionHash` must equal the request; all quantities through `parseQuantity`; logs validated (`validateAnnouncementLog` for announcer logs with `from = to = blockNumber`; Transfer logs require exactly 3 topics and 32-byte data, else skipped). With `secondary`, the receipt projection (status, blockHash, logs) and block hash must agree (`requestWithFallbackCheck`), else `RPC_FAILURE 'providers disagree'`.
4. `confirmations = head - blockNumber + 1`; final when `>= chain.finalityDepth`.
5. `tx2` (transfer tx) is fetched the same way; its transfers are merged; its announcements ignored.

```ts
export type AmountVerdict =
  | { readonly kind: 'verified'; readonly token: Address | 'native'; readonly amount: bigint;
      readonly source: 'router' | 'transfer-log' | 'native-tx-value' | 'native-balance-delta' }
  | { readonly kind: 'unverified'; readonly reason: 'no-transfer' | 'token-not-allowlisted' | 'amount-below-claim'
      | 'reverted' | 'native-not-provable' | 'metadata-unparsed' };

export function verifyAmount(i: {
  readonly stealth: Address; readonly claimed: ParsedMetadata | undefined; readonly viaRouter: boolean;
  readonly evidence?: ClaimEvidence; readonly allowlist: readonly TokenConfig[];
  readonly nativeDelta?: bigint; // from verifyNativeDelta, optional
}): AmountVerdict; // pure
export async function nativeBalanceDelta(client: RpcClient, stealth: Address, block: bigint): Promise<bigint | undefined>;
// eth_getBalance(stealth, b) - eth_getBalance(stealth, b-1); undefined when the provider lacks historical state
```
Verification rules (section 6 gives the rationale): evaluated in order, first hit wins.
1. `evidence.status == 'reverted'` -> `unverified/reverted`.
2. `viaRouter` (announcement `caller == manifest.router`, manifest read back per spec 01) and `claimed` parsed -> `verified/router` with `claimed.netAmount`. The router reverts unless the measured balance delta equals `net` (CONTRACTS_SPEC), so a router announcement in a successful tx is proof of delivery. Requires the claimed token be allowlisted for display as a payment; otherwise `unverified/token-not-allowlisted`.
3. ERC-20: sum of `transfers` with `to == stealth` and `token == claimed.token` (or, without metadata, every allowlisted token separately). If the token is not in `allowlist` -> `unverified/token-not-allowlisted` (its events are authored by arbitrary code). If sum >= `claimed.netAmount` -> `verified/transfer-log` with the **observed** sum. If 0 < sum < claimed -> `unverified/amount-below-claim` (shows observed sum). No transfer -> `unverified/no-transfer`.
4. Native: `txTo == stealth` -> `verified/native-tx-value` with `txValue`. Else `nativeDelta` > 0 -> `verified/native-balance-delta` with the delta (labelled "at least", other txs in the block may contribute). Else `unverified/native-not-provable` (internal value transfers leave no log and the provider has no history).
5. Normal scan (no receipt fetched) for non-router matches: `unverified` until the user clicks "Confirm amount", which runs `fetchClaimEvidence` by-block for that match (opt-in, because it adds RPC queries per match; spec 10 transport applies).

### 4.5 Worker protocol (`scannerCore.ts`)
Key material stays in the worker. Additions:
```ts
type ToWorker =
  | { type: 'start'; viewingKey: Uint8Array; spendingPublicKey: string; ignoreViewTag?: boolean }  // + A2: children[]
  | { type: 'batch'; batchId: number; logs: readonly WireLog[] }
  | { type: 'claim'; claimId: number; logs: readonly WireLog[]; ephemeral?: string; candidates?: readonly string[] }
  | { type: 'bench'; ops: number }   // micro-benchmark for the deep-scan estimate
  | { type: 'cancel' } | { type: 'end' };
interface WireMatch { id: string; stealthAddress: string; tagMismatch: boolean; childIndex?: number }
type FromWorker = ... | { type: 'claimResult'; claimId: number; matches: readonly WireMatch[] } | { type: 'bench'; usPerOp: number };
```
`claim` always runs with `ignoreViewTag: true` (one tx, negligible cost). `candidates` are the distinct `to` addresses of `transfers` plus `stealthHint`; tested with `matchEphemeral` only when `ephemeral` is present. The existing no-network test over `scannerCore.ts` and `scanner.worker.ts` must keep passing.

### 4.6 Web types and storage
```ts
// apps/web/src/lib/claim.ts
export type ClaimOutcome =
  | { kind: 'found'; matches: readonly VerifiedMatch[] }
  | { kind: 'not-mine' } | { kind: 'needs-ephemeral'; recipients: readonly Address[] }
  | { kind: 'reverted' } | { kind: 'not-found' } | { kind: 'block-mode-unsupported' } | { kind: 'chain-mismatch' };
export interface VerifiedMatch extends ScanMatch {
  readonly tagMismatch: boolean; readonly source: 'scan' | 'deep-scan' | 'claim';
  readonly amount: AmountVerdict; readonly confirmations: bigint; readonly final: boolean;
  readonly childIndex?: number;              // A2
  readonly transferLogId?: string;           // case C4 (no announcement)
}
export async function runClaim(input: ClaimInput, deps: ClaimDeps): Promise<ClaimOutcome>;

// apps/web/src/lib/inboxFilter.ts
export type InboxCategory = 'payment' | 'unverified' | 'dust' | 'unknown-token' | 'reverted';
export interface InboxSettings {
  readonly v: 1;
  /** key `${chainId}:${tokenLowercase|'native'}`, value decimal base units; missing = 0 (no dust filter). */
  readonly dust: Readonly<Record<string, string>>;
  readonly showUnknownTokens: boolean;     // default false
  readonly deepScanDefaultBlocks: number;  // default 50_000, max 500_000
  readonly deepScanMaxAnnouncements: number; // default 200_000
}
export function categorize(m: VerifiedMatch, s: InboxSettings, allowlist: readonly TokenConfig[], tagged: boolean): InboxCategory;
```
Category precedence: `reverted` > `unknown-token` > `unverified` > `dust` (skipped when `tagged`) > `payment`. Native and allowlisted ERC-20 only can be `payment`.
- `InboxSettings` stored in `localStorage` key `ghostpay.inbox.v1`, sanitized like `settings.ts` (bounds, unknown keys dropped, storage failure tolerated). Thresholds are not secret but are per-device; B1 backup `settings` section should include them.
- Default dust thresholds: allowlisted USD stablecoins 0.10 token (100000 base units for 6 decimals); native 0 (off) until an owner decides; documented as product heuristics.
- `TagPayload` gains optional `source?: 'scan'|'deep-scan'|'claim'` and `transferLogId?`; `validatePayload` accepts their absence (old records stay valid). For case C4 (no announcement), `announcementId` is set to the Transfer log id (same `blockHash:logIndex` shape) and `source: 'claim'`.
- Claim results are **not** persisted outside the tag vault. No claim history, no plaintext tx hashes in web storage.

## 5. Storage and key handling
- Viewing key: revealed with `unsafeRevealSecret` only to post into the worker (`start`), zeroized after posting (as `runScan` does). Claim reuses a short-lived worker session: start -> claim -> end, same lifecycle.
- Spending key: only in the sweep path (`deriveVerifiedSweepKey` in `sweep.ts`), which must call `deriveStealthSecret(..., { allowTagMismatch: match.tagMismatch })` or `deriveStealthSecretFromEphemeral` for C4. The address check inside those functions is the gate; `sweep.ts` additionally re-checks `owner == match.stealthAddress`.
- Claim codes pasted by the seller are kept in component state only; cleared on navigation and on session lock.
- The payer's receipt v2 lives wherever the payer saves it; the app never stores it.

## 6. Threat model

| Threat | Mitigation | Residual |
|---|---|---|
| Payer hides payment with wrong tag (D4) | deep scan; claim | needs seller to act (deep scan opt-in or claim code) |
| Payer omits announcement / invalid `R` | claim with `r=`; GhostPay payers always get `R` in receipt | third-party wallets that never publish `R`: funds unrecoverable (C5) |
| Forged announcement with attacker-chosen amount (S3-02) | amount shown only per section 4.4 rules; router lane proven by router checks | single-RPC trust: a lying RPC can fabricate a receipt; mitigated by canonical block-hash check and optional secondary provider; not eliminated |
| Malicious token emitting fake `Transfer` | allowlist gate; never `verified` | user override for sweep only, with warning |
| Dust / tracking tokens sent to your stealth addresses | `dust` and `unknown-token` categories, sweep friction | attacker still observes on chain whether you sweep |
| Claim code as phishing / injection | strict grammar, length cap, never a link, never rendered as HTML, React text only | social engineering ("your payment is stuck, enter your key") is outside the app; copy says GhostPay never asks for keys |
| Resource exhaustion via huge receipt / block | `maxLogs` 2000 per claim, RPC response-size cap (`RESPONSE_TOO_LARGE`), deep-scan caps and cancel | very large blocks in by-block mode may exceed the cap; fall back to by-hash with consent |
| Wrong-tag acceptance creating a false match | address equality is mandatory; property tests | none known (equality of 160-bit hash) |
| Reorg removes a claimed payment | confirmations shown; `pending` until `finalityDepth`; re-check button | user may sweep before finality (existing behaviour, warned) |

### 6.1 What this does NOT hide (honest list)
- **By-hash claim**: the RPC learns the seller's IP and that the seller is interested in this specific transaction, i.e. which payment is theirs. By-block mode reduces that to "interested in this block" (a block typically has many txs; on quiet L2 blocks it may have few, so the padding can be weak). Spec 10 transport (Tor/proxy) hides the IP, not the interest.
- **Confirm amount / native balance delta / sweep balance read**: each `eth_getBalance` or `balanceOf` for a stealth address tells the RPC the seller cares about that address. Opt-in and labelled.
- **Deep scan** does not change RPC queries (same `eth_getLogs` over the announcer), only local CPU.
- **Claim code**: anyone who sees it learns the tx, the one-time address and (with `r=`) the ephemeral key, and can link that payment to whatever conversation carried the code. `R` alone does not reveal the recipient without the viewing key.
- **Filters** are a local view. Hidden dust is still on chain, and an attacker who sent it learns from chain data whether it was swept.
- Payer, token, amount, timing, router use and later sweep linkage stay public exactly as before (privacy-limits.md).

## 7. Performance budget (measured, not promised)
Measured in this repo's CI container on 2026-10-21 (4 vCPU, Node, `@noble/curves` 2.x, warm): `getSharedSecret + keccak256` = **~2.4 ms/op**; the extra work a wrong-tag check needs (`h*G + P_spend`, keccak of the uncompressed point) = **~0.55 ms/op**. Today's scan already pays the ECDH for every announcement (the tag is compared after ECDH), so a deep scan costs roughly **+23%** CPU per announcement per key set, not 256x. Reference-laptop browser numbers are UNVERIFIED; the in-worker `bench` message measures the real device and drives the estimate in 3.3. Caps: `deepScanMaxAnnouncements` (default 200k, about 110 s extra on the measured container per key set) and cancel.

## 8. Interaction with other work
- Spec 02: this spec supersedes rule 2 (expected-payment fallback) and implements rule 3 (amount only if verified). Spec 02's `ScanVerdict` maps: `match_verified` = `amount.kind == 'verified'`, `match_unverified` otherwise.
- Spec 05: announcement-level spam (unrelated logs) is spec 05; this spec filters only matches. The trusted router lane in spec 05 is the same `viaRouter` flag.
- Spec 10: claim fetches go through the same `ScanTransport`; by-block mode is the default when a block is known.
- A2 (idea 03): the worker `start` takes a list of children; `claim` tests all children including archived and legacy ones (cheap for one tx), so a client paying an archived child is found by claim. `VerifiedMatch.childIndex` records which.
- B1 (idea 04): matches persistence (B1 rule 7) should store `source`, `tagMismatch`, `amount` and `childIndex` with each match.
- B6 receipts: may reuse `ClaimEvidence` and the claim code grammar later; not in scope.

## 9. Failure modes

| Failure | Detection | Behaviour |
|---|---|---|
| Malformed claim code | parser | one generic message, no echo of input |
| Tx not found (dropped, wrong chain, provider pruned) | null receipt | `not-found`; suggest checking chain and RPC |
| `eth_getBlockReceipts` unsupported | `-32601/-32602` | `block-mode-unsupported`; explicit consent to by-hash |
| Receipt block hash not canonical | block-hash compare | `RPC_FAILURE 'receipt not on canonical chain'`; retry later |
| Providers disagree | secondary compare | banner, no result shown |
| Tx reverted | status | `reverted`; never a payment |
| Transfers present, no announcement, no `r` | evidence | `needs-ephemeral` with recipients |
| Payer lost `r` and never announced (C5) | cannot be detected as yours | `needs-ephemeral` forever; docs state funds are unrecoverable |
| Provider lacks historical state for native delta | `eth_getBalance` error | `native-not-provable` (unverified), user can still sweep if current balance > 0 |
| Deep-scan cap reached | counters | stop with "range not fully checked, from X to Y"; cursor of the deep scan kept in memory only |
| Worker crash during claim | `onerror` | generic error; viewing-key copy zeroized in `finally` |
| Sweep of wrong-tag match | `allowTagMismatch` path | address check still enforced; mismatch throws `ADDRESS_MISMATCH` |

## 10. Test plan
Unit (vitest, existing `*.test.ts` convention)
- core-crypto: existing scheme-1 vectors unchanged with default options (regression); new vectors `scheme1-wrongtag-001..003` (valid `R`, tag xor 0x01, tag absent/empty metadata) match only with `ignoreViewTag`; `matchEphemeral` with bad `R`, off-curve, wrong candidate, right candidate; `deriveStealthSecret` with `allowTagMismatch` returns the same key as the correct-tag announcement; with a different address throws `ADDRESS_MISMATCH`; property test: for random keys and random announcements, `ignoreViewTag` never yields `matches:true` unless the derived address equals the announced one; differential against the ScopeLift package (ADR-0001) for the address derivation.
- `parseClaimCode`: round-trip property (`parse(format(x)) == x`), every grammar violation (order, duplicates, unknown key, uppercase hex, length 401, leading zeros, `c` unknown chain, off-curve `r`), whitespace/line-break tolerance, fuzz 1M random strings: zero throws other than `UserFacingError`.
- `fetchClaimEvidence` with the rpc test util: by-hash, by-block, unsupported method, receipt hash mismatch, non-canonical block hash, secondary disagreement, >2000 logs, malformed Transfer logs (2 topics, 31-byte data) skipped, `tx2` merge.
- `verifyAmount`: table over cases C1-C8 x router/non-router x allowlisted/not x native/ERC-20 x reverted.
- `categorize`: precedence table; tagged never dust.
- Worker: `claim` message with ignore-tag; `bench`; existing no-network source scan includes the new files.
Integration (anvil, existing e2e harness)
- Router payment (C1); direct ERC-20 transfer + announcer call with wrong tag in the same tx (C2) and in two txs (C3); transfer only + claim code with `r` (C4); forged announcement without transfer (C6); dust transfer to a real stealth address (C7); mock token emitting a fake `Transfer` (C8); reverted tx; sweep of a wrong-tag payment end to end.
Playwright
- Payer flow shows claim code only after inclusion; receipt v2 contents; seller pastes code, sees each result state; egress allowlist: only the configured RPC is contacted, and by-block mode issues no request containing the tx hash (assert request bodies).
- Copy snapshot for result states and sweep warnings (no "safe/private/anonymous").

## 11. Acceptance criteria
- [ ] Every case C1-C8 has a passing anvil test with the expected outcome and category.
- [ ] A wrong-tag payment found by claim or deep scan is swept successfully on anvil; a non-matching address is refused.
- [ ] No amount is rendered as received unless `AmountVerdict.kind == 'verified'` (component test over all verdicts).
- [ ] By-block mode request audit: no outgoing body contains the tx hash or the stealth address.
- [ ] Default scan behaviour and existing vectors are unchanged (regression suite green, bundle scan green).
- [ ] Deep-scan estimate shown before start; cap and cancel work; measured overhead recorded in the PR (device, browser, us/op).
- [ ] `docs/user/receive-and-scan.md`, `troubleshooting.md`, `privacy-limits.md` updated; THREAT_MODEL D4 moved to "Mitigated (seller action required)", S3-02 updated; spec 02 rule 2 amended.
- [ ] Receipt v2 schema test; v1 receipts still parse.

## 12. Effort and dependencies
| Part | Days |
|---|---|
| core-crypto options, `matchEphemeral`, vectors, property tests | 1.5 |
| chain-adapters `claim.ts`, `verify.ts`, rpc tests | 2 |
| worker protocol, `claim.ts`, `inboxFilter.ts` | 1.5 |
| Scan UI (claim panel, deep scan, filter), Sweep warnings, Pay claim card, receipt v2 | 2 |
| anvil + Playwright + docs | 1.5 |
| **Total** | **8.5 (one engineer)** |
Depends on: spec 01 (router/announcer addresses read back, for `viaRouter` trust), token allowlist (ADR-0011). Soft: spec 10 transport, spec 05 lanes, A2 multi-child worker (design the `start` message for a child list now so A2 does not change the protocol twice). No owner decision, no deployment, no contract change.

## 13. Rejected alternatives (server or protocol changes)
- **Hosted "find my payment" lookup** (paste hash on a GhostPay site that checks it): the host would need the viewing key or would learn the hash-to-seller link. Rejected (ideas.md rejected list: hosted view-key scanning).
- **Payer-to-seller push via relayer or mailbox**: needs an operator service and links payer to seller metadata. Rejected; the user's own channel carries the claim code.
- **On-chain enforcement of the view tag**: the router cannot compute the tag without the viewing key; impossible by design.
- **Indexer for receipts**: replaced by `eth_getBlockReceipts` against the user's own RPC; a self-run indexer remains possible under spec 10 but is not required.
- **Auto-hiding by sender reputation lists**: needs a list operator and creates false positives; local thresholds only.

## 14. Audit checklist (for the reviewer)
- [ ] Defaults of `checkAnnouncement`/`deriveStealthSecret` unchanged; vectors byte-identical.
- [ ] In every tag-ignoring path, acceptance depends solely on the derived address equalling the announced/candidate address; no path returns a key for an unverified address.
- [ ] `matchEphemeral` and claim parsing never throw on attacker data (only `UserFacingError` for the user's own input).
- [ ] Viewing key enters only the worker; zeroized after post; claim worker terminated after use; no new storage of keys or tx hashes.
- [ ] Router-lane `verified` relies on: manifest router read back (spec 01), `caller == router`, tx `status == success`; reviewer confirms CONTRACTS_SPEC balance-delta rule matches deployed bytecode version.
- [ ] Non-allowlisted token events never produce `verified`.
- [ ] Receipt canonical-chain check and secondary-provider comparison implemented as specified; no silent fallback from by-block to by-hash.
- [ ] Claim code grammar strict; length capped; never opened as URL; rendered as text.
- [ ] Sweep of `unknown-token` requires explicit override; dust warning present.
- [ ] Copy deck reviewed: no "safe/private/anonymous/verified seller"; honest list (6.1) present in user docs.
- [ ] Egress test proves by-block mode does not send the tx hash.
