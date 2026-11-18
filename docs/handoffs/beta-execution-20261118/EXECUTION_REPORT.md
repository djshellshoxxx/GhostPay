# GhostPay Pages beta execution report — 18 November 2026

## Outcome and evidence boundary

**Canonical main advanced, eight scoped repairs were published, and three superseded PRs were closed. GhostPay is not beta-qualified.** The repaired product changes remain unmerged because their required hosted checks are incomplete. Contract-analysis failures, a current unpatched development-tool advisory, privacy integration conflicts, and browser/deployment qualification remain open.

This execution used the Caveman workflow, isolated worktrees, three parallel specialist/reviewer lanes, and coordinator review. The requested Claude model could not be selected in this session; the available agents performed the work. No external human security audit is implied.

No release was published, site deployed, mainnet enabled, real funds moved, remote branch deleted, history rewritten, custody changed, or required gate weakened. Local Anvil recovery acceptance used synthetic keys and local test currency.

The record distinguishes:

- **Implemented:** reviewed source exists for the stated behavior.
- **Tested:** the named checks actually ran on the stated source.
- **Integrated:** the reviewed behavior is in canonical main.
- **Beta-qualified:** one combined candidate passes the agreed automated, browser and deployment-evidence gates.
- **Production-qualified:** separate external security, operational and release authorization; not asserted here.

Evidence index: [PR decisions](PR_INVENTORY.md), [exact PR heads, bases, files and checks](PR_SNAPSHOT.json), [local-to-remote source map](SOURCE_MAP.md), [branch census](BRANCH_CENSUS.json), [dependency review](DEPENDENCY_REVIEW.md), [new dependency blocker](PICOMATCH_AUDIT.md), [Mythril evidence](MYTHRIL_EVIDENCE.json), and [retained local outputs](LOCAL_TEST_OUTPUTS.txt).

## A. Repository consolidation

### Canonical source

| Item | Value |
|---|---|
| Starting main | 5467c158069c5bab264b6a653ac56e89e13f3e13 — merge of #203 |
| Verified final main | dfc75ef2087fa6463ae59e0818abec01796c578d |
| Directly merged in this execution | #206, reviewed head c487f0fe649e24a1e89f1f8fd0d82e90a3441c62 |
| Incorporated automatically through that merge | #204, head 2693b08ed4b1dae35fad604a2324b790f1eee5dc; GitHub marked it merged after its ancestry landed |
| Closed as superseded | #127, #42 and #49 |
| Pre-existing PRs inventoried/dispositioned | 32; the initial connector listing of 28 omitted four pre-existing Dependabot PRs |
| New repair PRs | #225–#231 and #233, eight separate reviewed changes |
| Product repairs merged | None yet; required checks remain queued/incomplete |
| Pre-existing PRs still open | 27; per-PR preserve, repair, extract and retarget decisions are in PR_INVENTORY.md |
| Branches | Retained; the census is an exact read-only snapshot, not a deletion plan |

The #206 merge was supported by **28 successful check runs and a successful Snyk status context on its exact head**, including [CI 44255163440](https://github.com/djshellshoxxx/GhostPay/actions/runs/44255163440) and [CodeQL 44255161160](https://github.com/djshellshoxxx/GhostPay/actions/runs/44255161160), independent review and 12 locally passing agent-tool tests. Its only CI behavior change adds those tests to the existing command. Required tests were not removed. The subsequent main-push CI is separate and remains pending in the final snapshot.

The retirement evidence was stronger than overlapping filenames:

- #127's product and regression-test blobs are identical to main: b6a18547cd19ec2c4a624e4d08cc55393fd359e3 and ab67eea47a034bc7d4e3cd95f5864b75b8bafc4f.
- #42's two complete document blobs are identical to main:702a4b0618ea0e9fc8f281d1b22cc73f9ffae375 and338f05ab0131d696a0209e5be0978badec3cad8f.
- #49 changes only the follow-redirects 1.16.2 lock entry. Its complete resulting entry already equals main, including integrity and metadata. Canonical entry SHA-256:4030d1e1a108b7f0212468679d566e4e3123afa717991b8e0cda4fae9df0816a. The entire historical lockfile was not claimed identical.

### Published repairs

