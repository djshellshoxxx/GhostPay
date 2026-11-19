# Independent reviews and recovery integration observations — 2026-11-19

## Scope, ownership and source identity

Reviewer: `recovery_completion`, delegated by the feature-consolidation coordinator. The coordinator explicitly
assigned this report and its evidence directory on `codex/ghostpay-feature-consolidation-20261119`. This worker
does not commit, publish or merge the coordinator's branch. Acceptance for this report is source-pinned review
of the privacy follow-up, dependency-inventory restoration, recovery integration, bounded PR #255 tooling
scope, final test-only integration repairs, the hosting timestamp repair and camera visibility integration,
with actual execution distinguished from author-reported evidence and outstanding qualification.

The privacy and dependency-inventory reviews below were independent of their implementation. This worker
implemented the recovery fix; that section is an integration observation, accompanied by the separate privacy
worker's independent source review and replay. This worker also implemented the TagArchive test repair;
its independent review is attributed to the privacy worker below. These are AI-assisted engineering reviews,
not an external audit or production release approval.

| Item | Exact source |
|---|---|
| Master baseline for the recovery and privacy follow-ups | `b529a720cfbfa3c1056cc71085b4f163078e7591` |
| Recovery implementation | `bdf6589f0dd07d9ab1935489c72160e1d99f2c82` |
| Recovery final evidence head | `16e0a4688e40e281d606ecbcf0c67577ac46120e` |
| Coordinator's recovery integration | `dd6b9dec6be7e9eea78069597602b5772dc8ae5f` |
| Privacy final runtime/test source | `1aaa29322933469dc02776a639d58c526077f0e7` |
| Privacy final evidence-only head | `a956acb2dab0f2043a2964028d9b1b30b3454445` |
| Dependency-inventory restoration | `471bfc50addc3b420d601a2654b68a1aa217096d` |
| Selected prior dependency-inventory source | `39083b787a8c548e806f8f0d1388281888b84f38` |
| PR #255 reviewed head | `ea47fa75eabb0be2045081ffeb120fc2bfae67ab` |
| Whole-unit diagnostic and four test repairs' common base | `e76451ad56ba1634eed9d03468961900433fd130` |
| Settings disclosure test repair | `83bc4f52767d88e6896d986a29f6d3495e8c22c4` |
| Scan cancellation test repair | `9ae57de3ef8a432c1592ddfb496de8b0fd0a6fee` |
| TRON shared fixture repair | `5b85a0e542cb067d595de89c6b1a0c6445aec7aa` |
| TagArchive idle test repair | `7eb078e817fe76c1f22e84cbb1bb75be71090ccc` |
| Coordinator's integration containing all four test repairs | `74e3111f994481e7c9201ddb0494cf4a8405eadd` |
| Hosting timestamp runtime/test repair | `38fe7fdaf151ef433be9721af8fea7cbcdea89c4` |
| Hosting timestamp evidence-only successor | `0d5e34add6ddfebc98c59de8a53c4149aac04338` |
| Hosting timestamp reuse on main | `f4464e57bc6743800c2564ddb71bb5b06f64eb35` |
| Focused-main hosting provenance/evidence successor | `db555cb9892076d30d297fa090d3a8114d9242c6` |
| PR #258 original camera visibility source | `84398a79e18673f3e371a405931bc464e1cca99a` |
| Camera visibility integration | `f0fe867d8bb257ecabb4cf36898962acb72839dc` |
| Camera integration evidence-only successor | `2777aeea2bd0563c66994bdee6bc8dac6347110f` |
| Coordinator after hosting and camera integration | `e74ddd26b75912d770e05d51f0b9229756adc649` |

The coordinator's branch continues to advance. Review conclusions apply to these identified sources and the
specific comparisons recorded below; they do not transfer whole-head test qualification to later merges.
The final read-only comparison at `e74ddd26` confirms all three reviewed hosting source/test blobs and both
camera source/test blobs remain exact. Combined-head execution results belong to the coordinator's receipt.

## Independent privacy follow-up review

**Result: no introduced blocker found within the reviewed scope.** The pinned source includes profile/Settings
commit `df06544c82afa7357b393025204c30da08ecb800`, checkpoint/app-lock commit
`78b16292449461a3149a4f95c79faf1f156bfc47`, and CSP commit
`1aaa29322933469dc02776a639d58c526077f0e7`. The later `a956acb2` commit adds evidence only.

Line references in this section refer to the final runtime/test source `1aaa2932`.

| Boundary | Reviewed source and conclusion |
|---|---|
| Stored network policy | `apps/web/src/lib/networkAuthorization.ts:165–167` uses the shared strict `readNetworkSelection` parser. Present malformed/incomplete records no longer acquire permissive field defaults. Policy-governed grants require a ready selection and recheck the stored-policy snapshot. Same-origin release hashing uses its separate resource authorization path. |
| Settings edits | `apps/web/src/views/Settings.tsx:494–538` retains the user's draft and its original stored revision after a storage event. A stale save compares against that original revision, refuses to overwrite the newer value and refreshes the displayed state. Refresh also invalidates network authority. |
| Private checkpoint authority | `apps/web/src/views/Scan.tsx:83–86, 195, 241–244, 351–372` includes the network-profile record in synchronous preference snapshots as well as storage-event handling. A profile mutation before event delivery therefore invalidates pending journal work through the existing external guard passed to the encrypted store. |
| App lock | `apps/web/src/views/Scan.tsx:203–209` replaces the pending automatic-rescan callback immediately, disables automatic rescanning and aborts current work. The synchronous callback replacement closes the interval before React commits the state update. |
| CSP parsing | `apps/web/scripts/apply-csp.mjs:33–68` obtains inert HTML parser locations and requires an unambiguous literal content range. Duplicate attributes, entity ambiguity and invalid placement cannot supply the special configured-origin exemption. |
| Bundle host checks | `apps/web/scripts/scan-bundle.mjs:119–134, 208–224` limits the exemption to configured URL tokens in the actual enforcing `connect-src` range. Other original bytes remain scanned, and the existing AST network-sink checks remain active. |

### Settings concurrency limit

The Settings change implements an **optimistic revision comparison**, not an atomic cross-tab localStorage
compare-and-swap transaction. It rejects the reproduced stale-draft case, including a remote update observed
before the save comparison. This review does not claim atomicity if a different process writes between the
comparison and subsequent localStorage write. The encrypted private journal's guarded store commit is a
separate mechanism and must not be conflated with the Settings comparison.

### Tests and independent execution

The added deterministic private-scan performance fixture uses the actual worker protocol and crypto through `InlineWorker`, plus encrypted journal
paths with synthetic in-memory RPC/storage. It asserts discovery equality, revalidation and bounded counts;
elapsed times are observational. It does not claim real network, IndexedDB, rendering or mobile performance.
The reviewed commits exclude local absolute-path Vitest configurations and temporary baseline source copies.

This reviewer independently executed the native CSP suite on Node `22.23.4` with serial execution and a bounded
heap:

```sh
NODE_OPTIONS='--max-old-space-size=384 --max-semi-space-size=8' \
  node --test scripts/tests/privacy-csp-bundle.test.mjs
```

**Actual result: 49 passed, 0 failed, 0 skipped, 0 cancelled; 4,215.349461 ms.** The three source/test hashes
were recorded before execution, checked unchanged afterward, and compared to the committed `1aaa2932` blobs.

