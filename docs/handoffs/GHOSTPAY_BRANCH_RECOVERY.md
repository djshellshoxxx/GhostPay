# GhostPay branch recovery record — 2026-11-16

## Baseline

- Repository: `djshellshoxxx/GhostPay`
- Default branch: `main`
- Working baseline: `codex/ghostpay-caveman-completion-20261116` at
  `4ee9dd770826e705cb8c2437a53cf6714a003635`
- Candidate PR: [#182](https://github.com/djshellshoxxx/GhostPay/pull/182), draft, based on #179.
- Current #182 source checks: web test and locale/catalog validation fail; aggregate `typescript` gate fails because of those jobs. Contracts, integration, CLI, lint and other listed checks passed at the checked run. Deployment and post-deployment jobs were skipped by design.

## Targeted recovery decisions

| Source | Source SHA | Unique work | Decision | Evidence / follow-up |
|---|---|---|---|---|
| PR #180, `codex/ghostpay-mythril-recovery-20261116` | `ffd957e28f982f5c6d2dc00f51143766b2406773` | Fail-closed Mythril process/report validation and offline fixtures | Integrated | Source branch is an ancestor of the baseline. Continuation handoff records 19 Mythril fixture tests and 13 Echidna fixture tests; no real Mythril campaign claimed. |
| PR #181, `codex/ghostpay-registry-recovery-20261116` | `98f779538bb7fe5ffa3b5235f87b6d9cf25bca2c` | ERC-6538 nonce/invalidation/delegated-registration builders | Integrated | Source branch is an ancestor. Continuation handoff records 40 helper tests and a five-test Anvil reference-registry run; ERC-1271 wallet UX and public deployment remain unqualified. |
| PR #164 lineage, `claude/lucid-meitner-apalzc` | `0d2ea8b4` | Historical recovery and broad sponsor/pool/QR/source-gate work | Integrated selectively | Source lineage is an ancestor. #182 handoff reports retaining qualified linear parsers where alternatives were equivalent and incorporating the sponsor queue, privacy-warning and source-gate fixes. Recheck exact package evidence before release. |
| PR #178, `chatgpt/zero-codex/pages-download-cleanup-20261116` | `cf5ad81cab48424e6302e507c9af46bf4c99aee4` | Revoke Blob URL and detach anchor after a blocked download click | Superseded; do not cherry-pick | Current baseline's `downloadText` catches failures across setup, append and click, revokes the Blob URL and removes the anchor in `finally`. Current tests cover click and append failures. Cherry-pick produced a content conflict because current behavior is already broader. #178's standalone CI was green, but its patch adds no distinct behavior here. |
| PR #182 current candidate | `4ee9dd770826e705cb8c2437a53cf6714a003635` | Invoice amount reporting, recovered custody/audit changes, profile bound, registry lifecycle and disclosures | Continue; do not mark complete | Candidate remains unmerged. Exact-head CI found 12 missing locale entries and one exhaustive critical-key classification failure. This follow-up records the source correction; hosted requalification is pending. |

## Follow-up change

- Commit: `8092e2f7f213f67033d99bb0fd0e408620d24ea2`, local branch
  `codex/ghostpay-caveman-followup-20261116`.
- Adds the four new merchant-profile keys to each machine-drafted locale using exact English source text and classifies
  them as security-critical. This preserves source-English behavior until native review.
- Static verification confirms 2,175 keys in each of four catalogs and exact, duplicate-free classification of all
  2,175 keys as critical or neutral. `git diff --check` passes.
- Hosted Vitest/catalog CI has not run on this commit. Local npm dependency installation exited 137.

## Scope and limits

Recovery focused on branches cited by the active continuation and the independently qualified Pages download fix. No old branch was merged wholesale. The remaining open PRs and older branches need per-commit comparison before any additional recovery. A branch's existence or green run on another head is not integration evidence.

## Next recovery steps

1. Publish the locale/security-key correction on the follow-up branch and verify the exact-head application, Pages and beta checks.
2. Compare remaining open PR heads against the selected integration base with ancestry and patch-equivalence checks.
3. Port only unique, non-superseded source and tests; record exact resulting commits and checks here.
4. Keep blocked owner decisions, external test prerequisites and design-only proposals outside the recovered implementation claim.