| PR | Target | Repaired behavior | Key evidence |
|---|---|---|---|
| [#225](https://github.com/djshellshoxxx/GhostPay/pull/225) | #212 security branch | Proposed Mythril checker rejects runner failures instead of accepting clean-looking JSON after a crash | RED 2 failures; GREEN 39/39; coordinator rerun 39 |
| [#226](https://github.com/djshellshoxxx/GhostPay/pull/226) | #224 Sonar branch | Audit helper resolves canonical containment, handles malformed request targets and filesystem failures | RED 3 failures; GREEN 8/8; coordinator rerun 8 |
| [#227](https://github.com/djshellshoxxx/GhostPay/pull/227) | main | Idle deadlines use wall and monotonic observations and lock before activity can extend an expired session | Canonical-main RED 9 fail/1 pass; GREEN 44/44; typecheck/lint; two matching static builds |
| [#228](https://github.com/djshellshoxxx/GhostPay/pull/228) | #222 privacy branch | Own-node selection checked before each cached EVM-client dispatch, including retry/reconnect | RED 5 fail/1 pass; GREEN 13/13; coordinator rerun 13; scoped lint |
| [#229](https://github.com/djshellshoxxx/GhostPay/pull/229) | #213 recovery branch | Import consent bound to selected export; combined-key authority and public archive metadata disclosed | RED 2 fail/9 pass;78 web,64 codec/property,16 independent recovery tests; coordinator component 11 |
| [#230](https://github.com/djshellshoxxx/GhostPay/pull/230) | #222 privacy branch | Sweep reuse history stays in memory, deletes legacy plaintext without reading it, and cannot repopulate after lock/session replacement | RED 6 failures;171 affected tests; independent 12; typecheck/lint |
| [#231](https://github.com/djshellshoxxx/GhostPay/pull/231) | main | Each balance preview refresh requires a click; stale pending-client work cannot start the lookup and late results are ignored | RED 14 fail/2 pass;120 focused tests; independent 72; typecheck/lint |
| [#233](https://github.com/djshellshoxxx/GhostPay/pull/233) | #222 privacy branch | Adapt browser fixtures to minimized receipts, encrypted invoices and explicit balance consent without changing product defaults or weakening original assertions | Hosted baseline 11 pass/2 fail/3 unrun; local helper RED 1 fail/1 pass; GREEN 49/49; independent 3/3; typecheck/lint; browser rerun pending |

The exact published and local commit/tree identities are in SOURCE_MAP.md. A successful local test on an identical tree does not turn pending remote CI into a pass.

### Integration dependencies

The main-targeted #227 and #231 are narrow candidates. #231 changes the preliminary balance display lookup; signing, quote, status and shared transport behavior retain their existing authorization and retry rules. The other repairs are intentionally stacked on the PR that owns their feature. #228, #230 and #233 are sibling repairs; none includes the others. #233 also overlaps #231's E2E setup clicks, which must be reconciled rather than duplicated.

The largest remaining integration conflict is #211 versus #222: both use a v3 checkpoint prefix with different derivations. #211 additionally binds key access to the loaded session and purges legacy slots. Resolve the storage format/migration explicitly and preserve those identity checks. A text merge alone is insufficient.

The Bitcoin files in #222 also conflict with #219's explicit provider-query opt-in. Preserve the latter when reconciling the full profile. Bitcoin, policy accounts, account abstraction and native applications were not enabled in the lean beta. Its existing optional configured relayer path remains reachable from core Sweep; no relayer infrastructure was added.

## B. Essential feature completion matrix

These percentages are a **coarse evidence-milestone score, not an estimate of effort or a security probability**. Four milestones contribute 25 points each: reviewed implementation for the stated row (I); relevant passing tests executed in this session (T); that reviewed implementation in main (M); combined-source beta acceptance (Q). Partial or unavailable evidence receives no credit. Remaining equals 100 minus that score. No row receives Q because there is no qualified combined candidate. Rows describe the named behavior, not every experimental variant.

| Feature | Complete % | Remaining % | Evidence/status |
|---|---:|---:|---|
| EVM scheme-1 generation and address derivation | 75 | 25 | I/T/M; existing main crypto, invoice and independent export/address-control evidence; external wallet/browser Q absent |
| Invoice encryption, parsing, signing, serialization and expiry checks | 75 | 25 | I/T/M;715invoice-schema tests plus web-app invoice-creation unit tests; #218 shared validation changes still require separate integration |
| Announcement discovery and local matching | 75 | 25 | I/T/M; selected scanner/match/fuzz tests on main; live provider qualification absent |
| Reorganization, confirmation and reconciliation controls | 75 | 25 | I/T/M; scanner/reconciliation/IDB tests in the180-test main run; no new public-chain reorg campaign |
| Native and supported ERC-20 payment execution | 50 | 50 | I/M; existing routes retained; this execution did not run actual browser wallet acceptance for both routes |
| Receipt creation and portable verification | 75 | 25 | I/T/M; main receipt tests and invoice-schema receipt cases; no external verifier/device acceptance |
| Sweep balance disclosure/consent | 50 | 50 | I/T in #231; main still has the old automatic path until that PR merges |
| Sweep authorization, journal and duplicate-send behavior | 75 | 25 | I/T/M for existing core controls; main journal tests and preserved signing regressions; no fresh live browser sweep |
| One-time EVM payment key export | 50 | 50 | I/T in #213+#229; unmerged; unsupported schemes remain excluded |
| Recovery without GhostPay website | 50 | 50 | I/T; separate Node crypto decoder and cast/Anvil private-key spend; main integration and browser/device qualification pending |
| Encrypted backup integrity, wrong password and tamper rejection | 75 | 25 | I/T/M;284vault tests, web keystore/recovery cases; independent backup verification is distinct from download success |
| Restore/storage mechanisms; cross-browser and crash acceptance pending | 50 | 50 | I/M of existing restore/storage mechanisms; in-memory/IDB tests are not real cross-browser/process-crash acceptance |
| Clock rollback and suspended-tab idle deadline | 50 | 50 | I/T in #227;44 tests and static builds; main integration and real sleep/resume acceptance pending |
| Own-node enforcement on cached EVM RPC clients | 50 | 50 | I/T in #228; full-web typecheck attempt ended 137; integration/proxy qualification pending |
| Session-bound/private scan checkpoint integration | 25 | 75 | Reviewed #211 approach; incompatible #222 derivation not reconciled or tested as one candidate |
| Private destination-reuse history | 50 | 50 | I/T in #230; memory-only, intentionally no cross-session/device warning history |
| Browser key storage/CSP and supply-chain controls | 50 | 50 | Existing I/M; build verifier, pins and secret scan passed, but current dev advisory, final source and browser gates remain |
| Critical localization and fallback policy | 50 | 50 | I/T for the newly corrected recovery/consent warnings; English fallback retained; new strings unmerged and native-language review absent |
| Keyboard, screen reader, mobile/camera and QR workflows | 50 | 50 | Existing I/M and selected QR unit tests; physical/browser accessibility acceptance not rerun |
| Lean static artifact and same-environment reproducibility | 50 | 50 | I/T on #227 local source; two16-file builds match; artifact candidate unmerged and contains no payment manifests |

This score must not be averaged into a repository readiness percentage. A single failed mandatory gate can prevent qualification even where other milestones are complete.

## C. Security findings and dispositions

Severity labels below are scoped engineering assessments unless explicitly labeled as analyzer/advisory ratings. An audit-helper defect is not represented as a deployed wallet exploit.

| Identifier / severity | Root cause and demonstrated boundary | Correction, regression and verification | Residual/status |
|---|---|---|---|
| RECOVERY-01 — Medium | Awaited vault read outlived the selected decrypted export; old consent could install a subsequently opened export or show obsolete confirmation | Export object plus operation identity captured; two real-store delayed-read regressions failed before repair; component 11/11 and broader 78/78 pass | Fixed in #229; unmerged. Local interaction/race, not demonstrated remote key theft |
| RECOVERY-02 — High-impact key boundary; disclosure defect | Private viewing key plus one-time payment private key and public announcement permits reconstruction of master spend key | Explicit warning in UI, raw-export confirmation, archive, format guide and standalone recovery help; security-catalog tests pass | Cryptographic relationship intentionally unchanged; combined disclosure retains master authority |
| RECOVERY-03 — Medium privacy limitation | Archive encrypts private bodies while authenticating readable public headers | Warning/guide now name chain, count, linked addresses/public keys and locators; final locale/security 16/16 pass | File holders still see and can link public metadata; no format-breaking claim of full-file confidentiality |
| GP-PAGES-04-CLOCK — Medium local lifecycle | Wall-clock-only deadline could be extended after suspended timers and clock rollback | Wall+monotonic elapsed checks; rollback/expiry checked before rearm;9 baseline failures then 44/44 | Fixed #227, unmerged. Existing sole-unbacked-up-key non-erasure policy preserved; real OS sleep not qualified |
| GP-TM14-CACHED-RPC — Medium privacy | Own-node policy checked at client construction, but cached clients survived profile changes | Per-dispatch guard covers typed/generic calls, handshake and retries;5 baseline failures then 13/13 | Fixed #228, unmerged. Cannot recall already-sent requests; invalid stored profile still follows inherited default policy |
| GP-SWEEP-HISTORY — Medium privacy | #222 persisted source/destination/chain linkage in plaintext localStorage without opt-in | Memory ledger, delete-only legacy cleanup, snapshots and session/lock epochs;6 baseline failures then 171/171; independent 12 | Fixed #230, unmerged. Storage denial may prevent legacy deletion; no cross-session/device history |
| GP-SWEEP-CONSENT — Medium privacy | Default view entry queried a one-time address; prior consent could replay on context updates | Explicit handler, current scope/session guard before dispatch and result;14 baseline failures then 120/120; independent 72 | Fixed #231, unmerged. Shared bounded transport retries remain; one click is not guaranteed one HTTP attempt |
| GP-MYTH-CHECK-01 — Medium if wired; currently latent | Proposed disposition checker ignored process-error annotations after valid-looking analyzer JSON | Reject abnormal, malformed, duplicate/unassociated errors and errors after empty reports;39/39 checker/runner/workflow tests | Fixed #225; helper stays unwired. Production runner/gates unchanged |
| GP-MYTH-PROVENANCE — future gate blocker | Clean raw reports lack target identity; document count cannot prove each expected contract ran | Documented prerequisite for expected-target/compiler/process/source-bound evidence | Unresolved; do not connect helper to a release gate |
| GP-POC-URL-01 — Low local availability | Malformed raw URL outside error handler could terminate loopback helper | Return 400 and continue; crash regression included in 8/8 | Fixed #226; not a deployed GhostPay backend |
| GP-POC-PATH-02 — Low in local-helper context | Lexical path checks did not stop file/directory symlinks escaping bundle root | Canonical root/file containment and regular-file checks; file/directory escape regressions | Fixed #226; concurrent hostile local filesystem replacement is not sandboxed |
| GP-POC-IO-03 — Low local availability | stat/read/realpath errors escaped; success headers preceded completed read | Fixed 404 before success headers; injected-error survival tests | Fixed #226; same8-test suite, not eight additional tests |
| CI-PRIVACY-FIXTURE — Test/qualification defect | #222 changed receipt minimization and invoice encryption defaults while its Pages fixtures retained old assumptions | #233 verifies minimized and explicitly opted-in full receipts, mutates the encrypted envelope's signed public amount and adds required consent setup;49local tests and independent 3 pass | Product defaults and original security assertions preserved; actual hosted browser rerun still pending |
| DEV-PICOMATCH — High advisory, development scope | GHSA-fc5q-39xc-vjpf affects installed 4.0.7; repeated extglob regex can block Node event loop | Fresh full audit and two independent reviews confirm 14 affected high package/ancestor entries; production audit 0 | Unresolved upstream: latest published 4.0.7, no patched version. No forced downgrade, override, fork or suppression |
| DEP-210 — Build/qualification blocker | Root viem 2.57.13 and workspace 2.57.19 types cross the Zama SDK boundary | Exact-head logs show TS 2322;23 failed checks retained | Not repaired; deliberate dependency alignment required |
| DEP-87 — Build/qualification blocker | TS 7/Node 26 Buffer typing changes and Hardhat 3 conflicts with retained fhEVM/Hardhat 2 peers | Hosted build errors and direct peer/configuration comparison | Not repaired;24 failed checks; split/co-ordinate major migration |

The production-only dependency result must not be stated as a clean whole-repository dependency audit. The fresh full result is **30 affected entries:14 high and 16 low**, zero critical. The 14 high entries trace to one advisory, not14different vulnerabilities. [Primary advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), [upstream releases](https://github.com/micromatch/picomatch/releases), and fresh registry queries all identify no published fix at this review. The 16 low entries are also preserved in NPM_AUDIT_ALL_MAIN.json.

### Mythril: all eleven records retained

This execution independently downloaded and parsed the complete existing artifact from [run 44267960327 / job 134677092580](https://github.com/djshellshoxxx/GhostPay/actions/runs/44267960327/job/134677092580), exact #220 head 16c48521f99903ccd2e584df5d00a9dec5ef754c. It did not run a new local symbolic-analysis campaign.

Artifact 14417019854 ZIP SHA-256: e3de18f42b81cb95ef99ff7260742bd00f122dcb24d3e856297d5383ead16f30. The retained report is 283170 bytes, not truncated, with SHA-256: 4f6cc97b9c17d6ac60510d8545e8af8d4e63a0f1bcb70067f6ae00af62b07736. Requested and checked-out commits match. Five analysis documents are successful with null errors and issue counts 0, 1, 0, 2, 8. The runner exits 1 for findings; this is not an installation failure.

The interpretations below summarize the existing source-pinned disposition documents, not a fresh rerun of every native counterexample test. **All remain present and the gate stays red.**

| Record | SWC / analyzer severity | Location, PC | Recorded interpretation and residual |
|---|---|---|---|
| R1 |116 / Low | SweepRelayer deadline,785 | Intended signed expiry; block-time/producer trust remains |
| R2 |116 / Low | PolicyAccount requestWithdraw,1876 | Intended signed expiry; not a randomness source |
| R3 |116 / Low | PolicyAccount proposeDestination,5077 | Intended signed expiry; separate delayed-change/cancel-window assumptions remain |
| R4 |110 / Low | Modelled clone fallback,30 | Recorded analyzer/model artifact; actual clone opcode/constructor constraints covered by existing regressions |
| R5 |107 / Medium | Factory initialize path,999 | Recorded intended fee-before-initialize order; safety depends on nonReentrant and no external call inside initialize |
| R6 |107 / Low | ReentrancyGuard release,1170 | Recorded guard-release false positive; guard must remain held across external work |
| R7 |113 / Low | Factory balanceOf,1668 | Intended fail-closed token check; immutable hostile/frozen token can block deployment |
| R8 |113 / Low | Factory allowance,1781 | Same token availability residual; present in this complete artifact although an older local reproduction saw 10/11 |
| R9 |107 / Medium | Clones CREATE 2,2887 | Recorded guarded atomic creation; preserve clone binding, rollback and reentry invariants |
| R10 |107 / Low | SafeERC 20 call,2978 | Target fixed by immutable factory token, not each caller; token behavior still matters |
| R11 |104 / Medium | SafeERC 20 return path,2978 | Recorded intended checked fee-waiver behavior; fee-revenue/token gas behavior remains conditional |

Native regression sources already exist in packages/contracts/test/MythrilExpiryDispositions.t.sol and MythrilFactoryDispositions.t.sol. They were not rerun with the pinned toolchain here. Owner-reviewed finding-specific policy and per-target provenance are prerequisites to any future gate exception. #225 does not approve such exceptions.

### Sonar and retained experimental risks

The historical #224 tally is 53 fixed,23 false positives,16 accepted,8 routed,3 obsolete,2 third-party and 2 remaining low. Current SonarCloud analysis/issue API requests returned 403. No current rating, closure count or service-side resolution was certified. The concrete loopback helper defects were repaired in #226; remaining source changes were reviewed in their scope.

Scheme-2 AUD24-01 exposes a seller-constant policyHash in calldata; the owner packet recommends keeping it disabled now and restoring a salt-only ABI before future deployment. The immutable fee-token freeze risk is not removed by #217's acknowledgement. These implementations remain outside lean Pages. No custody, ABI or fee-policy decision was invented.

## D. Privacy assessment

This is a source-based observation model. It is not a captured public-network trace or proof of anonymity.

| Actor | What can be observed during the payment lifecycle | Limitations/default impact |
|---|---|---|
| Website host/CDN | App-file requests, connecting address, timing and ordinary HTTP metadata; host can serve changed JavaScript | Keys are intended to stay client-side, but a malicious origin/code supply can defeat that boundary. Static hosting does not authenticate served code by itself |
| RPC provider | Chain and method, scan windows/topics, matching-transaction/receipt reads, explicit balance address/token, transaction submission, connecting IP/timing | Primary/secondary RPC maps and the relayer URL start empty. Settings select endpoints. Window padding and local matching do not hide all match-dependent requests. On current main, opening Sweep still auto-reads from a configured endpoint until #231 merges |
| Optional relayer | Quote/sweep addresses, token, amount, destination and request timing; its provider sees simulation/broadcast | Optional configured service reachable from core Sweep; no relayer is required by static Pages, and none was deployed. No custody is delegated |
| Blockchain observer | Public payer/stealth addresses, amounts/tokens, timing, gas funding and later destination/sweep links | One-time addresses reduce reuse. They do not hide the public transaction graph or make Monero-equivalent anonymity |
| Sender | Invoice contents it receives/decrypts and its payment destination, amount, timing and transaction | Encrypted transport does not hide invoice contents from its intended holder |
| Recipient | Matched payments and their public transactions; viewing material enables discovery | Private viewing key plus a payment spending key and announcement expands authority to the master spend key |
| Network intermediary | Destination/routing metadata, connection timing and volume; TLS ordinarily hides request bodies from an intermediary without TLS access | Tor/private routing is user/environment dependent and unverified here; webpage mode selection cannot attest route establishment |
| Browser extension or injected page code | Depending on permission/compromise, page contents, entered passphrases, unlocked keys, clipboard/downloads and network behavior | Browser encryption at rest does not protect an actively compromised browser. No claim of reliable JavaScript-memory erasure is made |
| Local device/file holder | Browser history/settings, encrypted stores, backups/downloads; public archive headers link included payments without a passphrase | #230 avoids new plaintext history and clears memory at lock/session change, but is unmerged. Deleting a legacy key is best effort when browser storage is denied |

Defaults relevant to qualification:

- The reviewed application ships no mandatory analytics/telemetry or mandatory identity service. Static scans and pinned-action checks provide bounded evidence, not a general proof that arbitrary future runtime code cannot exfiltrate.
- Primary/secondary RPC maps and the relayer URL default to empty: no bundled public provider is selected. Direct scan transport describes routing after configuration; fixed 1000-block windows and zero default jitter do not provide a private route.
- RPC/preferences remain non-secret plaintext settings; do not put credentials into URLs. Endpoint validation rejects prohibited credentials and schemes.
- Valid required-local-proxy plans block missing endpoints. Separately, current main loadScanPrivacy returns direct defaults when stored data is malformed or inaccessible, and invalid fields default during sanitization. That fallback remains unresolved. #228 checks cached EVM-client sends after own-node selection; it does not change this broader stored-setting fallback or qualify other chains/proxies.
- #230 deliberately trades cross-session reuse advice for avoiding persistent address links. Its warning says what is and is not checked.
- The invoice A256GCM envelope encrypts line items and memo; public fields such as the amount policy remain signed plaintext. Encryption should not be described as hiding every invoice fact.
- GitHub Pages cannot supply the full HTTP-header policy through static files alone; meta CSP lacks header-only protections. Other sites on the same account's shared origin can affect storage/origin trust. Dedicated origin and release trust-root decisions remain external gates.

The idle event locks tag access and notifies subscribing UI/passphrase state, but an unverified sole EVM key copy deliberately remains in memory under the existing recovery policy. An idle-lock notification is therefore not a guarantee that every secret has been erased.

## E. Tests actually executed

Environment: Linux, Node 24.22.1, Vitest 5.0.5. Repository CI normally uses Node 22. Dependencies were installed from the existing lock with npm ci --ignore-scripts --no-audit --no-fund;722 packages installed. Library build passed. Foundry interoperability used cached 1.5.1/b0a9dd9c, not the repository's pinned 1.8.5. The cached compiler version also did not establish pinned 0.8.28 analyzer qualification.

Main functional/test source is exactly canonical main plus the documentation-only claim at 76256a6a. Full source distinctions are in SOURCE_MAP.md. Counts overlap across author/reviewer runs and must not be summed as unique global tests.

| Source / command context | Exact command or defined set | Result |
|---|---|---|
| main, repo root | npm ci --ignore-scripts --no-audit --no-fund | Exit 0; lock preserved |
| main, repo root | npm run build:libs | Exit 0 |
| #206/main, repo root | node --test scripts/agent/*.test.mjs |12/12; root and independent reviewer |
| main, repo root | npm run ci:check-actions; npm run ci:scan-secrets | Both exit 0;111 action uses pinned; secret scan passed |
| main, repo root | npm audit --omit=dev --audit-level=high --json | Exit 0;0 production advisories |
| main, repo root | npm audit --audit-level=high --json | Exit 1;30 entries:14 high/16 low |
| main, packages/invoice-schema | ../../node_modules/.bin/vitest run --maxWorkers=1 --coverage.enabled=false |12 files,715 passed,0 failed/skipped |
| main, packages/ux-vault | Same Vitest command |7 files,284 passed,0 failed/skipped |
| main, apps/web | Functional selection below |13 files,180 passed,0 failed/skipped |
| #227, apps/web | AppShell.idleClock, App, AppLean, AppShell.i18n; --coverage.enabled=false --maxWorkers=1 |44/44; baseline idle suite 9 fail/1 pass |
| #227, repo root | NODE_OPTIONS=--max-old-space-size=1536 npm run typecheck -w @ghostpay/web | Exit 0; scoped ESLint also 0 |
| #228, apps/web | defaultServices.networkGuard and defaultServices tests; --coverage.enabled=false --maxWorkers=1 |13/13; scoped ESLint 0; whole-web tsc 137, unverified |
| #229, apps/web | Eight recovery/export/security/translator suites listed below |78/78; final component rerun 11/11; final disclosure-policy 16/16 |
| #229, packages/ux-vault | stealth-export-portable and its property test |64/64 |
| #229, repo root | REQUIRE_ANVIL=1 with explicit cached ANVIL_BIN/CAST_BIN, node --test --test-concurrency=1 scripts/recovery/*.test.mjs |16/16; separate Node crypto plus successful raw-key local Anvil spend |
| #230, apps/web | sweep, sweep.destinations.privacy, appLock and Sweep suites |171/171; independent privacy/appLock 12/12; tsc/lint 0 |
| #231, apps/web | Sweep.privacy, Sweep, securityKeys, translator and scanPrivacy suites |120/120; independent first2suites 72/72; tsc/lint 0 |
| #225, repo root | node --test scripts/tests/mythril-disposition-check.test.mjs scripts/tests/mythril-runner.test.mjs scripts/tests/contract-analysis-workflow.test.mjs |39/39; independent coordinator rerun 39 |
| #226, repo root | node --test docs/audits/poc/static-server.test.mjs |8/8; independent coordinator rerun 8 |
| #233, apps/web | pagesInvoiceTamper + existing receipt/default-encryption UI suites |49/49; independent helper 3/3; tsc/lint 0; Playwright discovery 14, execution 0 |
| #229 / #231 | node scripts/i18n/check.mjs |4 catalogs,0 errors;431/415 warnings respectively; English fallback intentionally retained |

Exact main web command, from apps/web:

~~~sh
npx --no vitest run src/lib/keystore.test.ts src/views/SellerKeys.recovery.test.tsx src/lib/reconciliationVault.idb.test.ts src/lib/reconciliationVault.invoices.test.ts src/lib/reconciliationMatch.test.ts src/lib/reconciliationLedger.test.ts src/lib/scannerCore.test.ts src/lib/scannerCore.fuzz.test.ts src/lib/scanMatches.test.ts src/lib/invoiceCreate.test.ts src/lib/receipts.test.ts src/lib/sweepAttemptJournal.test.ts src/lib/qrClassify.fuzz.test.ts --maxWorkers=1
~~~

Exact recovery web selection, from apps/web in the recovery branch:

~~~sh
../../node_modules/.bin/vitest run src/components/StealthExportRecovery.test.tsx src/components/StealthExportPayment.test.tsx src/lib/paymentKeyExport.test.ts src/lib/keyVault.secretExport.test.ts src/views/Scan.stealthExport.test.tsx src/views/SellerKeys.stealthExport.test.tsx src/i18n/securityKeys.test.ts src/i18n/translator.test.ts --maxWorkers=1
~~~

Exact codec/property selection, from packages/ux-vault:

~~~sh
../../node_modules/.bin/vitest run src/stealth-export-portable.test.ts src/stealth-export-portable.property.test.ts --maxWorkers=1
~~~

Exact sweep-history selection, from apps/web in that branch:

~~~sh
../../node_modules/.bin/vitest run src/lib/sweep.test.ts src/lib/sweep.destinations.privacy.test.ts src/lib/appLock.test.ts src/views/Sweep.test.tsx --coverage=false --maxWorkers=1
~~~

### Static artifacts and reproducibility

On clean #227 local final 59fcde26df4e5061fb42c5fee2ab38834c62bd8f, the following command ran twice with different output directories:

~~~sh
NODE_OPTIONS=--max-old-space-size=1536 bash scripts/pages/build-pages.sh /workspace/scratch/fb6d03ffb806/idle-main-pages
NODE_OPTIONS=--max-old-space-size=1536 bash scripts/pages/build-pages.sh /workspace/scratch/fb6d03ffb806/idle-main-pages-repro
~~~

Both exited 0 and verified 16 files. Their complete site path→SHA-256 maps and SHA256SUMS files are equal. SHA256SUMS digest: 1975bdce9372ce48ca0656c01be3c5b6d109d2e83ca3272da611bd63fcb842ad. This is a reproducible **demo artifact in the same environment**, with paymentsEnabledChainIds empty, not an enabled testnet release. Builder metadata release:true denotes its clean/non-development build mode, not owner release authorization.

Recovery's separate clean build passed on 1b0dd02e78d1d3f8dd117977c589eaa62671b3da, also 16 files and payments disabled. Its SHA256SUMS digest is b922ec899f5c92c6401f0842d48188662527662008a30b9c0b6d65c509d3762c. The final disclosure-only recovery head was not substituted into that artifact's provenance.

### Late hosted privacy-browser failure and bounded repair

A final refresh found the original #222 Pages-on-Anvil job [134715947261](https://github.com/djshellshoxxx/GhostPay/actions/runs/44279444265/job/134715947261) failed: **11 passed,2 failed,3 dependent tests did not run**. The checked-out source was synthetic merge644a43ee6366298f418a0aca5a40ecf974871748, joining main 5467c158 and #222 head 2bc20982. One fixture expected a stealthAddress in the now-minimized receipt. Another expected alg=none although the default envelope was A256GCM. The latter failed before testing signature refusal.

Repair [#233](https://github.com/djshellshoxxx/GhostPay/pull/233) keeps encryption enabled. It changes only the signed public amount while retaining ciphertext/private facts, and verifies decryption succeeds with an invalid signature. The Pages receipt flow first verifies minimization, then explicitly includes the address before retaining its original full-receipt checks. Related fixtures receive explicit address opt-ins and nine required balance-preview clicks. Runtime, package, configuration, skip and workflow gates are unchanged.

Fixture source 6dc3ae7c passed 49 focused tests, full-web typecheck and lint; the independent reviewer passed 3 helper tests. Final local cf13b9be adds docs only. Playwright --list collected 14 tests in3modified mocked suites and executed **zero** browser tests. The old hosted result remains failed; fresh repaired-head browser CI is required. Exact commands and source evidence are in [PRIVACY_BROWSER_FIXTURES.md](PRIVACY_BROWSER_FIXTURES.md) and [the failed-job record](LATE_PRIVACY_BROWSER_FAILURE.json).

### Unavailable or incomplete checks

System Chromium 156.0.8078.79 fails before test execution with socket Operation not permitted. Managed Playwright downloads were empty/truncated. Browser suites were adapted but did not execute. No Tor, physical mobile, camera, real wallet, screen-reader or native-language pass is claimed.

No new pinned Foundry/Hardhat/Slither/Echidna/Mythril campaign was completed here. Existing hosted results are explicitly source-pinned, and the complete current #220 Mythril artifact was rechecked. Recovery's local cast/Anvil test is not a substitute for all contract analyzers.

Some default-heap checks ended 137; a 768MiB attempt exhausted V8. Capping at 1536MiB allowed #227/#229/#230/#231 typechecks to pass. #228's full-web check still ended 137. Stale copied package build outputs caused initial worktree setup failures; relevant source-identical outputs were rebuilt/refreshed, not source assertions weakened.

## F. Release readiness

| Dimension | Result | Remaining gate |
|---|---|---|
| Feature implementation | Substantial existing main behavior and eight reviewed repair PRs; not all requested completion work finished | Checkpoint/Bitcoin conflict resolution, shared validation extraction and remaining acceptance |
| Branch consolidation |  #206/#204 integrated; three proven superseded PRs closed |27 pre-existing PRs preserved or awaiting repair/retarget/extraction; eight repair PRs awaiting CI |
| Security remediation | Concrete application/helper defects repaired on branches | Unmerged fixes, unpatched dev advisory, red Mythril, authenticated Sonar/private-alert visibility |
| Privacy qualification | Source-level boundaries and defaults reviewed; consent/history fixes tested | Combined-source egress evidence, checkpoint migration, real Tor/own-node/provider acceptance |
| Browser compatibility | Unit/jsdom and build evidence | Actual Chromium/Firefox/Tor and device acceptance; local launch unavailable |
| Key recovery | Independent EVM crypto and raw private-key spending demonstrated | Merge #213+#229; final source clean-profile/browser/independent-device acceptance; other schemes not certified |
| CI qualification | #206 exact head green before merge | Current main push and new repair heads incomplete; #222 Pages browser failure; #217/#220/#207 Mythril red; #210/#87 build failures |
| Static build | Two matching clean #227 demo artifacts; recovery demo artifact verified | One combined source, authenticated testnet manifests, signed trust root, accepted hosting origin |
| Production/release | Not qualified and not authorized for deployment in this task | Separate owner approval, external audit, operational/security/hosting gates |

No general assertion of “no unresolved high vulnerabilities” can be made: the development advisory is open and current private/Sonar inventories are not fully available. The lean artifact excludes the experimental scheme-2 paths, but that does not erase their repository findings.

## G. Remaining work in priority order

| Priority / item | Engineering and acceptance | Owner/external dependency | PR/source |
|---|---|---|---|
| P0 — qualify actual repair heads | Obtain completed required checks; repair real failures; recheck moving main; merge only reviewed exact heads; verify resulting main | Hosted checks currently queued/incomplete; no unsupported diagnosis of why | #225–#231/#233 |
| P0 — integrate recovery | Combine #213+#229, retain operation/session guards and disclosures; exact-head unit/property/type/lint/independent crypto and clean-profile browser pass | Browser-capable runner; real independent-device acceptance | #213/#229 |
| P0 — integrate immediate Pages privacy/lifecycle fixes | Qualify and merge #227/#231; verify combined AppShell/Sweep/session behavior and browser setup | Required CI and browser environment | #227/#231 |
| P0 — reconcile private checkpoints | Choose one versioned derivation, session identity binding and legacy purge; define migration or deliberate rescan; test restart/reorg/cross-tab/stale session | No new custody choice needed; format must be explicit | #211/#222 |
| P0 — combine own-node and history repairs | Integrate sibling patches and #233 browser fixtures, rerun full typecheck, tests, build and request audit; retain epoch guards | #228's tsc must complete; actual network-profile acceptance | #222/#228/#230/#233 |
| P0 — development dependency advisory | Retain visible failure; adopt authentic compatible fix or separately review a broader mitigation; repeat full/prod audits and tool compatibility | Upstream publishes no patched picomatch version at review | DEV-PICOMATCH, PICOMATCH_AUDIT.md |
| P0 — analyzer gate | Keep 11 findings; source/target/process provenance; independently reviewed per-finding dispositions or actual source repair; complete pinned campaigns | Owner policy if dispositions become gate exceptions; capable toolchain/runner | #212/#217/#220/#225 |
| P0 — current scanner inventories | Revalidate historical Sonar tally; resolve actual remaining vulnerabilities; do not close inaccessible service findings | Authenticated Sonar/private-security access or owner export | #224/#226 |
| P1 — shared dropped validations | Extract current invoice/shared-library fixes without dragging optional services into Pages; restore negative/fuzz/compatibility coverage | Cross-branch conflict review | #218/#209/#211 |
| P1 — payment/reorg/error acceptance | Native and ERC-20 separately: stale/malicious RPC, wrong chain, confirmation/reorg, fee/token behavior, network loss, rejected/ambiguous broadcast, duplicate send, crash recovery | Local devnet/browser and approved testnet evidence, no real funds | Existing main plus chosen repair integration |
| P1 — backup/lifecycle acceptance | Clean-profile and cross-browser restore, wrong keys/password, corrupt/interrupted IDB writes, explicit lock, sleep/resume/session restore; preserve sole-copy recovery policy unless owner changes it | Real browser/device environment; owner decision only if existing non-erasure policy changes | GP-PAGES-02/04, #227/#229 |
| P1 — dependency bundles | Align viem graph for#210; split TS/Node and Hardhat/fhEVM migration for#87; preserve supported peers; complete builds/tests | Compatible upstream dependency sets | #210/#87 |
| P1 — action pins | Retain bounded reviewed update, requalify all required checks | Mythril gate remains red | #207 |
| P1 — Bitcoin consent preservation | Reconcile #219 local spend tracking/explicit provider query with #222; stale/incomplete-provider and full-block proof acceptance | Full-profile/live-node qualification; outside lean beta | #219/#222 |
| P1 — Tor/own-node and metadata | Verify selected routes with real environment; no hidden fallback, credential leakage or involuntary address-bearing query; audit match-dependent requests | Tor/own-node/proxy setup and independent traffic observation | Privacy integration |
| P1 — localization/accessibility/mobile | Keep critical English fallback until reviewed; verify keyboard, focus, screen reader, responsive layout, camera and malicious QR flows | Native-language reviewers and physical/browser acceptance | Existing framework, #229/#231 |
| P1 — one-source beta artifact | Build final combined source reproducibly, run static/bundle/secret/CSP checks and browser acceptance against those exact bytes | Authenticated testnet deployments/manifests, release signing/trust root, dedicated-origin decision | Pages/release workflow gates |
| P2 — docs and Wiki | Update user/developer/threat-model text after real integration; correct stale library-only/completion claims; publish Wiki only with accurate source | Wiki publication is separate from committed source docs | #205/#214–#216/#221/#223 and older docs PRs |
| Deferred — policy/AA/fee-token/future variants | Keep disabled; preserve owner packets and tests; no automatic ABI, custody, guardian or escrow activation | Separate accepted specifications and explicit deployment authority | #217, AUD24-01, non-Pages research |
| Deferred — paid/scheduled AI workflows | Preserve read-only; do not activate paid execution or new schedules as part of Pages qualification | Separate owner scope/authorization | #51/#52/#82 |

The highest-value next integration is the narrow main-targeted pair #227/#231 once their checks complete, followed by recovery #213+#229 and a deliberately reconciled privacy candidate. The recorded PR/CI refresh was 2026-11-18 12:28:52 UTC (04:28:52 America/Los_Angeles); canonical main was unchanged and all eight repair heads still had queued checks. A future session must refresh heads and check results; this report is a committed handoff, not a claim of continued autonomous work after the session ends.
