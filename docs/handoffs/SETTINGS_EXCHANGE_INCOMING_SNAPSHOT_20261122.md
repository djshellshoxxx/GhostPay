# Settings-exchange reviewed input snapshot — 2026-11-22 UTC

## Scope and source-pinned work

- Cycle `20261122T0239Z`. One coordinator, sequential discovery / implementation / audit; no native independent worker or Caveman runtime.
- Baseline main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Parent PR #431 head `11b71fc9b0c66007e1d8c8700a53cfeb226d840d`; this work is stacked on it, not a competing mainline fork.
- Isolated branch `automation/20261122T0239Z/bug/settings-exchange-incoming-snapshot`.
- Ownership claim `ee962cec2e5415ad387dc134d817a12e1aba75ee`.
- Test-first regression `bb2e0053e5dab3c5979b741ffb7d3046cf6ab9a7`.
- Production snapshot implementation `fcfd93131376987f28a9951e7007fa7e81f97dab`; whitespace-only follow-up `bbef7f484029fc7c0e6f6e9b7c36ddcbda751f1d`.
- Exact source blobs: parent `fb13a22a70a9bf1a5f9f4eb1edb934ffc7b2e9a7`; final `ce1645f888ce2871dbf61e089888f0b54edf1836`.
- Changed product and regression paths: `apps/web/src/lib/settingsExchange.ts` and new `apps/web/src/lib/settingsExchange.incomingSnapshot.test.ts`. No contracts, workflows, dependencies, key custody or deployment changes.

## Reproduction and fix

`previewSettingsExchange(current, incoming, chainIds)` retained the *caller's* `DeviceSettings` object directly at `preview.incoming`. PR #431 separately detached `preview.basis` (current settings), but not the imported source. A caller editing the parsed import after the review could change what `applySettingsExchange` applied without updating the earlier displayed RPC map diff or pinned signer additions/removals. The `preferences.incoming` diff also pointed to the mutable source preferences. This is an exported-library state-consistency issue; no browser exploitability, malicious QR behavior, or funds-loss claim was established.

The correction makes independent copies of every mutable imported section when building the preview: preferences, primary and secondary RPC maps, and pinned signer list. It derives the displayed diff and the eventual applied input from these same detached values. Relayer URL is an immutable string and needs no nested copy. The original input remains caller-owned. Existing revalidation at apply and the parent's current-settings snapshot remain intact.

Four committed Vitest cases mutate the original parsed source after creating a review, then verify that the review and application preserve the user's originally reviewed preferences, primary RPC, secondary RPC and signer decisions. The test file was committed before implementation.

## Actual verification and limits

- Local native GitHub clone attempted: **blocked** by DNS resolution of `github.com`. No `npm ci`, repository Vitest, TypeScript, lint, browser or build tests executed locally.
- Node v22.16.0 source-equivalent isolated replay at `/tmp/ghostpay-import-preview-replay.cjs`: four baseline source-alias drift cases reproduced, and eight post-change preservation/consistency assertions passed. This replays the specific snapshot helper logic; **it is not the actual repository test suite**. The temporary path is not durable and is provided for evidentiary clarity only.
- Parent #431 hosted exact-head CI `44967724103`: all 24 listed core CI jobs successful, including web tests, typecheck, lint, full/lean e2e; five workflow groups complete successful on `11b71fc9`. Parent checks do not qualify this child head.
- New exact-head CI and an independent verifier are mandatory. No independent review was performed or claimed.
- Bounded ownership inspection: existing #431 owns the same production path and is intentionally the *parent*. No broad #278, #293 or #372 edits were overwritten. Changed-file checks on every open PR and historical ancestry were **not** exhaustive.

## Integration and release gates

Integration-lock branch `automation/ghostpay-integration-lock` remains at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`, status **held**, generation 11, owner `994a0d214fb9-root-r3`. Its expired timestamp does not grant takeover. No main or shared integration merge is authorized for this cycle.

Reviewed current workflow triggers: `ci.yml` runs on PRs and main pushes; `pages.yml` only validates PRs, and actual publication requires an explicit main `workflow_dispatch` with `deploy=true`; release is gated on version tags. The new PR must remain unmerged pending independent verification, exact-head CI, branch protection/ownership checks and refreshed deployment safety.

## Next cycle

1. Inspect exact-head CI for the new PR, especially committed web Vitest cases, TypeScript, lint, Pages validation and full/lean browsers; repair any actual failures on a scoped child without weakening tests.
2. Obtain separate independent code/test review and verify no regressions in importer trust confirmation or direct changes to `preview.incoming`.
3. Refresh parent #431 SHA and current main, reconcile broad integration, and coordinate qualified promotion through the active integration-lock owner. Do not merge under a held lock.
4. Record any independently confirmed security implications via private reporting per SECURITY.md rather than as a public exploit report.

No merge, deployment, release, tag, force-push, real-funds operation, fee activation, new dependency or security-gate waiver was performed.
