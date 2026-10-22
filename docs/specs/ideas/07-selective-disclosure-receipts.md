# 07 (idea B6) Selective-disclosure receipts and auditor pack

Status: proposal-grade spec, not reviewed, not built. Priority P2 | Effort M (about 14 d one engineer, plus audit of the new crypto) | Owner: packages/core-crypto (new primitives), new `packages/receipts`, apps/web (issuer UI + verifier page) | Date 2026-10-21, branch `claude/remote-extensions-3`.
Sources read: `docs/remote/ideas.md` (B6, A2, D2, D6), `docs/remote/research.md` s1, `docs/specs/02-scanner-robustness-and-payment-verification.md`, `packages/core-crypto/src/{stealth,keys,secret,metadata}.ts`, `packages/invoice-schema/src/{schema,sign}.ts`, `packages/chain-adapters/src/logs.ts`, `apps/web/src/lib/{tags,scannerCore,session}.ts`. Things not verified in source are marked UNVERIFIED.

## 1. Problem and the cryptographic fact we use

ERC-5564 scheme 1 as pinned by ADR-0001 (see `stealth.ts`): payer picks `r`, publishes `R = rG`; shared point `S = r*P_view = p_view*R` (33-byte compressed); `s_h = keccak256(S)`; view tag `= s_h[0]`; `h = int(s_h) mod n`; stealth address `Q = P_spend + h*G`; stealth key `q = p_spend + h`.

Consequences that drive this design:
1. The recipient never learns `r` (discrete log). The per-payment secret the recipient CAN disclose is `S` ("payment secret"). Disclosing `S` reveals `h`, hence `Q` is checkable against `P_spend`, but `q = p_spend + h` still needs `p_spend`. `S` does not reveal `p_view`, `p_spend`, or any other payment's `S` (each payment has a fresh `R`).
2. A bare `S` is not trustworthy: anyone can invent a fake pair. Pick any `p_view'`, set `S' = p_view'*R`, `P_spend' = Q - h'G`: the triple "looks" consistent. So `S` needs (a) a proof that it equals `p_view*R` for the claimed `P_view` (Chaum-Pedersen DLEQ), and (b) a proof that the discloser controls `Q` (a signature by the stealth key `q`), or else any viewer of the chain can mint "receipts" for any payment.
3. The view key is all-powerful for history: whoever holds it can issue (a) style proofs for every payment ever, past and future. The control signature is therefore the load-bearing part; a stolen or delegated view key alone cannot produce it.

Goal: let a receiver prove "address Q received this transfer and I control it" for chosen payments, and let a payer (phase 2) prove "I created this announcement", without handing out the view key and without any server.

## 2. Goals and non-goals

Goals
- G1 Per-payment receipt files, verifiable (a) fully offline for the cryptography, (b) with the verifier's own RPC for the chain facts.
- G2 Auditor pack: a set of receipts plus optional invoice disclosure and a verifier-recomputed summary.
- G3 Explicit "what this reveals" panel at issue time; explicit "what is NOT proven" panel at verify time.
- G4 Replay and forwarding controls: audience, expiry, optional verifier challenge.
- G5 Works with the D2 watch-only/offline-signer split (the control signature is made on the offline device).

Non-goals (explicit)
- N1 No "export view key" shortcut, no date-range or amount-range view keys. Scheme 1 has no way to scope a view key by time; a "range key" cannot be built. See s12.
- N2 No proof of completeness. The discloser chooses what to show; the verifier cannot know what was left out.
- N3 No proof of current balance, of non-refund, of tax status, of the payer's identity, or that a payment was "for" an invoice (the invoice nonce is not on chain).
- N4 No hosted verifier, registry or revocation list. Receipts cannot be revoked.
- N5 No compliance programme; informational evidence only.

## 3. Receipt types

| Type | Issuer | Needs | Proves | Grade |
|---|---|---|---|---|
| `payee` (v1) | recipient | view key (DLEQ) + stealth key `q` (signature) | Q's controller knows a meta-address M for which Q is the scheme-1 stealth address of announcement R, and on-chain facts (via verifier RPC) | `control` |
| `payee` view-grade | holder of view key only (e.g. watch-only device without signer round trip) | view key | consistency of (R, S, M, Q) only; anyone with the view key could issue it | `view` |
| `payer` (phase 2) | payer | the ephemeral `r` saved at pay time | the issuer created R (knows r) with S = r*P_view; Q derives from the stated M | `payer` |

