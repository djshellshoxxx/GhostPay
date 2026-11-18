# GhostPay feature completion matrix — 2026-11-16

> **Historical snapshot.** Current implementation, source-pinned checks, integration decisions and remaining gates are maintained in [GHOSTPAY_MASTER_COMPLETION_LEDGER.md](GHOSTPAY_MASTER_COMPLETION_LEDGER.md). The older statuses below do not override that ledger.

## Review basis

Source review uses candidate `4ee9dd770826e705cb8c2437a53cf6714a003635` plus follow-up source commit
`8092e2f7f213f67033d99bb0fd0e408620d24ea2`, its
`docs/handoffs/GHOSTPAY_CAVEMAN_CONTINUATION_2026-11-16.md`, the numbered specification status,
the listed package specifications, and exact-head GitHub check logs. This is not a completed external security audit.
The candidate is not release-qualified: its hosted web test and locale/catalog validation fail. Local dependency
installation in this execution exited 137, so this session has no new local suite result.

**Status definitions:** COMPLETE requires implementation, wiring, tests, security review and documentation at a
qualified head. PARTIAL means source exists but one or more requirements or qualification gates remain. MISSING means
the specified capability is absent. BLOCKED means product/authority or external evidence is required first. DEFERRED
means explicitly outside the static EVM beta.

## Current static EVM beta

| Feature | Status | Evidence | Remaining acceptance |
|---|---|---|---|
| Keys, encrypted vault and verified backups | PARTIAL | `apps/web/src/lib/session.ts`, `keyVault.ts`; vault and SellerKeys suites; custody changes on #182 | Run exact-head suites and browser-process restart acceptance; real device lifecycle remains external. |
| Signed invoices, wallet review and payment | PARTIAL | `invoiceCreate.ts`, `pay.ts`, `payExec.ts`; Pages journeys | Exact-head CI is red. Release-signed manifest and external wallet acceptance remain. |
| Submission journal and uncertain outcomes | PARTIAL | `duplicateAttemptJournal.ts`, `wallet.ts`, wallet-attempt UI | Qualify exact combined head and retry/replacement behavior; transaction success does not prove invoice attribution. |
| Scan, finality, reorg and evidence | PARTIAL | `scannerCore.ts`, `scanClient.ts`, scanner tests | Provider disagreement and all final-head browser journeys need requalification. |
| Invoice reconciliation | PARTIAL | `packages/ux-vault/src/reconciliation-portable.ts`, ledger UI; #182 adds explicit-link bigint summaries | Canonical block-time matching remains absent; imported and legacy data remain manual-review evidence. |
| Sweep | PARTIAL | `apps/web/src/lib/sweep.ts`, sweep journal and Pages journey | ERC-20 allowlisted-token real-chain acceptance and exact-head requalification remain. |
| QR/device exchange | PARTIAL | Camera importer, QR exchange package and browser tests | Physical camera, glare and mobile permission acceptance remain. |
| Static delivery and network boundaries | PARTIAL | Pages build, CSP, artifact checks and workflows | Dedicated origin, approved release configuration and exact-head CI remain. |

## Numbered specifications