| File | SHA-256 |
|---|---|
| `apps/web/scripts/apply-csp.mjs` | `914a80cab61dbe0a3f203a6cd2b6b305de63ebe224a0dd2979c969e52dea7139` |
| `apps/web/scripts/scan-bundle.mjs` | `5fb3017bcf62f924ab1461f05ab16a4bdf74bc8edcd4451f511a8a2987481c8f` |
| `scripts/tests/privacy-csp-bundle.test.mjs` | `0d184d94dd418d5b897e1436815f1e1859c152ab3cc888dd5e6e45dd442418a8` |

The complete replay output is retained byte-for-byte as
[`evidence/privacy-independent-csp-review.txt`](evidence/privacy-independent-csp-review.txt) (10,673 bytes;
SHA-256 `7aff73a2b1046e20542c6ec43843d09e541c3a573b573ab785903921d513c205`). The `.txt` suffix keeps the raw log
eligible for ordinary version control; its contents have not been summarized or rewritten.

The privacy author's broader focused results are recorded separately in
[`../../handoffs/privacy-master-followup-20261119/`](../../handoffs/privacy-master-followup-20261119/).
Those author runs are not relabeled as this reviewer's independent execution. No full web qualification or
whole-candidate build result is inferred from the CSP replay.

## Independent dependency-inventory restoration review

**Result: the narrow restoration preserves the intended reviewed/pending distinction.** At
`471bfc50addc3b420d601a2654b68a1aa217096d`, the complete
`scripts/tests/lean-core-reachability.test.mjs` blob is
`304b41ea3d6f2964eae5063c89a7c1847709effe`. It is exactly the blob selected from
`39083b787a8c548e806f8f0d1388281888b84f38`.

The integration had placed `@ghostpay/hygiene` and `@ghostpay/metadata-hardening` both in an additional reviewed
bucket and in `WEB_PENDING_OWNER_REVIEW`. The restoration removes that duplicate reviewed bucket. It retains
the original reviewed arrays, explicit pending entries, the exact workspace dependency closure comparison and
the reviewed/pending disjointness assertion. The relayer boundary and deferred source-reachability check remain.

This is a source/blob comparison, not another independent test run. It does not grant owner approval to a
pending package or convert the inventory test into a release-scope approval. The coordinator owns the combined
tooling replay and any eventual owner disposition.

## Recovery integration observations

The master baseline already contained the strongest Spec 18 recovery, strict BOM validation, atomic session
installation and idle/session behavior from the earlier branches. The preliminary main-based port at
`2176e4937a905d3c5603b5db9560d8675d0b51c5` is superseded and must not be imported as a second feature copy.

The novel fix at `bdf6589f` closes recovered-key authority use after synchronous idle expiry or session
replacement. `RecoveredPaymentKeys` and `RecoveredMasterKeys` retain session-version guards, refuse stale loans
and dispose owned secret boxes on rejection. `openStealthExport` retains the pre-decryption guard across its
asynchronous work, so completion cannot return usable keys after the original authority expires. Fresh
empty-session recovery remains permitted. The isolated recovery test selects the supported Node permission
flag and explicitly asserts `ERR_ACCESS_DENIED` when attempting to read the original repository script.

Read-only comparison confirmed that coordinator merge `dd6b9dec` preserves these three source/test files
exactly from the reviewed recovery head `16e0a468`:

- `apps/web/src/lib/paymentKeyExport.ts`
- `apps/web/src/lib/paymentKeyExport.expiry.test.ts`
- `scripts/recovery/stealth-export-recover.test.mjs`

| Execution | Actual result and attribution |
|---|---|
| New expiry regression against baseline master | Implementing worker: 5 failures and 1 passing fresh-session control. |
| Node 24 payment export, expiry and atomic session selection | Implementing worker: 39/39 passed across three files. |
| Node 22 expiry regression | Implementing worker: 6/6 passed. |
| Node 22 isolated recovery | Implementing worker: 1/1 passed, including permission-denial control. |
| Node 24 isolated recovery | Implementing worker: 1/1 passed, including permission-denial control. |
| Independent source review | Privacy worker reviewed implementation `bdf6589f` against session expiry/version guards and found no introduced source blocker. |
| Independent Node 22 expiry replay | Privacy worker reported 6/6 passed on unchanged recovery head `16e0a468`, with source manifests still matching. This reviewer did not execute that independent replay. |
| Typed ESLint | Implementing worker: heap exhaustion, exit 134. This is not a lint pass. |

These repeated runtime checks overlap; their counts must not be added as distinct test cases. Full recovery
evidence and exact commands are in
[`../../handoffs/recovered-key-authority-20261119/REVIEW.md`](../../handoffs/recovered-key-authority-20261119/REVIEW.md).
Earlier broad build/test processes were resource-killed; they do not supply whole-head qualification.

## Bounded PR #255 assessment

Reviewed source: `ea47fa75eabb0be2045081ffeb120fc2bfae67ab`, including tooling/deployment consolidation
`4a3c9af62da162e531814ef88d8877113ace4211`. This was a bounded read-only source review. No native analyzer,
contract deployment, live RPC operation or duplicate analyzer campaign was run by this reviewer.

**Assessment: no confirmed new source blocker found in the reviewed tooling/deployment scope; suitable for a
separate qualification lane, not a qualified release or an approved finding exception.** Against the inspected
coordinator candidate, production contract source, vendored libraries and compiler inputs were unchanged.

| Source at `ea47fa75` | Review conclusion |
|---|---|
| `packages/contracts/script/DeployPolicy.s.sol:105–120, 133` | Nonzero-fee acknowledgment binds chain ID, token address, current token codehash, flat fee and recipient. The checks occur before deployment broadcast. Acknowledgment is not proof of permanent token behavior. |
| `packages/contracts/scripts/pre-deploy-check.sh:90–105, 137–157` | The shell mirrors configuration binding using read-only chain/code queries and rejects missing/malformed identity or digest inputs. Zero fee retains its distinct acknowledgment behavior. |
| `packages/contracts/scripts/mythril-compat.py:26–99` | Observation retains original deadline/report operations and exposes known timeout, report-exception and error-log signals. Missing or unusable telemetry fails closed. |
| `packages/contracts/scripts/capture-mythril-evidence.py:92–115, 161–200` | Duplicate JSON keys and malformed telemetry are rejected; capture binds target order, invocation, source identity and retained outputs. Completion of evidence capture is distinct from successful security findings. |
| `packages/contracts/scripts/run-mythril.sh:41–46` | Every reported issue, abnormal process result or incomplete telemetry continues to fail the production gate. The reviewed default budget remains 900 seconds and depth 3. |
| `scripts/contract-analysis/mythril-disposition-check.mjs:204–284` | The unwired helper binds complete target evidence, source/configuration and scoped approval records. It does not authenticate the approver itself; authenticated review remains external to the offline helper. |

The production contract findings are not fixed merely by improving evidence handling. The checker remains
unwired and no owner disposition is granted by this review. Activation of any future finding exception requires
the applicable independent review and authenticated owner approval bound to the exact records, sources and
configuration. Existing token freeze/liveness behavior is an explicit residual decision; a matching acknowledgment
does not remove it or rescue already-prefunded accounts under another immutable factory.

