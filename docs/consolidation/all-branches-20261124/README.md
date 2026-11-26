# GhostPay branch comparison and reviewed integration

## Result and source identity

The reviewed composition combines current main with the useful, independently
reviewed branch work described below. It preserves the original donor histories
and reconciles overlapping implementations and tests. **This record does not
claim a main merge.** Final hosted qualification and the integration lease remain
required before promotion. Later check and merge results belong in
[PR #611](https://github.com/djshellshoxxx/GhostPay/pull/611).

| Identity | Exact value |
|---|---|
| Baseline main | `706188000c38b3dde5a3a362370a530870aa7587` |
| Independently reviewed production source | `a107d993c1aed73827d853924ea36036f083400f` |
| Final local source, including two test reconciliations | `fb12a3302d9a85aa8777805bbdaab1bf2770ea16` |
| Equivalent published Git object | `7b4af29882ad2e7acefdcb83d5a949cd516d100f` |
| Exact source tree shared by both final source commits | `8086add0f3c77a80ae953e45d50b179244261248` |
| Dependency lockfile SHA-256 | `e025d878c55cc215315286fc2df277ce5c79116c1507bba79419c789669e0e4e` |

The Git object API was used because this checkout's Git transport has no push
credentials. The remotely created source tree was verified against the complete
local tree before any ref update. Its parents preserve the earlier PR611 history,
the #551 and #389 originals, #615/C1, #525, #531 and #567. Original source branches
are retained. The final report commit adds evidence only.

## Every-branch comparison

The full comparison is a frozen **695-ref** census, followed by an explicit
**696-ref** refresh. The symbolic `origin/HEAD` alias is excluded. The refresh
found one new implementation branch, #616, and a documentation-ledger update;
main and the published PR611 head were unchanged at that observation.

For every census ref, the evidence retains its exact head, all merge bases,
uncapped divergence counts and all merge-base-to-head changed paths, including
file modes and blob identities. Non-documentation changes are compared with
current main. Ancestry, identical changed files, semantic supersession and
unmerged successor coverage are recorded separately. A different file hash is
not treated as proof of useful new behavior.

| Mechanical result in the 695-ref census | Branches |
|---|---:|
| Exact head already ancestral to main | 206 |
| Changed code entries already identical to main | 7 |
| Documentation/evidence-only differences | 85 |
| Remaining code differences requiring disposition | 394 |
| No net delta | 1 |
| Unrelated deployment history | 1 |
| Main itself | 1 |
| **Total** | **695** |

The census is accompanied by 356 PR records: the earlier 355-record collection
plus the subsequently observed #615. It is not presented as a fresh enumeration
of every PR state at the later ref refresh. #616 is captured separately in the
refresh annex. All indexes are source-pinned observations, not promises that
other workers' branches will remain stationary.

The selected history retains **351 snapshot branch rows representing 347
distinct head SHAs** across the local composition and earlier published PR611
history. This includes main's existing history. Within code-different rows, 141
branch rows (140 distinct head SHAs) are in the local composition and 144 rows
(143 distinct head SHAs) are retained across that union,
including the earlier PR611 tip. Aliases and integration branches are included;
these are not independent feature counts.

The new #616 implementation is semantically covered. Of its 19 product/config/
test paths relative to #615, 18 exactly match this composition; the remaining
CryptoKey implementation differs only in a local variable name. Its corrected
JSON fixtures and generated package map also match. #616 contributes independent
qualification evidence, including native Chromium acceptance, but its whole head
is not claimed as merged into this composition.

This is complete structural accounting with specific semantic dispositions and
independent review of the selected source. It is **not** a claim that every
historical mixed-scope stack received a complete new semantic audit. Residual
obligations remain explicit in the per-branch index and eligibility annex.

## Valuable work retained

The source-pinned C1/#615 ledger remains in
[`../branch-comparison-20261124-68c82b9/`](../branch-comparison-20261124-68c82b9/).
It records the reviewed 93-PR C1 consolidation and its later repairs. This
composition preserves that work and the following additional or stronger paths.

| Source or family | Result retained |
|---|---|
| C1 #504 through #615 | Reviewed parser, validation, UI and package repairs, with original ancestry and evidence |
| #594 | Reject duplicate canonical locale identifiers while retaining distinct regional catalogs |
| #568 | Bound the rounded fiat output magnitude |
| #574 and #274 through #515 | Correct countdown boundaries, monotonic expiry and independent expiry regression coverage |
| #576, including #406/#411 | Preserve POS totals and state through clock errors, cancellation and late observations; retain example/reducer parity and browser tests |
| #522/#555 completion | Reject nonadjacent duplicate invoice IDs in ledger export |
| #268 | Validate injected merchant-profile clock values |
| #601 | Retain fee timing checks and complete payment-asset identity checks |
| #276/#277 | Add the separate local Pages artifact integrity verifier and its original tests |
| #289 | Require primitive strings for base64url input, with the qualified fixture correction |
| #505 | Preserve genuine anchor attributes in metadata hardening |
| #507 | Snapshot Solana references once and retain reference bounds |
| #593 and the TRON-network successor | Snapshot supplied TRON fields once and default the network only when absent |
| #509 | Validate native CryptoKey branding using the real getter |
| #511 and stronger C1 parser | Preserve the invalid fiat-view result for unreadable quote data, with the established parser diagnostic |
| #516 | Return typed reminder errors for unreadable data |
| #529, #536 and #538 | Preserve display-marker warnings, Japanese script-extension grouping and independent duplicate-warning groups |
| #557 | Preserve decimal round trips across the full uint256 range |
| Original QR primitive-kind head | Retain input-kind validation and its regression coverage |
| #551 | Follow browser language changes in automatic mode while retaining explicit preference and embedding precedence |
| #389 | Validate pasted fragments while preserving valid HTTP and HTTPS link compatibility |
| #301, #313 and #305 | Retain runtime amount-input contracts, decimal precision validation and canonical ERC20 simulation results |
| #525 | Preserve dense QR SVG matrix validation |
| #531 | Restore the documented deployment-validation command and its tests |
| #567 | Preserve the stronger canonical-array descriptor snapshot and its added assertions |
| Selective deployment-date recovery | Reject impossible calendar dates without importing the unrelated donor stack |
| Selective RPC recovery | Preserve bounded retry handling and explicit credential, referrer and cache policy |
| Selective refund reservation recovery | Keep submitted reservations from being lost; do not activate the unfinished refund execution lifecycle |

Original heads and selective recovery commits are recorded in the index, source
handoffs and full comparison evidence. Selective recovery is distinguished from
merging an entire donor branch.

## Conflict decisions and preservation

**Ownership registry.** Additive conflicts were resolved by a three-way union.
Both parents' nonblank lines and their multiplicities were verified after each
resolution. No donor ownership claim was discarded.

**Canonical arrays.** The two #567 source/test conflicts were reconciled against
C1's existing files. The stronger descriptor snapshot supersedes the earlier
array guard, while the plain-object branch is unchanged. Fourteen additional
cases were retained, with no old assertion removed. Two existing fixture
deletions now use `Reflect.deleteProperty`; they remove the same configurable
array element and preserve the same hole and length under the current lint rules.

**Pasted links.** The isolated #389 HTTPS-only check would have rejected valid
HTTP URLs already produced or accepted by the application/SDK deployment model.
The composed parser accepts HTTP(S), preserves whole-fragment and whitespace
validation, and retains positive compatibility assertions. The QR importer's
separate restrictions remain unchanged.

**Fiat diagnostic.** The stronger parser catches unreadable fields and returns
`bad-rate-format` with `quote fields could not be read`. The view forwards that
structured error. Two literals in the older #511 expectations were reconciled
with that established contract. Both whole-object assertions, all six failure
cases and all normal controls remain. The outer catch and every production byte
are unchanged by this test reconciliation.

**Existing main and donor functionality.** Independent review confirmed that the
recent main fixes and the stronger C1 validation guards survive the composition.
The seven linear repairs changed no dependencies, workflows or configuration.
Across `b3d6338ab0f7c4119678462a0c0c8584e87526e7` to the reviewed `a107d993`,
all 958 existing test/specification files retained their prior blobs and modes;
the new wallet compatibility file brings that count to 959. The only later test
edits are the two array
operations and two exact diagnostic literals described above.

**Historical evidence.** Raw inherited C1 logs retain their bytes, including
existing whitespace. Source changes and newly authored documentation pass their
applicable whitespace checks. A blanket clean diff is not claimed for inherited
raw evidence and existing Markdown hard breaks.

## Static-analysis repairs

C1's original CodeQL check `138228881370` reported seven polynomial-regex alerts
and failed. The public annotations are retained as evidence. Six operations trim
trailing zeros in fractional strings; one classifies wallet error messages.

All seven operations are replaced with equivalent linear processing. Fractional
scans stay within the fractional substring, preserve precision-zero handling,
signs and export trim mode, and introduce no floating-point arithmetic. The
wallet classifier preserves same-line matching across LF, CR, U+2028 and U+2029
boundaries, literal substring behavior and error-priority order. Twenty-four
ordinary compatibility cases cover that taxonomy.

The independent reviewer approved the final production composition and verified
that its precision, bigint, rounding and sparse-entry guards remain intact.
Existing input bounds inform the alert review; the alerts are not represented as
confirmed exploitation. There are no suppressions, alert dismissals, dependency
changes or altered gates. **A green CodeQL result on the final published head has
not yet been observed at this report's creation.**

## Local qualification at publication

The production implementation is frozen at the reviewed `a107d993` tree content.
The final `fb12a330` successor adds only the two explained test reconciliations
and their evidence. Qualification records preserve each command's actual source
pin; earlier donor results are not counted as new combined results.

| Check | Observed outcome |
|---|---|
| Dependency-ordered library build | Passed, followed by rebuilds of all six packages changed by linear formatting repairs |
| 29 directly affected package coverage suites | **5,409 passing tests** after the fiat expectation reconciliation; **29 existing native-integration skips** |
| Package test files | 297 passing files; one native-integration file skipped |
| Corrected JSON fixture suite | 24 existing cases passed on the final composed source |
| Corrected fiat suite | 88 existing cases passed with the original coverage thresholds on the final composed source |
| Type checks | All 38 affected workspaces passed; both corrected packages rechecked |
| Typed lint | All 38 affected workspaces passed after the two fixture corrections; original generated-code warning remains non-failing |
| Pages artifact / POS / merchant amount Node checks | 22 tests passed |
| Full web production build | Passed with the original bundle scan, 19 emitted files scanned |
| Lean web production build | Passed with the original bundle scan, 17 emitted files scanned |
| Secret scan | Passed |
| Action pin verification | All 111 references passed |
| `tx.origin` check | Passed across 39 unchanged Solidity files |
| Full web coverage and existing no-coverage second pass | **2,980 tests passed** in 230 files; 13 existing tests in two files skipped |
| Native browser and real-chain qualification | Final hosted checks required; not claimed locally |

The combined local total is **8,411 passing tests**: 5,409 package, 2,980 web
and 22 Node checks, with 42 existing skips. Web coverage is 93.37% statements,
89.72% branches, 94.84% functions and 97.09% lines, above every original threshold.
The 88- and 24-case corrective runs are not added a second time to the package
total. Initial failing lint and fiat results remain in the evidence alongside
the corrections. Original coverage thresholds and assertions are preserved.

The 29 package skips are existing Anvil/compiler/artifact-dependent tests.
An earlier local Chromium attempt was blocked before test execution by the
environment's Unix-socket restriction. That launch failure is not a passed or
failed application assertion. Final hosted browser, chain and CodeQL gates remain
necessary. No workflow or test configuration was changed to bypass them.

## Work retained outside this candidate

The detailed index and eligibility annex distinguish known supersession from
useful work still needing an owner decision or acceptance evidence. In
particular:

- A separate bounded QR composition is in progress: #605 supplies dimension-
  recovery behavior and dense-image tests, while #581 supplies responsive SVG
  rendering, the ESM distribution, browser license emission and interoperability
  tests. Review found these contributions compatible. The follow-up will retain
  one decoder copy and reconcile the provenance assertions before functional,
  native and hosted qualification. The separable #525 SVG repair is already in
  this candidate; neither complete decoder continuation is yet claimed merged.
- The broad refund/settlement branch still lacks a complete execution adapter,
  authoritative observation/finality flow, atomic storage and real callers.
  Only the independent reservation correction was recovered.
- Wallet, recovery, privacy, receipt, mobile, offline and seller stacks retain
  their active source and native acceptance obligations. Successor containment
  does not by itself prove those features complete.
- Dormant future modules, independent dependency lock graphs, deployment
  history, integration-lock metadata and paid publishing automation remain
  distinct from eligible application fixes.
- Eleven historical mixed-scope residual stacks retain explicit semantic
  obligations. They are not blanket duplicates. A historical journal heuristic
  that would reject legitimate distinct payments was not reintroduced.

The additional audit assigns specific reasons to all 56 previously unresolved
residual rows and all 11 historical rows. Among the 56, it distinguishes 17
valuable runtime stacks, 14 dependent qualification continuations, nine genuinely
unresolved mixed-scope histories, five incomplete preview/provider efforts, five
separate tooling/infrastructure efforts, three narrow candidates, two QR
follow-up rows and one already-selected target behavior whose inherited parent
remains held. Green donor checks are not mislabeled failures.

The three narrow candidates are now undergoing separate current-source review:
the #410 printed-link boolean contract, #341's enabled-testnet destination ledger
and #220's counted-payment requirement before tolerance can mark an invoice paid.
Only independently useful, compatible hunks and their existing regressions may be
recovered. Their broad historical contract, workflow and privacy changes are not
selected as part of those narrow recoveries. The frozen core source
does not claim these follow-ups as completed.

No source branches were deleted or force-pushed. No deployment or live-funds
operation is part of this composition.

## Evidence and promotion

`SOURCE.json` records exact source and tree identity. The readable branch index,
frozen comparison/disposition archives, incremental refresh, held-branch notes
and qualification receipts accompany this report. Archives are lossless; their
manifest records both compressed and decompressed checksums.

- [BRANCH_INDEX.csv](BRANCH_INDEX.csv): all 696 observed refs and dispositions.
- [BRANCH_REFRESH_696.json](BRANCH_REFRESH_696.json): complete refreshed ref list
  and uncapped comparisons for the new branch and updated ledger.
- [Held-branch eligibility](held-branch-eligibility.md) and
  [incremental audit annex](branch-refresh-696-annex.md): concrete dispositions
  and limitations for all 67 residual/historical rows. These retain the audit's
  capture-time status; the completed web results above supersede its earlier
  in-progress qualification note. Full per-row evidence is losslessly compressed
  under `evidence/held-branch-eligibility.json.gz`.
- [SOURCE.json](SOURCE.json) and [SOURCE_REVIEW.json](SOURCE_REVIEW.json): source
  identity, parent provenance and independently reviewed preservation decisions.
- [QUALIFICATION.json](QUALIFICATION.json): actual commands, source pins, initial
  failures, corrective outcomes and nonduplicated test totals.
- [Frozen disposition narrative](evidence/branch-disposition-695.md) and
  [index](evidence/branch-disposition-695.csv): the original 695-ref overlay,
  retained as evidence rather than rewritten after publication.
- [Full comparison archive](evidence/branch-census-695.json.gz) and
  [disposition archive](evidence/branch-disposition-695.json.gz): lossless complete
  machine-readable evidence. Decompress with `gzip -dc`.
- [Qualification logs](evidence/local-qualification-logs.tar.gz) and
  [checksum manifest](evidence/MANIFEST.json): original outputs and verifiable
  compressed/decompressed identities.

Before promotion, refresh main, PR611's exact head and its hosted results. Acquire
the repository's integration lease only when the final head is eligible; verify
the lease token immediately before merging. Use a normal merge preserving donor
ancestry, verify the resulting main history/content, and release the lease. Do
not treat this pre-merge report, a donor's green run, or an unprotected branch as
permission to bypass a pending or failing final gate.
