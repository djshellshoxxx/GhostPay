# GhostPay Policy Accounts (Scheme 2) — completion and safety handoff

**Snapshot:** 2026-11-22 UTC. **Status:** PARTIAL / BLOCKED. **Scope:** experimental scheme 0x47500002, noncustodial Pages-oriented design. **Repository:** https://github.com/djshellshoxxx/GhostPay

**Inspected main:** eb59d93cffed7848c4aac37d0e9650b87239c6da. This is a **source and PR reconnaissance report**, NOT a claim that the feature was implemented, tested, security-audited, approved, merged or deployed in this work cycle. The document is on an isolated branch for coordination. There is no approved public deployment, release trust root, automatic lost-key recovery, mainnet authorization or external audit established by this work.

## 1. Evidence basis and status meaning

Primary sources read on the exact main above:

- AGENTS.md; docs/ai/WORKFLOW.md; docs/ai/HANDOFF.md; docs/ai/ACTIVE_WORK.md.
- docs/adr/ADR-0027-policy-end-to-end-gates.md and docs/adr/ADR-0028-policy-recovery-authority-model.md; docs/specs/16-policy-account-recovery.md; docs/guides/policy-accounts.md.
- packages/contracts/src/PolicyAccount.sol (blob 1e5eeadfe7ba6e2a68f64e95ef1ca84afe12cbf4), PolicyAccountFactory.sol (d456eec25c744e1e992ca786b2f21eefdbdf81a7).
- apps/web/src/features/policy/chain.ts (758e19ef20d5f1ad2d3388979fb2d59e9db6578c), PolicyView.tsx (92b02eb63315b9afd01e653b268a5a6de9b59d64), PolicyCreate.tsx, PolicyPay.tsx, PolicyReceive.tsx, pay.ts, send.ts, paymentEvidence.ts, withdrawalState.ts, withdrawalJournal.ts, withdraw.ts and flag.ts.
- packages/policy-scheme/src/record.ts (b6b3a7b25d3f5b436a5a87da5b46ad6f7295db08); package.json for app/library and contracts Foundry configuration.
- Current metadata and descriptions for policy PRs #345, #357, #362, #368, #374, #375, #385, plus independent key-recovery PR #372, donor #211, and P0 recovery audit #455.

Definitions: VERIFIED_COMPLETE = demonstrated to satisfy the stated bounded scope at a qualified source head; IMPLEMENTED_UNVERIFIED = source exists but current-head execution/acceptance absent; PARTIAL = some required behavior exists; MISSING = capability absent in inspected main; BROKEN = confirmed source-level contradiction to a requirement; BLOCKED = owner/authority/deployment/qualification decision required; NOT_APPLICABLE = outside the documented contract's semantics. All statuses in the next table refer to **main**, not to unmerged candidates.

## 2. Current main implementation/dependency matrix

