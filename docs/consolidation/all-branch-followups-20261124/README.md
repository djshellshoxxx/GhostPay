# GhostPay: selected branch recoveries and final comparison overlay

## Result and exact source

This composition preserves the useful, independently reviewed work found after the core branch consolidation. It adds the compatible QR, print, offline-profile and individual-payment-key export units, plus narrowly recovered correctness and cleanup fixes. It retains current validation, session, archive and build behavior while keeping unfinished or failing feature stacks separate.

**Core PR [#611](https://github.com/djshellshoxxx/GhostPay/pull/611) is merged.** Main advanced from `706188000c38b3dde5a3a362370a530870aa7587` to `cc090bf80bbf35c1db81ecbe6acae694a518bed0` at 2026-11-24 12:57:38 UTC (4:57 a.m. Pacific). Its tree exactly matches the tested `87bee078...` candidate. All 37 check runs passed, the three release/deployment-only PR skips were expected, and Snyk passed. Both merge parents were verified and integration lease generation 18 was released. [CORE_PROMOTION.json](CORE_PROMOTION.json) records the exact result.

This report records the source and local qualification at publication. It does **not** assert that this follow-up has merged or that its new hosted checks have passed. The pull request for [the candidate branch](https://github.com/djshellshoxxx/GhostPay/tree/integration/all-branch-followups-20261124) records subsequent exact-head hosted results and promotion. Promotion requires those checks, a fresh main comparison and the cooperative integration lease.

| Identity | Exact value |
| --- | --- |
| Original main comparison baseline | `706188000c38b3dde5a3a362370a530870aa7587` |
| Published core candidate | `87bee07895679deaef345c3dd4aaf2e8f8651f1c` |
| Current main after core promotion | `cc090bf80bbf35c1db81ecbe6acae694a518bed0` |
| Qualified application composition | `bda2af071d4b9d3c85bbe4a20da2f8edb5eabcf8` |
| Final extended local source | `70df75359a807bf833da82f43229452d6ab59976` |
| Equivalent published source commit | `0a7b903780b66135a9505230c96d4ab45b2959a2` |
| Exact shared extended source tree | `d006864ec291386d17ddab0bd4fd4ac1bb08c1a8` |
| Final dependency lockfile SHA-256 | `beadafcce959f301fb812ae96e62ffc8f07440a9f0d8cbaaa9e8b05d36f59660` |

The Git object API created the equivalent source because Git transport lacks push credentials. Every newly created blob, the complete tree and all remote parents were verified. The application source `c6efee6e...` retains core history and the original #581, #605, #608, #563 and #572 heads. The compatibility source `851e86ce...` has current main, that application source, original #377 and original #578 as its four parents. The final source is its child and adds the exact qualified deployment-helper subset and evidence; #570/#619 are not whole merge parents. The two standalone tooling units retain exact selected files; their broader historical heads are not merge parents. Selective hunks from broad historical donors do not make those entire donor branches ancestors. The final report commit adds documentation and evidence only.

## Every-branch comparison

[The core report](../all-branches-20261124/README.md) preserves the original uncapped 695-ref comparison and its 696-ref refresh. This directory preserves the **698-ref** frozen observation and supplies the subsequent **699-ref** current-main index and incremental evidence, including exact heads, all merge bases, raw changed entries, file modes and blob identities for moved or newly observed refs. The latest observation and accounting are in [BRANCH_INDEX.csv](BRANCH_INDEX.csv) and [BRANCH_ACCOUNTING.json](BRANCH_ACCOUNTING.json).

The later changes were inspected individually:

- **#617:** all thirteen non-documentation changes relative to #616 exactly match the core candidate. The follow-up preserves eleven of those blobs and strengthens the other two with the literal-true printed-link policy. Its qualification evidence is valuable; there is no omitted unique runtime delta to recover from the whole head.
- **#618:** two IndexedDB rejection-fixture expressions were corrected, with the original causes retained. They belong to the still-dependent #579 dashboard stack. They add no independent runtime behavior to this composition.
- **#619:** recover only the qualified three-file deployment-helper/test correction from #570/#619. Its retained utility has no current production callers; the broad privacy/export work remains held.
- **Moved #493:** retain the confirmed confidential-amounts setup build failure caused by incompatible nested/root Viem types. Its 68 manifest/lock changes are not eligible as a wholesale dependency update.
- **Ledger advances:** complete uncapped comparisons show documentation/evidence changes only. Their source-pinned observations are retained without importing unrelated runtime history.
- **The coordinator's core branch:** its moved head is the selected, published core source rather than an independent missing feature.

The final inventory cutoff is **2026-11-24 13:14:56.599080 UTC (5:14 a.m. Pacific)**: **699 branch refs and 693 distinct heads**. Main at `cc090bf8...` contains 351 of those refs (347 distinct heads, including main); the final published source contains 367 refs (362 distinct heads). Local and remote equivalent trees have different ancestry because the remote publication explicitly joins current main and approved original donor history. The final follow-up branch did not yet exist at this observation and is recorded separately by its subsequent publication.

The complete structural comparison against the post-core main is:

| Structural result against `cc090bf8...` | Branch rows |
| --- | ---: |
| Already ancestors of main | 350 |
| Main itself | 1 |
| Documentation/evidence changes only | 86 |
| Changed code postimages equivalent | 5 |
| No net delta | 1 |
| Code differences requiring row-specific semantic disposition | 255 |
| Unrelated generated-site history | 1 |
| **Total** | **699** |

These are mechanical relationship categories. The semantic overlay separately identifies selected units, partial recoveries, superseded code and concrete holds. The complete uncapped structural record covers 17,538,540 original bytes and is retained losslessly compressed.

Ancestry, exact changed-file equality and semantic supersession remain distinct. Branch counts include aliases and integration histories and are not feature counts. The earlier 698-ref observation remains immutable under `evidence/frozen-698/`; its counts apply to its earlier main and application-source pins. Each current row records its comparison baseline and disposition. Selective recovery does not assert that every historical aggregate is complete.

## Valuable unique behavior selected

| Original work | Retained behavior and scope |
| --- | --- |
| #581 + #605 QR continuations | One canonical ESM decoder, responsive SVG rendering, native-to-software fallback behavior, bounded neighboring-dimension retries, the shared version-23 correction, original dense-image/interoperability tests and complete license/provenance assertions |
| #608, including #532/#548 | Receipt/bill print-target lifecycle, selected-document isolation, pagination and light print margins; current archive generation and in-flight ownership guards remain |
| #563 bounded F08 viewer | Local signed public-profile review, full-key comparison, replacement/expiry handling and offline operation; default off, opt-in full only, excluded from the lean production entry |
| #572 individual payment-key export | Credential reauthentication tied to the loaded key set and selected payment, encrypted-file generation and byte-exact saved-file verification, explicit individual raw-key export, bounded portable codec and standalone recovery tooling |
| #410 policy subset | Only literal boolean `true` suppresses the printed bearer-link warning; existing input and QR-kind guards remain |
| #341 ledger subset | Destination-ledger support for enabled EVM testnets, using the existing chain lookup; no new browser caller or default activation is asserted |
| #220 ledger subset | A positive invoice requires a positive counted payment before tolerance can mark it paid; zero-due, expiry and overpayment behavior remains |
| Portable keystore cleanup | Owned normalized passphrase bytes and derived temporary bytes are cleared on success and rejection without changing KDF, cipher, normalization or format; immutable caller strings are not claimed erased |
| PIR normalization subset | A linear terminal-separator scan preserves configured path bytes, endpoint construction and existing transport constraints; unrelated donor settings and timing/stress cases are excluded |
| IndexedDB harness repair | The existing browser harness supplies the current `invalidateFrom` arguments and checks exact stored height while preserving cross-tab invalidation |
| React root diagnostics + Pages smoke | Fixed public error-class labels, preserved smoke failure detection, and the original nine-view navigation/fixture walk; no error message, name or stack content is copied |
| Release fixture-key boundary | Known public fixture keys are refused for release provenance, with the existing deliberate development-fixture contract preserved through the sanitized build environment |
| #377 scoped development dependency repair | Pin only Sentry 5.30.0's cookie dependency to 0.7.2; preserve all 814 unrelated lock records and add one ordinary parser/middleware compatibility case |
| #358 exact-object comparator | Standalone read-only comparison of complete canonical snapshots, preserving modes, deletions, ancestry and raw claims; current live inventory still requires a complete schema/provenance adapter |
| #468 offline evidence formatter | Preserve original five-report bounded summary and tests, with explicit limits on positional target labels and the legacy zero-reported-issues verdict; no analyzer execution or new workflow activation |
| #578 HTTPS/RPC compatibility | Original owned loopback-TLS browser case for secure context, offline invoice review, saved Tor preference and selected-chain RPC health; no Tor routing or live-provider certification |
| #570/#619 deployment-helper subset | Fixed public reasons in the retained deployment utility, preserving verified/no-RPC/secondary/status behavior and strengthening its original tests; no new production caller or live-screen coverage claim |

The export unit does not replace seller master-backup authorization or introduce the broader #573/#596 recovery interface. Its operation owns current session revision, key/payment/chain identity and verified RPC route around asynchronous work. A deliberate stopped scan retains its already verified client for manual export. Decrypted/derived temporary buffers have cleanup paths. No network calls were added to the standalone decoder.

The F08 unit remains public-file review only. It cannot change a pin, authorize a payment or establish domain ownership or revocation status. Critical message classification and the existing English fallback remain intact. All four locale catalogs retain every previous value and metadata field, with fourteen F08 messages and 86 export messages added per catalog.

## Conflict resolution and preservation

The print and F08 composition conflicted only in `ACTIVE_WORK.md`. Both parents' ordered nonblank records and their multiplicities were retained. The subsequent #572 merge was conflict-free; the final overlapping files were independently checked rather than assumed safe from the merge result.

- All 29 nonshared entries in the print/F08 merge and all 45 nonshared entries in the export merge retain their approved parent blobs and modes. No unrelated changed path was introduced.
- Both complete security-key insertion blocks occur once. Removing either restores the opposite approved parent's entire file.
- Each of the four catalogs contains 2,372 messages: 2,272 existing values, fourteen F08 additions and 86 export additions. The additions are disjoint and duplicate JSON keys are absent.
- At the qualified `bda2af...` application stage, all 933 pre-export files matching the explicitly recorded JavaScript/TypeScript test/spec naming rule were byte-identical. The author separately verified its broader 973-file preexisting test/spec inventory. These use different inventories and are not presented as the same count.
- At the qualified application stage, all 74 manifests and the lockfile were unchanged. The final extension changes only the root scoped override and one of 815 lock records; all 73 workspace manifests, 814 other lock records and top-level lock metadata remain exact. The five old dependency-tooling cases remain an unchanged prefix, with one additional case. Existing seller pairing, app lock, portable keystore cleanup, Scan Tags and approved receipt/print entries remain.
- The new export panel is outside the selected receipt print target. Current print isolation excludes the surrounding interface.

The final census also recovered the three-file deployment-helper correction independently of the held #570 privacy/export stack. Current production screens use a separate manifest-readback path, so this source repair does not activate a new caller or certify all live diagnostic paths. Its exact source review and focused qualification are recorded separately.

The QR conflict selected one ESM distribution while combining both factory corrections. Existing provenance tests still reconstruct the complete source and verify the embedded and separate original license; no checksum-only substitute or reduced assertion was introduced.

The three subsequent compatibility merges conflicted only in the ownership registry. Both parents' ordered records and multiplicities were preserved, and every nonshared approved mode/blob was checked before each commit. The compatibility-stage independent review at `7852931f...` verifies application/package implementation and workflows remain identical to the qualified application stage, with only the explicit cookie dependency/test exception and added standalone tools/browser spec. The later diagnostic-helper unit changes its three named source/test files only; the final review records that additional exception and preserves the remaining entries.

The source reviews and preservation receipts record exact source pins and file-level evidence. Review is distinct from native acceptance.

## Local qualification

The completed application composition at `bda2af071d4b9d3c85bbe4a20da2f8edb5eabcf8` passed **3,049 web tests**: 3,046 coverage cases plus three separate no-coverage cases. Thirteen existing cases were skipped. Original coverage thresholds all passed: **92.99% statements, 89.38% branches, 94.53% functions and 96.79% lines**.

Web typecheck and lint passed. Standard full, opt-in full and lean-with-flag builds/scans passed (19/19/17 files). **173 distinct Pages/workflow/build-profile Node cases** passed without skips. Internationalization checks reported no errors or missing English keys. All 114 action pins, the secrets guard and the `tx.origin` guard passed. A clean-tree release Pages build passed and all sixteen artifact hashes were verified; it explicitly remained a no-manifest demo with payments disabled.

Those executions keep their application-stage source pin. The later extension adds separately qualified dependency/tool/browser coverage and the bounded retained-helper correction; fresh hosted checks qualify the complete extended tree. Its original full-web result is not relabeled as a run of the later helper change.

The five affected package suites account for **917 distinct passing tests**: QR 270, hygiene 175, merchant ledger 36, current vault 375 and PIR 61. Earlier 310-case vault results are superseded by the current 375-case suite rather than added again. The qualification receipt records exact package/dependency identity between those tested sources and the `bda2af...` application composition. The later development-cookie override is an explicit separately qualified change; no unchanged whole-lockfile claim is made for the extended source. F08's 744-case invoice-schema run remains separately source-pinned and is not added again to the core suite total.

Earlier focused source runs, including QR, print, F08, export and release-boundary cases, remain in the evidence with their actual source commits. They are not added to the final full-web total. The previous broad follow-up run at `74e51b7...` passed 2,991 web tests with thirteen existing skips; it predates print/F08/export and is retained as historical progression, not mislabeled final-source coverage.

Initial outcomes are preserved: the F08 all-green fixture initially lacked its three new required check names; only those names were appended before the unchanged assertions passed. A React/Pages lint attempt exceeded its initial heap limit; the same command passed with a 2 GiB heap. The known fixture-key release refusal is an expected acceptance outcome, while the deliberately flagged development fixture and normal no-manifest Pages builds passed.

Local Chromium could not start under the environment's Unix-socket restriction. The required individual-export native spending attempt found neither Anvil nor Cast and stopped before executing its spending cases. These are recorded environment/prerequisite outcomes, not passed application tests. No bypass or fabricated native success is included.

### Additional compatibility qualification

The scoped cookie repair used an isolated, exact-lock **workspace-only installation of 334 packages**, with scripts disabled. All installed versions, archive URLs and integrity records were checked. Actual root, Sentry and `@sentry/utils` resolution reached cookie 0.7.2 while Hardhat still used Sentry 5.30.0. All six dependency-tooling cases and thirty router cases passed, contract typecheck passed, and native solc 0.8.28 compiled 36 Solidity files for Cancun. This was not a full-repository install. Production lock audit had zero findings; the full audit retained fifteen low Elliptic-derived findings and exit 1. Earlier linked-layout diagnostics remain preserved and are not represented as clean installation results.

The read-only tooling units passed **37 distinct combined Node cases**: thirteen comparator cases, five summary cases and nineteen existing offline runner cases. The separate canonical run repeats the same thirteen and is not added again. Original source/test files, runner gates and command behavior remain exact. The comparator deliberately rejects the current refresh schema without a complete provenance adapter. The formatter's positional labels do not authenticate contract identity; zero reported issues does not establish successful analysis or finding clearance.

The HTTPS/RPC unit passed full web typecheck/lint and seventy existing focused cases. Full and lean browser collection each found the new case; no local native execution is claimed. The original source and historically passing native logs remain pinned separately. Fresh execution on the combined full/lean head is required.

The final deployment-helper subset passed **45 existing focused cases across four files**, with zero failures/skips, plus full web typecheck and typed lint at `e65214c2...`. Its three selected file modes/blobs remain exact in the final composition. Those web checks reused an installation containing cookie 0.4.2; they do not qualify the cookie override or establish whole-lock equality. The separate private-cookie qualification remains in force, and the final hosted install/tests cover the combined candidate.

See [COMPATIBILITY_QUALIFICATION.md](COMPATIBILITY_QUALIFICATION.md) and its structured receipt for exact commands, sources, complete raw logs and independent reviews.

## Required hosted acceptance

All existing checks remain required. Additions make recovered native obligations executable on the final head:

| Gate | Required behavior |
| --- | --- |
| Full-profile ordinary E2E | Run the repaired cross-tab IndexedDB harness after the existing browser suite, using managed Chromium |
| Pages build | Run the original smoke against the already-built local Pages artifact, preserving output identity and propagating native failures |
| `ghostid-native (default-full)` | Default full excludes the picker |
| `ghostid-native (opt-in-full)` | Opt-in full reviews files offline and preserves the independent stored pin |
| `ghostid-native (lean-with-flag)` | Lean excludes the picker even with the flag set |
| Existing `rest-0` tests | Preserve the original Node invocation and additionally run recovery tests with `REQUIRE_ANVIL=1` |
| Existing full/lean browser suites | Discover and execute recovered print, individual-export and HTTPS/RPC scenarios |
| Fresh dependency install and existing contract/tooling gates | Resolve the exact scoped cookie override and execute the new ordinary compatibility case without changing the existing tests |

Each F08 matrix leg owns a separate runner/build. Its report gate requires the correct actual pass and one intended skip; all-skipped, wrong-project, flaky, retried or runner-error outcomes fail. The cloud integration allowlist retains its original five checks and adds the three F08 names. Existing gate assertions remain intact. Removing only the two new CI units restores the previous ordinary CI workflow byte-for-byte.

Final hosted ordinary, CodeQL/Snyk, chain, browser and native recovery results must be checked against the exact published head before merging. Donor green runs and historical PDF/native results are not substitutes.

## Work retained outside this composition

[RESIDUAL_OVERLAY.md](RESIDUAL_OVERLAY.md) corrects the original 67-row eligibility audit while preserving it as a historical observation. Selected subsets do not imply that their broad parents are complete.

The responsive/palette #583 continuation remains held for concrete observed failures: a JavaScript zoom fixture outside the typed lint project, five viewport asset-response assertions per profile, and serious forced-colors contrast failures. A 304-cache explanation for the asset results is only an inference because response statuses were not retained. The exact donor logs/artifact and the scoped recovery plan are recorded in its handoff; no accessibility rule or asset assertion was weakened.

The updated Dependabot #493 train also remains held for an observed setup failure: the confidential-amounts build reports TS2322 because nested Viem 2.58.4 and root Viem 2.57.13 expose incompatible types. The current census includes the exact head, workflow/job evidence and uncapped delta; a dependency update is not treated as eligible merely because it is newer.

Other retained stacks have specific unresolved contracts or acceptance gaps: competing BTC spentness/worker lifecycles; action-scoped network authority and private-checkpoint migration; wallet/clipboard cancellation; interrupted-payment/draft identity; dashboard evidence providers; seller master recovery; durable recurring execution; chain-format capability transitions; and deployment/compiler-bound tooling. The deeper mixed-scope review distinguishes already integrated signer/policy guards from these remaining feature obligations. Default-off viewer and individual export selection do not imply completion of those broader systems.

Original branches remain available. No branch deletion, force push, manual deployment or live-funds operation is part of this integration.

## Evidence index

- [SOURCE.json](SOURCE.json): local/remote tree identity, parents and publication method.
- [SOURCE_REVIEW.md](SOURCE_REVIEW.md): independent final extended composition verdict; [COMPATIBILITY_SOURCE_REVIEW.md](COMPATIBILITY_SOURCE_REVIEW.md) and [APPLICATION_SOURCE_REVIEW.md](APPLICATION_SOURCE_REVIEW.md) preserve the earlier compatibility and application interaction reviews.
- [QUALIFICATION.json](QUALIFICATION.json): actual commands, sources, equivalent package entries, outcomes and limitations.
- [BRANCH_INDEX.csv](BRANCH_INDEX.csv) and [BRANCH_ACCOUNTING.json](BRANCH_ACCOUNTING.json): all 699 refs observed at the final census cutoff and distinct ancestry/semantic dispositions.
- [RESIDUAL_OVERLAY.md](RESIDUAL_OVERLAY.md): updated held/selected findings with historical limits retained.
- [evidence/MANIFEST.json](evidence/MANIFEST.json): per-file checksums for the complete report evidence. The unchanged [application archive manifest](evidence/application/MANIFEST.json), compatibility receipts and current/frozen branch evidence retain their individual source pins and lossless readback proofs.

Promotion rechecks main and the candidate head, confirms all required outcomes, acquires and verifies the integration lease, uses a normal ancestry-preserving merge, verifies the resulting main tree and parents, and releases the lease. A report or unprotected branch does not bypass pending or failed gates.
