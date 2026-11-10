# GhostPay ChatGPT documentation-maintenance ledger

## 2026-11-10 — second pass: release-truth and test traceability

**Pin and ownership.** Source remains draft #98 exact SHA `364b1f185fcc2adaedab4ce7b4b14e676b1da3b7`, not main. Existing docs PR #104 is owned by `chatgpt/zero-codex/docs-wiki-20261110`; no implementation or other owner's branches were changed. Current main last inspected at `bd2652bf1853948594522140a6a0fe0cbe54e32b`.

**Previous draft CI now qualified:** #104 exact preceding head `0502ec3f792f85e0f632291d9643ed92e302cd27` [run 42819503032](https://github.com/djshellshoxxx/GhostPay/actions/runs/42819503032) concluded **success**, with four completed-success guard/change-gating jobs and twelve **skipped** application jobs. This was *not* re-running application unit/browser/contract testing. Other previous docs-only [#102](https://github.com/djshellshoxxx/GhostPay/actions/runs/42819487676) and [#103](https://github.com/djshellshoxxx/GhostPay/actions/runs/42819497628) checks also concluded success under the same change gating. Source #98 retains its own 34/34 successful exact-head GitHub checks, absent Sonar analysis.

**Files and exact commits in this docs branch:**
- `docs/wiki/Verification-and-Release-Gates.md` — `a1f1b6638600ea9c851bf0938c6d4748f059d1aa`; new requirement → source/test → status matrix, with explicit mock-chain versus B0 local-chain evidence distinction.
- `docs/operators/release-and-verify.md` — `2e1b47a846d5dba53914f2982e9d9b73ca79efb3`; correct false historical claims that no GitHub workflows ran and CodeQL was absent; **do not** claim the signed-tag release workflow ran. Retain external fingerprint and reproducibility gaps.
- `docs/wiki/_Sidebar.md` — `f50cef62996c85c359c54d44d63a391180d5b4e5`; add link to verification matrix.
- `docs/wiki/Developer-Guide.md` — `db88df7eb10e4e5a9f3440e3c82fe28f82c56a6e`; link developer instructions to the matrix.

**Validation:** fetched actual source and exact-head [GitHub check-run API](https://github.com/djshellshoxxx/GhostPay/commit/364b1f185fcc2adaedab4ce7b4b14e676b1da3b7/checks), which reported 34 successful checks including CodeQL; confirmed #102/#103/#104 prior CI job-level success/skip breakdown. Static on-branch link scan: **18 relative markdown wiki links checked across five pages, zero missing target files**. No local tests, browser tests, Forge, npm, Sonar scanning, signed tag, packaging or live wiki publication performed by this docs update.

**Gaps and next:** fresh exact-head CI on these new docs commits is pending reinspection. The live GitHub Wiki remains unsynchronized (no direct wiki-write connector); only draft version-controlled files changed. Source #98 is still draft; SonarCloud D on #84 remains unresolved, #99 remains future-only; #105 new invoice binding tests require their own CI. Future docs pass: check remaining README, operational runbooks and specs against new source heads and actual release gates; preserve owner approvals and pending independent review.

## 2026-11-10 — first isolated docs/wiki pass

**Source and ownership**
- Base: draft [integration PR #98](https://github.com/djshellshoxxx/GhostPay/pull/98) at exact head `364b1f185fcc2adaedab4ce7b4b14e676b1da3b7`, which remains unmerged and unchanged.
- Isolated branch: `chatgpt/zero-codex/docs-wiki-20261110`.
- Docs/README edit commit **`2c33a87f04c8c88c37fd7730def4df5d8e3fcf7b`**. This ledger's subsequent commit is a documentation-only successor; consult the draft PR head for its SHA.
- The current default main at inspection: `bd2652bf1853948594522140a6a0fe0cbe54e32b`. Future-only privacy catalog PR #99 landed on main after the #98 integration was branched; do not conflate these trees.

**Files updated at docs commit**
- `README.md`: replace stale claim that merchant/CLI is separate from the product branch; identify #98 integrated draft, open Sonar gate, #100 separate security PR and #99 future-only specs.
- `docs/wiki/Home.md`, `_Sidebar.md`: prominently link both required **User Guide** and **Developer Guide**, plus existing architecture/codebase navigation.
- `docs/wiki/User-Guide.md` (new): status, Node/CLI setup, common seller/invoice/payment/receipt/QR/recovery workflows, safe-use limitations, troubleshooting and FAQ.
- `docs/wiki/Developer-Guide.md`: replace incorrect design-only assertions with source-pinned architecture, prerequisites, build/test/CLI, module contracts, CI, security, debugging, ADRs, contributions and outstanding release gates.
- `docs/wiki/Codebase-Map.md`: replace incorrect `documents only` assertion with actual module/workspace links.

**Evidence and checks**
- Fetched repo README, product/CLI guides, security policy, #98 and #100 PR state, #99 merged/future-only state, security Sonar triage and current repo wiki source before edits.
- Static check of **16 internal wiki navigation links** against known page files: all target known pages. The pages `Architecture-and-Design-Rationale.md` and `Codebase-Map.md` already existed. Validated five linked source paths via exact-SHA `fetch_file`: secret-box export, privacy limits, threat model, release-and-verify guide, hosting guide. Other external/pinned links were not exhaustively crawled.
- **No npm, Forge, Playwright or browser tests were run for these documentation-only edits.** No GitHub Wiki write/publish was attempted or verified; version-controlled source is not the live wiki.
- Neither the published wiki nor any GitHub repository settings, permissions, Actions schedules or deployment were changed.

**Requirement traceability and distinctions**
- User Guide and Developer Guide exist **in this draft branch**, not on main or live wiki.
- The project has working code and previous exact-head CI successes, but is not independently audited, deployed or released. Signatures are not proof of payment. QR is not a substitute for original digital evidence.
- PR #98 remains draft. PR #100 separately hardens automation. PR #99's 18 proposals remain future-only.
- Current acceptance references: `docs/user/product-guide.md`, `packages/cli/README.md`, `SECURITY.md`, `docs/audits/08-completion-gates.md`, tests and CI workflows; no approved protocol or spec requirement altered.

**Next pass**
Recheck branch ownership and fresh CI for this docs PR. Review remaining guides, ADRs, TODOs and release notes for draft-vs-merged drift; add requirement-to-test traceability incrementally. Once an authorized wiki-publishing pathway is available, publish and verify the *live* Home, sidebar, User Guide and Developer Guide. Until then report the publication blocker; do not claim wiki synchronization.