One nonblocking documentation gap remains: `packages/contracts/scripts/run-mythril.sh:5` still suggests a plain
pip-installed `myth`, although the new mandatory telemetry requires the repository compatibility launcher on
PATH. The hosted workflow installs that launcher correctly. Correct the local-run prerequisite when promoting
this lane; do not weaken telemetry validation to accommodate the old instruction.

Integration must preserve newer overlapping source from the selected candidate, including the security-tooling
work associated with PR #257. A whole-file import from the older branch is not justified by this review. The
packet's prior focused tests and installed-interface probes are not a fresh full five-target campaign or exact-head
hosted qualification. The coordinator's candidate excludes #255 unless that separate qualification is completed.

## Final test-only integration repairs

**Result: no introduced source blocker found in the four scoped repairs.** All four were based on
`e76451ad56ba1634eed9d03468961900433fd130` and are integrated in coordinator head
`74e3111f994481e7c9201ddb0494cf4a8405eadd`. The repairs change tests or test fixtures, plus their work claims
and evidence. They do not change production behavior, timeouts, configured coverage thresholds or security
validation. Independent review and test execution are attributed separately below.

### Failed baseline and failure accounting

The coordinator's terminal whole-unit diagnostic on `e76451ad` exited **1**: **245 files passed, 10 failed,
2 skipped; 3,584 tests passed, 33 failed, 13 skipped**. It used the original Vite configuration, two workers
and coverage disabled for diagnosis, after the coordinator verified **254/254 build inputs**. This remains a
failed baseline, not a qualification result for the repaired source.

The coordinator maps the four repairs to **31 of those 33 baseline failures**. The shared TRON fixture affected
several files, so the smaller isolated red selections below must not be summed as the whole-baseline failure
count. Their green counts also overlap with broader selections and must not be added as distinct coverage.

| Repair and exact source | Scoped correction and preserved assertions |
|---|---|
| Settings — `83bc4f52767d88e6896d986a29f6d3495e8c22c4` | `apps/web/src/views/Settings.exchange.test.tsx` updates both obsolete provider-warning matchers to the disclosure already rendered. The positive assertion requires the complete exported URL/provider warning; a separate assertion requires the session-only/detected-credential omission and missed-secrets caveat. Preferences-only defaults, unticked sections, exact listings, hidden endpoint paths, disabled empty sections and import confirmation checks remain. `Settings.tsx`, the exchange helper and English locale are unchanged. This corrects an assertion, not runtime consent or Settings concurrency. |
| Scan — `9ae57de3ef8a432c1592ddfb496de8b0fd0a6fee` | `apps/web/src/lib/scanPrivacy.authorization.test.ts` restores three assertion lines and is byte-identical to the selected earlier repair at `5c926889d424392c67185b3c13974d0fcd589780`. Production `assertScanActive` already throws `Error('scan-aborted')`, which the view and other tests recognize. The two pre-aborted cases, queued-window case and jitter case now expect that sentinel. Zero-dispatch checks, one-window bound, single jitter call and live-indexer abort propagation remain. `scanPrivacy.ts` and `Scan.tsx` are unchanged. |
| TRON — `5b85a0e542cb067d595de89c6b1a0c6445aec7aa` | `apps/web/src/features/tron/fixtures.testutil.ts` returns each requested existing block height in order, using the API's exclusive `endNum` and the advertised tip of 600. Only height 500 carries the original funded transaction; the special genesis response remains. `chain.hardening.test.ts` asserts the earlier strict parser's exact `INVALID_RESPONSE` code for missing genesis while preserving uppercase-mainnet rejection. The original sparse fixture could not pass the adapter's existing contiguous-range validation. No production adapter, authority, receipt or cancellation check changes. |
| TagArchive — `7eb078e817fe76c1f22e84cbb1bb75be71090ccc` | `apps/web/src/components/TagArchive.test.tsx` preserves all original generated-passphrase, value, value-attribute and input-type checks by first notifying the real lock subscriber while mounted. It then refills the fields and advances the real application's fake timer by 61 seconds: the same seller remains retained, the session is suspended, a raw viewing-key loan is refused, archive fields/actions are absent and typed passphrases are absent from the document markup. The old expectation that the archive stayed visible after suspension was stale. All relevant production components and session/app-lock code are unchanged. |

### Focused execution and independent review

All four authors used the original repository Vite configuration and existing compiled package outputs in
isolated checkouts; none used a source-alias configuration for these final repairs. The evidence packets record
the applicable copied-output/input checks. These focused runs do not establish a fresh complete package build.

| Repair | Implementing worker's actual execution | Independent review; no separate runtime replay |
|---|---|---|
| Settings | Privacy worker, Node 24.22.3 / Vitest 5.1.0, one worker, 384 MiB heap, coverage off. Complete file: red **1 failed / 10 passed** in 28.00 s; green **11/11 passed** in 9.93 s. | Recovery worker reviewed exact `83bc4f52`, verified the test hash and unchanged runtime/locale inputs, and confirmed the retained default/listing/privacy checks plus explicit omission caveat. |
| Scan | Privacy worker, Node 24.22.3 / Vitest 5.1.0, one worker, 384 MiB heap, coverage off. Red **4 failed / 1 live-indexer control passed** in 2.49 s; green **5/5 passed** in 2.10 s. | Recovery worker reviewed exact `9ae57de3`, verified equality to the earlier test blob and unchanged runtime, and checked the fixed helper sentinel and retained dispatch/cancellation assertions. |
| TRON | TRON implementing worker, Node 22.23.4 / Vitest 5.1.0, one worker, 512 MiB heap, no file parallelism. Red chain-hardening file **7 failed / 24 passed** in 2.95 s. Green selection **5 files / 69 tests passed** in 74.33 s, covering all four TRON files and the complete shared chain localization/authority suite. Existing 60-second timeout retained. | Privacy worker reviewed exact `5b85a0e5`, confirmed the exclusive range bound, ordered heights, funded-height/genesis behavior and unchanged runtime scope. Recovery worker also inspected the narrow diff against the strict range parser; neither reviewer reran the author's tests. |
| TagArchive | Recovery worker, Node 24.22.3 / Vitest 5.1.0, one worker, 384 MiB heap, coverage off. Filtered C-R11: red **1 failed / 8 deselected** in 11.76 s; green **1 passed / 8 deselected** in 6.58 s. | Privacy worker reviewed exact `7eb078e8`, verified its test hash and unchanged runtime, and read both raw logs. It confirmed preservation of the mounted-field wiping assertions followed by timer-driven suspension and retained-copy restrictions. |

The TagArchive filter deliberately deselected eight unrelated cases; the focused pass does not qualify its
complete nine-case file. The three source reviews performed by the recovery worker are independent of those
implementations. The recovery worker's TagArchive execution is an author run, accompanied by the separate
privacy worker's source/evidence review. No author run in this table is relabeled as an independent replay.

Evidence and full commands:

- [Settings disclosure review and red/green evidence](../../handoffs/settings-exchange-20261119/REVIEW.md),
  finalized in evidence-only head `fed63bf0c3816e125afe77166857aff6298266da`.
- [Scan cancellation review and red/green evidence](../../handoffs/scan-cancellation-20261119/REVIEW.md),
  including the exact reused test source and unchanged runtime hashes.