| Feature boundary | Main status | Exact observation / dependency | Next acceptance |
| --- | --- | --- | --- |
| Feature flag and experimental scope | VERIFIED_COMPLETE (static source behavior) | flag.ts defaults off; opt-in VITE_GHOSTPAY_EXPERIMENTAL_POLICY=1; warning states no lost-key recovery or pinned deployments | Retain off-by-default and testnet boundaries on every candidate |
| Policy inputs, hash and limits | PARTIAL | policy-scheme validation, hashed limits and strict v1 record implementation exist | Versioned chain/factory/implementation commitments and supported asset policy |
| Seller policy record import and identity | BROKEN in main | PolicyView.tsx addRecord deduplicates only by policyHash; separate sellers may legitimately use identical terms | Recover #357/#362/#368 and test both public-key identities, import and export |
| Record privacy/persistence | MISSING (encrypted policy-record persistence) | PolicyView.tsx keeps records in React useState; public-record manual download/import exists; do not confuse with seller secret vault | Versioned encrypted browser record, cross-tab CAS, atomic import, restore, corruption rejection and key separation |
| Counterfactual derivation | IMPLEMENTED_UNVERIFIED | policy-scheme derive and factory deterministic clone, local vectors/tests from older handoffs | Revalidate exact authenticated factory/implementation, predicted address, code hash and deployment profile on current head |
| Deployment authentication | BLOCKED | chain.ts PINNED_POLICY_DEPLOYMENTS is empty; browser can enter a factory and router but no published verified profile is approved | Owner-approved testnet profile, canonical code-hash and immutable getter checks, upgrade/proxy drift refusal |
| Scheme-2 request/ordinary invoice interoperability | MISSING (supported ordinary invoice path) | ADR-0027 identifies the ordinary invoice schema as scheme 1 only; experimental PolicyPay accepts raw scheme-2 meta-address separately | Versioned scheme-2 request with stable invoice/chain/deployment/asset/amount/expiry identity |
| Native/EVM ERC-20 payment preparation | PARTIAL | pay.ts and send.ts prepare/decode/router-bound transactions; PolicyPay.tsx offers native or pasted token address | Restore asset/typed-data review guards and enforce supported token profile before each wallet prompt |
| Submission and unknown-outcome handling | PARTIAL | existing wallet-attempt journal and PolicyPay broadcast state; #374/#375/#385 add safeguards; check first-hash fix family #427/#440 before integration | Crash/reload/tab/approval hash preservation, precise unknown-outcome lock and explicit resumption |
| Independent payment receipt proof | IMPLEMENTED_UNVERIFIED | paymentEvidence.ts verifies router, announcement, transaction/receipt, native or exact ERC-20 transfer; observed default-branch code search lists module and tests, not a production UI caller | Wire a canonical evidence record and reorg-invalidated, unique credit into supported invoice status; do not equate successful broadcast with payment attribution |
| Scheme-2 announcement scan | PARTIAL | PolicyReceive.tsx and scan2.ts match announcements and account predictions with session guards | Bind events to verified source/deployment/record and deduplicated canonical receipt; test RPC completeness/reorg |
| Account deploy/view and request withdrawal | PARTIAL | PolicyReceive.tsx uses withdrawalState.ts full bounded history and fresh read-back, withdraw.ts signing, Factory deploy | Test coherent canonical history, nonce and limits and deterministic identity across actual local-chain operations |
| Withdrawal assets and prepared-call guards | PARTIAL in main | Asset coverage, wallet-time guards, canonical decoder/typed-data restoration and tests are proposed in #374/#375/#385 | Qualify stacked heads, reject unsupported assets and altered prepared calldata immediately before submission |
| Durable withdrawal action journal | IMPLEMENTED_UNVERIFIED | withdrawalJournal.ts requires navigator.locks plus attempt storage; guarded reload and scope logic exist | Real multi-tab race, storage failure, journal corruption, chain reorg and unknown-outcome acceptance |
| Pending-operation recovery | PARTIAL | withdrawalState.ts reconstructs bounded canonical events, checks receipts/requests and blocks incomplete history | Exercise request/execute/cancel/reload/reorg with real Anvil and browser interruption |
| Owner-key recovery after total loss | MISSING | PolicyAccount.sol fixes owner on initialize; no owner replacement/recovery method; ADR-0028 unaccepted model is not contract code | Owner approval of authority design, versioned contract, EIP-712/ERC-1271 tests, independent audit |
| Revoking pending operations | PARTIAL | Owner can cancel pending withdrawals and destination proposals; no general withdraw/recovery privilege delegation | Verify nonce, replay, cancellation and adversarial race behavior |
| Revoking/replacing the immutable account policy | MISSING for existing clone | Limits immutable, no upgrade or owner-rotation recovery; creating another account does not move assets automatically | Specify successor scheme semantics and safe migration of remaining funds after authorized delays |
| Browser management and recovery | PARTIAL | Create, Pay, Receive, deploy, scan, request, cancel and execute UI present; no actual lost-key authority flow | End-to-end browser restore, account list, backed-up state, security/finality status, i18n and accessible review |
| Automatically refunding an expired *completed* payment | NOT_APPLICABLE without new authority | Expiration of an invoice is not an on-chain transfer reversal; current router moves value directly | Do not advertise refunds; separate voluntary sender/recipient agreement or independently approved escrow design |

**Status limitation:** source review proves presence/absence of inspected APIs and UI wiring, not correctness of all reachable states. A past test log applies only to its exact tested tree, not automatically to current main, a stacked candidate or production.

## 2A. P0 structural risk: counterfactual funds may be undeployable

