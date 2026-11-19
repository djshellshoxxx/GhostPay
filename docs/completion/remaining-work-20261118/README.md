# GhostPay remaining-work execution ledger

Snapshot: `2026-11-19T09:21:11.859589+00:00`. Main: `14ded337a10c140d7a9f9a9238ec038587d925bb`. Local candidate: `1cb5f907923a2d67587a303882b10c9bfea175b7`.

Previous published checkpoint: `28edbcf55093a6d6056232fd59ef37a2ae832b9a`, [PR #246](https://github.com/djshellshoxxx/GhostPay/pull/246), stacked on #238. This ledger records the source snapshot before its own packaging/publication commit. The current PR description and publication commit identify the verified delivered head and tree.

## Counts and meaning

```json
{
  "tasks": 87,
  "statuses": {
    "INTEGRATED": 50,
    "MERGED": 1,
    "BLOCKED": 12,
    "SUPERSEDED": 11,
    "REQUIRES OWNER DECISION": 13
  },
  "already_complete_at_start": 9,
  "integrated_tasks": 50,
  "superseded_total": 11,
  "scope_reference_only": 2,
  "newly_implemented_integrated": 51,
  "main_merged": 1,
  "historical_features": 194,
  "historical_security_records": 49,
  "prs": 264,
  "open_prs": 59,
  "github_confirmed_pr_merges": 63,
  "closed_unmerged_prs": 142,
  "non_pr_issues": 1,
  "excluded_owner_streams": 7
}
```

Each task below is counted once. Feature, security and PR crosswalks preserve the wider source inventory; they are not additional completed tasks. Local integration, hosted qualification and a GitHub-confirmed merge into main are separate states. Historical percentages are not reused. The nine already-complete tasks and the two scope-only superseded references are reported separately; the newly implemented, integrated and main-merged counts overlap and must not be summed. Historical audit cells are explicitly nested under `historical_assessment`; supported-scope decisions and current defect dispositions are recorded separately.

## Prioritized tasks

| Task | Priority | Requirement | Status | Remaining requirement/blocker |
|---|---|---|---|---|
| RW-ABI-PRIVACY | P0 | Resolve seller-constant policyHash exposure before enabling scheme2 | REQUIRES OWNER DECISION | Approved ABI/protocol migration in lockstep with clients/routers and independent audit required |
| RW-CONFIDENTIAL-BINDING | P0 | Resolve confidential note/cross-chain binding findings requiring protocol evidence | REQUIRES OWNER DECISION | Need approved backend/proof-domain and transfer-binding design;cannot infer missing cryptographic authority |
| RW-CONFIDENTIAL-FORWARD | P0 | Do not copy attacker-controlled returndata during confidential native forwarding | INTEGRATED | Final combined qualification and eligible main merge |
| RW-FEE-ACK | P0 | Require token-specific acknowledgement for fee-charging policy factories; reject trailing-newline bypass and misleading missing-fee diagnostics | INTEGRATED | Final combined qualification and eligible main merge |
| RW-FEE-FREEZE-RESIDUAL | P0 | Disposition immutable fee-token freeze risk beyond deployment acknowledgement | REQUIRES OWNER DECISION | Choose eligible fee/token/commercial policy or approve a specified fail-open protocol change;never silently change recipient |
| RW-LEDGER-TOLERANCE | P0 | Require a counted payment before positive-due invoices can settle within tolerance | INTEGRATED | Final combined qualification and eligible main merge |
| RW-MANIFEST-IMPLEMENTATION | P0 | Verify the policy implementation runtime hash in verifyDeployment | INTEGRATED | Final combined qualification and eligible main merge |
| RW-ORIGIN-TRUST | P0 | Choose dedicated origin and establish independent release trust roots | REQUIRES OWNER DECISION | Owner must choose/configure dedicated hosting, release keys and out-of-band trust;no production publication authorized |
| RW-PERMIT-NONCE | P0 | Reject nonce RPC responses that are not exactly one ABI uint256 word | INTEGRATED | Final combined qualification and eligible main merge |
| RW-POLICY-ASSETS | P0 | Block locally known policy assets without a valid withdrawal leaf | INTEGRATED | Final combined qualification and eligible main merge |
| RW-POLICY-N09 | P0 | Validate policy inputs/proofs before secret copies and canonical calldata | INTEGRATED | Final combined qualification and eligible main merge |
| RW-POLICY-N10 | P0 | Reconstruct the permitted EIP-712 domain/types/message before policy signing | INTEGRATED | Final combined qualification and eligible main merge |
| RW-POLICY-N11 | P0 | Bind scheme-2 payment metadata/ephemeral point/view tag before wallet requests | INTEGRATED | Final combined qualification and eligible main merge |
| RW-POOL-CEREMONY | P0 | Replace insecure development ceremony before any production pool claim | REQUIRES OWNER DECISION | Independent circuit audit and real multiparty ceremony are external prerequisites;no production pool release |
| RW-POOL-SEED | P0 | Bound seed-backup parsing/KDF work, authenticate v2 headers and preserve bounded v1 recovery | INTEGRATED | Final combined qualification and eligible main merge |
| RW-QUOTE | P0 | Bound requested quote age by trusted heartbeat+300s and require valid Pay feed metadata | INTEGRATED | Final combined qualification and eligible main merge |
| RW-RECOVERY-AUTHORITY | P0 | Decide policy-account recovery authority without introducing guardians | REQUIRES OWNER DECISION | User authority preference does not approve a new fund-control protocol;no guardian/custody redesign |
| RW-SOL-COMPAT | P0 | Recover coherent Solana CLI derivation/domain/address compatibility | INTEGRATED | Real-chain acceptance and independent cryptographic audit remain separate |
| RW-TRON-COMPAT | P0 | Recover coherent TRON CLI address format and memo-binding refusal | INTEGRATED | Builder remains explicitly unsupported for transaction production until it can bind the existing memo requirement;no silent payable skeleton |
| RW-BETA-LOGS | P1 | Retain the existing hidden beta-acceptance log files in the restricted artifact | MERGED | See exact evidence in machine ledger |
| RW-BIDI-DOWNLOAD | P1 | Preserve inert bidi/download/input handling already recovered by integration | SUPERSEDED | See exact evidence in machine ledger |
| RW-BUFFERED-SWEEP-ACCEPTANCE | P1 | Demonstrate actual Anvil token payment plus gas-buffer-funded direct sweep | INTEGRATED | This is local compiled-contract acceptance,not actual OP fee or live-wallet qualification |
| RW-BUNDLE-SCAN | P1 | Preserve all-HTML scanning and shared lean exclusions | SUPERSEDED | See exact evidence in machine ledger |
| RW-CANCELLATION-FIXTURE | P1 | Correct the async-without-await cancellation fixture without changing its assertion | INTEGRATED | Final combined qualification and eligible main merge |
| RW-CLI-ARGS | P1 | Honor global CLI flags independently of argument position | INTEGRATED | Final combined qualification and eligible main merge |
| RW-CLI-INPUT | P1 | Classify malformed CLI observations as fixed typed input errors | INTEGRATED | Final combined qualification and eligible main merge |
| RW-CLI-RECONCILE | P1 | Do not treat stale observations as currently verified or export-confirmable | INTEGRATED | Final combined qualification and eligible main merge |
| RW-CLI-REDACTION | P1 | Redact bearer paths and escape terminal controls in CLI errors | INTEGRATED | Final combined qualification and eligible main merge |
| RW-COMPOSE-CI | P1 | Validate public Compose models with and without the onion profile | INTEGRATED | Final hosted step pending;no image lifecycle executed |
| RW-DEPENDENCIES | P1 | Reconcile minor/patch dependency updates with viem and coverage-provider compatibility | BLOCKED | Fresh hosted checks on published 3c95b2a before main merge |
| RW-DEPLOYMENT-MATRIX | P1 | Qualify73 chain/token/feed/deployment acceptance cells | BLOCKED | Requires actual deployment/readback evidence and approved network/release configuration;no deployment authorized |
| RW-DEVNET-CANONICAL | P1 | Reconcile local Base Sepolia browser fixture with canonical deployment verification | INTEGRATED | Full browser execution remains separate;both browser branches and production verification are unchanged |
| RW-EXAMPLE-CI | P1 | Run all existing merchant example tests and webhook selftest in CI | INTEGRATED | Final combined qualification and eligible main merge |
| RW-EXTERNAL-AUDIT | P1 | Obtain independent external cryptographic and contract audit acceptance | BLOCKED | External audit is explicitly owner-gated in the implementation specifications;no commissioned assessment or signed external acceptance is available |
| RW-FRAME-GUARD | P1 | Preserve restricted-view frame refusal | SUPERSEDED | See exact evidence in machine ledger |
| RW-GITHUB-ALERTS | P1 | Read CodeQL, Dependabot and secret-scanning alert inventories | BLOCKED | Connector does not expose alert inventories;passing scanner jobs do not prove zero alerts |
| RW-HOSTILE-TEXT-FIXTURE | P1 | Accept only the legitimate beforeunload dialog in the inert-text browser regression | INTEGRATED | Final combined qualification and eligible main merge |
| RW-IDB-CI | P1 | Wire existing two-tab IndexedDB browser acceptance into full-profile CI | INTEGRATED | Actual browser execution is not established locally; require new hosted full-profile step |
| RW-L2-DELAY-POLICY | P1 | Choose chain-specific policy withdrawal delay after censorship-bound verification | REQUIRES OWNER DECISION | Authenticated chain-specific inclusion/censorship policy and approved minimum are absent |
| RW-MANIFEST-LEGACY | P1 | Keep legacy runtime unsigned manifest consumers removed | SUPERSEDED | See exact evidence in machine ledger |
| RW-MYTHRIL | P1 | Disposition fresh pinned Mythril records without suppressing findings | REQUIRES OWNER DECISION | Finding-specific policy decision or a verified correction that closes the strict analyzer gate;#255 stronger evidence lane remains separately owned |
| RW-NATIVE-ACCEPTANCE | P1 | Qualify real wallets, mobile camera, Safari/Firefox, screen readers and Tor | BLOCKED | Physical/native environments and actual hosted endpoints unavailable in this execution environment |
| RW-NATIVE-FEE-RECIPIENT | P1 | Qualify immutable native fee-recipient acceptance before deployment | REQUIRES OWNER DECISION | Fee recipient and its acceptance behavior require owner-selected deployment evidence;do not change funds destination or fee policy |
| RW-OP-RELAYER-FEES | P1 | Include OP L1 and operator fees in quote, admission, reserves and settlement | INTEGRATED | Public OP-chain fee acceptance and exact resulting-head hosted qualification remain open |
| RW-ORACLE-CONFIG | P1 | Qualify same-chain sequencer/reference-price configuration and real feeds | BLOCKED | No authenticated same-chain sequencer/second-source deployment record or qualified fork/RPC configuration;do not invent addresses |
| RW-PACKAGE-METADATA | P1 | Align generated package graph and explicit pending owner-review closure metadata | INTEGRATED | Final combined qualification and eligible main merge |
| RW-POLICY-ASSET-PROTOCOL | P1 | Resolve withdrawal-asset uncertainty for payers with only a policy meta-address | REQUIRES OWNER DECISION | Meta-address alone lacks asset leaves;full protocol closure needs authenticated policy metadata/design |
| RW-QUALIFICATION | P1 | Qualify the resulting integrated candidate and merge only eligible checked source | BLOCKED | Exact delivered candidate full hosted matrix, strict analyzer closure and owner recovery integration remain open; local full invoice coverage failed with one timeout and CLI/relayer full typechecks were killed; none is claimed passing |
| RW-RELAYER-ADMISSION | P1 | Reserve per-client lane capacity before asynchronous admission and bound per-peer sockets | INTEGRATED | Exact combined hosted gates pending |
| RW-RELAYER-BREAKER | P1 | Open quote RPC outage breaker without consuming sweep probe state | INTEGRATED | Exact combined hosted gates pending |
| RW-RELAYER-CLIENT-429 | P1 | Classify pre-broadcast client_queue_full refusals honestly | INTEGRATED | Exact combined hosted gates pending |
| RW-RELAYER-FEE-RECIPIENT | P1 | Reject relayer fee recipients inconsistent with the verified manifest | INTEGRATED | Exact combined hosted gates pending |
| RW-RELAYER-LIMITER | P1 | Preserve live loss reservations and bounded fair overflow buckets | INTEGRATED | Exact combined hosted gates pending |
| RW-RELAYER-LOGGING | P1 | Contain stdout and log-sink failures and return fixed malformed-URL errors | INTEGRATED | Exact combined hosted gates pending |
| RW-RELAYER-READBACK | P1 | Require known-chain canonical announcer and configured-secondary deployment agreement | INTEGRATED | Canonical local browser-devnet fixture follow-up is integrated and reviewed;browser provider consent wiring remains with existing network owner#251 |
| RW-RELAYER-SIGNATURE | P1 | Reject noncanonical sweep signatures before costly owner/RPC work | INTEGRATED | Exact combined hosted gates pending |
| RW-RELEASE-INTEGRITY-SOURCE | P1 | Preserve origin, public-key denylist, attestation and smoke-check implementation | SUPERSEDED | See exact evidence in machine ledger |
| RW-SELFHOST-PINS | P1 | Pin nginx/Tor base image defaults and document actual HSTS/apt limits | INTEGRATED | Live image/startup/TLS acceptance remains separate |
| RW-SLITHER-VISIBILITY | P1 | Retain Low/Informational and ignored Slither findings beside the unchanged required gate | INTEGRATED | New report has not yet run on hosted nightly;no finding waived |
| RW-SONAR-INVENTORY | P1 | Obtain current Sonar findings beyond historical107-row triage | BLOCKED | Authenticated current Sonar access is unavailable;historical53fixed/23FP/16accepted/8routed/3obsolete/2thirdparty/2openlow is not a current inventory |
| RW-STATIC-HELPERS | P1 | Preserve static path, symlink containment and malformed-request repairs | SUPERSEDED | See exact evidence in machine ledger |
| RW-ESCROW-AUTHORITY | P2 | Resolve milestone escrow custody/authority specification | REQUIRES OWNER DECISION | Separate product/custody approval required;do not invent escrow execution |
| RW-EXPERIMENTAL-MODELS | P2 | Run existing recovery and escrow design-model tests in CI | INTEGRATED | Design-support checks do not select recovery/escrow authority or implementfundcontrol;new hostedstep pending |
| RW-HISTORICAL-ISSUE38 | P2 | Reconcile four historical bug-hunt findings and preserved source recovery | BLOCKED | Historical source-port acceptance must be confirmed by recovery/master owner;issue remains open |
| RW-I18N-CHECK | P2 | Retain required missing-key check and reviewed-critical-message fallback | SUPERSEDED | See exact evidence in machine ledger |
| RW-LEAN-BUFFER | P2 | Pin off-by-default v1 gas buffer and public-linkage disclosure in both profiles | INTEGRATED | Actual OP chain fees and real-wallet acceptance remain separate |
| RW-LIVE-HOSTING | P2 | Qualify live container startup, TLS/HSTS and onion reachability | BLOCKED | Requires actual operator host, authorized deployment and public reachability;this task does not deploy |
| RW-MERCHANT-PROFILE-CLOCK | P2 | Reject invalid runtime clocks in signed merchant-profile expiry verification | INTEGRATED | Conditional supplied-clock defect only; all finite numeric behavior and error precedence preserved; no remote exploit established;full-package qualification failure remains separate |
| RW-NATIVE-LOCALES | P2 | Obtain native-language review and decide remaining catalog rollout | BLOCKED | Native-speaker acceptance cannot be inferred from machine translation;no review flag fabricated |
| RW-POLICY-DELAY-COPY | P2 | Disclose unverified L2 policy-delay assumptions without inventing chain limits | INTEGRATED | Final combined qualification and eligible main merge |
| RW-PUBLIC-PACKAGES | P2 | Decide public SDK licensing, package publication and external merchant integrations | REQUIRES OWNER DECISION | Publication/licence, real shop/API and Shopify program access are absent;no mandatory service invented |
| RW-RELAYER-RECEIPT-STATUS | P2 | Reject absent or unknown mined receipt status before settlement | INTEGRATED | Final combined qualification and eligible main merge |
| RW-SDK-QUOTE-WARNING | P2 | Retain quote-expired warning semantics required by verifier specification | SUPERSEDED | See exact evidence in machine ledger |
| RW-SOURCE-PROVENANCE | P2 | Preserve original local source commits referenced by evidence after GitData publication | INTEGRATED | Capture precedes generated ledger/archive packaging;historical execution tools may still need recorded path mappings and separate Node/Foundry dependencies |
| RW-ACTION-UPDATES | P3 | Update two pull-request actions to the reviewed Node24 runtime | INTEGRATED | Live paid-workflow execution is neither authorized nor claimed;setup-python v7 is optional maintenance and remains unselected |
| RW-CONTEXT-HELP | P3 | Preserve open context help while pointer leaves the trigger | SUPERSEDED | See exact evidence in machine ledger |
| RW-DELAY-LABEL | P3 | Display fractional configured delay minutes accurately | INTEGRATED | Final combined qualification and eligible main merge |
| RW-FOCUS-ACCEPTANCE | P3 | Recover accepted in-view paste focus regression | INTEGRATED | Local Chromium socket restrictions;new hosted browser acceptance required |
| RW-LOW-DEPENDENCIES | P3 | Disposition17 remaining low development dependency findings | REQUIRES OWNER DECISION | cookie/elliptic development chains need reviewed compatible upstream migration;no blind major upgrade or unsupported override |
| RW-MAJOR-UPGRADES | P3 | Keep major dependency migration under its existing qualification owner | BLOCKED | Separate major compatibility matrix/owner work;do not auto-merge or duplicate active work |
| RW-DEPLOY-DOCS | P4 | Correct deployment allowlist, matrix counts and signed-manifest instructions | INTEGRATED | Final combined qualification and eligible main merge |
| RW-EMBED-DOCS | P4 | Correct the embed frame-ancestor header configuration path | INTEGRATED | Final combined qualification and eligible main merge |
| RW-OPTIONAL-PROPOSALS | P4 | Keep future ideas and experimental authority changes as explicit references | SUPERSEDED | Separate product approval required for new off-ramp, multi-profile UI, hosted BTC service or custody changes |
| RW-PAID-AUTOMATION | P4 | Preserve explicitly unactivated paid-agent workflows | SUPERSEDED | The execution directive already prohibits paid-agent activation; no new approval is requested |
| RW-REGISTRY-DOCS | P4 | Update ADR0018 for delegated library helpers and constrained ENS lookup | INTEGRATED | Final combined qualification and eligible main merge |
| RW-RPC-QUOTE-DOCS | P4 | Document current RPC/quote, optional relayer feed, manifest and alert behavior | INTEGRATED | Final combined qualification and eligible main merge |
| RW-SDK-DOCS | P4 | Document SDK exports, trust/expiry semantics and optional merchant boundary | INTEGRATED | Final combined qualification and eligible main merge |

## Evidence and boundaries

The [machine ledger](ledger.json) records sources, workers, implementation/integration IDs, tests, reviews, dependencies and merge identity. The [feature crosswalk](feature-crosswalk.json) retains all194 historical feature requirements and their source paths without reusing old percentages. The [security crosswalk](security-crosswalk.json) maps all49 historical findings to repairs, owners and explicit residuals. The [PR inventory](pr-inventory.json) contains every returned open/closed PR and the sole non-PR issue, with source ancestry kept separate from GitHub merge confirmation.

Detailed implementation receipts and raw logs are under [`../remaining-20261119/`](../remaining-20261119/) and [`../../handoffs/agents/`](../../handoffs/agents/). The fresh Mythril evidence includes source/PC/trace-specific dispositions and concrete replay; it still exits1. Local resource or browser-start failures are retained as failures/blocked execution, never relabeled as passes.

## Existing owners

The seven explicitly assigned streams remain under their original owners. New master recovery and consolidation branches (#245, #247, #250, #255, #257–#264 and related work) are also tracked without duplicate implementation. #255 extends token-only freeze acknowledgement to configuration/codehash binding; its main integration must preserve our corrected missing/invalid-fee diagnostic. The historical Sweep destination inspection/acknowledgement gap is referred to the TM/Sweep owner, distinct from balance-consent/session-history repairs.

## Merge confirmations

- #237 merged into main at`58d89b39b27a66454ebf392bcd35d5c68b57b2f8`.
- #236 merged into the #210 dependency branch at`7fab4b92f90d65dd8d3e992eaca2483187f544a7`; this is not a main merge.
- Master-owned #241/#242 source is preserved through ordinary main merges; it is not authored or counted as our new feature work.

No production deployment, release, branch deletion, force-push, paid-agent activation or reduction of security/coverage gates was performed.
