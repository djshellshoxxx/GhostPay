# Core EVM payments: source-verified research and Claude handoff

**Research date:** 2026-11-03 America/Vancouver / 2026-11-04 UTC.
**Purpose:** finish and qualify GhostPay's existing lean EVM payment path; identify reusable upstream code, tests, and specifications. This document is research and proposed acceptance criteria, not an implementation, audit certification, or evidence of a live deployment.

## Decision

Keep the current scheme-1 derivation, signed invoice protocol, router, and sweep authorization model. The most valuable upstream reuse is **test adaptation and precise interoperability documentation**, rather than another payment framework. The immediate decisions concern the selected chain's confirmation policy, the relayer's uncertain broadcast and settlement accounting, and the time semantics of seller receipts. Several apparently unfinished features in older research are already implemented in main or PR #47; PR #64 additionally owns enforcement of invoice-bound receipts in lean builds.

There is also a concrete provenance correction: the inspected vendored `SafeERC20.sol` and `ERC20Permit.sol` exactly match OpenZeppelin 5.6.1, but the vendored root contains only `README.md`, `contracts/`, and `package.json`. `THIRD_PARTY.md` currently says it ships `LICENSE-MIT` and `LICENSE-APACHE`; those files are absent in the inspected checkout. Correct the inventory and preserve the upstream MIT notice before redistribution. This observation does not claim the entire vendored tree was compared.

## Baselines, ownership, and evidence level