**Source-level risk confirmed; exploit/fund-loss reproduction not executed in this cycle.** GhostPayPolicyRouter.sol::_checkPolicyAccount checks only that the recipient equals FACTORY.predictAddress(owner, policyHash). It does **not** authenticate the policy preimage, owner-controlled backups, a deployable configuration or the existence of clone code. A transfer to the counterfactual account can therefore succeed before the account exists. PolicyAccountFactory.sol::deploy subsequently requires the actual destination, delay in its accepted bounds, limitsRoot and payment/waiver of any factory fee. PolicyPay.tsx/pay.ts currently prepare payments from a scheme-2 meta-address and do not require that the recipient's policy preimage/record is recoverable.

Consequently, **a correctly predicted counterfactual address is not evidence the recipient can ever deploy or withdraw the funds**. A lost record/limits leaves, an unsupported delay, a malicious or malformed advertised commitment, missing deployment-fee availability, or unapproved factory profile can leave a funded address inaccessible. Record import/backup does not restore a totally lost signing key. The fee-waiver implementation handles some failed transfers but cannot establish that every fee-token failure is recoverable.

Before enabling real-value payments, explicitly decide and test one of: (a) fail closed until an authenticated, already-deployed account with matching owner/policy is verified on-chain, or (b) accept counterfactual payments only under a separately reviewed and authenticated deployability, record-availability, fee and recovery proof design. Avoid assuming a seller attestation makes a private preimage cryptographically reconstructible; do not solve the risk by exposing linkable policy parameters on-chain without an explicit privacy review.

Required local-chain regression: construct a factory-predicted account for a policy hash whose required preimage is not provided, demonstrate the router's current transfer admission, and demonstrate the subsequent inability to call factory.deploy with known valid materials; then verify the approved production payment path **refuses the unsafe configuration before any wallet request**. Separately test a valid funded counterfactual account, token/nonnative fee failures, owner-key backup loss, and an existing deployed account. Keep any attack/failure reproduction local and unfunded.

## 3. Unmerged code to reuse before implementing new functionality

Integrate the current policy stack **in order and only after ownership/CI review**:

