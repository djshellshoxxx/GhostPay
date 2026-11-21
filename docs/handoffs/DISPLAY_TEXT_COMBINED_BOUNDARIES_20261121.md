# GhostPay — combined display truncation and output-cap candidate

## Exact checkpoint — 2026-11-21T20:37:07.986Z

**Cycle:** `20261121T2033Z`. One assistant coordinator executed sequential branch-consolidation, source-audit, test-writing, implementation and verification phases. No independent worker, formal independent approval, Caveman runtime or paid coding agent was used.

**Task branch:** `automation/20261121T2033Z/integration/display-text-boundaries`.
**Base:** open [PR #390](https://github.com/djshellshoxxx/GhostPay/pull/390), exact head `b655bc273a6704c9c140287b8adcdf4085b91882`, source blob `7b5977b8cc0af0efca85bfb8fee71486cd5b8c6b`.
**Second donor:** open [PR #419](https://github.com/djshellshoxxx/GhostPay/pull/419), exact head `62dcc695ae3ff9d8c109ced97dd357fe29ed3fd3`, test blob `5992d5ae3e2104141eee87f24e2a9149e532f432`.
**Observed main:** `eb59d93cffed7848c4aac37d0e9650b87239c6da`. Both donor PR heads and main were re-read unchanged during this cycle.
**Lock ref:** `automation/ghostpay-integration-lock`, head `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`; `integration-lock.json` blob `97523a9ce00231ac883b32178ab48a547eb0dd8f`, generation 11, status **held**, owner `994a0d214fb9-root-r3`. Expiry never authorizes takeover.

## Motivation and conflict analysis

Both donor branches modify `apps/web/src/lib/displayText.ts` in the same `safeText()` span; taking only one source would risk losing the other correction. PR #390 caps *rendered* output after Unicode/hostile-marker expansion, at 4096 UTF-16 units, never outputting part of a visible `⟦U+....⟧` marker. PR #419 detects a *raw-input* cut that splits a valid surrogate pair, before calling the sanitizer.

A blind copy of #419's original fourth scenario is incompatible with #390's established output cap: a genuine lone high surrogate immediately after 4,095 ASCII characters cannot fit an eight-unit visible marker. Under #390 it must be dropped whole with `flagged: true`, not emitted beyond the cap. The composed regression explicitly tests both situations: genuine invalid surrogate with sufficient space produces a complete marker, and a too-late one produces no partial marker.

The #390 output cap already avoids showing a fabricated surrogate marker for the particular 4,095-unit prefix example. Consequently, the new raw-input pair guard is **defense in depth and explicit sanitizer-input correctness**, not evidence of a remaining user-visible exploit in #390. This cycle did not invent an extra critical security finding or weaken the capped-rendering contract.

## Exact committed work

1. Ownership claim committed before product edits: `64617ec9c640d2e26563e1fb5099528c04620526` (`docs/ai/ACTIVE_WORK.md` additive task-local entry).
2. New combined regression file: `apps/web/src/lib/displayText.truncation.test.ts`, commit `8f56a1041b62c39692e077ab2067278412ad291a`, blob `d2f9fd8667e93219431913c5b8afa4bcf39e26a0`. Six tests: split-valid-pair, intact pair, genuine invalid marker fitting, marker-too-near-cap, invisible expansion, clean exact-boundary string.
3. Minimal production composition: commit `2ccb0261880e9b4ef5daf4faf33ecccd3df8a525`, product blob `97d29e845f256ed4d35dd407624e837f22cbb1c9`. Before sanitation, if the 4096-unit input clipping boundary splits one well-formed supplementary character, remove the clipped high surrogate. Preserve PR #390's rendered-output cap and all existing escaping, NFC, mixed-script and flag logic.
4. This handoff (source-pinned to production commit above; the final branch head includes the documentation commit).

Original parent branches remain unmodified and open. No source-branch deletion, force-push, shared ledger edit, integration-lock update, main merge, real-funds action, release, deployment or production setting change.

## Executed checks and coverage limits

- **Executed:** `node --test /tmp/ghostpay_display_composition.test.mjs` on Node `v22.16.0`; **10/10 passed**. This is a **source-equivalent isolated JS replay**, using the inspected `safeText`, rendered-escaping rules and address-safety sanitizer behavior, not a checkout or the repository's actual Vitest suite. It covers all six new regression cases plus short NFC, mixed script, short invisible marker and short genuinely unpaired surrogate.
- The corresponding new six-case Vitest source was **committed**, but **not locally executed**.
- Native Git checkout attempt failed: `fatal: unable to access 'https://github.com/djshellshoxxx/GhostPay.git/': Could not resolve host: github.com`. No local repository lint, TypeScript, full Vitest, build, browser E2E, Mythril or fuzz suite can be claimed.
- Inspected GitHub exact-donor-head CI: all five reported workflow runs for **#390** `b655bc27` and all five for **#419** `62dcc695` completed with conclusion `success`. Both PRs currently report **zero submitted PR reviews**. Donor CI results do not qualify this new composite head.
- Pages workflow was inspected: `pull_request` validates without deployment; actual publication requires an explicit `workflow_dispatch` on `main` with `deploy=true`. Other downstream release/security gates are not certified by this review.

## Next-cycle actions and merge blockers

1. Inspect the composite draft PR's final exact commit SHA, all GitHub jobs and their logs; repair any failures on an exclusively owned isolated branch, preserving test assertions and reviewer ownership. Run native repository Vitest, TypeScript, lint, build and applicable Pages/browser tests when executable.
2. Obtain **genuine independent verification** of the exact combined source, including marker overflow behavior, Unicode boundary semantics and no signed-input changes; do not self-approve.
3. Recheck main, both donor PR heads and overlap. Qualify the composite as a source-level replacement for overlapping #390/#419 code only after all compatibility gates pass, and coordinate retirement or supersession without deleting unique work.
4. Only the legitimate integration owner may integrate after an explicit released/handoff lock, fresh required checks, reviewed dependency chain and no-deployment gate. Do **not** merge to main while the current lease is held.
5. Respect the unresolved security-review and real-wallet testnet gates elsewhere. This bounded display correction is not full beta clearance.

**Scope:** static GitHub Pages client; no hosted service, protocol, custody, contract, wallet, private-key or manifest changes.
