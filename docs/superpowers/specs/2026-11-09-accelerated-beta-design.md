# GhostPay accelerated completion and beta specification

Date: 2026-11-09 (owner-local date). Version: 1.
Status: implementation specification under the owner's instruction to turn the agreed acceleration plan into repository specifications and start work. This is not deployment, merge or mainnet authorization.

## 1. Objective and approach

Deliver the smallest independently qualified EVM testnet beta, then complete the wider feature set in staged releases. Finish and integrate existing work before creating replacements. A complete module, passing unit tests, a green child PR and a publishable product are different states.

Chosen approach: narrow EVM beta plus isolated parallel completion lanes. Waiting for every chain, experimental protocol and merchant integration would delay qualification of the core. Unrestricted parallel edits would increase merge conflicts and invalidate evidence. Neither alternative is the execution default.

Earlier conversational completion percentages and week ranges are planning hypotheses, not measured progress, acceptance evidence or promised release dates. The schedule is dependency-driven. Re-estimate after the first integrated, repeatable end-to-end run.

## 2. Source baseline and existing work

This specification starts from PR #93, `gpt/ghostpay-product-completion-20261109`, commit `3cd1e5544391bad61c943ffab9e5c432d80ea1ee`. Read its [product completion handoff](../../handoffs/PRODUCT_COMPLETION_HANDOFF.md), not just the older main-branch README.