| Spec | Capability | Status | Current evidence and remaining work |
|---|---|---|---|
| 01 | Manifest readback | PARTIAL | Runtime hashes and router constants are checked. Canonical announcer hash and proposed cache are absent; verified deployment data is required. |
| 02 | Scanner robustness and expected payment | PARTIAL | Bounded scan and router proof exist. #182 adds local explicit-link amount summaries. Canonical block timestamps and final-head qualification remain. |
| 03 | Fiat feeds | PARTIAL | Fail-closed unavailable behavior exists. Verified feed inventory, provider reads and acceptance are required before enabling missing combinations. |
| 04 | Permit griefing fallback | PARTIAL | Classifier and refusal paths exist. Combined contract, relayer and web qualification remains; optional contract extension is not approved by default. |
| 05 | Announcer spam and privacy disclosure | PARTIAL | Bounded trusted/open lanes, replay memo and disclosures exist. Provider and oversized-block limits remain documented; no measured anonymity claim. |
| 06 | ERC-6538 registry | PARTIAL | Read/write UI and #182 nonce/delegation builders exist. ENS lookup and delegated signing/send/UI integration remain. |
| 07 | Relayer observability | PARTIAL | Authenticated opt-in `/metrics` and ops tools exist. Separate metrics listener, `/v1/stats`, signed alert webhook and live scrape/receiver acceptance are missing. |
| 08 | Archive import/export and rotation | PARTIAL | Atomic `TagStore.applyBatch` replaces draft journal design. Recheck crash guarantees and exact-head suites. |
| 09 | Verified chain/token/deployment matrix | MISSING | Machine-readable enabled-chain-to-verified-deployment matrix and CI binding rule are absent. Must use verified primary-source data. |
| 10 | Privacy-aware stage-1 scanning | PARTIAL | User-configured transport, fixed windows and fail-closed disclosures exist. Browser cannot itself prove a SOCKS/Tor route; operator/user acceptance remains. |
| 11 | BIP-352 wallet hardening | DEFERRED | Retained full-profile implementation and tests; not part of static beta. Final cross-package, wallet and device qualification remains. |
| 12 | BIP-352 light scanning | DEFERRED | Header-sync implementation and tests exist. Persistent real-node compatibility and full spec qualification remain. |
| 13 | Gas buffer v2 | PARTIAL | Full-profile policies exist; lean excludes v2 invoices. Feed-dependent display and optional contract extension remain separate gates. |
| 14 | Merchant embedding and identity | PARTIAL | Signed readback/embed handshake and unverified-identity notice exist. Remote profile URL loading, trusted identity pinning and template presentation are absent. |
| 15 | AA / EIP-7702 policy account | BLOCKED | Experimental path exists. Policy-hash calldata disclosure needs an ABI/privacy decision before enabling functional account behavior. |
| 16 | Guardian recovery | BLOCKED | Design exists, implementation does not. Authority model, schema/contract choice and adversarial invariants need approval. |
| 17 | Milestone escrow | DEFERRED | Separate product brief only. Custody, dispute and authority prerequisites must be decided before implementation. |

## Other audited completion gates

| Area | Status | Evidence-based remaining work |
|---|---|---|
| Cryptography and stealth flows | PARTIAL | EIP-5564 and related implementations/tests exist. Independent final security review, real-wallet acceptance and exact-head qualification remain. |
| Contracts and account abstraction | PARTIAL | Unit/fuzz/invariant suites and static gates exist. Four policy-contract cases, real analyzer campaigns and deployment review remain unqualified. |
| Relayer, sponsorship and abuse controls | PARTIAL | Source, tests, queues, budgets and fail-closed paths exist. Spec-07 interface gaps and real pool proof acceptance remain. |
| Chain adapters | PARTIAL | EVM/BTC and experimental adapters exist. Verified chain/token matrix, external sources and per-adapter production acceptance remain. |
| Internationalization | PARTIAL | English plus machine-drafted Spanish/Japanese/Arabic catalogs exist. Candidate's locale-key errors are fixed in this follow-up; fresh catalog CI and native review remain. |
| Deployment and release engineering | BLOCKED | ADR-0029 and release-origin, signing trust root, approved testnet manifests, fee/deployer decisions and protected release checks remain. |
| Documentation | PARTIAL | Specs, handoffs and user/developer docs exist. This run adds current matrix/progress/recovery records; reconcile remaining source drift after qualification. |
| Independent security review | BLOCKED | No independent final release audit is evidenced. Candidate-specific CodeQL/Sonar clearance and external review are required. |

## Explicit external and product blockers

Do not invent chain addresses, code hashes, oracle feeds, signing trust roots or fee recipients. Obtain approved
testnet deployment data, serving-origin decision, release-signing configuration, legal/policy decisions, real external
wallet/mobile/Safari/screen-reader and native-language acceptance, fresh CodeQL/Sonar results, and independent security
review. Resolve guardian authority, policy-account ABI/privacy, and escrow authority before claiming those designs
complete.