`view` grade is shown with a red banner and is useful only when the verifier already knows the payee's true meta-address and trusts that no one else holds its view key. It is optional; the default issuer UI offers only `control` and offers `view` only inside the watch-only flow when the offline signer is unavailable, with a warning.

## 4. UX

Issuer (Scan/Receive view, per matched and finalised payment)
1. Button "Create receipt" on a payment row (disabled until `finality = final`, per spec 02 `DetectedPayment`).
2. Dialog fields: audience (required text, e.g. "ACME auditors 2026", max 80 chars), expiry (default 30 days, max 366), challenge (optional paste from verifier), attach invoice (off; if on, choose public part only or full including line items/memo), memo (off, max 200 chars).
3. "What this reveals" panel, always visible, checklist rendered from the actual receipt contents (s7): chain, tx hash, token, net amount, payer address (public), your meta-address (spend + view PUBLIC keys), this payment's shared secret, your control of the stealth address, audience, timing, optional invoice. And a fixed line: "This does not reveal your keys or any other payment. Anyone holding this file can show it to anyone; it is not locked to a person."
4. Sign: full profile signs locally; watch-only profile creates a D2 `receipt-attest` request (s9) for the offline signer.
5. Output: download `.gpr.json`; copy text; single-receipt QR (about 1 KB, fits one QR). Receipt in a URL fragment is NOT offered by default (history, chat previews, S3-03); hidden advanced toggle with warning.
6. Pack builder: multi-select rows or filter by tag/client/date, same dialog applied to all, output `.gpack.json`. Shows count, totals per token, and "Not included: N other payments (not shown to the recipient of this pack)" as an honest hint to the issuer only.

Verifier (standalone `verifier.html`, also routed as `/verify` in the main app)
1. Load receipt or pack (file/paste/QR). Optional inputs: "Expected payee meta-address", "Expected seller signer key" (to pin identity), "My challenge" (generate button creates 32 random bytes and shows them for the discloser), RPC URL(s).
2. Tier 0 (no network): cryptographic verification, rendered as green/red per check.
3. Tier 1 (RPC): on-chain verification (s6.3). Two independent RPCs recommended; mismatch -> banner (reuses `requestWithFallbackCheck` per spec 02 rule 7).
4. Result card: "Verified facts" (from chain + math) separated from "Attested claims" (audience, invoice, memo) and a mandatory "Not proven" list (s8). Export CSV (formula-injection-safe) and print view.

## 5. Exact formats

All JSON canonicalised with `invoice-schema` `canonicalize`/`parseStrictJson`: sorted keys, no duplicates, no unknown keys, NFC, integers only (uint256/amounts as decimal strings), hex lowercase. Max receipt 8 KiB, max pack 4 MiB and 2000 receipts, depth 6.

```ts
type Hex = `0x${string}`;

interface ReceiptFactsV1 {            // the part covered by receiptHash
  chainId: number;
  txHash: Hex;                         // 32 bytes
  logIndex: number;                    // index of the Announcement log in the tx receipt
  announcer: Hex;                      // address that emitted Announcement
  stealthAddress: Hex;                 // Q
  ephemeralPublicKey: Hex;             // R, 33 bytes
  metadata: Hex;                       // exactly as emitted (57 bytes for router payments)
  payee: { spendingPublicKey: Hex; viewingPublicKey: Hex };   // M, 33 bytes each
  sharedSecret: Hex;                   // S, 33 bytes compressed
  dleq: { c: Hex; s: Hex };            // 32 bytes each, big-endian scalars in [1, n-1]
}

interface PayeeReceiptV1 {
  v: 1;
  kind: 'ghostpay.receipt';
  type: 'payee';
  grade: 'control' | 'view';
  facts: ReceiptFactsV1;
  attest: {
    audience: string;                  // 1..80 chars, printable, no control chars
    challenge: Hex;                    // 32 bytes; zero bytes when none
    issuedAt: number;                  // unix s
    expiresAt: number;                 // unix s, <= issuedAt + 366d
    invoiceHash: Hex;                  // 32 bytes; zero when none
    memo?: string;                     // <= 200 chars, never rendered as markup
  };
  signature?: Hex;                     // 65 bytes r||s||v by Q; present iff grade === 'control'
  invoice?: { signed: SignedInvoice; disclosure: 'public' | 'full' }; // from invoice-schema; optional
}

interface AuditPackV1 {
  v: 1; kind: 'ghostpay.audit-pack';
  packId: string;                      // 32 hex random
  createdAt: number;
  audience: string;                    // informational; each receipt carries its own signed audience
  receipts: PayeeReceiptV1[];          // sorted by (chainId, blockNumber unknown -> txHash, logIndex)
  note?: string;                       // <= 500 chars
  packSignature?: { signer: Hex /*33B signer pubkey*/; signature: Hex /*64B compact*/ }; // optional, by invoice-signing key
}
// Totals shown in a pack are ALWAYS recomputed by the verifier; a "summary" field is not accepted.
```