Source pointers:
- [PR #93](https://github.com/djshellshoxxx/GhostPay/pull/93): product outcomes, accessibility/help, retry/persistence and qualification evidence; based on #90.
- [PR #92](https://github.com/djshellshoxxx/GhostPay/pull/92): separate CLI completion lane, last inspected handoff head `3a9ce554ff6ae0231c6a41bbb163fcb5477c9e04`; not incorporated merely by selecting #93.
- [PR #91](https://github.com/djshellshoxxx/GhostPay/pull/91): separate merchant/product ancestry. Refresh its actual checks and ownership before integration.
- [PR #84](https://github.com/djshellshoxxx/GhostPay/pull/84): parent consolidation and unresolved Sonar gate recorded in #93. Green child checks do not clear the parent's findings.

Refresh all refs and reviews before writing to shared files. Preserve the #84/#88/#89/#90 ancestry and the #91/#92 and #93 sibling work. Compare unique diffs; do not remerge already-contained older branches. Owner-only agent workflows are not part of this specification.

## 3. Release scopes

### B0: integrated local candidate

A commit-pinned candidate with its constituent PRs reconciled, full required local/hosted suites run, open findings inventoried and deterministic local payment journeys. No public-network readiness is inferred.

### B1: restricted EVM testnet beta

One explicitly approved EVM testnet and a small verified asset allowlist first. Sepolia is the initial candidate; Base Sepolia is a separately qualified profile, not an automatic second-network promise. Support seller setup, invoice creation/import, buyer review/payment, seller scanning, supported sweep/recovery, documented CLI equivalents and verified static distribution.

Missing or mismatched deployment manifests MUST disable signing/payment. Experimental schemes, unsupported assets, mainnets and unqualified features MUST remain disabled. A beta badge MUST name the network and scope; it MUST NOT imply anonymous payments, an independent audit or real-money readiness.

### B2 and subsequent milestones

Qualify second-network support, Bitcoin Silent Payments, Solana/TRON, policy accounts, privacy pools/PIR/alternative transports, advanced merchant functionality and wider localization independently. These are retained deliverables, not silently deleted scope. Do not make them dependencies of B1 unless their code is inseparable from its exercised path.

## 4. Functional requirements and acceptance

| ID | Requirement | Acceptance evidence |
| --- | --- | --- |
| GP-B01 | Establish one source-pinned candidate, inventory every contributing branch and unresolved review. | Ancestry/diff report; exact candidate SHA; required checks belong to that SHA; parent Sonar disposition and independent review recorded. |
| GP-B02 | Verify chain ID, contract identity/code, announcer, router, fee recipient, supported tokens and deployment provenance. | Approved manifest and reproducible verification; missing manifest, wrong chain, wrong bytecode/address and unsupported-token negatives. No invented addresses. |
| GP-B03 | Seller can create and unlock a profile, back up/restore the supported secrets and create a signed invoice. | GUI and supported CLI round trips; malformed backup/invoice refusal; lock, cancellation and repeated-import tests. No secrets in logs or exported public receipts. |
| GP-B04 | Buyer can inspect amount, asset, network, recipient, fees and expiry before consent, then authorize exactly the reviewed payment. | Actual wallet testnet transcript plus local automated negatives for changed terms, wrong signer/digest, expired invoice, chain switch and stale asynchronous work. |
| GP-B05 | Payment truth comes from qualified chain observations, not the invoice signature, a merchant claim or a supplied transaction hash alone. | Wrong asset/amount/recipient/chain/signer and reverted/unconfirmed/reorganized transaction tests; seller signature distinguished from verified payment. |
| GP-B06 | Seller scanning detects and reconciles the correct announcement and preserves resumable progress. | Local and approved testnet payment-to-scan journeys; duplicate events, RPC disagreement, interrupted scan and checkpoint restoration cases. |
| GP-B07 | Supported sweep and gas-sponsorship paths preserve reviewed terms and transaction uncertainty. | Direct sweep and supported permit/relayer journeys; quote expiry, nonce reuse, simulation failure, uncertain broadcast and rejection-after-send negatives. No blind automatic resend. |
| GP-B08 | Recovery survives interrupted operations without erasing transaction identifiers or claiming an uncertain send never happened. | Reload/lock/device-backup scenarios; known hash retained; receipt reconciliation before retry; persistence failure surfaced. |
| GP-B09 | CLI and GUI use the same public schemas and validation for supported functions. | Integrate #92's unique work deliberately; golden GUI-to-CLI and CLI-to-GUI invoice, receipt, backup and QR vectors; structured failure exits and help. Unsupported refund execution stays a tested refusal. |
| GP-B10 | User controls communicate actual capabilities accessibly. | Keyboard/focus/touch help, announced asynchronous states, repeated-file selection, responsive layout and manual assistive-tech checks. Physical devices and Safari are separate evidence, not inferred from Chromium emulation. |
| GP-B11 | Locale selection never represents fallback English as a reviewed translation. | Catalog completeness plus reviewer disposition for security-critical copy; RTL/long-text checks; unshipped languages clearly identified. No guessed native-language approval. |
| GP-B12 | Release artifacts are nonempty, internally consistent and tied to the intended commit. | Reproducible builds, manifest/checksum verification and negative archive tests, including empty/corrupt/missing-index archives. Hash agreement is not proof of authenticity. |
| GP-B13 | Distribution can be independently verified and recovered without a privileged application server. | Verified static-host build, served-file comparison, independently sourced signing identity/attestation, rollback and incident instructions. IPFS/Tor are additional distribution lanes, not substitutes for integrity. |
| GP-B14 | Every required security/quality gate has an explicit disposition. | No unresolved beta-blocking critical/high finding; investigate Sonar findings rather than disable the gate; independent review of custody/signing/recovery changes. Any accepted lower-severity risk has a named owner and rationale. |
| GP-B15 | The release has an operational owner and explicit publication authorization. | Security contact, supported profiles, known limitations, issue triage and recovery instructions; owner approval recorded separately from test results. |

A success in GP-B12 alone does not satisfy GP-B02, GP-B04, GP-B14 or GP-B15. No new checklist may replace the existing runtime, manifest, signature or release verifiers.

## 5. End-to-end acceptance journeys

J1: seller profile -> signed invoice -> buyer import/review -> actual wallet consent -> testnet receipt -> seller scan -> supported sweep -> reconciled receipt. Every stage records what was observed and what remains unverified.

J2: cancellation before a send-capable call; wallet error after possible broadcast; refresh after submission; delayed/replaced/reorganized receipt; subsequent reconciliation. A transaction that might exist cannot be reset to an unsubmitted state solely to allow retry.

J3: fresh profile recovery using the supported encrypted backup; repeated import; lock during asynchronous work; UI and CLI exchange of the same public documents. Preserve secrets and pending transaction provenance separately.

J4: clean build -> artifact verification on a separate directory/machine -> static serving -> served-file comparison -> rollback. A checksum-valid empty bundle MUST fail the archive verifier.

## 6. Work packages, ownership and ordering

| Lane | Scope and deliverable | Dependencies / exclusions |
| --- | --- | --- |
| W0 Integration lead | Branch map, conflict ownership, dependency-order qualification, blocker ledger. | One writer for package manifests, lockfile, workflows and shared configuration. No automatic merge or release. |
| W1 Payment and recovery | GP-B02 through GP-B08; reuse existing transaction outcomes and adapters. | Reserve touched files with #93 and policy/payment workers; no new contracts or trust roots without review. |
| W2 CLI and merchant | GP-B09 and bounded merchant acceptance. | Coordinate with #91/#92; do not duplicate their generic QR or shared-library work. |
| W3 QA/security | Adversarial cases, evidence provenance, Sonar diagnosis, independent review. | Reviewer is not the author; unknown/unavailable checks stay unknown. |
| W4 UX/localization | GP-B10/11, physical-device and language qualification. | Reuse #93; do not rewrite its completed controls. |
| W5 Release/operations | GP-B12/13/15, reproducibility, static hosting, runbooks. | Read-only preparation first; no key generation, deployment or hosting changes without explicit operational approval. |

Use up to eight concurrent workers only when independent file ownership exists. This is a capacity ceiling, not a claim that workers are running. Prefer a small active set and one integration lead to oversubscribing shared files.

Critical path: refresh/inventory -> qualify common ancestors -> reconcile unique #92/#93 work -> pass local journeys -> approve deployment inputs -> actual wallet/testnet qualification -> release review -> explicit publication. QA, release verification and device preparation may overlap; unreviewed protocol changes may not.

## 7. Full-feature completion backlog after B1

| Milestone | Completion contract |
| --- | --- |
| Bitcoin | Header/chain validation, BIP-352 interoperability, scan/spend/recovery and real fixture/regtest evidence; no mainnet activation from vector passes alone. |
| Policy accounts | Scheme-2 derivation, deployment/authorization, announcements, UI/CLI, lifecycle and documented recovery limits qualified together. |
| Other chains | Per-chain manifests, wallet/device matrix, signing/finality/reorg semantics and independent security review. |
| Merchant extensions | Subscription state, refunds, webhooks, approvals, plugins and commerce integrations tested against their actual authority model; no placeholder execution represented as implemented. |
| Privacy/distribution | Separate profiles and threat models for pools, PIR, Tor/I2P/IPFS and other transports; honest anonymity/metadata limitations. |
| Languages/accessibility | Reviewed translations for advertised languages and manual device/assistive-technology acceptance beyond automated checks. |

## 8. Evidence and completion rules

Record requirement ID, exact source SHA, environment/tool versions, command, result, passes/failures/skips, artifact identity, reviewer and outstanding limits. Distinguish mocked, local-native, public-testnet and physical-device evidence. A skipped mandatory test is not a pass. Child-PR evidence cannot silently qualify a newly merged tree.

Run the repository's pinned environment and all applicable scripts: library build, typecheck, lint, workspace tests, contract suites/static analysis, browser profiles, release/reproducibility checks and focused release-verifier tests. The default `npm test` is not proof that every standalone script test ran; record `node --test scripts/tests/verify-release.test.mjs` explicitly.

Stop promotion, not all useful development, when an external gate is unavailable. Preserve disabled funds/network flags, existing release trust roots and all contributor branches. Publish small reviewable commits and truthful handoffs. Do not start paid development-agent workflows under this specification.

## 9. First implementation increment

Own only this specification, its implementation plan, `scripts/verify-release.sh` and `scripts/tests/verify-release.test.mjs`. Reproduce the empty-archive acceptance defect, add a failing regression, make the smallest refusal fix and run the existing plus expanded verifier suite. Do not change manifests, contracts, dependencies, workflows or the active CLI/payment files.

See [the first-increment implementation plan](../plans/2026-11-09-beta-first-increment.md). All other requirements remain open until individually evidenced; committing this specification does not complete beta.
