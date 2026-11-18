# Consolidation candidate: integration record (2026-11-18)

Integration branch: `nodata/wizardly-allen-qwol6u`, draft PR
[djshellshoxxx/GhostPay#203](https://github.com/djshellshoxxx/GhostPay/pull/203), base `main` (`cfaebeea`).
Foundation: unified PR [#187](https://github.com/djshellshoxxx/GhostPay/pull/187) at
`beb525dddcca103de9eda447b55cddf7ee2f428c` (tree `36177d29c0ec7a44504cc248837f70c4ddf3cb52`). Original
branches and PRs were not modified, closed or deleted. Worker lanes ran in isolated local worktrees from base
`d39e304a`; the coordinator alone merged them, in the order below, after reviewing each diff. The final head and
tree are recorded in [PROMOTION_PACKET.md](PROMOTION_PACKET.md).

## First-parent integration sequence

| Commit | Tree | What it integrates | Conflict / rationale |
|---|---|---|---|
| `f5e10f84` | `36177d29` | Main ancestry (`d2e8689b`, `0fb33dc8`, `c9787b22`, `cfaebeea`) | No source change: all 13 files touched by main's four commits were already blob-identical in unified, and `git merge-tree --write-tree beb525dd cfaebeea` returned `36177d29`. History reconciliation only. |
| `d39e304a` | `3a506e85` | Pages lineage #192, #194–#200 (16 commits, 10 files, tip `23cc6db4`) | Two conflicts, resolved as planned: `apps/web/src/components/Common.tsx` keeps the unified implementation (its try covers href/download/rel assignment, insertion and click; the older Pages fix guarded only click); `apps/web/src/lib/manifest.test.ts` takes the import union (`loadBundledManifest`) and keeps both test sets (15 unified + 4 Pages = 19). AppShell merged textually. An independent reviewer confirmed 15 of 16 Pages commits present byte-for-byte and the 16th intentionally superseded. |
| `278c9a27` | — | Ownership claims in `docs/ai/ACTIVE_WORK.md` | Coordination record only. |
| `b441cc64`, `5ddb042a` | — | Bundle-scanner end-tag fix | CodeQL `js/bad-tag-filter` (PR #203) found that `scan-bundle.mjs` matched `<\/script>` only, so an inline script ending `</script >` or never closed escaped the postbuild guard (pre-existing since `1f7ab710`). Start/end tags are now paired with an HTML-conformant end-tag rule; unterminated elements are reported. RED-first regression. |
| `b20e1c98` | `6f4d3de4` | Specs lane (`ab78c021`): #190 spec 18 (`16bc61fa`), #191 privacy 5a–5l (`e05044d4`) | Both merged without conflict. Separate semantic commit makes spec 18 the canonical, approved, before-beta-exit source for requirement 3q and corrects privacy 5k (which called it proposed/future-only); 3q is counted once; the other eleven future privacy items remain proposed. |
| `92c7a362` | — | [Next-phase queue](NEXT_PHASE_QUEUE.md) | Documentation. |
| `15c302cd`, `ffa7cb05` | `f78b7217` | Cigates lane (`05a4c2fc`) and analyzer documentation correction | `release.yml` calls the reusable `contract-analysis.yml` after the signed-tag check; `build` needs it and re-verifies this run's Echidna and Mythril metadata for exactly the tagged commit. Failed/cancelled/skipped/absent evidence blocks the release. Contract-analysis cancels superseded runs only for pull requests. `run-mythril.sh` no longer names a nonexistent `--exclude-swc` flag. Per-push CI and Pages are unchanged. |
| `1fa4179f`, `113160be` | `359c9d2a` | Mythril expiry lane (`d4171c7b`) and gas-snapshot additions | Three SWC-116 records recorded as intended inclusive signed-deadline checks; 31 tests; 28 snapshot entries added, none changed. |
| `0dda9ca1` | `a2444e21` | TagArchive lane (`b3e4051e`) | Ports #193's (`8aed22ad`) blocked-click regression; the full-profile tag-archive export now uses a shared `downloadBlob` helper extracted from `downloadText`, so a throwing click removes the anchor and revokes the Blob URL. Lean bundle unaffected. |
| `afbce0a6`, `89d10ae8` | `6efadacc` | Mythril factory lane (`2d54ab60`) and gas-snapshot additions | Eight PolicyAccountFactory records recorded as false positives or intended fail-closed behaviour; 32 adversarial tests; 31 snapshot entries added, none changed. |
| `84b4e605` | `21965d64` | Reimport lane (`af32d7f7`) over #201 (`2fb89ff5`) and #202 (`30cc4560`) | Root cause of the #201/#202 keystore re-import e2e timeout: a lost click. `ContextHelp` dismissed its in-flow explanation on an outside `pointerdown`; the collapse moved "Decrypt and load" between press and release, the release landed on another element and the form never submitted. Outside dismissal now happens on click. #201's AppShell `[view, fragment]` dependency was excluded as the cause by an in-place revert. |
| `86b6e9e5` | `3bf1f3d8` | Contextual-help hover target | `.context-help` is shrink-wrapped (`width: fit-content`) so blank row space no longer opens an in-flow explanation; rendering unchanged; open text stays hoverable. |
| `bbd24cd0` | `bd0236ac` | Supersession follow-ups | `audit-report-paths.test.mjs` now expects the generator's stricter `0o644 & ~umask` (it failed under umask 002); stale `TEAM_J_UNIFIED.md` sentence corrected. |
| `3f10fcaf` | `6395072f` | Independent review of the expiry dispositions | Reviewer conditions applied; L2 sequencer caveat added to `docs/developer/security-model.md`. |

Later documentation and evidence commits are listed by `git log --first-parent beb525dd..<final head>`.

## Decisions taken during integration

- **Common.tsx**: unified version kept; no Pages behaviour lost (independent review, Common.test.tsx covers
  click-throw and appendChild-throw paths).
- **#201 focus behaviour accepted as merged**: `[view, fragment]` also focuses `main` after in-view paste "Read",
  QR "Open", "Forget" and the asynchronous cancel on session change. Narrowing it to hashchange arrivals would
  drop focus to `body` when those controls unmount. Recorded as LOW in [REVIEW_FINDINGS.md](REVIEW_FINDINGS.md);
  a test pinning paste-submit focus is backlog.
- **Mythril dispositions do not change the gate**: Mythril 0.24.8 has no per-finding suppression. All eleven
  records stay visible and the gate stays red until source changes or the owner approves a finding-specific,
  source-matched disposition mechanism.
- **#204 not integrated**: open draft PR #204 (`nodata/eager-babbage-0w6sf6`, another session, base `main`) adds
  agent tooling and conflicts with this candidate in `.github/workflows/ci.yml` and `CLAUDE.md` (add/add). It is
  outside consolidation scope; whichever lands second must resolve those two files.
- **Active external writer**: the ChatGPT "zero-codex" rotation automation keeps pushing documentation commits to
  `chatgpt/zero-codex/{audit-pages-release-20261112,docs-pages-scope-20261112,pages-owner-ci-handoff-20261114}`.
  Their product-relevant content is not integrated; they are archived as evidence in the disposition ledger.

## Toolchain used locally

Node 22.23.5 / npm 10.9.9 (`npm ci --ignore-scripts` from the committed lockfile, unchanged); Foundry 1.8.5
(release tarball SHA-256 `6c66ffcc55fa4249197721baa3098bc208014ea1d8aa04b2ed50ac6bccffb226`); solc 0.8.28;
Echidna 2.2.7 (release checksum verified against the workflow pin); Mythril 0.24.8 with solc-select 1.2.0 on
Python 3.13 (CI uses 3.12); Playwright 1.64.1 driving the host's preinstalled Chromium build 1243 (CI installs
the Chromium build matching Playwright 1.64.1, so local browser geometry and timing can differ from CI). No
dependency or toolchain pin was changed.