Derived values
- `receiptHash = keccak256("GhostPay.Receipt.v1\0" || canonicalBytes(facts))`.
- `invoiceHash = keccak256("GhostPay.Receipt.Invoice.v1\0" || invoiceDigest(invoice))` using the existing `invoiceDigest` from `sign.ts` over the full invoice (public + private parts) so a later disclosure of the public part only still binds to the whole invoice; zero bytes if no invoice.
- Control signature: EIP-712 typed data, domain `{ name: "GhostPayReceipt", version: "1", chainId }` (no `verifyingContract`, no contract ever verifies it), primary type
  `Attestation(bytes32 receiptHash,string audience,bytes32 challenge,uint256 issuedAt,uint256 expiresAt,bytes32 invoiceHash)`. The memo is deliberately NOT part of the signed type: it is unsigned convenience text, shown by the verifier labelled "unsigned". Signature must be low-s, 65 bytes, recover to `facts.stealthAddress`.
- Domain separation from other uses of the stealth key: different EIP-712 domain/type from `Sweep` and from token `Permit`; EIP-712 `0x1901` prefix means the digest can never equal a transaction signing hash. A review item still checks no contract in the repo accepts this domain.

### 5.1 New core-crypto API (needs test vectors, `@testVector receipt-001..`)
```ts
export function sharedSecretPoint(viewingSecret: SecretScalar, ephemeral: CompressedPoint): CompressedPoint;
export interface SharedSecretProof { readonly c: Uint8Array; readonly s: Uint8Array } // 32B each
export function proveSharedSecret(viewingSecret: SecretScalar, ephemeral: CompressedPoint, rng?: RandomSource):
  { sharedSecret: CompressedPoint; proof: SharedSecretProof };
export function verifySharedSecret(viewingPublicKey: CompressedPoint, ephemeral: CompressedPoint,
  sharedSecret: CompressedPoint, proof: SharedSecretProof): boolean;       // never throws on bad data, returns false
export function stealthFromSharedSecret(spendingPublicKey: CompressedPoint, sharedSecret: CompressedPoint):
  { address: Address; viewTag: number };   // same hashing as ADR-0001, rejects h = 0 and infinity
```
DLEQ (Chaum-Pedersen, Fiat-Shamir) for secret `x = p_view`, public `P = xG`, `S = xR`:
- Prover: `k` fresh uniform in [1, n-1] by the existing rejection sampler (`randomScalar`); `A1 = kG`, `A2 = k*R`; `c = int(sha256("GhostPay.Receipt.DLEQ.v1\0" || G33 || P33 || R33 || S33 || A1_33 || A2_33)) mod n`, reject `c = 0` (resample k); `s = (k + c*x) mod n`. `k` zeroized.
- Verifier: reject if any point is invalid/infinity, `c` or `s` not in [1, n-1]; `A1' = sG - cP`, `A2' = sR - cS`; recompute `c'`; accept iff `c' = c` and neither `A1'` nor `A2'` is infinity.
- Nonce reuse across two different statements with the same `x` reveals `x` (`p_view`). Therefore `k` must never repeat: fresh CSPRNG per proof, no caching, no deterministic derivation without hashing `x`, tests with a counting RNG that asserts distinct `k`.
- Soundness/zero-knowledge in the random-oracle model (standard). The proof leaks nothing about `p_view` beyond the statement.
The phase-2 payer proof uses the same routine with roles swapped (bases `G` and `P_view`, secret `r`, publics `R` and `S`) and its own domain tag `"GhostPay.Receipt.DLEQ.Payer.v1\0"` so a payee proof can never verify as a payer proof.

