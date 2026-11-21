# GhostPay Pages completion report — 2026-11-18

**Status: reviewed source candidate published as draft PR #238; final qualification remains incomplete. Remote main merges performed by this workstream: zero.**

This draft closeout is pinned to local integration `e8c77e7e8699dd16b86b7a1ff90b834594d07105`, tree
`81341de7972041b5f7ce53da76027846356fab90`, on `integration/ghostpay-pages-completion-20261118`.
The verified starting remote main was `dfc75ef2087fa6463ae59e0818abec01796c578d`.
The initial packet snapshot was **2026-11-18 14:37:21 UTC**. Later completed execution and review records are
included below, each retaining its own source and time. The runtime candidate was initially published as
[**draft PR #238**](https://github.com/djshellshoxxx/GhostPay/pull/238) at
`9bad95e5cc0ee73f5adb8d2c587161074b21e080`, with exactly the same complete tree as the local runtime source above.
A fresh read at **15:32:34 UTC** confirmed the PR remained unmerged and remote main remained `dfc75ef2`.
Documentation/evidence descendants preserve the runtime inputs. Use the PR body for the final published
documentation head, incremental commit mapping and complete-tree transport proof. Retained build artifacts are
explicitly attributed to `9bad95e5`; a build stamped with a later documentation commit would have different hashes.

The implementation preserves client-side key handling and signing, independent recovery, explicit secret export,
user-selected RPC infrastructure, testnet restrictions and the static Pages scope. It adds no project-operated
custody, mandatory account service, analytics or mainnet enablement. No deployment, release publication, branch
deletion or PR closure was performed. The authenticated GitHub Git Data API published the candidate because CLI
push credentials were absent. The initial publication recreated 61 commits with verified trees and ordered parents,
including 15 merge commits; their changed identities and original-author/committer provenance are recorded in the
[publication record](publication/PUBLICATION.md) and [complete mapping](REMOTE_SHA_MAPPING.json). Source-tree
equality does not rename a local test execution as hosted CI or prove a release artifact is reproducible.

## A. Consolidation

### Discovery and preservation

The complete paginated inventory inspected **242 live remote branches** and **235 PRs**: **40 open, 142 closed
without merge and 53 historically merged** at that snapshot. Branch enumeration used pages of 100, 100 and 42;
PR enumeration used 100, 100 and 35. Every live head was compared with the starting main and checked against local
Git objects. The branch relationships were 163 ancestors/behind, 71 diverged, 6 ahead, one identical main and one
unrelated history. Thirteen of the 77 non-ancestor related branches had no patch-unique commits. The later
integration branch and PR #238 are recorded separately; these initial discovery counts are not a fresh enumeration
after publication.

[The Markdown matrix](RECONCILIATION_MATRIX.md) and [complete JSON](RECONCILIATION_MATRIX.json) preserve exact heads,
base branches, ahead/behind values, source commits, changed paths, dependencies, conflicting implementations,
regression scopes, CI snapshots and dispositions. This was initially a read-only inventory; subsequent engineering
and test execution is recorded separately. An ancestor or patch-equivalent change proves historical inclusion,
not that later merges retained its behavior. Branch names, PR titles and old green checks were not used as merge
approval.

The initial open-PR decisions were 18 EXTRACT, 7 REWORK, 5 BLOCKED and 10 DEFER. Initial branch decisions were 177
SUPERSEDED, 36 EXTRACT, 17 DEFER, 7 REWORK and 5 BLOCKED. Those figures are discovery classifications, not closed PRs
or completed remote merges. The narrow BLOCKED repairs could be integrated locally for qualification while their
final CI/release gate remained unmet.

### What is in the local candidate

The runtime snapshot's local delta contains **78 commits**, including existing source-branch history; **36** lie on the integration's
first-parent chain. There are **15 merge commits overall and 13 first-parent merges**. Eleven reviewed source PR
heads are present by ancestry. Eight other source PRs contributed bounded extractions. Exact local commit identities,
parents, trees, authors, timestamps, messages and changed paths are retained in
[LOCAL_COMMIT_LEDGER.json](LOCAL_COMMIT_LEDGER.json), with the coordinator sequence in
[LOCAL_COMMIT_LEDGER.md](LOCAL_COMMIT_LEDGER.md). The 339 changed tracked paths have source hashes in
[SOURCE_FILES_SHA256.json](SOURCE_FILES_SHA256.json).
Later documentation/evidence work is recorded separately: the reviewed documentation head `63592da4` was
integrated by `e033855b02736f28d6ac583582b984f1d973d4be`. The merge changed documentation only. Independent
Git-object comparison confirmed that application, package, test, script, workflow and dependency inputs still
match the runtime snapshot and published `9bad95e5`.

| Work | Local result | Material integration choice |
|---|---|---|
| #227, #231, #235, #234, #237 | Reviewed source heads merged locally | Sleep/rollback locking, explicit balance refresh, private v4 slots, opt-in pinned-signer parser and restricted beta logs |
| #222, #228, #230, #233 | Source merged with reviewed overlap resolutions and new fixes | Retain v4 and per-click balance consent; enforce own-node policy on cached requests; replace plaintext destination history with session memory; preserve encrypted/minimized browser fixtures |
| #213, #229 | Recovery lane merged locally | Independent keypair/archive/master recovery, selected-import consent, session cancellation and visible RPC disclosure |
| #210, #236 | Matching dependency and lockfile slices extracted, then lane merged | Keep the paired viem/coverage repair with the dependency versions it requires; no isolated override transplant |
| #209 | Fourteen selected source/test/doc commits extracted | Release-key test-key denial, all-HTML scans, bundled signed manifests, frame/origin/unload controls, artifact provenance and recovery/smoke harness improvements |
| #212, #225 | Narrow tooling slices extracted | Standalone fail-closed Mythril helper and deployment-validation command; helper remains unwired |
| #224, #226 | Narrow audit/helper/build slices extracted | Static-helper path containment, malformed-request handling, HTTPS-only pinned downloads, no implicit installation and visible bidi escapes |
| #220 | Selected security slices extracted | RPC metadata flags, viewing-key boundary proof, automation input restrictions and cached compiler integrity |
| #223 | Documentation refreshed on a separate local branch | Current imports/CI facts and privacy limitations replace stale present-tense claims; historical results retain their source boundaries |

[CONSOLIDATION_OUTCOMES.md](CONSOLIDATION_OUTCOMES.md) and its [JSON companion](CONSOLIDATION_OUTCOMES.json) give each
reviewed PR head, exact local integration/extraction commits and its limits. Local merge commit names do not mean
that the PR was merged into remote main. **The workstream has merged zero PRs to remote main and closed zero PRs.**
Initial candidate publication is complete; final CI and authorized main integration remain separate, incomplete
steps. The [independent publication check](publication/PUBLICATION_PACKET_REVIEW_20261118.json) confirms the exact
source tree and PR state. GitHub's synthetic merge SHA and `mergeable=true` are not completed main merges or green gates.

### Work retained outside this consolidation

#211's incompatible v3 checkpoint work is superseded by #235 v4 in this candidate. Its policy hardening,
BTC/Solana/TRON backup clipboard removal, optional-chain/CLI compatibility and focus regression remain useful for
separate qualification. #218's shared signer behavior is covered by #234; its server/CLI/limiter improvements remain
separate. The current server does not emit its additional `client_queue_full` code, so the unchanged client keeps
conservative unknown-outcome locking. #219's spent-recognition consent/worker/header changes remain outside the
active lean route list. These branches are preserved; see the
[remaining-work review](REMAINING_PR_DELTA_REVIEW_20261118.md).
The confidential-router return-data mitigation and merchant-ledger tolerance correction in #220 remain preserved
outside the active Pages release scope. Its attempted ux-flow payer-proof ambiguity guard was reverted upstream
after independent review found a bypass and a liveness failure; no claim is made that this design issue was fixed.

The #209 release-test relaxation, speculative contract modifications, earlier bypassable D1 ambiguity guard,
unrelated runtime/action-pin changes and connecting the Mythril helper to a release gate were excluded. Git
comparison confirms no change from the starting main to `release.yml`, `contract-analysis.yml`, the strict Mythril
runner or contract production sources in this candidate. Their existing controls remain in force.

## B. Feature completion

### Estimate method

The following are **approximate, conservative checklist judgments**. Each implementation criterion earns 1 point
for wired behavior, 0.5 for partial implementation and 0 if absent. Verification earns 1 for sufficient current
local proof of the narrow criterion, 0.5 for component/unit or upstream evidence with broader required acceptance
missing, and 0 when no executed evidence was identified. The denominators are the named directive criteria:
K01–K06 for A, TM1–TM15 for B, and the explicit feature lists for C–F.

A 100% implementation score records source presence for that bounded checklist. It does not imply all browser,
security, public-network or device acceptance has passed. These points were not increased by summing later local
suite totals. Every criterion and point is visible in the
[feature/evidence map](PAGES_FEATURE_THREAT_EVIDENCE_20261118.md) and
[machine-readable companion](PAGES_FEATURE_THREAT_EVIDENCE_20261118.json).

| Feature | Implemented estimate | Verified estimate | Remaining work | Blocker |
|---|---:|---:|---|---|
| A — Stealth keypair export and recovery | 100% (6/6) | 75% (4.5/6) | Actual browser/profile validation, interrupted/fresh-browser recovery acceptance and external wallets/devices. Combined unit/coverage and pinned Foundry interoperability now pass within their recorded scopes. | Browser execution environment and external acceptance. |
| B — Privacy and threat model | 73% (11/15) | 53% (8/15) | Per-invoice signer design, quote correlation, complete bounded-evidence traffic evaluation, real Tor and final browser acceptance; keep exposed headers/journals explicit. | External network/browser qualification and specific protocol/product decisions. |
| C — Invoice and payment flow | 100% (12/12) | 46% (5.5/12) | Final combined Pay/wallet/browser tests, same-nonce replacement and pending-reload journeys, approved signed testnet manifest and real wallet/network acceptance. | Exact-head hosted/full-browser qualification and approved external deployment inputs. Optional two-provider manifest readback remains Scan-only; do not silently add another observer to Pay/Sweep. |
| D — Scan, sweep and reconciliation | 95% (9.5/10) | 70% (7/10) | Actual browser restart/reorg/storage-denial/concurrent-scan, replacement/retry journeys and provider/public-network acceptance. Existing unit coverage passes; preserve the uncertain-send journals. | External provider/browser acceptance and final hosted qualification. |
| E — Backup, idle lock and device sleep | 100% (9/9) | 83% (7.5/9) | Actual process restart, OS suspension/wake, browser navigation and fresh-profile restore at the intended serving origin; final lint and hosted qualification. | Device/browser lifecycle acceptance and complete candidate qualification. |
| F — Application quality, accessibility and localization | 86% (9.5/11) | 41% (4.5/11) | Full/lean builds and project-subpath/declared-origin artifact checks pass. Actual browser journeys, smoke behavior, keyboard/screen-reader/mobile checks and native translation review remain unqualified. | Browser launch environment, real devices and human native-language/accessibility acceptance. |

### Feature boundaries

**A — Recovery.** K01–K06 have scheme-1 EVM source implementations: validated public records, authenticated single-key
encryption, explicit/re-authenticated export, independent recovery, bounded encrypted archives and a separate master
spending/viewing backup. Local crypto/property/session tests and a separate recovery implementation execute. Pinned
Foundry now independently derives and spends a synthetic exported key on loopback Anvil. Actual fresh-browser,
external-wallet and physical-device recovery remain separate requirements. Authenticated archive headers remain
readable and link entries; master backup does not silently replace the existing three-key keystore format.

**B — Privacy.** The [TM implementation ledger](../../threat-model/TM_IMPLEMENTATION_20261118.md) evaluates each
recommendation. Explicit balance consent, metadata flags, endpoint warnings, memory-only destination history,
v4 slot names and minimized receipts are wired. Per-invoice signer selection, quote-free redesign, comprehensive
traffic-analysis resistance, real Tor routing and experimental-chain qualification are not complete. No result
establishes payment anonymity.

**C — Invoice/payment.** Encryption defaults on, signatures and tamper checks remain enforced, and optional pinning
is available. The Pay view uses pins for trust presentation; #234 does not globally turn on `requirePinnedSigner`.
Expiration, review, transaction journals, chain switching and receipt behavior exist, but the exact combined
candidate still needs full payment/browser acceptance. #233 now has actual hosted browser evidence on its own
upstream synthetic merge; that does not qualify the dependency/recovery/tooling combination here.

**D — Scan/sweep/reconciliation.** Private slot names, cancellation, bounded evidence fetches, reorg/resume handling,
explicit balance refresh and local encrypted reconciliation are retained. Cursor contents remain plaintext;
wallet/sweep uncertain-submission journals remain tab-scoped plaintext safety state. Removing the destination
history did not encrypt those journals or remove duplicate-send protections. BTC spent recognition is not claimed
as a completed lean feature.

**E — Backup/idle/sleep.** File verification precedes reliance on a backup, stale asynchronous operations cannot
reactivate a changed/locked session, and idle expiry uses wall/monotonic checks including rollback. The deliberate
sole-unbacked-copy safeguard remains. Mocked lifecycle tests do not prove OS sleep/wake behavior on every device.

**F — Application quality.** Core lean routes, network/settings controls, privacy disclosures, recovery UI,
frame/origin/unload guards and local root-error handling exist. The smoke script now fails on fixed sanitized root
render markers. Locale checks retain English fallback for security-critical unreviewed strings; they do not certify
native translations. Responsive, assistive-technology and physical-device acceptance remain unqualified.

## C. Security

### New findings repaired during this execution

| Finding | Exact repair | Evidence and independent review | Limit |
|---|---|---|---|
| Bulk scan evidence could schedule more RPC work after cancellation | `821d1035b3e8b20921904f5c3bf6411f22ea3346` | Abort checks across async boundaries; independent cancellation 6/6 and scanClient 92/92; focused privacy selection 174/174 | Cannot recall requests already sent; bulk evidence remains bounded and optional |
| Scan privacy text still described automatic Sweep balance queries | `27e80199ab7299e6cc72d64366366335c57196b3` | Disclosure suite 37/37 after the regression | Corrects informed-consent text; does not hide a user-requested read |
| Payment-key export lacked a visible address-bearing RPC disclosure | `933bdedc07dfeb6024f1ea23045bacbbc81972fb` | Failure reproduced before correction; recovery selection 135/135 and independent export/security selection 24/24 | Export can still identify the payment to the selected provider after deliberate action |
| Root reporting could echo mutable or throwing error content | `0bbd8965b2535a48ecd4eab700cd4f28e54b38fa` | Negative tests reproduced; hosting web selection 135/135 and script selection 92/92; independent selected-source review | Fixed local reporting is not protection against a compromised runtime |
| Smoke could report success after React caught a render failure | `a77cadbb7deca0cb2bf8829ed1215962bb8b4d9f` | Baseline 4 failures/5 passes; corrected 9/9, complete Pages Node scripts 95/95, independent 9/9 | Uses the actual smoke entrypoint with a synthetic browser interface, not Chromium acceptance |
| Keystore KDF scratch passphrase bytes were not explicitly wiped | `e8c77e7e8699dd16b86b7a1ff90b834594d07105` | Four baseline failures become four passes; independent committed-source review and file hashes retained | Owned byte arrays only; immutable strings and internal copies cannot be securely erased |

The source reviews are AI-assisted reviews by separate workers, not an independent professional release audit.
Detailed records are in [reviews/](reviews/), including the
[keystore review](reviews/KEYSTORE_SCRATCH_INDEPENDENT_REVIEW_20261118.md) and
[smoke/source review](reviews/PAGES_SMOKE_RENDER_ERRORS_20261118.md). Focused and reviewer reruns overlap broader
selections; their totals are not added as unique coverage.

### Recovered protections and limits

The integrated foundations also correct clock rollback, cached-client own-node enforcement, stale balance refresh,
publicly derivable checkpoint slot names and plaintext sweep-link history. Recovery consent is bound to the selected
export and active operation. The static audit helper now rejects path/symlink escape and malformed requests. The
standalone Mythril utility refuses abnormal runner failures and malformed dispositions. Automation consumes a
smaller untrusted PR inventory and restricts sensitive paths; cached solc bytes are checked against the official
pinned hash. Existing action pins, workflow permissions/approval policy and release/analyzer gates were preserved.

The standalone helper is not connected to a gate. Its report counts do not establish target coverage/provenance,
and an owner-approval reference is not authenticated authorization. Passing its fixtures does not disposition a
real Mythril finding or authorize a future release exception.

The full dependency audit, rerun at local `e8c77e7e` with exit 1, remains unresolved: **30 affected-package entries,
including 14 high and 16 low**, with an unpatched upstream Picomatch advisory in the development graph. The production-only audit reports zero findings.
The production-only rerun at the same source exited 0. These scopes must not be conflated. No blanket suppression
or threshold reduction was introduced. Under the user's release rule, unresolved high findings continue to block release qualification.

### Current hosted Mythril gate

The existing [main-branch Mythril job](https://github.com/djshellshoxxx/GhostPay/actions/runs/44297673763/job/134778851902)
finished with **runner exit 1** at exact `dfc75ef2087fa6463ae59e0818abec01796c578d`. All five target JSON reports
returned `success: true` and `error: null`; the gate failed on **11 retained findings: three medium and eight low**,
not an installation failure, malformed report or outer timeout. Router and PolicyRouter had zero findings;
SweepRelayer had one low timestamp record, PolicyAccount two low timestamp records, and Factory eight records.
The complete `packages/contracts` tree and analyzer workflow are unchanged in the candidate, so the finding
review applies to those inputs while the hosted job retains its original main SHA. The
[retained metadata](evidence/hosted/main-mythril-dfc75ef2/metadata.json) and
[full report](evidence/hosted/main-mythril-dfc75ef2/report.log) preserve the execution.

The current record set differs from the historical disposition inventory: it adds low SWC-113 at Factory PC 999,
the initialization call, and omits the old low SWC-113 allowance-call record at PC 1781. Equal totals are not exact
finding coverage. The strict gate remains failed; no suppression, accepted-risk file or release policy was changed.
Fresh [record-by-record review](evidence/hosted/HOSTED_MYTHRIL_REVIEW_20261118.md), its
[structured evidence](evidence/hosted/HOSTED_MYTHRIL_REVIEW_20261118.json) and an
[independent check](reviews/FINAL_EVIDENCE_REVIEW_20261118.md) established specific counterevidence: all eight
Factory-analysis traces encode constructor `implementation_ = address(1)`, which the real constructor rejects for
having no deployed code on the ordinary EVM precompile model. Each creation segment contains the exact existing
3,296-byte metadata-free runtime template; this does not establish whole-initcode or immutable-resolved deployed
runtime identity. The new PC999 record repeats identical deploy inputs. After a successful first deployment those
inputs would trigger `AlreadyDeployed` before fee collection/initialization; the raw trace alone does not establish
that the first call succeeded. These are bounded source/trace observations, not a new EVM replay or proof that
every execution with a valid implementation is safe. The
[exact historical delta](reviews/HOSTED_MYTHRIL_DISPOSITION_COMPARISON_20261118.md) and
[independent byte/ABI evidence](reviews/INDEPENDENT_MYTHRIL_TRACE_COUNTEREVIDENCE_20261118.json) are retained.
The conditional policy fee-token availability/freeze risk remains a real design limitation, separately from the
symbolic-trace findings. No professional final release audit or current SonarCloud clearance is established.

The [source-pinned #220 remediation report](https://github.com/djshellshoxxx/GhostPay/blob/16c48521f99903ccd2e584df5d00a9dec5ef754c/docs/audits/security-remediation-20261118.md)
classifies **D-1 as medium and latent**, open design in
`packages/ux-flow/src/reconcile.ts`: an unsigned payer proof does not bind the observed transfer to its invoice.
That package is not imported by the Pages app. A reverted ambiguity heuristic and a warning comment are not a
repair. Payer-bound proof design is required before enabling it; this record does not relabel it as a resolved
or active-lean high-severity finding.

### CodeQL fixture finding and remaining scanner limits

PR #222 check `134777382565` reported one high-severity finding on `Settings.test.tsx` at source
`2bc2098298d90928eb1acafad969f28316bb05fc`. The retained annotation identifies a literal `rpc.example` fixture
serialized into jsdom localStorage to test the saved-provider-key warning. It is cleared between tests; the default
service fixture rejects network requests, and the reported value does not originate from a live user or provider.
Independent source review supports a **synthetic-fixture false-positive disposition for that one annotation**.
The exact file blob `f73eee0286e0b0e490674ab5578240dcf796579c` is unchanged at published `9bad95e5`.

The [source/annotation evidence and disposition](reviews/CODEQL_FIXTURE_DISPOSITION_20261118.md) preserve the reasoning.
**The failed check remains failed**; no finding was dismissed, renamed away, suppressed or excluded. Private alert/SARIF
inventory and final-candidate CodeQL/Sonar clearance remain unqualified. Separately, production Settings can retain
provider-bearing URLs in plaintext unless session-only is explicitly chosen; that real storage boundary is not cleared
by the fixture disposition. Current scanner gaps cannot be replaced with a successful test-helper run.

### Residual privacy and trust boundaries

Public-chain payer, amount, token, timing, announcement and sweep links remain visible. A minimized receipt still
contains a transaction hash and stable signer. Ordinary encrypted invoice links contain their decryption key;
any bearer can read the protected fields. Per-invoice signer rotation is not wired, and the meta-address remains a
stable identifier.

A viewing private key plus a one-time private key and its public announcement can recover the master spending key.
Do not describe sharing the viewing key as harmless if the same recipient also receives an exported payment key.
Normal derivation inside the user's trusted wallet remains necessary and supported. Recovery/header metadata,
reconciliation scope, record counts/chains/timing and checkpoint contents are visible even when secret contents
are encrypted. JavaScript strings and browser-managed memory are not securely erasable.

Own-node selection restricts accepted targets before every dispatch, including cached-client retries. It does not
prove ownership or Tor routing. The endpoint validator accepts plain HTTP loopback for scanning, but the shipped
CSP permits only self/HTTPS/WSS and its allowlist parser rejects HTTP: validator acceptance does not establish
browser reachability. No broad CSP weakening was made. A second configured provider currently participates in
Scan comparison, not automatic Pay/Sweep manifest readback; the documentation now reflects that boundary instead
of silently adding another observer.

## D. Testing and execution evidence

[EXECUTION_STATUS.json](EXECUTION_STATUS.json) is the editable status register for final closeout. The
[artifact manifest](ARTIFACT_MANIFEST.json) identifies copied stable artifacts by source and SHA-256, preserving
the original 62 unchanged and appending completed execution, publication and source evidence. The completed full npm
log and its collected exit metadata are now included. Source-specific commands and environments are retained
in the recovery, dependency, tooling and native records. Most early worker selections used Node 24.22.1/Vitest
5.0.5; the dependency-aligned qualification uses Node 22.23.5/npm 11.21.2/Vitest 5.1.0 where its logs identify them.
Do not describe the earlier Node 24 runs as a pinned Node 22 execution.

### Current combined qualification

| Check | Source and actual outcome | Status at this packet snapshot |
|---|---|---|
| Clean install and library build | At published `9bad95e5`, clean install exited 0 with 721 packages; dependency-ordered library build exited 0. Two earlier install processes were killed with SIGKILL and remain recorded | **Passed on the published runtime source** |
| Typecheck | Full `npm run typecheck` at `e85db1ef` exited 134 when web exhausted 768 MiB; other workspaces passed. Web-only retry at `ea8f8d65`, 1536 MiB, exited 0; subsequent vault change has scoped checks | All workspace types covered across the successful scopes; original failed aggregate remains recorded |
| Typed lint | Final isolated full run at documentation descendant `1656558a`, Node 22.23.5/npm 11.21.2 with a 2,048 MiB heap, again exited 137 in web after 185.58 seconds; earlier workspace lints passed | **Blocked**; no ESLint source diagnostic was printed and the kill cause is unproven; no whole-candidate lint pass |
| Secret scan and action pins | At local `e8c77e7e`, `npm run ci:scan-secrets` and `npm run ci:check-actions` both exited 0; 113 action references passed the existing external-pin/local-action policy | **Passed within shipped scanner scopes**; no full supply-chain/audit claim |
| `npm test` | At `e8c77e7e`, exit 0 in 2,204.93 seconds: **12,402 passed, 0 failed, 79 skipped**, across all 68 test-bearing workspaces | **Passed with explicit skips**; original coverage thresholds retained |
| Full/lean web builds | Actual TypeScript, Vite and postbuild scans passed at published `9bad95e5`; separate full/lean snapshots retained | **Passed**, 19 full-profile files and 17 lean-profile files |
| Pages artifact and loopback checks | Default clean-source build gates and actual HTTP checks passed under `/GhostPay/` and `/` with declared origins | **Passed within static/local HTTP scope**; no hosted or browser claim |
| Development release build and reproducibility | `npm run release:build` and `npm run release:repro -- --head` both exited 0 at `9bad95e5`; two clean-clone tarballs and SBOMs are byte-identical | **Passed for development artifacts**; no release/tag/publication |
| Hosted checks, CodeQL and SonarCloud | At 15:32:34 UTC, draft #238 runtime head `9bad95e5` had 18 checks: 2 CLI successes, 15 queued and 1 skipped | **Not qualified**; no candidate browser, aggregate or final scanner clearance |
| Actual full/lean Playwright journeys | Both supported system-browser attempts built their server and launched Chromium, then failed at socket EPERM/SIGABRT. Full: 1 launch failure/84 not run; lean: 1 launch failure/74 not run | **Blocked by executor**; zero application assertion passes |

### Completed full workspace run

The full command used Node **22.23.5**, npm **11.21.2**, one Vitest worker and a 1,536 MiB Node heap at
`e8c77e7e8699dd16b86b7a1ff90b834594d07105`. It completed with **exit 0** in **2,204.93 seconds**.
The [per-workspace report](evidence/qualification/package-tests-final.md),
[machine-readable phases and coverage](evidence/qualification/package-tests-final.json),
[raw log](evidence/qualification/package-tests.log) and
[execution metadata](evidence/qualification/package-tests-result.json) retain the complete outcome.
An independent reviewer reconciled all 68 test-bearing workspaces against the source inventory and found no missing
or extra workspace, incomplete phase, failure marker or arithmetic mismatch.

| Selected scope within this one run | Passed | Skipped | Qualification boundary |
|---|---:|---:|---|
| All 68 workspace test scripts | **12,402** | **79** | Zero failed; configured per-workspace coverage gates preserved |
| Web coverage phase | 2,959 | 1 | 217 files passed, one file skipped; 93.30% statements, 89.52% branches, 95.04% functions, 97.04% lines |
| Web separate nocov phase | 3 | 0 | Three files passed; these tests add no coverage evidence |
| Portable vault | 352 | 0 | 96.99% statements, 94.24% branches, 99.50% functions, 98.89% lines |
| Invoice schema | 731 | 0 | Shared signature, encrypted invoice and parser tests |
| Chain adapters | 584 | 0 | Includes the cancellation regression source |
| Relayer | 484 | 1 | Separate workspace, outside Pages release scope |
| Confidential contracts | 46 | 0 | Actual Hardhat/Mocha execution; coverage was not reported by that runner |

The 79 skipped cases are attributed by workspace: pool-circuits 59, pool-relayer 9, external-pools-privacypools 4,
payer-sponsor 4, external-pools-railgun 1, relayer 1 and web 1. The minimal reporter does not name every skipped
case, so the report does not invent their individual reasons. In the relayer, source inspection identifies a
single conditional prerequisite assertion and four native integration cases; the aggregate one-skip result is
consistent with the prerequisite being skipped and the four integration cases running. This is a source-plus-count
inference, not separate per-case logging. Skipped cases remain unexecuted evidence. These totals describe this npm
invocation only; earlier focused reruns and the separate Forge execution are not added as unique project coverage.

### Native execution

The native worker verified official Foundry **1.8.5**, solc **0.8.28**, Slither **0.11.6**, Echidna **2.2.7** and
Mythril **0.24.8**. Installation/probe success alone is not analyzer success. The complete commands, tool hashes,
source boundary and filters are in [NATIVE_QUALIFICATION_20261118.md](NATIVE_QUALIFICATION_20261118.md).
The historical native record is preserved unchanged; the
[Echidna completion addendum](evidence/native/ECHIDNA_COMPLETION_20261118.md) records its later exit, property
inventory, diagnostics and pinned-source interpretation, with a [JSON companion](evidence/native/ECHIDNA_COMPLETION_20261118.json).

- **Forge:** exit 0, **490 passed, 0 failed, 0 skipped**, 34 suites. The default profile retained 10,000 fuzz runs,
  256 invariant runs/depth 50, optimizer 200 and Cancun. Concurrency was reduced without reducing the budgets.
- **Independent raw-key recovery:** exit 0, **1 passed, 0 failed, 0 skipped**, using pinned cast/Anvil and
  `REQUIRE_ANVIL=1` on a synthetic loopback transfer.
- **Slither:** exit 0, **34 contracts / 64 detectors / 0 retained results**, with unchanged CI path/severity/source
  filters, including exclusion of informational/low findings and `--fail-medium`. This does not claim every possible
  detector/configuration produces zero findings.
- **Echidna:** the existing full runner completed with **exit 0**, observed at 15:09:10 UTC. Router executed
  300,000 calls, Sweep 300,005 and Policy 300,020: **900,025 calls**, all **13 safety properties passing**, and
  all **11 required reachability canaries falsified**. The canaries deliberately fail when intended success paths
  are reached; the repository runner requires those failures. All three auxiliary Slither preprocessing steps
  failed and warned that fuzzing may be less effective; the log also contains ten unconfigured synthetic
  `EmptyBase` RPC diagnostics. These limitations remain visible despite the configured runner's successful exit.
  The separate standalone Slither pass does not clear them. Budgets, property inventory and canaries were retained.
- **Mythril:** installed and executable; **the full five-target campaign was never started**. The coordinator reported
  an automatic possible-cybersecurity-risk interruption and narrowed this worker to existing-output observation.
  This was a coordinator report; retained tool logs do not identify the exact interrupted action. This is neither
  a scanner result nor a claim that a campaign is merely waiting to launch.
  Required 900-second target timeouts, depth 3 and the strict findings/error gate remain unchanged.

The successful contract/recovery executions are bound to `ea8f8d655caa9fa361cfbcfa3e4e41f474dfa929`; the worker
verified those input trees unchanged during execution. The contracts tree is
`a84815152b8f07c854197c84b5613b02f7939882`. Later vault/documentation changes are outside that native tested scope.
Forge success is not a substitute for separate coverage, snapshots, static formatting or extra-contract workspace
qualification. Scanner unavailability, crashes, timeouts and partial output must remain failures/incomplete states.

### Focused local execution

| Source boundary | Executed evidence |
|---|---|
| `305ccb0d570c27a47435083059492edc819a0101` | Stage-1 web 192; invoice-schema 728; ux-core 119 passed |
| `821d1035b3e8b20921904f5c3bf6411f22ea3346` | Focused privacy 174 passed; independent cancellation 6 and scanClient 92 passed. Exact filename/argument selection was not retained in the compact log, so no invented filename list is supplied |
| `27e80199ab7299e6cc72d64366366335c57196b3` | Disclosure suite 37 passed |
| `f2ed1ed4240f91ef2fb41f3edaf3ea6546e87e60` | Recovery web 135; core-crypto 75; ux-vault isolated retry 348 passed with original thresholds; independent export/security selection 24 passed |
| `0b67fa9fbd125b18412ef53a5d377ab5ccd460e2` | RPC 87; key-boundary 1; deployment command 3; i18n 27; display/hardening 59; helper 13; static server 8; automation 27; unchanged gate fixtures 33 passed; three affected library typecheck/lint scripts passed |
| `0bbd8965b2535a48ecd4eab700cd4f28e54b38fa` | Hosting web 135 and Pages/workflow scripts 92 passed |
| `a77cadbb7deca0cb2bf8829ed1215962bb8b4d9f` | Smoke regressions 9 and full Pages Node scripts 95 passed; independent 9-case rerun passed |
| `e8c77e7e8699dd16b86b7a1ff90b834594d07105` | Four KDF scratch cleanup regressions passed; final whole-package/combined outcomes remain separate |

Recovery's first vault coverage attempt was incomplete after SIGKILL, and its later isolated retry passed 348/348
with 96.99% statements, 94.24% branches, 99.50% functions and 98.88% lines. The initial 15-pass/1-skip Node recovery
run and Foundry 1.5.1 supplemental result are retained historically; the later pinned 1.8.5 result above is the
relevant native-toolchain evidence. The historical recovery locale run reported 434 warnings and 2,229 used/136
unused keys. The later full-source light checks at `e8c77e7e` report **four catalogs, zero errors, 500 warnings;
2,267 used keys, zero missing English keys and 139 unused**, each command exiting 0. These counts describe different
source scopes; they are not evidence of native translation approval. None of the overlapping test counts is a total
of distinct project tests. Exact commands, exits and durations are in [light-results.json](evidence/qualification/light-results.json).

### Built artifacts, browser attempts and reproducibility

The [complete build qualification record](evidence/build/BUILD_QUALIFICATION_20261118.md) and
[structured command results](evidence/build/qualification-results.json) retain all 19 invocations, including
unsuccessful setup attempts. The clean published checkout and both reproducibility clones remained at `9bad95e5`,
tree `81341de7972041b5f7ce53da76027846356fab90`, with no source edits. Node 22.23.5 and npm 11.21.2 were used.

Full and lean TypeScript/Vite/postbuild checks passed. The clean-source Pages builds produced 16 files each. An
independent reviewer checked complete checksum membership and source/configuration metadata. Actual loopback
HTTP checks fetched and compared 15 files per artifact; `.nojekyll` was hash-checked separately. The project case
used `/GhostPay/` with declared `https://djshellshoxxx.github.io`; the dedicated-origin configuration used `/`
with placeholder `https://ghostpay.example`. The declared external origins were not contacted or deployed to.
Both configurations contained no approved deployment manifests and kept all payments disabled.

The actual Playwright commands used one worker and stopped after the first launch failure. The normal full
invocation built its server but lacked the pinned Chromium headless-shell 1255 binary. Supported
`GHOSTPAY_CHROMIUM=/usr/bin/chromium` retries actually launched system Chromium 156.0.8078.79; both full and lean
then aborted at a denied Unix socket operation before application assertions. Full selected 85 tests, with one
launch failure and 84 not run; lean selected 75, with one launch failure and 74 not run. No accessibility, wallet,
IndexedDB, CSP, worker or browser journey acceptance is inferred. An earlier full attempt incorrectly stamped the
fixture with `GP_COMMIT`; the existing production-key guard correctly rejected its public test key. That preflight
failure is separately retained and no source or guard was changed to fix the invocation.

The normal `release:build` performed its own fresh install, library rebuild, chain-matrix check, full web build,
bundle scan and SBOM generation, exiting 0 in 102.182 seconds. `release:repro -- --head` built twice in distinct
clean clone paths and exited 0 in 206.123 seconds. The exact label was `qualification-9bad95e5`; all manifests
say **development**, with no tag, clean source and the published runtime SHA. No release was published.

| Artifact | SHA-256, identical in the standalone development build and both clean clones |
|---|---|
| Web tarball | `3ad9d94c09e5dfedecf2fe5be5b5748b83e3d0df5cd9b396230f603d41eb4cc1` |
| CycloneDX SBOM | `e2165196882b5150466731805c38c7fb93d088d1344aebba11d880831bee107d` |
| Release manifest | `5a8c345a094e048542b00c1adb0cbb9aae15c4194fb32af6e9162245fbab4213` |

The repository reproducibility gate compares tarball and SBOM. Separate checks also verified manifest/checksum
identity, archive file membership, duplicate/link/path rejection and normalized tar timestamps/ownership. The SBOM
contains 139 components; this is not an independent completeness audit. Reproducibility covers the pinned Linux
environment and two clean paths, not every operating system. Later documentation commits preserve the runtime
inputs but would change embedded commit/time metadata and resulting artifact hashes if rebuilt.

### Hosted execution on the runtime candidate

The [15:32:34 UTC readiness snapshot](evidence/hosted/READINESS_SNAPSHOT_20261118_153234.md) and its
[complete check inventory](evidence/hosted/READINESS_SNAPSHOT_20261118_153234.json) record draft #238
at `9bad95e5`, with 2 successful CLI jobs, 15 queued checks and one skipped release-gate job. Both completed jobs
checked out synthetic merge `f8cf77781311635e281d3c9e3d692ed17ee778b3`, whose complete tree equals the tested
runtime tree. Their actual tool versions were Node **22.23.4** and npm **10.9.9**, distinct from local qualification.

- [Ubuntu CLI job](https://github.com/djshellshoxxx/GhostPay/actions/runs/44327356184/job/134882135309):
  570 unit cases, 21 compiled-CLI cases and one build-helper case passed.
- [Windows CLI job](https://github.com/djshellshoxxx/GhostPay/actions/runs/44327356184/job/134882135056):
  568 unit cases passed, two skipped; 21 compiled-CLI cases and one build-helper case passed.

These CLI jobs do not establish Pages browser acceptance, a passing TypeScript/contract aggregate, or security
clearance. The main-branch Mythril result above has its own main-source identity. Main's other passing jobs are
not assigned to this candidate. Later documentation commits also require their own intended-result hosted checks;
the final PR body records the refreshed head rather than relabeling these earlier job results.

### Fresh upstream hosted evidence

The CI worker inspected actual checkout and execution logs for PR #233. The jobs used synthetic merge
`5ce26fc6023c048ecfcb81b959a939e673f9d0e9`, associated with source PR head
`67cf835d0bf5f3b239e8ee6f18dca401fd5a5050`:

- [Pages run 44304211061, job 134801443002](https://github.com/djshellshoxxx/GhostPay/actions/runs/44304211061/job/134801443002): **16/16 browser cases passed**.
- [Beta run 44304211191, job 134801441908](https://github.com/djshellshoxxx/GhostPay/actions/runs/44304211191/job/134801441908): **3/3 browser cases**, CLI **124**, library acceptance **PASS** and `ACCEPTANCE OK`.

This is actual browser execution, beyond test discovery. It proves that upstream source's execution only. It is
not current combined-source CI, Spec 18 fresh-browser acceptance, a public-testnet operation or a deployed-site
smoke pass. No funded public-network, real Tor, external-wallet or physical-device result is claimed.

## E. Release readiness

| Level | Current status | Required next evidence |
|---|---|---|
| Code implementation complete | Broad in-scope implementation plus the six repairs above; several compound TM recommendations and compatibility obligations remain partial | Keep explicit scope/defer decisions and unfinished obligations visible |
| Locally verified | Full npm/coverage, full/lean builds, Pages artifact checks and development reproducibility passed; typed web lint and actual browser acceptance remain blocked | Qualified lint and browser execution; preserve native/analyzer limits |
| CI qualified | **No final combined candidate qualification**; runtime draft/source mapping and two CLI job results verified | Fresh required checks on the intended final candidate/merge result |
| Security reviewed | Separate AI-assisted source and evidence reviews completed; no professional final release audit; strict Mythril and full audit gates remain unresolved | Supported exact-finding dispositions, current CodeQL/Sonar clearance and resolution of high dependency findings |
| Public-testnet qualified | **No** | Approved signed deployment data and authorized external wallet/provider recovery/payment acceptance |
| Ready for owner release approval | **No** | All preceding mandatory gates and the approved origin/trust-root configuration |

The task authorizes verified integration, not an unconditional merge. Missing required CI and unresolved security
gates prevent a main merge. The concrete candidate remains draft #238 with traceable implementation and execution
evidence. This workstream performed zero deployments, release publications, mainnet enablements or branch deletions.

## F. Outstanding decisions and finalization

Only genuine authority/product choices belong in this section. Killed lint processes, browser launch failures,
queued hosted checks and missing acceptance evidence are engineering/qualification tasks; they are not requests to lower gates or
new owner approvals.

| Decision or input | Why it remains necessary | Current safe boundary |
|---|---|---|
| Approved dedicated serving origin and release trust identity | Sibling-path isolation, release verification and artifact provenance require concrete owner-controlled identities/configuration | Preserve origin checks and fail-closed empty/unapproved trust roots; no deployment |
| Approved testnet deployment manifests, fee recipient and release signer material | Addresses/hashes/authority must be independently verified and supplied through the existing process | Do not invent deployment data or use published test keys in a release |
| Future per-invoice signer/trust compatibility design (TM10) | Rotation changes identity pinning and receipt continuity; a library primitive alone does not specify migration/UX | Keep explicit scoped deferral and the encrypted default; do not claim rotation exists |
| Future quote-free relayer protocol (TM11) | The signed fee and bound quote tuple require a coherent protocol design | Preserve current signing/fee checks and optional-service scope |
| Experimental non-EVM/policy/guardian/escrow and payer-proof expansion | These have separate compatibility, protocol, authority or custody prerequisites outside the active Pages target; ux-flow also needs payer binding before use | Preserve disabled/experimental scope and valuable branches; no implicit production enablement |

The completed npm, build, reproducibility and native results are recorded above, including every retained failure
and limitation. The remaining merge/release blockers are the unpatched high dependency advisory, failed strict
Mythril finding gate, unqualified typed web lint, unavailable local browser acceptance and incomplete required
hosted checks. Current CodeQL/Sonar clearance, native translation, real accessibility/device/Tor and public-testnet
acceptance remain separate gates. The original published mapping is preserved; the PR body records the final
documentation transport proof after the guarded append. No blocker is converted into a pass or an approval request
to reduce the existing requirements.

### Packet contents and integrity

- [Full branch/PR matrix](RECONCILIATION_MATRIX.md) and [JSON](RECONCILIATION_MATRIX.json).
- [Local consolidation outcomes](CONSOLIDATION_OUTCOMES.md), [exact commit ledger](LOCAL_COMMIT_LEDGER.md),
  [changed-source hashes](SOURCE_FILES_SHA256.json), [runtime identity proof](RUNTIME_IDENTITY.json) and
  [verified initial publisher mapping](REMOTE_SHA_MAPPING.json).
- [Feature/TM evidence and explicit scoring](PAGES_FEATURE_THREAT_EVIDENCE_20261118.md),
  [remaining-source review](REMAINING_PR_DELTA_REVIEW_20261118.md),
  [final independent evidence review](reviews/FINAL_EVIDENCE_REVIEW_20261118.md) and [independent reviews](reviews/).
- [Execution status](EXECUTION_STATUS.json), [native qualification](NATIVE_QUALIFICATION_20261118.md), stable
  [evidence](evidence/) and [artifact SHA-256 manifest](ARTIFACT_MANIFEST.json).

The packet records completed engineering work and explicit qualification blockers. It makes no claim of release readiness.
