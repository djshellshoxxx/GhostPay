# Unfinished GhostPay features and acceptance

This register separates source implementation, integration, automated qualification and external acceptance.
It does not assign arbitrary percentages or count a PR as a completed feature. Old status ledgers are historical
unless the exact cited source and tests still match the current candidate.

## Active static Pages work

| Priority | Workstream | Present source / status | Blocker and next action |
| --- | --- | --- | --- |
| P0 | Spec 18 / 3q per-address keypair export and independent recovery | Implementations exist on #238/#239/#240; complementary fixes reconciled separately | Five byte/custody regressions now pass in #260. Complete frozen install, typecheck/lint, full vault/UI/browser and combined source qualification remain. |
| P0 | Sleep-aware idle lock and authority revocation | Dual-clock foundation is in main; #256 contains candidate synchronous authority and checkpoint guards | Current Pages browser journey is 15 pass / 1 expiry-assertion failure; reproduce the clock/idle interaction with retained DOM/trace and qualify the combined recovery/session source |
| P0 | Network authorization/privacy consent | Transport guards #241 are in main; #238/#249/#251 contain candidate policy/UI cancellation implementations | Qualify a single consent generation model with no post-revocation request/fallback |
| P0 | Mythril evidence integrity and residual Factory findings | #255 owns stronger runner, provenance and deployment acknowledgment | Current-head hosted Mythril failed; complete current-source evidence/disposition while preserving the strict gate; no accepted exceptions or production fee decision inferred |
| P1 | Selected invoice signer enforcement | Foundation #234 is in main; #243 follows with selected-pin validation | Exact-head tests for stale/changed/invalid pins and signature-before-trust ordering |
| P1 | Durable private seller discovery/checkpoints | #235 foundation is in main; #248 adds completion behavior | Crash/cancel/resume/reorg and session-authority tests against combined privacy/session state |
| P1 | Sweep balance consent and session-only history | #231/#252 plus #230/#238 | Confirm current account, chain, provider and consent before accepting late balance results; preserve no plaintext history |
| P1 | Current application CI failures in the broad #238 stack | Key-export test fix in #239, browser/lint fixes in #246, further follow-on lanes exist | Integrate selected fixes and rerun full/lean suites on one combined source; old passing sub-PRs do not qualify it |
| P1 | Canonical date/retry/TRON completeness and scanner safeguards | #250/#257 current independent candidates | Wait for applicable exact-head checks; merge only qualified source |
| P1 | Documentation status and retained evidence | #214 merged; #215/#216 plus old rotation histories being recovered | Published correction/archive in #259; applicable current-head CI and coordinated promotion remain. |
| P1 | QR import visibility cancellation | Independently owned #258 cancels imports when the page is hidden | Owner-reported focused results require current-head hosted and combined browser qualification; this task did not execute them |
| P2 | Accessibility, native-language and real-device acceptance | Existing source/tests retained; no new physical-device evidence in this task | Real screen-reader, wallet, mobile file/download and Tor Browser acceptance remain unrun |

## Release prerequisites requiring authentic evidence

- Approved serving-origin/release-key choice and authentic signed testnet manifests; placeholders are not valid evidence.
- Verified deployment/runtime/token/feed/provider matrix; supply real source pins and readback results without changing fail-closed defaults.
- Current-source analyzer success or an explicitly approved, reproducible finding-specific mechanism; no suppression of valid findings.
- Public testnet wallet/payment/recovery acceptance and served-artifact verification. Deployment itself is outside this execution's authorization.
- Real browser/device/Tor and native-language review where the release criteria require them.

## Preserved optional or deferred work

| Area | Status / next condition |
| --- | --- |
| BTC BIP-352 / spec 12 | #254/#244 contain candidate local-spentness and explicit private-scanning implementations; exact-head qualification is pending; full-profile optional; own-node/proxy/device qualification remains separate |
| Registry/ENS delegation | Existing selected-RPC implementation retained; authentic runtime pins and wallet acceptance required; no new delegated-signing authority |
| Fiat feeds, gas buffer, deployment matrix | Existing exact arithmetic/configuration guards retained; actual deployments and feed evidence required |
| Relayer/CLI/server observability | Preserved outside the active serverless Pages beta; no new mandatory backend |
| AA/EIP-7702 policy disclosure | Existing experimental code retained; unresolved policy-hash/authority decisions are not silently enabled |
| Guardian recovery | Excluded by the user's current instruction; no implementation or default guardians added |
| Milestone escrow / automatic merchant checkout | Design-gated; no new custody/dispute/signing authority introduced |
| Future privacy 5a–5j and 5l | Proposed specifications; not silently promoted into release requirements |
| Fee recipient | Explicitly deferred; unchanged |

The numbered specifications and older `GHOSTPAY_MASTER_COMPLETION_LEDGER.md` supply detailed historical acceptance
criteria, not proof of current completion. Concrete current PR, SHA and CI observations are in `pull-request-audit.json`.

New independent #258 implements cancellation of QR imports when a page becomes hidden; its owner-reported
77 importer checks and nine regressions are provenance, not executions by this task. It remains separately
owned and requires current-head hosted qualification. The integration coordination branch is metadata only,
not another product feature.

## Final candidate and count boundary

This register contains **12 active workstreams**, including qualification and documentation work. That is not a
certified count of every incomplete product feature. Two scoped recovery safeguards were repaired and tested in
#260; no whole feature newly satisfied all acceptance criteria in this execution. New broad candidates #262 and
#264 remain independently owned and unqualified. Source review confirms #262 retains the five #260 regression
assertions, but their execution on its combined tree remains pending. [FINAL_CHECKPOINT.md](FINAL_CHECKPOINT.md)
records current failures, latest source identities and the prioritized continuation.