## 6. Verification algorithm (exact order)

6.1 Parse/shape: strict JSON, caps, field regexes, point validity via `parseCompressedPoint`, uint ranges, `grade` consistent with presence of `signature`.
6.2 Cryptographic checks (Tier 0):
1. `verifySharedSecret(P_view, R, S, dleq)` true.
2. `stealthFromSharedSecret(P_spend, S).address == facts.stealthAddress`.
3. `viewTag(S) == metadata[0]`; if not equal, flag `tag_mismatch` (a payer may have set a wrong tag; the payment is still real).
4. grade `control`: signature recovers to `stealthAddress` under the exact typed data; `challenge` equals verifier's challenge when the verifier supplied one; `issuedAt <= now + 300`, `now < expiresAt` (else `expired`, advisory); `audience` shown verbatim and highlighted if the verifier typed an expected audience that differs.
5. Optional pins: `payee` equals "expected meta-address" (else banner "payee identity not pinned"); invoice (if present) signature valid, `invoice.metaAddress` equals payee, `invoice.chainId` equals `chainId`, `invoice.signer` equals pinned signer (else "signer unpinned"), `invoiceHash` equals recomputed.
6.3 On-chain checks (Tier 1, verifier's RPC):
1. `eth_getTransactionReceipt(txHash)`: success status, block number, confirmations >= chain `finalityDepth` (else `pending`).
2. Log `logIndex` is an `Announcement` (topic from `ANNOUNCEMENT_TOPIC`), emitted by an announcer address in the verifier's pinned set (deployment manifest for the chain; canonical ERC-5564 address is UNVERIFIED on some chains), decoded fields equal `facts` (schemeId 1, stealthAddress, ephemeral key, metadata) via `validateAnnouncementLog`.
3. Funds movement per spec 02 rule 3: router path -> decode 57-byte metadata and cross-check an ERC-20 `Transfer(to = Q, value = netAmount)` log from the same token in the same tx; token must be on the verifier's allowlist (ADR-0011) else `token_unlisted`. Native path: a log cannot prove it; use `eth_getBalance(Q)` at block-1 vs block and report `native_balance_delta` as "consistent with", never "verified". Direct (non-router) announce -> `amount_unverified`.
4. Reveal tx `from` (payer address) and block timestamp as chain facts.
5. Duplicate detection inside a pack on `(chainId, txHash, logIndex)`; duplicates counted once and flagged.
Reorgs: a receipt issued pre-finality is invalid after a reorg; Tier 1 re-checks; the issuer UI refuses non-final payments by default.
RPC trust: a lying RPC can fake chain facts. Recommend two providers or own node; the verifier states which RPC answered.

## 7. What a disclosure reveals, field by field

Reveals to anyone who holds the file:
- chain, tx hash, log index, announcer (all public anyway); token and net amount (public); payer address `tx.from` via verifier's lookup (public).
- Your PUBLIC meta-address (spend and view public keys). Any two receipts with the same meta-address are linkable to one recipient by the holder. With A2 per-client meta-addresses, receipts expose only that child.
- `S` for this payment: lets the holder compute `h`, and so confirm Q belongs to your meta-address. It does not let them spend or compute other payments' secrets.
- That you control Q at issue time, the audience string, issue/expiry times, optional memo, optional invoice (public part or full with line items/memo).
- Indirectly: Q's later on-chain history (sweep destination, consolidation) is public; the verifier can look it up. The receipt neither adds nor hides it.
Cannot reveal (given correct implementation): `p_view`, `p_spend`, the stealth key `q`, any other payment's `S`/`R`, your other meta-addresses, your invoice-signing key (unless you attach the pack signature, which reveals the signer PUBLIC key and links all invoices signed with it).

## 8. What this does NOT prove or hide (shown in the verifier UI)

Not proven: completeness; that the payment was for the attached invoice (attestation only; the invoice nonce is not on chain); the payer's identity or that the payer is an arm's-length customer (self-payment/wash is indistinguishable; compare payer to your counterparty records); that funds are still there or were not refunded; fiat value or tax treatment; that the issuer is a particular person or company (identity needs a pinned meta-address, pinned signer key, ENS/registry, or out-of-band knowledge); that the token is genuine unless allowlisted.
Not hidden: everything already public, including the sweep destination and timing; the existence of a pattern if several receipts are shared; the meta-address.
Fabrication boundary: the owner of Q can make a receipt naming a fresh meta-address M' of their own choosing (they can pick `p_view'` and derive a consistent `P_spend'`). That is why payee identity is "unpinned" unless the verifier supplied the expected meta-address, and why a receipt is evidence of control and facts, not of a named counterparty. Nobody can borrow someone else's genuine meta-address because that needs its view key.

## 9. Forgery, replay, forwarding

| Attack | Result |
|---|---|
| Make a receipt for a payment you do not control | `grade control` needs a signature by `q`: infeasible without `q` (ECDSA). `grade view` is forgeable by any view-key holder, hence flagged and non-default. |
| Anyone mints "receipts" for arbitrary on-chain announcements with a fake M' | Needs a valid signature by `Q`'s key; without it only a red `view`-grade at best (and it fails pinned-M check) |
| Announcement spoofing (anyone can emit an Announcement for any Q with any R) | Tier 1 requires a matching `Transfer`/router flow in the same tx and a DLEQ-consistent R; a fake R'' cannot satisfy `Q = P_spend + H(p_view*R'')G` for the real owner |
| Replay on another chain | `chainId` in domain and in `receiptHash`; `txHash` is chain-specific; verifier checks the receipt on `chainId` only |
| Replay/forward to another verifier | Bearer file: any holder can show it. Mitigations: `audience` (display only, not bound to the verifier's identity), short `expiresAt`, and `challenge` mode (verifier supplies 32 random bytes, signed into the attestation; verifier accepts only its own challenge issued < 15 min ago). Challenge mode defeats offline replay, not a live relay through the true owner. |
| Alter a field after signing | `receiptHash` covers all facts incl. S and DLEQ; any change breaks the signature. Unsigned: `memo`, `invoice` bodies are checked against `invoiceHash`. |
| Signature malleability | Low-s enforced; recovery compared, not signature bytes |
| DLEQ forgery/malleability | Hash includes all bases and commitments; reject out-of-range `c`,`s`, infinity, non-canonical encodings |
| Proof nonce reuse leaks `p_view` | Fresh CSPRNG `k`, test that `k` never repeats; zeroize |
| Wrong invoice attached to a real payment | Possible by the issuer (not on chain); invoice match is an attestation; verifier checks amount/token/chain/expiry consistency and flags mismatch; duplicate invoice use within a pack is flagged; across packs it cannot be detected |
| Stolen view key | Cannot issue `control` receipts; can read history (outside this spec) |
| Stolen stealth key `q` after sweep | Attacker can issue receipts for that payment; key custody is D2's job |
| Reorg after issue | Verifier recheck, issuer refuses pre-finality by default |
| Hostile file (zip-bomb, huge numbers, markup in memo/audience) | Caps, strict parse, `textContent` only, CSV injection guard (prefix `'` for cells starting `= + - @ tab CR`) |

## 10. Storage and key handling

- No persistent receipt store in v1; receipts are files the user keeps. If stored in the tag vault (optional), they go through `TagVault` AES-GCM like other records (payload type `receipt`, includes S: sensitive, treated as private).
- Signing key `q` is derived in memory per receipt via the existing `deriveVerifiedSweepKey` pattern, signature taken, `zeroize` in `finally`. Receipts are signed ONLY via the fixed typed-data builder; there is no free-text message signing API.
- Watch-only: DLEQ made online with the view secret (never transmitted); the control signature comes from the D2 offline signer through a new action type:
```ts
interface ReceiptAttestAction {      // addition to spec 06 SignRequestV1.action
  type: 'receipt-attest';
  announcement: AnnouncementRef;     // as in spec 06
  attestations: Array<{ receiptHash: Hex; audience: string; challenge: Hex; issuedAt: number; expiresAt: number; invoiceHash: Hex;
                        summary: { token: Hex|'native'; netAmount: string; txHash: Hex } }>; // max 50
}
```
The signer rebuilds the typed data itself and shows audience, expiry, challenge presence, token/amount/tx hash for each; refuses `expiresAt` beyond 366 d. It never shows or signs `Sweep`/`Permit` for this action type, and the reverse.
- Tx hash lookup: the scanner stores only `blockHash:logIndex` in `TagPayload.announcementId` (comment in `tags.ts`: the scanner does not retain tx hashes). Issuing a receipt therefore queries the RPC (`eth_getLogs` by blockHash filtered to the announcer, or `eth_getTransactionReceipt` once the hash is known) which tells that RPC provider which payment you are documenting. Spec 02's `DetectedPayment` is expected to carry `txHash`; this spec depends on it. Document the leak; allow using the user's own RPC.
- Randomness only from Web Crypto through the existing `randomScalar`/`RandomSource`.

## 11. Phase 2: payer receipts

Today `deriveStealthPayment` zeroizes `r` and never returns it, which is the right default. Payer proofs need an opt-in: new `deriveStealthPaymentWithEphemeral` returning `r` as a `SecretScalar`, used only by the pay flow when the user ticks "Save proof of payment". The pay flow immediately downloads a `.gpproof` file (optionally encrypted with scrypt+AES-GCM as in `keystore.ts`) holding `{chainId, R, r, Q, M, token, amount}`; nothing is kept in the app. Later the payer builds a `PayerReceiptV1` (DLEQ with secret `r`, no stealth-key signature, `attest` signed by a Schnorr/ECDSA-of-`R` signature over the same typed-data digest using `r` as key, `grade:'payer'`). Revealing `r` itself is NOT done: it would let the holder impersonate the payer; the DLEQ shows knowledge without handing it over. Risk: a leaked `.gpproof` links Q to M (public anyway) and lets anyone impersonate the payer; documented. Payers cannot prove the payee's identity, only that Q derives from the stated M.

## 12. Rejected or redesigned items (server-dependent or unsafe)
- Hosted verifier/notary, timestamping service, public receipt registry, revocation list: need an operator. Rejected. Timestamps come from block time.
- "Export view key" as the auditor path: rejected as default. Documented alternative procedure only: migrate to a new meta-address, then hand the OLD view key to the auditor for the closed period (it will still show any late payments to the old address, forever). This is a user decision, not a button.
- Time-scoped or amount-scoped view keys: impossible in scheme 1.
- On-chain commitments to receipts (contract change) or Merkle completeness commitments: immutable contracts (ideas ground rule 4) and they would not prove completeness anyway.
- Receipt state proofs (MPT proofs against a block header) for fully offline chain verification: possible later; needs a trusted header source, so deferred.
- Email/upload of receipts by the app: no; the user moves files.

## 13. Failure modes
| Failure | Handling |
|---|---|
| Payment not final | Issue disabled; verifier shows `pending` |
| RPC cannot return the receipt/log (pruned node) | Tier 1 `unavailable`, Tier 0 still shown, no green overall |
| RPC providers disagree | Banner, no overall green |
| Native payment | Reported as "consistent with balance delta", never "verified" |
| Token not allowlisted / non-standard | `token_unlisted`, amount shown as claimed |
| tag mismatch | flagged `tag_mismatch`, still valid |
| Clock skew on challenge | Reject with explicit skew message |
| Key derivation fails at issue (announcement not mine) | Blocked with message; nothing signed |
| Watch-only without signer | Offer `view` grade with warning, or round trip |
| File too large/invalid | Rejected before parsing past caps |
| User shares the wrong file (full invoice attached) | Pre-share summary lists "includes full invoice"; no undo (stated) |

## 14. Test plan
- core-crypto: KATs for `sharedSecretPoint` (equals `r*P_view` from `deriveStealthPayment` vectors), DLEQ prove/verify round trip over 10k random statements, proofs with wrong P_view/R/S/tampered c,s, infinity and off-curve inputs return false, zero `c`, `k` distinct under counting RNG, payee proof never verifies as payer and vice versa, `stealthFromSharedSecret` equals `deriveStealthPayment` outputs and `checkAnnouncement` results; second implementation cross-check (independent script) of DLEQ verification.
- receipts package: canonical round trip, strict parser fuzz (never throws uncaught, bounded memory), mutate each field -> verification fails at the expected check, signature low-s, chain-id domain swap, challenge mismatch, expiry, fake M' consistent triple without signature rejected as `control`, view-grade labeled, duplicate detection, CSV injection cases, huge pack.
- Chain (anvil fork-free): real router payment (ERC-20) -> issue -> verify Tier 1 green; announcement-only spoof (no Transfer) -> `amount_unverified`; wrong announcer; reorg simulation (`evm_revert`) -> not final; native payment -> "consistent" only; non-allowlisted token.
- Playwright: issuer dialog shows the reveals checklist matching file contents (assert no field present that is not listed); verifier offline (network blocked) completes Tier 0; Tier 1 with mock RPC and with two disagreeing RPCs.
- Egress: verifier page makes requests only to user-entered RPC URLs; none at Tier 0 (bundle scan + runtime assertion).
- Privacy regression: parse a produced receipt and assert it contains no value equal to `p_view`, `p_spend`, `q`, signing key, or any other payment's R/S.
- D2 integration: watch-only profile produces `receipt-attest` request; offline signer output verifies identically to a locally signed receipt.

## 15. Acceptance criteria
- [ ] Verifier rejects every forgery/replay case in s9 with a test each.
- [ ] No receipt/pack contains secret material (privacy regression test) and every disclosed field appears in the issue-time checklist.
- [ ] Tier 0 works offline; Tier 1 never reports green for native or non-allowlisted amounts.
- [ ] `grade view` can never render as verified identity; overall green requires `control` + Tier 1 + final.
- [ ] Docs (user guide + `privacy-limits.md` addition) state s7/s8 verbatim in spirit, including bearer property and no-revocation.
- [ ] New crypto reviewed independently; KATs added to `test-vectors`; ADR for "payment secret disclosure and DLEQ" merged.
- [ ] Pack verifier recomputes all totals; no trusted summary fields.

## 16. Effort and dependencies
Effort M: core-crypto primitives + vectors 3 d; receipts package (types, canonical, verify) 3 d; issuer UI + pack 3 d; verifier page 3 d; tests/e2e 3 d (about 15 d). Phase 2 payer proofs +4 d. D2 integration +2 d.
Dependencies: spec 02 (`DetectedPayment` with txHash, verified-amount logic, `requestWithFallbackCheck`), spec 01 (announcer/router addresses), spec 09 (token allowlist), invoice-schema (`invoiceDigest`, signer pinning D6), optional spec 06 (offline signer), optional A2 (per-client metas), B2 CSV export for export hygiene.

## 17. Audit checklist
- [ ] DLEQ: transcript includes all bases/commitments/domain tag; `c`,`s` range checks; infinity checks; fresh `k` and zeroization; no timing branch on secrets.
- [ ] Shared-secret hash path identical to ADR-0001 (`keccak256` of 33-byte compressed S, `mod n`, reject zero).
- [ ] Verifier never throws on hostile input; resource caps enforced before allocation.
- [ ] Typed-data domain/type are distinct from `Sweep`/`Permit`; no contract accepts them; low-s and recovery compare enforced.
- [ ] `receiptHash` canonicalisation is unambiguous (field order, hex case, no duplicate keys).
- [ ] Issuer cannot sign anything outside the fixed builder; free-text only in `audience`/`memo` and length-capped, escaped on render.
- [ ] Secrets zeroized after use; no secret in logs, receipts, errors, or storage.
- [ ] Tier 1 uses pinned announcer/router and token allowlist; native handled as non-verifiable; reorg depth from chain config.
- [ ] Reveal checklist generated from the object, not hand-written (cannot drift).
- [ ] No network at Tier 0; RPC URLs only from user input; CSP and bundle scan updated.
- [ ] Docs do not claim completeness, identity, current balance or compliance.
