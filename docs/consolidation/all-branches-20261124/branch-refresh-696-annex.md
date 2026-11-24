# Incremental 696-ref annex

Frozen **695 branches / 356 open PRs** remain unchanged. One new branch and one moved evidence ref are recorded here. #616 is identified explicitly; no full refreshed open/closed PR count was collected.

| Ref | Previous | Current head | Disposition |
|---|---|---|---|
| `integration/ghostpay-followup-fixes-20261124-68c82b9` / #616 | New branch | `7c4987650faf32322d7ded48ad669130aba7e63b` | Semantically covered successor; original head not claimed merged. Useful independent native Chromium qualification. |
| `ledger/consolidation-snapshot-20261124-0418` | `346080a4a6ddd80aeb6d17e707404fc442955533` | `3fa89e629cac706e2cca633d8a8e1a0ec34f02a7` | Exact Git delta only adds `docs/consolidation/autonomous-20261121/semantic-overlay-20261124T1005Z.json`; evidence only. |

## Source and semantic evidence

Main `706188000c38b3dde5a3a362370a530870aa7587` and published PR611 `100de4006569ee1f65736adce8d111446dfafa59` remain unchanged at cutoff. Final local source `fb12a3302d9a85aa8777805bbdaab1bf2770ea16`, tree `8086add0f3c77a80ae953e45d50b179244261248`. Git verifies production unchanged since `a107d993c1aed73827d853924ea36036f083400f`; successor changes only documentation and two test fixtures. Root reports unreferenced remote source `7b4af29882ad2e7acefdcb83d5a949cd516d100f` has the same tree. That object was unavailable in this clone; it is not treated as the published PR611 ref.

Independent root review found 18 of 19 #615→#616 product/config/test paths exact by blob/mode. `ux-presets/seal.ts` differs only in local variable spelling (`nativeType` versus `nativeTypeDescriptor`); normalized full-file equality and generated package-map equality were verified. Preserve `docs/handoffs/FOLLOWUP_COMPOSITION_20261124.md` and its Chromium evidence. This establishes source coverage, not original-head ancestry or final hosted approval.

## Qualification

Seven C1 linear replacements are implemented and independently source-reviewed. Root reports 5,409 direct-package passing tests, 29 existing native skips, 297 passing files and one skipped file; 38 typechecks and 38 lints pass after fixture corrections. Full/lean builds and original bundle scans pass. Full web coverage continues. **Final CodeQL has not been observed.**

Prior C1 check `138228881370` at `1a7447d58c08363209b6b9b67e9a6afad07d87f3` failed on 2026-11-24 at 04:58:49 UTC with seven high-severity polynomial-regex alerts. Preserve the failure as evidence, without calling it cleared or confirmed exploitable. Public REST annotations were accessible; connector endpoint limits were not an access denial.

QR #605 and #581/#614 have bounded compatible unique value. Root authorized isolated composition based on `fb12a330`, now in progress: retain candidate-retry/dense-image and ESM/responsive/license/interoperability semantics plus provenance, then complete independent source and functional/native/hosted gates. This follow-up does not change the frozen core source pin.

See `held-branch-eligibility.md` and `.json` for all 67 held rows, concrete reasons and unresolved semantic scope. No frozen report, source or ref was changed.
