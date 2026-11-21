# GhostPay R13 — capped branch ancestry audit and continuation (2026-11-21 UTC)

## Exact checkpoint

- Immutable `main` comparison base: `eb59d93cffed7848c4aac37d0e9650b87239c6da`, reconfirmed before this cycle's engineering.
- R9 frozen source: `c493df9e210f6227471864a623ee536cc9483a3a` (447 heads, 26 exhaustive immutable-head comparisons).
- R12 frozen source: `2eb64d0a19e172ca02abe10a191b7d711962cb52` (468 heads, 22 new/moved compared with same `main`). R12 evidence is owned by PR #401, stacked on canonical coordination PR #380.
- R13 REST branch pagination: **100/100/100/100/70/0**, terminal empty page; **470** distinct names matched **470** Git `matching-refs/heads` SHA references. Delta vs frozen R12: **468 unchanged heads, 2 added, 0 moved/removed**. The two additions were fully compared to the same `main` SHA:
  - `audit/ghostpay-r12-delta-20261121-0507` at `2eb64d0a19e172ca02abe10a191b7d711962cb52`: ahead 8 / behind 0, 32 returned paths, existing ledger PR #401; no independent runtime code donation.
  - `fix/ghostpay-browser-selfchecks-optionals-r13-20261121` at `3c9b96d0a10a976cb2143a8a62bbd4e31fc9f565`: ahead 7 / behind 0, 14 returned paths vs `main`; four isolated commits and four paths **relative to parent #395**, handled by stacked draft PR #402.
- R12+R13 inherited path triage: **191 ancestry-zero-ahead, 141 uncapped code-like, 78 uncapped docs/other, 59 GitHub-300-file-capped, 1 unrelated `gh-pages` = 470**. These are only path/ancestry heuristics, not evidence of semantic uniqueness or safe merges.
- Open PR pagination: **50/50/50/12/0 = 162**; #380→#401 and #395→#402 source/base/head connections confirmed. This evidence branch was created after the 470 snapshot and is intentionally not counted; future workers must refresh the total.

## All 59 capped comparisons: exact-head lineage triage

[`CAPPED_ANCESTRY.json`](CAPPED_ANCESTRY.json) enumerates **all 59 current capped branch names and exact SHAs**, their source R9/R12 records, and the immutable compare pair against active recovery/privacy PR #372 head `055d33e042c63edf1d5bbbdd7833d3c1ef93733d`. GitHub commit comparisons were performed on each source head, not inferred from names.

- **30 exact ancestors of #372:** all those branch commits are in the active PR #372 head's Git history. They are **not necessarily integrated into `main`**, approved, or safe. Recover or review their behavior via the existing PR #372 chain, rather than opening duplicate broad donor PRs.
- **5 exact descendants of #372:** active browser/Bitcoin recovery children #381, #383, #386, #373 and #382. Their unique commits are **already claimed** by these stacked PRs; do not shortcut into `main`.
- **24 divergent heads:** their branch-specific history remains outside #372. Do **not** auto-import. Use merge-base-to-head commit review and semantic comparisons against current `main`, other active PRs and the v1.0/v1.1 scope. For example, `chatgpt/ghostpay-tm-hardening-20261118` has 1 commit missing from #372's ancestry, `chatgpt/ghostpay-remaining-work-20261119` has 2, and `chatgpt/spec18-recovery-completion-20261118` has 6; these histories require per-change review and are not presumed safe or unique.

These 59 all had capped `main` comparisons; lineage classification does **not** remove the need to inspect changed code or prove the combined integration is safe. It reduces duplicate-search scope for existing PR-owned histories.

## Actual code repair in this continuation

- New **draft [#402](https://github.com/djshellshoxxx/GhostPay/pull/402)**, child of browser self-check Workstream I [#395](https://github.com/djshellshoxxx/GhostPay/pull/395), exact head `3c9b96d0a10a976cb2143a8a62bbd4e31fc9f565`.
- Hosted parent [Hosting kit 44899184722](https://github.com/djshellshoxxx/GhostPay/actions/runs/44899184722) job `136831267457` failed `TS2375`: `browserCheckEnvironment` explicitly returned undefined fields under `exactOptionalPropertyTypes`. Child fixes it by conditionally omitting missing crypto/storage providers and adds deterministic denied-storage/missing-WebCrypto fail-closed regression. Test-first and fix commits are source-pinned in the child's [handoff](https://github.com/djshellshoxxx/GhostPay/blob/3c9b96d0a10a976cb2143a8a62bbd4e31fc9f565/docs/handoffs/BROWSER_SELF_CHECK_OPTIONAL_TYPE_R13_20261121.md).
- Isolated local TypeScript 5.8.3 equivalent strict/exactOptionalPropertyTypes smoke: baseline returns TS2375 (exit 2); corrected object shape compiles (exit 0). **Not a repository typecheck or Vitest execution**. Full repo could not be cloned locally because DNS for github.com was unavailable. Hosted CI, review and combined parent qualification remain outstanding.

## Ownership, blockers and safe handoff

- Integration lock `automation/ghostpay-integration-lock:integration-lock.json` remains **held**, generation **11**, owner `994a0d214fb9-root-r3`; no takeover despite historical expiry timestamp. No main merges, release, deployment or real-funds transactions were performed.
- #402 requires exact-head CI, Hosting/Beta/Pages, browser/lean qualification and independent review before stacking into #395; re-run parent gates after integration.
- #372 recovery/privacy and its browser children still require full Firefox/WebKit qualification, custody/permission checks, and dependency review. #386 native-browser workflow failed independently of its signer assertion change.
- #401 is the existing ledger PR; **integrate this documentation-only child into #401**, then requalify #380 after the upstream chain is reviewed. Do not create a second canonical ledger.
- Next worker: inspect the 24 divergent capped heads via merge-base commit-level differences; prioritize unowned security/recovery code and avoid source-redundant imports. Check current branch/PR heads and ownership before any modification.

Source evidence is not release approval. No local GhostPay web unit suite, browser suite or production build was executed in this lineage review.