- [TRON fixture qualification and red/green evidence](../tron-integration-20261119/QUALIFICATION.md),
  including the input comparison/copy receipt and five-file green selection.
- [TagArchive review and red/green evidence](../../handoffs/tag-archive-idle-20261119/REVIEW.md),
  finalized in evidence-only head `b9d77b033e3ca1397e9168282c73a439c897734b`; byte-exact raw logs and source
  hashes are retained in that packet.

### Remaining timing diagnoses and combined qualification

The two other failures from the whole-unit baseline are not fixed by these test repairs. The Bitcoin initial-scan
case exceeded its one-second assertion wait in the broad run; its isolated selection passed **2/2**, which
supports a timing diagnosis but does not prove the broad-run failure resolved. The million-log fuzz run took
approximately **206 seconds**, exceeding its unchanged **180-second** timeout under load. Resource contention
is a hypothesis for that timeout, not a demonstrated fix or permission to relax the test.

When the four-repair review above was recorded, the coordinator's serial replay of all ten previously failed files on the combined
source was still running. It subsequently finished at `74e3111f` with **96 passed / 1 failed** across **nine passing
files and one failing file**. The unchanged million-log case exceeded its 180-second limit at **191.874 seconds**;
`QUALIFICATION.json` records that terminal failed command separately. The earlier focused results remain distinct
from this broader replay. The replay remains a failed command and does not establish passing full-suite, compiler,
lint, coverage or browser gates at `74e3111f`.

## Independent hosting timestamp review

**Result: no introduced source blocker found at `38fe7fdaf151ef433be9721af8fea7cbcdea89c4`.** The repair is
based on `74e3111f994481e7c9201ddb0494cf4a8405eadd`. Evidence-only successor
`0d5e34add6ddfebc98c59de8a53c4149aac04338` leaves the reviewed product unchanged. Author: `branch_recon`;
independent source/evidence reviewer: `recovery_completion`. This is a runtime precision correction, separate
from the four test-only repairs above.

The bounded source review covered `tools/portable-hosting-kit/src/profiles/static-export.mjs` and its static
export/differential tests. This reviewer independently inspected the installed Node 22.23.4 runtime source:
`dateFromMs` constructs `Stats.mtime` using `new Date(MathRound(Number(ms)))`. The preview instead uses
`Math.floor(st.mtimeMs / 1000)`. Passing the rounded Date through `fs.utimes` can advance the exported HTTP
second when the source lies in the final half millisecond of a second.

The repair carries raw `mtimeMs` and passes `String(mtimeMs / 1000)` to `fs.utimes`. During review, the
reviewer identified and the author addressed two conversion edges: Node maps negative numeric timestamps
to the current time, whereas numeric strings retain their negative value; an explicit `mtimeMs !== null`
condition preserves epoch zero. Destination atime still equals copied mtime, matching prior behavior.
Overlay-null behavior, no-follow/open/stat checks, exclusive creation, failure cleanup and final rename
remain unchanged. Preview, header, routing, comparison-helper and package configuration blobs were verified
unchanged from the base. Existing differential assertions remain intact.

The six new focused cases cover fractional-boundary, epoch and pre-epoch timestamps under both root and
subpath exports. They verify actual fixture precision, the exact HTTP whole second, submillisecond preservation
within 0.01 ms and identical file bytes. The existing differential fixture now sets the font to
`1795078174.9996` seconds, making the previously intermittent rollover deterministic without removing or
weakening any validator, request, status, header or body assertion.

| Evidence on the pinned product | Attribution and actual result |
|---|---|
| Original exporter plus new focused tests | Author run; raw log independently read: **9 passed / 2 failed**, 428.947 ms. Both failures exported second `1795078175` instead of `1795078174`. |
| Repaired exporter, same focused selection | Author run; raw log independently read: **11 passed / 0 failed / 0 skipped**, 420.241 ms. |
| Original full kit command, concurrency 4 | Author run; terminal log independently read: **299 tests, 285 passed / 0 failed / 14 skipped**, 7,893.821 ms, exit 0. |
| Kit TypeScript and full kit ESLint | Author receipt records exit 0 for each, using the original kit configurations. |
| Evidence integrity | Reviewer verified all six committed evidence files' lengths and SHA-256 values against the receipt. No independent test replay was performed. |

Source/test hashes verified by this reviewer:

| File | SHA-256 |
|---|---|
| `tools/portable-hosting-kit/src/profiles/static-export.mjs` | `a9906474a56a3e45699182e71b7b1fc7cf272a5304483d6f11e24646c84fde98` |
| `tools/portable-hosting-kit/test/profiles/static-export.test.mjs` | `1b3d2da446e657802c957de14fa25cde2447d3ef7e6fc34487e43ab19d682d31` |
| `tools/portable-hosting-kit/test/profiles/differential.test.mjs` | `c45152e8274aa7112baaeb45c5484c3d03deedd09282086802f11e566f3a1ebc` |

The [hosting timestamp qualification](../hosting-timestamp-20261119/QUALIFICATION.md) and
[receipt](../hosting-timestamp-20261119/receipt.json) retain full commands, raw logs, unchanged-source identity
and the original hosted failure reference. Four real nginx differential cases were skipped locally because
nginx was absent. Other existing skips cover missing native tools, opt-in browser/container cases and the
isolated checkout's missing web build. No native nginx, transport, browser, container or new web-artifact pass
is inferred. An optional `/usr/bin/time` wrapper failed with exit 127 before starting tests; its log is retained
separately and is not a test result. The coordinator owns combined-source and hosted qualification.

### Focused reuse on main

The author also prepared `f4464e57bc6743800c2564ddb71bb5b06f64eb35` on main
`14ded337a10c140d7a9f9a9238ec038587d925bb`, retaining the original `38fe7fda` cherry-pick provenance.
This reviewer independently verified that main is an ancestor, candidate `74e3111f` is not an ancestor,
and the only changes from that main are the work claim and the same three product files. All three blobs
match the reviewed product; the entire `tools/portable-hosting-kit` tree is identical at Git tree
`3295a7030121f51b1286ffc96b3a6480aa319aa7`. No introduced source blocker was found in this focused reuse.

The root `package.json` and `package-lock.json` differ between the tested feature source and this main-based
source. Kit-tree equality is therefore **not full dependency equivalence**, and this source comparison does
not constitute another test execution. The earlier logs remain historical execution on `38fe7fda`; no fresh
full-kit, lint, typecheck or hosted result on `f4464e57` is claimed by this reviewer.

The final focused provenance packet is pinned to evidence successor
`db555cb9892076d30d297fa090d3a8114d9242c6` under
`docs/consolidation/hosting-timestamp-main-20261119/`. This reviewer independently verified that all eight
historical evidence files remain byte-identical to `0d5e34ad`, including recorded sizes and hashes, and
recomputed **109 differing parsed root-lock entries**. A separate traversal from `typescript`, `@types/node`,
`eslint` and `@eslint/js` through declared dependencies and optional dependencies resolved **82/82 identical
package records**, identical path sets and zero unresolved names on both locks. Optional peers are outside
that traversal. The four recorded shared kit inputs and the original main registry bytes also match.