The main snapshot is [`0014bc5b26c7487ea1f9fb230194c36673193236`](https://github.com/djshellshoxxx/GhostPay/tree/0014bc5b26c7487ea1f9fb230194c36673193236). The integrated working frontier inspected here is PR #47 at [`f8193502e602c99bb24ff956f142671750b744a0`](https://github.com/djshellshoxxx/GhostPay/tree/f8193502e602c99bb24ff956f142671750b744a0). All GhostPay paths below refer to that frontier unless stated otherwise. Main and frontier were compared for the named files; no tests, contracts, wallet requests, or service transactions were executed during this research.

The latest PR list is moving. PR #64's receipt-profile patch was inspected at `820ede969445d6b3e186bc357e7d1c90ea253f64`; the coordinating agent subsequently reported it advanced to `2470f6eb9f9b1a874f8c03e3dbd70c2d2089a6a6`. PR #62's chained browser/devnet journey was reported at `31b6974481dd2a3865ba3c1e7a97cc670ce60236`; its test run was not independently executed here. PR #69 owns specific permit-refusal wording (`19f435990429c322cf5e271b1c95b0d41efc54eb`). Reconcile current heads before implementation. Do not open parallel changes to these owned surfaces merely from this report.

The prior [PR #55 security review](https://github.com/djshellshoxxx/GhostPay/blob/2d9c30e12c41cfb0212b0cfc366c83a1e5e45b21/docs/research/parallel-reviews/security-review-41750257638.md) already identified service-side broadcast uncertainty and receipt/reorg accounting as **questions requiring qualification**, and treated receipt/finality tests as overlaps. The new contribution here is inspection of the actual integrated source, refreshed upstream source and license pins, and removal of duplicate work suggestions. [PR #54](https://github.com/djshellshoxxx/GhostPay/pull/54) is another existing acceptance-research owner; consult it before creating a new testing lane. The current lean scope in `docs/handoffs/LEAN_RELEASE_SCOPE.md` remains the release boundary.

### What is already present

| Area | Inspected GhostPay evidence | Status and consequence |
|---|---|---|
| Scheme-1 reference compatibility | `packages/core-crypto/src/stealth.ts`, `differential.test.ts`, `vectors.test.ts`, `hash-edge.test.ts`; `test-vectors/scheme1.json`, `generate.mjs`, `README.md`; ADR-0001 | Reference SDK comparison already exists. The differential test source specifies 500 seeded key sets × 2 payments, plus a separate derivation path using noble. Do not create a task simply to add SDK vectors. Test source is not a newly observed passing run. |
| Registry interoperability | `packages/chain-adapters/src/registry.ts`, `registry.compat.test.ts`, `src/abi/erc6538Registry.ts` | Direct `registerKeys(1, bytes)` and strict 66-byte round trips are present. The adapter checks deployed code and reference type hash. It does not promise every feature of the registry standard. PR #60 owns adjacent public pairing/registry QR work. |
| Invoice integrity versus identity | `packages/invoice-schema/src/sign.ts`, `envelope.ts`, `envelope.test.ts`, `json.ts` | Dedicated signing key, canonical validated payload, domain separation, explicit signature-valid versus signer-pinned states already exist. A self-contained valid signature is not independent seller identity. |
| Exact payment evidence | `packages/chain-adapters/src/payments.ts`, `payments.test.ts`, `scanVerify.ts` | Already present on main and retained in the frontier: successful direct router receipt/calldata binding, canonical block checks before and after evidence reads, exact payer-to-recipient token log, evidence reuse prevention, optional second-provider comparison. Balance alone is not accepted as payment proof. |
| Durable wallet uncertainty | `apps/web/src/lib/duplicateAttemptJournal.ts`, `wallet.ts`, `payExec.ts`, their tests | Unknown/submitted attempts and hash retention are implemented. PR #47 adds late transaction readback after a receipt arrives and preserves a hash across post-broadcast failures. Do not prescribe automatic resend or replace the journal with a simple promise wrapper. |
| Invoice-bound seller receipt | `apps/web/src/lib/receipts.ts:receiptBindingForInvoice`, `receipts.test.ts`; `components/ReceiptPanel.tsx` | Binding helper rechecks the signed invoice, seller key/meta-address, exact verified scan facts, fixed-token amount, and derived recipient. PR #64 owns hiding/refusing manual-digest receipts in lean while retaining the explicitly labelled full-profile mode. |
| Permit and sweep authorization | `GhostPayRouter.sol`, `GhostPaySweepRelayer.sol`, `packages/chain-adapters/src/{permit,sweep}.ts` | Existing permit fallback, exact balance deltas, EIP-712 sweep fields/domain, per-owner unordered nonce bitmap, and contract tests must be preserved. Do not describe these as missing. |

Source links: [core derivation/tests](https://github.com/djshellshoxxx/GhostPay/tree/f8193502e602c99bb24ff956f142671750b744a0/packages/core-crypto/src), [chain adapters](https://github.com/djshellshoxxx/GhostPay/tree/f8193502e602c99bb24ff956f142671750b744a0/packages/chain-adapters/src), [invoice schema](https://github.com/djshellshoxxx/GhostPay/tree/f8193502e602c99bb24ff956f142671750b744a0/packages/invoice-schema/src), [web payment libraries](https://github.com/djshellshoxxx/GhostPay/tree/f8193502e602c99bb24ff956f142671750b744a0/apps/web/src/lib), [contract tests](https://github.com/djshellshoxxx/GhostPay/tree/f8193502e602c99bb24ff956f142671750b744a0/packages/contracts/test), [PR #64](https://github.com/djshellshoxxx/GhostPay/pull/64).

## Prioritized research-to-implementation decisions

### EVM-1 — Qualify one chain's confirmation policy and its meaning

**Priority:** P0 qualification for the selected lean chain; ownership overlaps PR #47/#62. **Reuse:** design guidance from Ethereum JSON-RPC, EIP-1898 and OP documentation; adapt existing tests. No additional dependency is necessary.

`packages/chain-adapters/src/config/chains.ts` explicitly calls `finalityDepth`, range limits, and block times conservative engineering defaults that are **not provider-verified**. `payments.ts:verifyClaimedPayment` computes confirmations as `head - announcementBlock + 1` and sets `final` when that count reaches `chain.finalityDepth`. `scanVerify.ts` uses that result to distinguish pending from verified. The same configuration describes `finalityDepth` as a rollback depth. These are implemented application policies, not evidence that the chain has reached its consensus finality marker. Existing canonical-block rechecks are useful and should remain.

Ethereum exposes `safe` and `finalized` block tags. OP Stack documentation distinguishes its latest/unsafe head, safe head whose data is on Ethereum, and finalized head anchored to Ethereum finality. A large count of L2 blocks cannot substitute for knowing which head policy was used. EIP-1898 provides hash-based state reads and a `requireCanonical` option; it helps coherent reads but is not a promise against future reorganization. [S9–S11]

**Concrete decision:** record the selected chain, verified provider capabilities, confirmation threshold, timestamp of qualification, supported finality tags, and exact user-facing promise. Separate the retained scan-rewind window from the acceptance threshold in the design, even if the initial implementation uses the same value. Do not enable more chains to resolve this task. A provider that cannot supply an optional finality tag should produce a declared depth-policy result, never an unlabelled claim of consensus finalization.

**Acceptance:** the release record explains the difference between inclusion, GhostPay's accepted depth, and a protocol finalized head. Existing boundary and mid-read canonicality tests remain passing. An explicitly supported finality policy covers a head that advances while its finalized marker lags, provider disagreement, and absent/unsupported tags. Rescan behavior removes or downgrades orphaned evidence without crediting it twice. These are criteria to reconcile with current tests, not a claim that the baseline lacks all of them. The full browser journey belongs with PR #62.

### EVM-2 — Keep wallet submission, inclusion, replacement, and payment verification distinct

**Priority:** P1 after current integration; PR #47 owns the client path. **Reuse:** adapt viem 2.57.7's replacement and concurrent-wait tests, not its entire wallet workflow.

`apps/web/src/lib/wallet.ts:verifySubmission` compares the transaction returned by the configured RPC to the previewed sender, target, calldata and value. `pollReceipt` returns a small inclusion result (`status`, `blockNumber`). `payExec.ts:submitTx` records the hash before subsequent verification, rechecks a late-visible transaction, and preserves uncertain results. The scanner's exact payment verification is a stronger, separate step. This distinction should be explicit in the API names and visible status text rather than inferred from a generic word such as “verified.”

At the pinned viem source, `waitForTransactionReceipt` defaults to one confirmation and detects a replacement using the original sender and nonce. It distinguishes repricing, replacement, and cancellation; its test suite also covers delayed receipt visibility, skipped blocks, differently cased addresses and concurrent callers with different confirmation/timeout options. [S5] Those cases are valuable models for GhostPay's own receipt/journal state machine. They do not automatically establish payment intent for a replacement.

**Concrete mapping:** adapt selected scenarios into `wallet.test.ts`, `payExec.test.ts` and journal tests only after checking their current coverage. If replacement tracking is added, retain original and replacement hashes, bind the replacement again to the approved payment, and distinguish a cancellation or changed call from the originally requested payment. Read-only observation can continue after a view/session expires; a new send still requires fresh authorization. A receipt wait timing out must remain an unknown outcome rather than a retry permission.

**Acceptance:** the journal survives reload and late visibility; every stored hash is recoverable for read-only reconciliation; ordinary confirmation and replacement callbacks cannot clear an unresolved attempt incorrectly; one waiter's timeout cannot weaken another waiter's policy. Current post-broadcast hash-retention and late-readback tests are baseline controls, not new tasks. No automatic gas bump, cancellation, fallback send, or broad provider search is proposed.

### EVM-3 — Resolve relayer accounting across uncertain broadcast and later settlement

**Priority:** P1 service qualification; P0 only if this service is required for the chosen lean release. **Reuse:** viem's explicit receipt/replacement semantics and standard RPC data model, plus the existing service accounting model. This is the follow-up to T1/T2 in PR #55, not a new vulnerability claim.

The frontier's `apps/relayer/src/service.ts` has substantial queue, simulation, deadline, gas-budget, and pending-receipt work. Its `sendSweep` catch still invalidates the nonce allocation and releases reserved budget/loss accounting before reporting `send_failed`. After a known hash, timeouts retain reservations and enter `reconcilePending`; this protection already exists. `apps/relayer/src/chain.ts:waitForReceipt` calls viem without a `confirmations` argument and reduces a returned receipt to status/gas usage. `settleReceipt` settles accounting from that summary. The earlier research correctly treated the difference between uncertain submission and settled canonical outcome as an unresolved service policy.

**Concrete decision:** define service states for refused before handoff, submission outcome unknown, hash known, included, accepted by the selected settlement policy, and reconciled. Decide what data must survive a service restart and how reservations remain associated with an unresolved send. Locally signed transactions may allow an intended transaction hash to be retained before network handoff, but adopting that approach requires a review of the existing key/signing boundary; do not expand private-key handling casually. Decide separately when inclusion is sufficient for operator budget accounting versus when payment/fee earnings may be treated as final.

**Acceptance:** ordinary transport uncertainty never becomes an unqualified assertion that no transaction exists. A receipt summary retains the canonical identity needed by the chosen reconciliation policy. Reservation release/charging is idempotent, and late outcome changes are accounted for without silently accepting a second use of the same service budget. Inspect the current service tests and PR ownership first; validate with controlled local fixtures only. This research did not establish that a live provider can produce a particular loss, assign a severity, or execute a reproduction.

### EVM-4 — Decide whether expired invoices can receive a historical receipt

**Priority:** P1 product/protocol decision; do not block PR #64 or silently loosen its checks. **Reuse:** design-only; no external receipt framework needed.

`apps/web/src/lib/receipts.ts:receiptBindingForInvoice` rejects an invoice whose `expiresAt` is reached at **receipt-creation time**. `receipts.test.ts` explicitly expects that rejection. The helper otherwise binds a validated signed invoice to a verified router scan record and current seller keys. This is intentional tested behavior, not an uncovered parser defect. It leaves a useful product question: should a valid payment completed while an invoice was open be acknowledgeable after the invoice expires?

Keep three meanings separate in a decision record: validity for starting a new payment, the time of payment evidence, and the time a seller signs an acknowledgement. If lean deliberately refuses all new receipts after expiry, document that consequence in the seller workflow. If historical acknowledgements are required, define which canonical timestamp/evidence controls eligibility and how late payments are labelled. Do not replace the present clock check with a browser-supplied payment timestamp. Existing signed receipts should also retain an explicit verification policy independent of whether the seller can issue a new one now.

**Acceptance:** the specification decides before/at/after-expiry cases and delayed scanning/receipt issuance. Any change is accompanied by fixtures distinguishing historical valid settlement from a new late payment, uses the selected chain evidence policy, and retains all signer/digest/asset/net-amount/recipient checks. PR #64's lean profile enforcement remains the integration owner. No code change is authorized by this report alone.

### EVM-5 — Preserve the exact GhostPay serialization and scheme profile

**Priority:** P1 documentation/provenance; coverage audit rather than rewriting crypto. **Reuse:** continue the existing ScopeLift SDK as a pinned development oracle; adapt standards/reference tests only where a recorded gap exists.

GhostPay's scheme-1 `sharedHash` hashes the compressed shared point and obtains the view tag from the first digest byte; ADR-0001 and generated vectors bind that profile to the ScopeLift SDK. The inspected SDK `generateStealthAddress`, `checkStealthAddress` and `computeStealthKey` paths are an appropriate compatibility oracle. Keep them development-only. The SDK contains broader GraphQL/viem functionality and a permissive helper interface that is not a reason to replace GhostPay's stricter parser, secret wrapper, or deterministic test injection. The separate pure-noble path is independent application logic, not an independent elliptic-curve implementation. [S1, S3]

The invoice scheme is likewise deliberately specific: `SIGNING_DOMAIN = 'GhostPay.Invoice.v1\0'`, validated canonical JSON, dedicated secp256k1 signing key, compact low-S signature, NFC validation and a restricted integer domain. It is not an EIP-712 invoice format. RFC 8785 is useful for comparing canonicalization rules, but JCS preserves strings as-is and does not impose GhostPay's NFC/profile restrictions. Replacing `canonicalize` with a generic JCS or stable-stringify package would be a protocol decision requiring vector comparison and versioning. [S8, S12]

**Acceptance:** publish the exact bytes, key encodings, normalization/rejection rules, address casing, domain prefix and scalar handling used by the existing vectors. Re-running vector generation should not silently replace authoritative expected values. Record the SDK/package version and upstream commit, fixture hashes and implementation used to cross-check them. Check Unicode, duplicate keys, integer limits, metadata lengths and point/scalar boundary cases against the tests already present; add only uncovered invariants. Preserve rejection of malformed data and all production secret-lifetime controls in PR #47.

**Rejected drop-in:** Umbra's inspected `KeyPair.ts`/`Umbra.ts` derive receiving keys by multiplication by a decrypted random scalar and carry a different announcement payload. That is not GhostPay's additive scheme-1 path. Its current SDK also uses ethers 5 and noble-secp256k1 1.x. Borrowing its cryptographic send/scan classes would change protocol and dependency assumptions. It can inform workflow design, but do not substitute it into `stealth.ts`. [S13]

### EVM-6 — Qualify assets and permits without broadening payment evidence

**Priority:** P1 selected-token qualification; current permit wording belongs to PR #69. **Reuse:** retain OpenZeppelin 5.6.1 and adapt only uncovered ERC20Permit/SafeERC20 test cases.

`GhostPayRouter.sol` and `GhostPaySweepRelayer.sol` already combine `SafeERC20` with exact balance-delta checks. The router binds payer intent through its direct call; the sweep separately binds token, owner, destination, fee recipient, amount, fee, deadline and nonce in a GhostPay EIP-712 order. The sweep nonce bitmap is per owner and unordered. Token permit nonce, GhostPay sweep nonce, and the relayer hot-account transaction nonce are different state machines and must stay distinct.

ERC-2612 authorizes allowance, with its own nonce/deadline; it does not itself express GhostPay's intended destination and fee. OpenZeppelin recommends tolerating a consumed permit when the required allowance already exists, and retaining a non-permit entry point for wallets that cannot produce the token's permit signature. GhostPay already implements those patterns. EIP-712 supplies structured signing, while application replay protection remains necessary. [S6–S8]

`packages/chain-adapters/src/sweep.ts:buildPermitTypedData` reads domain name/version and nonce and can compare the on-chain domain separator. `permit.ts:classifyPermit` models already allowed, expired, consumed nonce, invalid signature and unsupported token states. Keep explicit support records per selected token implementation/chain, including domain version, permit flavor, decimals, exact-transfer behavior and deployment provenance. Do not infer support from the existence of a `permit` selector or use DAI-style permits, Permit2, or ERC-3009 as interchangeable encodings.

The scanner intentionally requires successful **direct** router transactions and exact transfer evidence. Smart-wallet/internal calls remain unverified under that contract. Do not relax this to “any successful receipt with a Transfer” merely to support more wallets. Account-abstraction support needs a separately specified evidence adapter; see the account-abstraction research lane.

**Acceptance:** selected assets pass the already-defined exact-transfer and permit paths; unsupported/flavored permits use the approved explicit allowance path; existing tests for no-return/false-return tokens, fee-on-transfer refusal, front-run permit tolerance, nonce single use, failed-sweep rollback and boundary words are retained. The upstream tests should be mapped to present tests before adding more. A successful token helper call must not replace the application's required net-transfer evidence.

### EVM-7 — Correct dependency attribution with measured provenance

**Priority:** P1 low-cost release hygiene. **Reuse:** preserve verified upstream license texts and provenance; no dependency upgrade implied.

OpenZeppelin tag `v5.6.1` resolves to `5fd1781b1454fd1ef8e722282f86f9293cacf256`. Two file comparisons were actually performed using Git blob identities:

| File under `packages/contracts/lib/openzeppelin-contracts/` | Upstream and local Git blob identity | Result |
|---|---|---|
| `contracts/token/ERC20/utils/SafeERC20.sol` | `b1e4b6e67dbe01b666da809442d8833499fa9f3c` | Exact match |
| `contracts/token/ERC20/extensions/ERC20Permit.sol` | `77e796591fa8942edae04c5db73da8c9bd1ddda1` | Exact match |

The upstream root `LICENSE` at that commit is MIT, copyright 2016–2026 Zeppelin Group Ltd. The local vendor root has no `LICENSE`, `LICENSE-MIT`, or `LICENSE-APACHE`; the tracked files and directory were inspected. `THIRD_PARTY.md` should describe observed files, and the eventual redistributable vendor content should retain the applicable notice. Review the rest of the used vendored closure separately before claiming a complete match. [S6]

ScopeLift SDK package metadata has no `license` field at the inspected revision, but the repository's `LICENSE` is MIT, copyright 2024 ScopeLift. The standards contracts and their tests have CC0-1.0 evidence. This distinction matters when adapting tests: an omitted package metadata field is not the same as missing license evidence. Keep copied notices and exact origin paths in `THIRD_PARTY.md`. [S3–S4]

## Verified upstream reuse register

The following are primary sources actually retrieved during this pass. Pins are the versions inspected, not advice to adopt an unreviewed newer release. A website without an explicit source-code license is treated as design guidance only.

| ID | Source, exact path and pin | License evidence | Decision and GhostPay fit |
|---|---|---|---|
| S1 | [ERC-5564](https://ercs.ethereum.org/ERCS/erc-5564), specification/interface and metadata rules | Standard CC0 footer | Design/ABI conformance; `core-crypto/stealth.ts`, metadata parser, announcer ABI. An announcement alone does not establish GhostPay payment evidence. |
| S2 | [ERC-6538](https://ercs.ethereum.org/ERCS/erc-6538), registry interface, entry type and nonce/domain rules | Standard CC0 footer | Design/compatibility; `registry.ts`. On-behalf signatures and ERC-1271 support in the standard do not imply GhostPay's direct-only adapter must expose them now. |
| S3 | ScopeLift SDK `1.0.0-beta.5`, commit [`88bcc27c3b6163080ee18f330dfd6336dc8bd2e2`](https://github.com/ScopeLift/stealth-address-sdk/tree/88bcc27c3b6163080ee18f330dfd6336dc8bd2e2); `src/utils/crypto/{generateStealthAddress,checkStealthAddress,computeStealthKey}.ts`, `src/utils/crypto/test/generateStealthAddress.test.ts` | [`LICENSE`](https://github.com/ScopeLift/stealth-address-sdk/blob/88bcc27c3b6163080ee18f330dfd6336dc8bd2e2/LICENSE) MIT; `package.json` version inspected | Continue existing dev oracle; adapt uncovered vectors. Reject wholesale production migration. |
| S4 | ScopeLift standards contracts commit [`a0e91a954da6033b59bc23891fa5afbd2a68518f`](https://github.com/ScopeLift/stealth-address-erc-contracts/tree/a0e91a954da6033b59bc23891fa5afbd2a68518f); `src/ERC5564Announcer.sol`, `src/ERC6538Registry.sol`, `test/ERC6538Registry.t.sol` | Root [`LICENSE`](https://github.com/ScopeLift/stealth-address-erc-contracts/blob/a0e91a954da6033b59bc23891fa5afbd2a68518f/LICENSE) and test/source SPDX CC0-1.0 | Adapt narrowly scoped ABI/domain/registry fixtures. Reference addresses are not proof of deployed bytecode on a selected chain. |
| S5 | viem `2.57.7`, annotated tag resolved to commit [`bd8e313490d6f788a5d6f93c76f55fed606d78b9`](https://github.com/wevm/viem/tree/bd8e313490d6f788a5d6f93c76f55fed606d78b9); [`src/actions/public/waitForTransactionReceipt.ts`](https://github.com/wevm/viem/blob/bd8e313490d6f788a5d6f93c76f55fed606d78b9/src/actions/public/waitForTransactionReceipt.ts) and adjacent `.test.ts` | Root [`LICENSE`](https://github.com/wevm/viem/blob/bd8e313490d6f788a5d6f93c76f55fed606d78b9/LICENSE) MIT | Already a dependency. Borrow replacement/timeout/concurrent-wait test design. Do not bypass journal or preview binding. |
| S6 | OpenZeppelin Contracts `v5.6.1`, commit [`5fd1781b1454fd1ef8e722282f86f9293cacf256`](https://github.com/OpenZeppelin/openzeppelin-contracts/tree/5fd1781b1454fd1ef8e722282f86f9293cacf256); `contracts/token/ERC20/utils/SafeERC20.sol`, `extensions/ERC20Permit.sol`; tests `test/token/ERC20/{utils/SafeERC20,extensions/ERC20Permit}.test.js` | [`LICENSE`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/5fd1781b1454fd1ef8e722282f86f9293cacf256/LICENSE) and file SPDX MIT | Retain existing vendored dependency, adapt uncovered token tests, repair attribution inventory. This is the installed version, not the earlier 5.4.0 example encountered during discovery. |
| S7 | [ERC-2612](https://ercs.ethereum.org/ERCS/erc-2612) and [OpenZeppelin ERC20 permit documentation](https://docs.openzeppelin.com/contracts/5.x/api/token/erc20) | ERC CC0; documentation used as guidance only | Permit compatibility and fallback semantics; `permit.ts`, `sweep.ts`, router/sweep contracts. |
| S8 | [EIP-712](https://eips.ethereum.org/EIPS/eip-712) | Standard CC0 | Sweep/domain encoding and replay-responsibility reference. Do not relabel the custom invoice format EIP-712. |
| S9 | [EIP-1898](https://eips.ethereum.org/EIPS/eip-1898) | Standard CC0 | Coherent block-hash state reads; design-only for RPC wrapper and settlement policy. |
| S10 | [Ethereum JSON-RPC documentation](https://ethereum.org/en/developers/docs/apis/json-rpc/) | No code copying; guidance only | Receipt identity, block tags and provider qualification. |
| S11 | [OP Stack transaction finality](https://docs.optimism.io/op-stack/transactions/transaction-finality) | No code copying; guidance only | Meaning of latest/safe/finalized if the selected release chain is an OP Stack chain; does not authorize enabling one. |
| S12 | [RFC 8785](https://www.rfc-editor.org/info/rfc8785/), especially §3.1/§3.2 | IETF Trust/BCP 78 notice; no code copied | Design comparator for canonicalization. Reject silent protocol replacement with a generic JCS library. |
| S13 | Umbra commit [`a62358b8cc1ccaf680a6ce2251c7956e618c28c4`](https://github.com/ScopeLift/umbra-protocol/tree/a62358b8cc1ccaf680a6ce2251c7956e618c28c4); `umbra-js/src/classes/{KeyPair,Umbra}.ts`, `umbra-js/package.json` (`0.3.0`) | [`LICENSE.txt`](https://github.com/ScopeLift/umbra-protocol/blob/a62358b8cc1ccaf680a6ce2251c7956e618c28c4/LICENSE.txt) MIT, copyright 2026 ScopeLift | Reject cryptographic drop-in; consider workflow concepts only. Different stealth derivation and announcement representation. |

## Sources beyond GitHub and limits of the search

The investigation used the official ERC/EIP sites, ethereum.org, Optimism and OpenZeppelin documentation, and the RFC Editor, not merely GitHub search results. Searches for Ethereum stealth-address/permit implementations on GitLab, Codeberg, and SourceHut did not establish an additional verified drop-in implementation for this lane. Codeberg retrieval was blocked by robots policy. The npm registry artifact URL was also unavailable through the research fetcher. These are discovery limits, not proof that alternatives do not exist; neither inaccessible code nor an unverified license was promoted into the reuse list. Other-forge candidates from the broader handoff should be assessed against the same exact-path/pin/license standard.

The ScopeLift and viem source pins were resolved through repository commit/tag data. Upstream code and relevant test definitions were inspected, but their test suites were not run. Only the two OpenZeppelin blob comparisons above are measured file-identity results. No whole-dependency audit, whole-chain compatibility claim, production-readiness claim, or live RPC/contract validation follows from this work.

## Suggested order for Claude

1. Reconcile current PR #47, #62, #64 and #69 before assigning implementation. Preserve completed controls and scoped ownership.
2. Record one-chain confirmation and service settlement policies with the owners of those paths; use the existing acceptance work as the baseline.
3. Resolve the historical-receipt expiry decision. Keep its distinction from PR #64's lean profile enforcement.
4. Map the pinned viem/OpenZeppelin/ScopeLift tests to existing coverage, then add only missing cases relevant to the selected release path.
5. Repair third-party attribution and document the two verified vendored matches without claiming the entire tree is verified.
6. Preserve AA, alternate permit standards, broader chains, and alternate stealth protocols as separately qualified extensions.
