# Individual stealth-payment export recovery — 2026-11-24

Worker `/root/ui_data_review`; coordinator `/root`. Branch
`integration/individual-export-recovery-20261124`, reusing the completed
`react-pages-diagnostics` worktree. The former branch and commit remain intact.

## Reviewed and qualified source

| Role | Exact commit |
| --- | --- |
| Integration base, including selected receipt printing | `0b60dba235710f12847532dd9d0f74f12f7298c6` |
| Original #572 donor, preserved as merge parent | `28bba11cdaebc13edc4d100761ee00750c3f396f` |
| Ancestry-preserving merge | `05d818e7fc85bfc9a2e5ccaf0cfa874ee0df2110` |
| Qualified source | `079a153aadd2c3f2ac8e87a9dab2daf8f0fc00de` |
| Qualified tree | `b7c3a7784d20f5e538caaf9e6bcb7bf0f445f565` |

The complete individual-payment unit is recovered: public/encrypted/deliberately
confirmed raw exports, credential-to-loaded-seller authorization, verified Scan
RPC ownership, encrypted-download retry and exact saved-file verification,
portable formats, standalone recovery CLI, original vectors, documentation and
all existing donor tests. The codec's complete formats do not activate the held
archive/master/recovery UI from #573/#596. No dependency or lockfile changes.

Independent source reviewer `/root/ui_data_review/react_pages_review` approved
the complete product composition and the exact final CI/documentation delta at
the source/tree above. This approval is distinct from runtime qualification.

## Reconciliation and preserved behavior

Production source merged without conflicts. Four locale conflicts were unions:
each language gains 86 messages while retaining both parents' exact message
values and metadata. All additions retain their security classifications. The
ownership registry preserves both complete parent line sequences.

The only changed donor product-file text is two comment lines in
StealthExportCommon.tsx. Its previous synchronous-session-deadline claim was
incorrect: captureSessionVersionGuard checks revision, while the operation also
checks input scope and reacts to lock/session notification. The corrected comment
describes those implemented guarantees; executable behavior is unchanged.

The current entire Scan Tags implementation, session/keyVault behavior, seller
authorization, chain scope and asynchronous readback guards remain preserved.
The new credential proof is additive and leaves the separate seller-backup
authorization and custody behavior intact. Current portable-keystore cleanup
and its memory regression remain unchanged. All 973 pre-existing test/spec files,
receipt/bill/print behavior, QR policy/geometry/decoder/CSS, manifests and lockfile
are unchanged. Of 23 new donor files, 22 are byte-identical; the remaining file has
only the comment correction above. The recovery CLI and two test files also match
the original #560 source `2d79881a52e8f425e19704367c2ac8f91f1d7922` exactly.

## Local qualification on the frozen source

| Check | Actual result |
| --- | --- |
| Complete ux-vault test/coverage suite | **375 passed, 14 files, zero skips** |
| Vault coverage | Statements **97.01%**, branches **94.28%**, functions **99.50%**, lines **98.89%**; original gates passed |
| Vault build, typecheck and lint | **Passed** |
| New/existing web consumer tests | **311 passed, 27 files, zero skips** |
| Standalone recovery Node suite | **23 passed, zero skips** |
| Existing workflow guards | **5 passed, zero skips** |
| Full web typecheck and typed lint | **Passed** |
| Locale validation | **4 catalogs, 2,358 messages each, zero errors; 498 retained untranslated-equality warnings** |
| Full build and original bundle scan | **Passed; 19 files scanned** |
| Lean build and original bundle scan | **Passed; 17 files scanned** |
| Required local native spending suite | **Prerequisite failed: Anvil and Cast unavailable; zero spending cases executed** |

The web run covers all four new export suites plus current session/keyVault,
keystore, app-lock, Scan, seller-key, AppShell, full/lean App and privacy-invariant
consumers. It is targeted qualification, not full-web coverage. The coordinator
will run final combined full-web coverage after composition.

Commands, exact selected test paths, environments, durations, exit codes and log
SHA-256 values are recorded in
[QUALIFICATION.json](individual-export-recovery-20261124/QUALIFICATION.json).
Every original command log, including the missing-tool failure, is retained in
[run-logs.tar.gz](individual-export-recovery-20261124/run-logs.tar.gz), SHA-256
`b5c3086e05630da9e6f4d971404389e5a5c5d61fa2ce1cbccc30f6bb0c0bea4a`.

No installation or duplicate dependency tree was needed. Node 24.22.3/npm 11.19.1
used existing external dependency links, with 68 workspace links resolving to
this worktree. Unchanged package outputs were reused; pir-two-server output was
refreshed from the exact base and ux-vault rebuilt. Heavy checks ran sequentially;
full web lint used a 2,048 MiB heap. Builds retain their existing nonfailing
1,200 kB chunk warning and unchanged bundle guards.

## Native gate and remaining qualification

Donor run 45335656982, rest-0
[job 138296957367](https://github.com/djshellshoxxx/GhostPay/actions/runs/45335656982/job/138296957367),
actually executed both spending cases with Foundry 1.8.5: the raw-vector signer
and a fresh encrypted-backup signer each spent successfully on the local test
chain. Its combined Node invocation passed 261 tests with zero skips. This is
historical donor evidence, not qualification of the new composition.

The coordinator approved enforcing those same cases in the existing rest-0 lane.
CI equals the current base plus one line after its unchanged original Node command:

```sh
REQUIRE_ANVIL=1 node --test scripts/recovery/*.test.mjs
```

All shards already install the pinned Foundry toolchain and prepare libraries.
The enforcement flag activates the original failing prerequisite when tools are
absent. No additional shard, toolchain change, duplicate recovery invocation or
weakened earlier gate was introduced.

The local required native command returned exit 1 with
`REQUIRE_ANVIL=1 but anvil=false cast=false`. The original result is retained;
there was no installation or alternate-tool workaround. A fresh native browser
launch was not repeated after the coordinator retained the previously established
Chromium Unix-socket restriction. Both full/lean native specs
individual-stealth-export.spec.ts and stopped-scan-payment-export.spec.ts remain
required and are automatically discovered by current hosted Playwright jobs.

Promotion requires the fresh combined hosted native spending and full/lean browser
results, plus the coordinator's final composition gates. No fresh hosted pass,
main merge or publication is claimed here. The separate #583 palette family
remains excluded; its three precise failures and bounded recovery plan are in
[RESPONSIVE_PALETTE_ELIGIBILITY_20261124.md](RESPONSIVE_PALETTE_ELIGIBILITY_20261124.md).