This bounded lock comparison supports the recorded provenance; it is not an installation, runtime trace or
fresh check execution. The original browser selection was skipped and the Playwright versions differ, so
no browser qualification transfers. The preserved red TAP log contains four whitespace-only assertion-format
lines: the author's full raw-evidence diff check exits 2, while its source/prose check exits 0. Exact raw bytes
are retained and the full diff is not described as whitespace-clean. No introduced source or provenance blocker
was found within this focused review; the published exact head still requires its applicable hosted gates.

## Independent camera visibility integration review

**Result: no introduced source blocker found at integration `f0fe867d8bb257ecabb4cf36898962acb72839dc`.**
This reviewer first reviewed original PR #258 source `84398a79e18673f3e371a405931bc464e1cca99a`, then
verified the integration's exact component/test blobs, ancestry and evidence. The integration has parents
`52c9d7738949e473cd77b2213a038ba07f41238e` (the claim on candidate `74e3111f`) and original `84398a79`.
Evidence-only successor `2777aeea2bd0563c66994bdee6bc8dac6347110f` retains that runtime source.

The candidate's `CameraImporter.tsx` was byte-identical to the original PR's sole parent,
`ffd982a7aea2856c186b40ef236a39720a1b81f5`. This was a missing independent correction, not a duplicate
already present in the candidate. The integration retains original ancestry. The sole registry conflict was
resolved as the exact 16-line upstream addition followed by every byte of the candidate claim's existing
registry; this reviewer verified that composition directly.

The runtime delta is confined to `apps/web/src/components/CameraImporter.tsx` (eight additions, three removals):

- The shared visibility check now rejects a hidden document before camera, pasted-text or image dispatch
  and before consumer delivery, including the interval before the visibility event is delivered.
- Hiding aborts pending local imports as well as camera work. Aborted work remains refused after visibility
  returns, while a fresh explicit action can begin a new attempt.
- Camera and image handlers recheck visibility after synchronous preview invalidation. Consumer delivery
  checks again before invoking the callback. These checks cover a callback that hides the owning UI.
- Existing controller-identity checks in finalizers prevent a late old operation from clearing a newer one.
  Idle pasted drafts, scope/disclosure cancellation, multipart reset and camera-stop behavior remain intact.

The reviewer also read the unchanged lower-level `qr-exchange` camera stream-identity checks, late-start
abort handling and final cleanup. The patch changes no scanner, transport or library source. No introduced
camera-scan cleanup regression was found in this source review; this is not a physical-camera test. Consumers
must still honor the supplied AbortSignal after their own asynchronous work. Abort cannot undo an already
completed consumer action.

| Fresh integration evidence | Attribution and actual result |
|---|---|
| New visibility file against unchanged candidate component at claim `52c9d773` | Privacy integration worker: **9 failed / 9**, exit 1, 2.88 s. This reviewer read the raw failures showing missing aborts and hidden dispatch/delivery. |
| Six complete importer files on exact integration `f0fe867d` | Privacy integration worker: **77 passed / 0 failed / 0 skipped**, exit 0, 18.04 s. Includes all nine visibility cases plus existing base, behavior, lifecycle, multipart and localization cases. This reviewer read the terminal raw log. |
| Source and evidence integrity | Reviewer verified 11 source/configuration hashes and four artifact hashes, plus exact upstream runtime/test equality and original ancestry. No independent runtime replay was performed. |

The fresh runs used Node 22.23.4, Vitest 5.1.0, the original Vite configuration, 512 MiB old-space and
32 MiB semi-space, one worker and no file parallelism. The integration worker copied existing coordinator
package outputs and recorded byte equality for 565 JavaScript files across 41 available output directories.
That is compiled-output reuse, not an independent package rebuild. A separate optional `/usr/bin/time`
launch failure occurred before any tests and is retained as instrumentation setup evidence, not behavioral red.

| Reviewed product | SHA-256 |
|---|---|
| `apps/web/src/components/CameraImporter.tsx` | `f5725a3c854b60414ce10330922941110bb5bd20058048d46bc89256e9f1fb13` |
| `apps/web/src/components/CameraImporter.visibility.test.tsx` | `27d24dd0ff8be898f514fe56e19e92f7bc6159c8706fe807f538e67bd7e954d5` |

The [camera integration review](../../handoffs/camera-visibility-integration-20261119/REVIEW.md) and
[machine-readable evidence](../../handoffs/camera-visibility-integration-20261119/EVIDENCE.json) retain the
new original-config red/green runs and their source/configuration identity. Earlier upstream checks remain
historical; their bounded TypeScript/ESLint program is not a fresh full-project lint pass. The mocked jsdom
regressions and scoped component replay do not establish whole-web coverage, real-camera, mobile-browser,
Tor, deployment or combined-head hosted qualification.

## Read-only fuzz memory-configuration review

The coordinator subsequently reported that the unchanged million-log test again exceeded its 180,000 ms limit,
at **191,874 ms**, under Node 22 with `--max-old-space-size=512 --max-semi-space-size=8`. This report does not
convert that timeout into a pass. The coordinator requested a bounded resource review before a single further
isolated replay; this reviewer did not run the fuzz test or any other heavy check for that review.

This reviewer actually executed small, fresh Node startup probes using
`/home/agent/.npm/_npx/361c55be1121897e/node_modules/node/bin/node`: Node **22.23.4**, V8
**12.4.254.21-node.57**, pointer compression disabled. The probe subprocesses removed inherited `NODE_OPTIONS`,
passed the flags below explicitly and printed `require('node:v8').getHeapStatistics().heap_size_limit / 1048576`.
The values are heap-limit observations, not measured test memory consumption or process RSS.

| Explicit old-space limit | Explicit semi-space limit | Observed V8 heap limit |
|---|---|---|
| 512 MiB | 8 MiB | 536 MiB |
| 512 MiB | None; automatic | 560 MiB |
| 768 MiB | None; automatic | 816 MiB |
| 768 MiB | 32 MiB | 864 MiB |
| 1024 MiB | None; automatic | 1072 MiB |

