# Docs vs code/status conflicts, 2026-11-14

Scope: docs added by merges of `chatgpt/zero-codex/audit-pages-release-20261112` (#139) and `chatgpt/zero-codex/docs-pages-scope-20261112` (#140) onto `worker/c5-docs-large`. Grep-based check only; whole docs not read.

Path gate: #139 touched `docs/audits/CHATGPT_RANDOM_AUDIT_LEDGER.md`. #140 touched `README.md` and `docs/**`. No code, config, workflow or package.json paths. Merges were clean, no conflicts.

| file | doc claim | code fact | action |
|---|---|---|---|
| README.md:13 | "Latest independently CI-qualified staged Pages-only candidate" | Qualification is CI only; file elsewhere says not independent audit (README:201) | Minimal edit: dropped "independently", added "CI only, not an independent audit" |
| docs/audits/CHATGPT_RANDOM_AUDIT_LEDGER.md, README.md, docs/handoffs/*, docs/wiki/* | Added lines matching audited / production-ready / deployed / anonymous / unlinkable | All hits negated, hedged, or describe other drafts/PRs as "not deployed" / "no audit". No affirmative forbidden claim found | None |
| docs/handoffs/CHATGPT_DOCS_MAINTENANCE_LATEST.md, docs/audits/* | "Is it anonymous? No." (linkage via RPC, wallets, timing) | Consistent with LEAN_RELEASE_SCOPE non-claim | None |
| docs/wiki/*, README.md | GP-PAGES-05 / GP-PAGES-06 (Decided: do not change) | No added line changes or reopens these items | None |
| docs/wiki/*, README.md | ERC-20 direct sweep qualification, payer gas buffer (ADR-0024) | No added line claims ERC-20 direct sweep qualified | None |
| added lines | `0x[0-9a-fA-F]{40}` address literals | grep returned zero hits in added lines | None |
| docs/audits/CHATGPT_RANDOM_AUDIT_LEDGER.md | Pinned PR, CI run and blob SHAs | Recorded as historical evidence, labelled unmerged/draft, no deployment claim | Not verified against GitHub (no network); BLOCKED-EXTERNAL to verify |
| README.md / docs/wiki/* | Pages "draft", "not merged", "not deployed", live smoke "skipped" | Consistent with statements of PR status in same files | None |