1. [#357](https://github.com/djshellshoxxx/GhostPay/pull/357), head e871eccc1238b7145cd1d0a667afb393c373cf83, based on main: seller-bound policy record identity; draft/unqualified.
2. [#362](https://github.com/djshellshoxxx/GhostPay/pull/362), head 67542c09ba180eec95004fb9b7a6d52d1a8dd809, based on #357: distinct export filenames, restore fixtures/catalog fixes; draft.
3. [#368](https://github.com/djshellshoxxx/GhostPay/pull/368), head 18d0442a156106abe2309f8a6e82358aab37961a, based on #362: security translation classification; open child of the stack.
4. [#374](https://github.com/djshellshoxxx/GhostPay/pull/374), head 821700d172dc638e1c06f35a03ca5f0c215fd46d, based on #368: asset-coverage and wallet-time guards; draft; author reports passing historical suite evidence but explicitly retains hosted/browser gates.
5. [#375](https://github.com/djshellshoxxx/GhostPay/pull/375), head 2e0aff8490086a54fadd52c2fa4d802605b7920e, based on #374: canonical decoder, policy typed-data/leaf and prepared-payment validation; draft; native-chain/exact-head gates outstanding.
6. [#385](https://github.com/djshellshoxxx/GhostPay/pull/385), head d981b19ff34c400251c2c398643a337a4205b06c, based on #375: review race tests and Anvil proof fixture correction; draft/unqualified.

The independent [#345](https://github.com/djshellshoxxx/GhostPay/pull/345) review invalidation guard and its test repair #359 must be compared semantically; #374 claims to have preserved #345's behavior. Do not cherry-pick both without evaluating duplicated hooks or state revisions.

[Recovery/privacy PR #372](https://github.com/djshellshoxxx/GhostPay/pull/372) is broad and separately stacked: it contains independent payment-key export/recovery, custody and privacy repairs. **It does not add Scheme-2 on-chain owner-key recovery**. Do not reuse its word "recovery" as proof that the missing contract function exists. Its author reports some green CI but unresolved security/browser/ownership gates. P0 [#455](https://github.com/djshellshoxxx/GhostPay/pull/455) also distinguishes transaction refund capability from offline refund planning and documents the broader recovery chain.

A prior 433-branch census at an older SHA is useful provenance, not evidence that all remaining branches are mergeable, semantically unique or safe. Recheck every intended donor against **current main and its exact parent** before code integration; retain parents and merge sequencing. There is a generation-11 integration lease held by another coordinator (reported as 994a0d214fb9-root-r3); this documentation branch does not acquire or override it.

## 3A. Hosted CI verification of candidate branch heads (not main)

Observed directly through GitHub commit check-runs on 2026-11-22; the results below belong to the **specified exact SHA** and are not new local executions.

- **#385 at d981b19ff34c400251c2c398643a337a4205b06c:** 35 reported checks: **32 success, 3 skipped, 0 failed**. The successful checks include TypeScript, web and other workspace tests, contracts, contract coverage/Slither, full and lean browser e2e, static/lean Pages build, Pages-on-Anvil browser, and beta acceptance. The three skipped checks were "Deploy to GitHub Pages", "Post-deployment smoke test" and "Release gates (typecheck, lint, unit, mocked lean browser suite)". The main CI run is [44897887391](https://github.com/djshellshoxxx/GhostPay/actions/runs/44897887391). **Zero GitHub PR reviews were recorded** when checked. Green hosted checks do not constitute an independent security audit, policy-authority approval, or qualification of a future consolidated main.
- **Parent #375 at 2e0aff8490086a54fadd52c2fa4d802605b7920e:** its earlier exact-head run [44883454132](https://github.com/djshellshoxxx/GhostPay/actions/runs/44883454132) had failing "typescript" and "ts-test (rest-0)" jobs. #385's new head is green, which supports a repaired child, **not** a retroactive claim that the parent's SHA was green.
- **Broad recovery/privacy #372 at 055d33e042c63edf1d5bbbdd7833d3c1ef93733d:** integration, beta and most CI checks succeeded, but "qualify" and "mythril" checks **failed** on its inspected head; do not promote this source as fully release-qualified. It is not Scheme-2 owner recovery regardless.

Source selection and risk still require review of how #345, #357, #362, #368, #374, #375 and #385 compose with current main, active ownership, cryptographic proof/privacy requirements and current deployment policy. Browser smoke in CI does not prove physical-device or real-wallet acceptance.

## 4. Recovery authority: BLOCKED — owner acceptance required

ADR-0028, dated 2026-11-09, is an **unaccepted executable design model** with 19 historical local model tests, not a deployed or implemented Solidity recovery path. Current PolicyAccount owner is immutable after initialization and old clones cannot gain recovery through new browser code.

| Choice | Authority and consequence | Can it satisfy lost-key recovery? | Decision |
| --- | --- | --- | --- |
| A. Existing owner-only | Existing owner or viable backed-up signing key; no third-party override | No, if every authorized key/backup is gone | Permissible noncustodial baseline but fails the new lost-key acceptance |
| B. Destination-priority challenge | Current withdrawal destination may admit recovery of owner; one finite objection grace; existing owner cannot veto indefinitely | Yes, if current destination key survives and it wins the admission race | Requires explicit acceptance of destination compromise and withdrawal-freeze risks |
| C. Independent committed recovery quorum | Separately authenticated recovery threshold; changes policy commitment and UX/privacy | Yes, if threshold retains enough live independent keys | Optional-only if accepted; do not introduce mandatory guardians |

Reject any claim that the old inactivity/cancel rate-limit design bounds griefing. ADR-0028 establishes that a compromised owner can act repeatedly before the inactivity period, postponing admission indefinitely. Candidate B's model gives a conditional post-admission eligibility bound but grants the destination powerful recovery rights and can permit repeated hostile freezes. Candidate C can trade risk for quorum availability but would require a commitment format and possibly a new scheme version.

**Owner decision required:** select A, B or C (or explicitly reject all and request a new model); specify who may replace the owner when existing owner and surviving recovery authority disagree; approve cancellation/finality, loss and privacy tradeoffs and recovery parameters. Do not silently select B, do not introduce mandatory guardians, hidden GhostPay administrator keys, mandatory hosted services, or any unilateral spending authority.

Any accepted B/C follow-on contract must define authenticated clone/factory identity, owner/destination/recovery epochs, distinct nonce spaces, EIP-712 scope, strict ERC-1271 handling, old-signature invalidation, freeze semantics, pending-withdrawal epochs, limits persistence, destination rotation ordering, counterfactual initialization and canonical event replay. Owner-loss restoration without any usable authority is impossible under those choices and must be disclosed.

**Design-only work that can proceed now:** evaluate threat models and compatibility, create read-only local-chain test fixtures for the accepted invariant boundaries, specify backup/identity semantics and classify future browser states. No contract ABI or production change should be presented as qualified while the authority choice is unresolved.

## 5. Dependency-ordered implementation backlog

### P0 — preserve safety and identify authoritative source

- [ ] Freeze exact main, all donor heads/merge bases, all owner claims and CI run identifiers.
- [ ] Confirm current integration lease holder and explicit sequencing approvals. Do not bypass.
- [ ] Reconcile #357 -> #362 -> #368 -> #374 -> #375 -> #385 against current main, #345/#359 and #211 source; preserve seller-specific identity, wallet review invalidation, approved hashed attempts, typed calldata and localization.
- [ ] Test independently on final combined head; eliminate failing Anvil proof fixtures without weakening contract negativity tests.
- [ ] Keep Scheme 2 disabled for real funds and leave deployment profiles empty until approved and verified.

### P1 — independent of the recovery authority decision

- [ ] Specify **version 2** policy records carrying chain ID, factory/router/implementation, canonical deployment profile version/code hashes and seller public identity; retain v1 import only with explicit untrusted/legacy status. Never reinterpret a scheme-1 invoice as scheme 2.
- [ ] Store verified public policy records using existing encrypted browser-storage architecture, atomic writes and conflict detection; never store private keys inside public policy records. Enforce identity as seller *and* policy/account/deployment, not policyHash alone.
- [ ] Verify a supported testnet deployment at a canonical block with code hashes, immutable getters, chain and asset profile; no manually pasted address becomes a trust root.
- [ ] Add versioned scheme-2 payment request identity and expiration; map supported assets to verified deployment and exact-decimal semantics.
- [ ] Connect already existing paymentEvidence.ts to the supported receipt/reconciliation path; unique canonical event/receipt proof and reorg invalidation required. Successful wallet receipt does not by itself establish invoice attribution.
- [ ] Qualify withdrawalState.ts history reconstruction plus withdrawalJournal.ts with crash/reload/multi-tab, hash preservation, incomplete RPC pages and storage denial; block duplicate attempts on an unknown outcome.
- [ ] Complete browser account list, import/export/restore and ongoing security status, with explicit approvals for sensitive actions and idle lock cancellation.
- [ ] Define policy expiration and replacement UX truthfully: expiring a request is not a fund return and the existing policy account is immutable.

### P1 — authority-dependent work only after an accepted design

- [ ] Update the applicable contract specification/ADR, protocol and threat model before implementation.
- [ ] Implement separate versioned experimental contract/factory behavior and update ABI/client derivation only within the approved scheme; never pretend legacy funded clones inherit new owner recovery.
- [ ] Add initiation, authenticated admission, bounded challenge, optional single objection if approved, execution, old owner invalidation, nonce/epoch replay tests and recovery cancellation according to the chosen model.
- [ ] Preserve token limits, dest restrictions and pending request invalidation; prove recovery cannot independently broaden spending privileges.
- [ ] Add browser recovery review, explicit wallet authorization, accepted model disclosure, interrupted/failed recovery resumption, canonical replay and lost-all-keys unrecoverable status.
- [ ] Separate external independent security review and migration/deployment authorization from implementation completion.

### P2 — end-to-end hardening and acceptance

- [ ] Unit tests for records, typed data, policy hash, seller binding, limit proofs, validation and stale approvals.
- [ ] Foundry local tests for legitimate/unauthorized native/ERC-20 payments and withdrawals, wrong tokens, exact amounts, unexpected token behavior, reentrancy, signature/nonce replay and destination changes.
- [ ] Bounded fuzz/property/invariant tests for policy constraints and every accepted recovery state, including owner activity/griefing, dest compromise, ERC-1271 revert/magic, failed auth/nonces, timestamp edges and clone initialization.
- [ ] Integration tests on local Anvil through real router and policy account calls, including actual receipt evidence, escrow-free fund movement, record restore, revoke/cancel and valid/invalid withdrawals.
- [ ] Playwright account-create -> backup -> pay -> verified receipt -> deploy -> request -> reload -> execute -> fresh profile restore; browser variations test tab races, wallet disconnect, wrong chain, malformed inputs, storage loss, RPC partial responses and reorgs.
- [ ] Full app unit/typecheck/lint/build, lean Pages bundle scanning, secret and tx-origin/action checks, locale/security messages, browser and host acceptance.
- [ ] Independent source/security review on **final combined head** and required owner approvals, not only overlapping earlier tests.
- [ ] Confirm no unresolved critical correctness defect; leave real-network deployment and release separate until authorized.

## 6. Adversarial acceptance matrix

| Test theme | Expected refusal or proof |
| --- | --- |
| Wrong factory/router/chain/implementation, getter-compatible impostor, proxy drift | No trusted deployment and no wallet request |
| Malformed/legacy/unbound record, duplicate same seller, same policy different seller | Reject invalid record; retain distinct valid seller records with correct account ownership |
| Unsupported token, wrong limit leaf or Merkle root, noncanonical calldata, modified review | No policy payment or withdrawal wallet request |
| Owner signature on wrong chain/account, wrong EIP-712 domain/nonce/deadline | Contract rejects; refused action cannot consume successful nonce |
| Browser edits after review or between wallet prompts | Subsequent payment blocked; already mined allowance still recorded and disclosed |
| Duplicate broadcast, unavailable receipt, page reload, another tab | No automatic retry; preserve first hash and unknown outcome until canonical reconciliation |
| Failed fee transfer and counterfactual funding | Never quietly strand funds through an unsupported/dependent fee path; do not claim unconditional recoverability |
| Incomplete logs, mismatched receipts, reorg, stale block | No success or withdrawal authority inferred from unauthenticated history |
| Lost seller backup vs lost owner key vs lost every recovery key | Distinct states and restoration prerequisites; no invented recovery guarantee |
| Continuous malicious owner activity, current/former destination signatures, ERC-1271 failure | Prove only the explicitly approved model's safety/liveness boundaries; old authority cannot replay |
| Public metadata/policy-hash leakage | Analyze and document linkability; contract ABI/privacy change requires explicit owner signoff |

Historical PR authors' local runs are **attributed historical evidence**, not fresh tests on this handoff branch. In this cycle no local repository checkout, npm workspace tests, Forge/Anvil tests, browser tests, fuzzers, live RPCs or independent audit were run; the local runtime cannot resolve github.com for git clone. GitHub connected source/PR inspection is available. No production source was edited.

## 7. Suggested commands for an execution-capable worker (not run in this cycle)

From a fresh checkout of an explicitly approved candidate head:

~~~sh
node --version                 # repository requires Node >=22
npm ci
npm run build:libs
npm test -w @ghostpay/policy-scheme
npm run typecheck -w @ghostpay/policy-scheme
npm run typecheck -w @ghostpay/web
npm run lint -w @ghostpay/web
npm test -w @ghostpay/web      # coverage + no-coverage app suites
npm run build -w @ghostpay/web
npm run test:e2e -w @ghostpay/web
(cd packages/contracts && forge test)
node --test scripts/experimental/policy-recovery/model.test.mjs
git diff --check
~~~

This is a planned gate list, not a claim these commands will all be runnable in every environment. Use repo CI for broader security and lean-build gating; record full commands, SHA, versions, failures and skips. No simulated pass counts.

## 8. Permanent evidence register and release disposition

| Field | Observation |
| --- | --- |
| Main SHA at reconnaissance | eb59d93cffed7848c4aac37d0e9650b87239c6da |
| Task branch | audit/ghostpay-scheme2-completion-20261122 |
| This task's source changes | None; documentation and additive ownership claim only |
| Policy source candidate | #357 -> #362 -> #368 -> #374 -> #375 -> #385, unmerged at snapshot |
| Independent payment-key recovery | #372, NOT a Scheme-2 owner-rotation implementation |
| Authority decision | BLOCKED: ADR-0028 unaccepted (A/B/C) |
| Contract deployment approval | BLOCKED |
| Runtime/payment safety qualification | BLOCKED pending combined exact-head tests |
| Policy record v2/encrypted state | MISSING in main |
| Browser E2E acceptance this cycle | NOT RUN |
| Contract/Anvil/fuzz this cycle | NOT RUN |
| Independent review this cycle | NOT RUN |
| Merges, releases or deployment | None |
| Final Scheme-2 status | PARTIAL / BLOCKED — not functionally complete or production-ready |

**Next authorized engineering handoff:** coordinate integration of the existing seller identity/asset authorization guard stack, then implement independently approved record/evidence/browser enhancements on isolated tested branches. Track the recovery authority decision separately and keep any new recovery contract strictly experimental until approval. Never label the feature VERIFIED_COMPLETE merely because imports, proofs or a wallet receipt worked in isolation.