The [official Node CLI documentation](https://github.com/nodejs/node/blob/main/doc/api/cli.md) describes the
young-generation allowance as three times the semi-space size and says a larger semi-space may improve
throughput at a memory cost, depending on the workload. Combined with the actual limit differences above,
the automatic semi-space in these processes is inferred to be **16 MiB**. The earlier explicit 8 MiB cap
therefore reduced the corresponding young-generation allowance from **48 to 24 MiB** in this environment.
This is not a claim that every Node 22 host has the same default.

Source inspection of `apps/web/src/lib/scannerCore.fuzz.test.ts` found 200 newly allocated batches of 5,000
logs, with repeated per-byte string construction. `scannerCore.ts` processes each batch and bounds its replay
memo. The smaller young-generation allowance could add scavenging or promotion work for that allocation
pattern. **No GC trace, CPU profile or controlled workload comparison establishes GC as the timeout's cause.**

The recommendation was one isolated replay with
`NODE_OPTIONS='--max-old-space-size=768 --max-semi-space-size=32'`, one worker and no file parallelism, after
other heavy work ends. It raises the observed per-process V8 heap ceiling by 328 MiB to 864 MiB, below the
1024/automatic alternative's 1072 MiB, while increasing the allowance relevant to allocation churn. The small
probes observed approximately 2.4 GiB available memory; that was a transient snapshot, not a reservation or
a whole-process memory guarantee. Recheck available memory before execution; peak RSS/CPU capture with
`/usr/bin/time -v` would help document the actual replay. The original configuration, coverage setting,
timeout, seed, corpus and thresholds remain unchanged.

Any eventual green replay belongs to the coordinator's execution evidence for that exact source and resource
configuration. This read-only recommendation is neither a performance result nor a proved GC diagnosis.

## Independent canonical-array final-source review

**Result: no introduced source blocker found in the bounded inert-array repair.** The primary independent
semantic review is `privacy_completion`'s [final-canonical-source-review.json](final-canonical-source-review.json).
`recovery_completion` additionally read the final product diff and source-pinned worker receipt, and independently
verified the Git objects and ancestry below. Neither reviewer reran the author's tests as part of these reviews.

| Pin | Exact commit or tree |
|---|---|
| Original PR #265 | `c591b54078febcf24cba01b29bc173b2fac1f9cb` |
| Reviewed worker product | `0f8dca27613fe9952cdb772cb10d05ced0f2b455` |
| Worker evidence successor | `09821dc69e505d544672746b2bfa8edc2643b3c6` |
| Canonical local integration checkpoint | `3ab1c3f7efd2b9b65eb3db08a35748c9e515eb33` |
| Fetched canonical published checkpoint | `cb7cfc9ec4f6c051e99805a25132c9458beb7af0` |
| Identical local/published tree | `c58843c86dae5164eab259d3440aba01406bd593` |

Read-only Git checks confirmed that both final commits retain main
`14ded337a10c140d7a9f9a9238ec038587d925bb`, original camera head
`84398a79e18673f3e371a405931bc464e1cca99a`, and original canonical head `c591b540` as ancestors.
Only the two files below differ outside documentation/ownership records from prior source `e74ddd26`.
Their blobs match the reviewed worker product, final local commit and fetched published commit exactly.

| File | SHA-256 |
|---|---|
| `packages/invoice-schema/src/json.ts` | `948ea28f70bff55601d292a73c97b6d92d0ca8b5ba0ec457ca75254a150861c8` |
| `packages/invoice-schema/src/json.test.ts` | `d7b6ee94c624d621db0fa62b4a3eba729e51dad2a9c67055364a4e76deec4778` |

The guard checks that array own keys are exactly `0..length-1` followed by intrinsic `length`, then preserves
existing recursive canonicalization. The ordered-key comparison matters: a missing index plus an extra own key
can satisfy the count check while still being invalid. The added regression exercises that case, and dense empty,
nested and frozen controls retain their exact bytes. The original upstream executable guard remains unchanged;
its only source-text correction is a real newline replacing a literal backslash-n in JSDoc.

This is a sparse/decorated **inert-array** correction. Accessors, proxies, custom inherited map/species behavior,
cycles and unbounded dense input remain pre-existing limits. The review does not claim arbitrary hostile-object
sanitization. Invoice signing validates schema first and receipt signing reconstructs normalized fields; no
signature bypass or key compromise was demonstrated by this work.

The implementing worker's [qualification](../canonical-array-20261119/QUALIFICATION.md) records the unchanged-config
upstream regression at **10 passed / 1 failed**, followed by **four files / 200 passed** across JSON, schema, signing
and receipt tests. The red Vitest result is one failing test whose fixture loop stops on its first failure; a separate
exact-source diagnostic is not relabeled as five failed Vitest cases. Entire-package typecheck, typed lint and production
build exited **0** on Node 22.23.4. These are author executions reviewed through their source-pinned logs, not independent
reviewer executions. Full package coverage and unchanged **95/90/95/95** thresholds were not run or qualified.

The coordinator separately rebuilt final invoice source at `3ab1c3f7`. Its first command used Node 24.22.3 after
the old Node 22 cache path disappeared; [QUALIFICATION.json](QUALIFICATION.json) preserves that runtime identity.
A distinct direct-executable Node **22.23.4** production build then exited **0**, with original `tsconfig.build.json`.
This does not supply final web consumer, browser or coverage qualification.

## Independent merchant-clock integration review

**Result: no introduced source blocker in the bounded clock-value correction.** The primary semantic/source
review is `privacy_completion`'s [final-merchant-source-review.json](final-merchant-source-review.json).
The implementing worker is `branch_recon`; its [qualification](../merchant-clock-20261119/QUALIFICATION.md)
and exact commands/log hashes remain author-attributed. `recovery_completion` read those records and independently
verified final local/published tree identity and original main/#258/#265/#268 ancestry. Neither reviewer reran
the implementing worker's test, typecheck, lint or build commands.

| Pin | Exact value |
|---|---|
| Original PR #268 | `ddfc8cfafa44b09103ced821f160c1d37fdfe552` |
| Reviewed product | `c4a6e5eab6f2ae4ae644433e557676cfb223c5a8` |
| Worker evidence successor | `2afa8ffe22bebfd448b749fd60e0f96d96c9f14f` |
| Final local source | `9b8e502498388405d5f03da170e7c51574bc06a6` |
| Fetched published source | `155d009160a6e5b2c24a91705c72fc8cca6ce815` |
| Shared final tree | `e585d1dec43844bd18167f213c246994ea6c4397` |

Only `packages/invoice-schema/src/merchantProfile.ts` and its test change outside documentation/ownership
records from `3ab1c3f7`. Both blobs exactly match the reviewed product and upstream PR. Runtime SHA-256 is
`7253a236747cc04abf5d04f5b9152fca90f7075b1857d4416dff390b53c4ce1a`; test SHA-256 is
`a4e379d2f71ace6da597170c74ef95ea31c0be93c933668fc7e8635820ffb005`. The source review verifies retained
registry bytes and unchanged canonical-array code, application tree, dependency/configuration files, contract
trees and deployment data.

The guard rejects nonfinite, negative and runtime nonnumber `nowSec` values through the existing `format`
result before parsing or signature work. Finite nonnegative values, including fractions, retain the existing
behavior and `exp <= nowSec` equality boundary. Signature domain, schema, canonical bytes and cryptographic
verification are unchanged. This validates the clock parameter's value; it does not establish that an otherwise
finite clock is accurate or trusted.

Author evidence uses a real signed profile. The original-config baseline ran **eight tests: seven passed and one
failed**, because `NaN` incorrectly accepted the valid signed profile. The loop is one failed Vitest case, not
five independently failed cases. The fixed five-file merchant/JSON/schema/sign/receipt selection passed
**208/208**, zero skipped, in **9.74 seconds**; entire-package typecheck, typed source lint and production build
also exited **0** on Node 22.23.4. The 208 overlaps the preceding canonical 200 selection and must not be added
to it. Full package coverage and unchanged **95/90/95/95** thresholds were not run or qualified.

No production exploit, remote clock control or signing bypass was established. The earlier interruption occurred
before claim/repair execution; the recovered environment then supported the actual integrated qualification above.
The coordinator subsequently rebuilt the final invoice package directly on Node 22 and obtained a fresh
**18-workspace / 254-output** JavaScript comparison before the final web checks recorded below.

## Independent source-bound security artifact review

**Result: all 11 Mythril findings remain open at the strict gate; PR #264's CodeQL high-alert applicability remains
unknown.** The completed [security review](security-artifact-review/REVIEW.md) and
[receipt](security-artifact-review/receipt.json) preserve exact identifiers, source/configuration hashes, source
locations, prior disposition records and connector limitations. This reviewer performed the artifact/hash/log review;
no analyzer, contract test, deployment, finding suppression or approval mechanism was executed or changed.

### Mythril #255

The native connector supplied exact artifact **14509646188**, run **44476066945**, head
`ea47fa75eabb0be2045081ffeb120fc2bfae67ab`. ZIP SHA-256
`f26634aa26eb718a808bb0cb755d30a29eaf3a2eb9eafa735de33f5b1c78e9e7` matches GitHub's digest.
The report is complete at **283,170 bytes**, SHA-256
`4f6cc97b9c17d6ac60510d8545e8af8d4e63a0f1bcb70067f6ae00af62b07736`. Independent checks verified
all **241** recorded input hashes against exact Git blobs, the canonical inventory and configuration hashes,
and all **15** per-target stdout/stderr/completeness hashes. Ten reported source snippets match their reported
lines; the generated/modelled fallback record supplies no filename or line and is left without an invented location.

The source-bound artifact records **eight Low and three Medium findings**, with strict runner exit **1**. Mythril
0.24.8, selected solc 0.8.28, optimizer 200, Cancun, depth three, default modules and 900 seconds per target are
recorded in the manifest. All five completeness records report no observed timeout/exception/error. That is bounded
execution evidence, not exhaustive path coverage or a clean security verdict.

At frozen candidate `e74ddd26`, **all ten project Solidity files, all 226 vendored Solidity files and Foundry configuration
are identical**. Only the contract-analysis workflow, runner and compatibility launcher differ; the new evidence-capture
script is absent. This reviewer also checked that those contract/vendor/Foundry inputs remain unchanged between
`e74ddd26` and final `3ab1c3f7`. The artifact therefore concerns unchanged contract inputs, but is not a native analyzer
execution using the final candidate's tooling.

The later merchant audit independently confirms that the entire contract/deployment trees remain unchanged at
`9b8e5024`. It does not alter the artifact's original source pin, analyzer-tooling differences or gate outcome.

Existing expiry and factory documents contain previously authored and independently reviewed assessments of
corresponding historical records. They expressly retain the red strict gate and do not activate exceptions. Those
prior assessments are preserved and attributed; this review neither adopts a dismissal nor accepts their residual
conditions on behalf of an owner. **All 11 findings remain open; no finding disposition is activated.**

### CodeQL #264

The successful JavaScript/TypeScript, Actions and Python job logs for run **44487024101** each show checkout of
`bf510471283cb0aa9cf6ff79e640e0b50a0b5d0a` and completed SARIF upload. Their CLI/action/query-pack versions are
recorded. The separate aggregate check **135456052088** reports one **High** alert, as preserved in the coordinator's
exact-head PR snapshot. Successful analysis execution does not clear that finding check.

The native first-page artifact wrapper returned an empty artifacts array. The connector rejected the annotations
endpoint with HTTP **400 / INVALID_ARGUMENT** because that endpoint is outside its allowlist. No endpoint variants,
alternate credentials or access-control workaround were used. The available logs list evaluated queries but expose
no confirmed alert rule, location or dataflow; query execution is not evidence that a particular query produced the
alert. **Whether the high alert is fixed or novel in the candidate remains unknown.** Other repaired build findings
do not answer that question.

All ZIP members were read as data, never executed. A temporary workspace outage prevented the first local hash-check
process from starting; saved evidence survived and the checks completed after recovery. Signed download URLs and
reusable-file references are omitted from the committed-ready packet. Its receipt inventories **30 evidence files**
and has SHA-256 `db3ed95e2dd3e9a10c6f68ae81d1768456a034b1405e42b2a81b736f5a9cff69`.

## Independent lint-driver runtime-path refresh review

After the environment reset, the coordinator restored exact Node 22.23.4 under
`/workspace/scratch/13855ecc035c/runtime-npm-cache/_npx/361c55be1121897e/node_modules/node/bin/node`.
The privacy worker changed only the temporary driver's `NODE` executable-path constant. This reviewer verified
that reversing that single substitution in current driver SHA-256
`fb2ba508ef706d7815897684d5a9813753449f930f995784602b1f612d28f724` reproduces the previously reviewed
`c895b0c9e3cdb5ce82260b5113383a7789953317bedb935cb5c9cac48df53c67` exactly. No other driver byte changed.
This was a read-only source comparison; it is neither driver execution nor lint qualification. The final manifest
and all 497 selected files still require complete source-bound execution receipts before an aggregate lint pass.

### Subsequent partition trial: blocked, with no retry

The coordinator executed one representative 24-file partition at source `3ab1c3f7`. It ended child **−9 / SIGKILL**,
shell **137**, driver **2**, after **185.333 seconds**, peak RSS **404,932 KiB**. No `eslint.json` was produced:
**zero files have verifiable lint results**, error/warning totals are unknown, and **20 partitions were not executed**.
The cause of SIGKILL is unknown; this is neither an established out-of-memory diagnosis nor an identified lint/source
defect. No further partition or retry ran. The original monolithic exit-137 attempt remains a separate failed execution.

`privacy_completion` independently verified the trial's input identity and retained artifacts without executing lint;
see [the archived review](evidence/web-lint-partitions-3ab/INDEPENDENT_REVIEW.json), SHA-256
`256b531fb958b7199dd9bce1766209cfc475670e5928d408c56cf48edb26004c`. The full historical directory remains
unchanged after the merchant integration. Refreshed `9b8e5024` discovery selects the same **497 files**, bytes and
configurations, but that metadata operation supplies no lint result.

## Final serial harness and execution-receipt review

**Orchestration review:** `recovery_completion` reviewed the temporary final-check harness without executing it.
The corrected pre-integration source was SHA-256
`cfbbe813045678681b1c63425769743717a96ea1637288dd4dce57fa415f769f`. The five requested corrections are present:
local/published tree checks and tracked/untracked guards, post-source validation before receipt publication,
exclusive output creation, pre/post artifact binding, and explicit Vite/postbuild scope with a matching successful
typecheck required for a successful build phase. Original TypeScript project, no-coverage selector, Vite, CSP and
scanner commands remain unchanged. The actual child exit is retained even if source validation blocks qualification.

After integration, exactly three single-occurrence literals changed: local source to `9b8e5024`, published source
to `155d0091`, and output directory to `final-source-checks-9b8e5024`. The resulting **7,164-byte** driver SHA-256 is
`54365703eb0344750c3c3edf12cfe6a81718cbd16b8d254ef6879c3a779fbf6b`. Reversing those three substitutions
reproduces the previously reviewed hash exactly. Read-only Git checks independently confirmed shared tree
`e585d1de` and original main/#258/#265/#268 ancestry in both final commits. The explicit review is
[final-source-checks-harness-review.json](evidence/final-source-checks-harness-review.json), SHA-256
`3fc71d44cad184ec1ff7d36ebc60b0444a2fa68b5110f34a031426e72aa55e9a`.

**Coordinator execution and independent receipt review:** the final phases have now completed, separately from
that source-only harness review. `recovery_completion` read all ten command receipts and verified their log byte
counts and SHA-256 values; each records exit **0**, `qualification: PASSED`, correct source/published pins and
`post_source_validation_error: null`. `privacy_completion` independently verified all **24** retained files, the
artifact manifests, source identity and summary counts. Neither reviewer reran those commands.

| Actual coordinator execution at `9b8e5024` | Recorded outcome |
|---|---|
| Original web `tsconfig.json --noEmit`, direct Node 22.23.4, 1536 MiB heap | Exit 0; **109.097 s** wrapper time. |
| Original separate `vitest.nocov.config.ts`, one worker, 768/32 MiB settings | **4 files / 4 tests passed**; **88.69 s** Vitest / **89.689 s** wrapper. |
| Full Vite build, original CSP application, original AST/artifact scanner | Three exit-0 commands; **19-file** artifact manifest, matching typecheck prerequisite qualified. |
| Lean Vite build, original CSP application, original AST/artifact scanner | Three exit-0 commands; **17-file** manifest, matching typecheck prerequisite qualified. |
| Lean boundary validation | Exit 0; **six chunks, one worker, zero problems**. |
| Original complete hosting-kit command against actual full web dist | **299 total / 286 passed / 0 failed / 13 skipped**; **10.072 s** test / **10.333 s** wrapper. |

Logs, receipts, the exact driver, full/lean manifests and lean module report are retained in
`evidence/final-source-checks-9b8e5024/`. The build uses the default broad-connect policy; warnings remain in the
logs. It is local artifact qualification, not production endpoint-policy or release approval. Native/opt-in skips,
including the four locally unavailable nginx cases, remain skips. These counts are not added to the historical
author hosting run or to a separate hosted run.

The preceding [final-build-input-review.json](final-build-input-review.json), SHA-256
`3701ecdc76e25071c3f967336265be65c74c4cfec88ee9072a828521bf6d695a`, records `branch_recon`'s fresh comparison
at `9b8e5024`: **18 workspaces, 254 of 254 JS outputs matching**, no missing/extra paths, emit diagnostics or
changing inputs, and equality also without per-line trailing-whitespace normalization. This is an in-memory
transpilation/output comparison, not a typecheck, runtime test or declaration/source-map qualification. The earlier
`e76451ad` comparator remains unchanged and separately identified.

## Qualification limits and outstanding gates

### Focused #267 hosted acceptance, separately attributed

`branch_recon` independently retrieved and reviewed [Hosting kit run 44497615337](https://github.com/djshellshoxxx/GhostPay/actions/runs/44497615337).
Its [receipt](hosted-hosting-review/receipt.json), SHA-256
`47b2d991298afd594effe59a5ea802673b5e6db350a589cd11b5af153d8c0da3`, preserves native GitHub metadata,
the workflow and two losslessly compressed raw job logs. `recovery_completion` additionally read the receipt,
verified all four retained artifact hashes and both decompressed hashes/lengths, and confirmed that the tested
broad candidate's kit tree equals the receipt's `3295a7030121f51b1286ffc96b3a6480aa319aa7`. Neither reviewer
executed nginx, Docker, Chromium, a build or tests for this review.

Native Git Data binds synthetic merge `d97980dd98aa4ba0cb21dccdccf58f5949c63371`, with parents main `14ded337`
and focused head `c3a693e87053fbe91219f8edfe159a5ec0a37a34`, to the head's exact entire tree
`7cfbb2835be8a3c58ccd5dd549fbb2ecabcccfac`. The source-identical kit is reusable evidence; the focused
application differs from the broad `9b8e5024` application.

| Hosted execution | Actual result |
|---|---|
| Kit job `135468723862` | **302 tests / 296 passed / 0 failed / 6 skipped**, three suites. |
| Native nginx and Docker | Configuration validation, root/subpath differential and normative matrices, real container HTTP requests and runtime-hardening checks passed. |
| Timestamp regression controls | All six boundary/epoch/pre-epoch cases under root and subpath passed. The `.9996` font fixture remained in the differential validator/body matrix. |
| Kit lint/typecheck and demo workflow | Passed; the kit has no separate build script. |
| Sibling web job `135468724333` | Original web typecheck/Vite build, **19-file** bundle scan, validation, packaging and internal-consistency verification passed. Its broad library-build step was cache-skipped. |
| Sibling Chromium CSP smoke | **1 passed / 0 failed / 0 skipped**, ordinary headless Chromium, focused app/demo root/subpath/deep-link rendering. |

The kit's six skips remain: unavailable no-network i2pd execution, Java I2P runtime, opt-in Chromium in that kit job,
unbuilt net-transport comparison, absent real web dist in that kit job, and root-required user-switch validation.
The sibling web/Chromium job is separate evidence and does not erase those skips. No Tor Browser, live I2P,
wallet, broad-app browser acceptance or independent publisher authenticity is established.

This result is distinct from the coordinator's local **286/13/299** run and the author's older **285/14/299** run.
The 10:50:56 UTC PR snapshot contained eight successful and twenty queued checks; the hosting workflow's success
does not establish whole-PR success. Main advanced later through a separate merge, so remaining checks and
current-base compatibility still require review before focused PR promotion.

### Subsequent main ancestry reconciliation

The coordinator reports that a concurrent coordinator merged original #257 head
`4f14d6f167c788f5ae2d019bc8482027495f3c6c` to main at 10:52:59 UTC, following 36 successful checks,
three skips and Snyk success. This reviewer independently inspected the resulting Git objects: main
`8f56376427c96881f49590920ff0bf8543ec81b4`, tree `21ae3aa7b070aa8921d4360debb15add03d5c194`, retains
parents `14ded337` and original `4f14d6f1`.

The normal local reconciliation `3ce8cad3b0f793733a98b73007d2afdea97b9aa6` retains tested `9b8e5024`
and updated main `8f563764` as parents. Independent comparison found **zero changed paths** and the exact same
entire tree `e585d1dec43844bd18167f213c246994ea6c4397`. All final command receipts remain bound to
`9b8e5024` / `155d0091`; no execution was repeated or relabeled. The external #257 promotion is distinct from
this task's historical-document merges and does not promote the broader unmerged feature set. The coordinator
published reconciliation `c7e09bc7cdb52e9172fa80fc2db83251fad6cd1a`, fetched it back and verified identical tree
and updated main ancestry; [main-257-promotion-review.json](main-257-promotion-review.json) preserves that evidence.
`privacy_completion` independently verified both reconciliation trees against both tested trees, zero-file diffs,
updated main ancestry and native merged-PR metadata in [final-main-reconciliation-review.json](final-main-reconciliation-review.json),
SHA-256 `63184976dcc72eab17ff24a693dfbff52a2b16964110179158be122f81084dba`.

This report distinguishes source review, author execution, coordinator execution and independent receipt checking.
The final `9b8e5024` typecheck, separate no-coverage selection and full/lean build receipts qualify their recorded
scopes. They do not establish full web coverage, typed web lint, browser acceptance or the remaining native/hosted
contract and security matrix. Resource-killed coverage and lint attempts remain incomplete. Strict Mythril's eleven
findings remain open, CodeQL #264 applicability remains unknown, and pending dependency owner review remains pending.
No security gate, threshold, detector or approval requirement is relaxed by this report.

The coordinator records exact command outcomes and remaining blockers in [QUALIFICATION.json](QUALIFICATION.json).
No production readiness, mainnet, deployment or release approval is inferred.
