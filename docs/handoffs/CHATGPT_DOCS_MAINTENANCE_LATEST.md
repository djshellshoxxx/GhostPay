# GhostPay ChatGPT documentation-maintenance ledger

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
