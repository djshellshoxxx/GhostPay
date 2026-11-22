# R33 — targeted browser donor semantic preservation review

**Sources:** required v1.1 candidate `8c196d12fd45dc5a49a6c1d69f9b5d6c532994e9`, recovery PR #372 `055d33e042c63edf1d5bbbdd7833d3c1ef93733d`, current `main` `eb59d93cffed7848c4aac37d0e9650b87239c6da`. Complements the exhaustive [5,299-donor-blob tree audit](DONOR_TREE_DIFF.json); not a code merge or equivalence certificate.

Compared **complete contents** of six critical browser source paths at all three SHAs. The uniqueness counts below normalize line leading/trailing whitespace, skip blank/comment-only lines, and compare *sets*, so they are a **triage aid only**: line order, indentation in templates, call graph and runtime effects require actual diff/behavior verification. A textually repeated line may still move, gain/loss a guard, or change state transitions. No native Firefox/WebKit or local runtime tests were executed in R33.

| Browser path | Donor-only normalized code lines vs #372 | Donor-only lines **not already in main** | #372-only normalized code lines | Initial disposition |
|---|---:|---:|---:|---|
| `lib/wallet.ts` | 4 | **0** | 11 | Recovery adds receipt/input/hash type and status guards. Keep #372 pending native receipt/malformed-provider tests; never revert to donor version. |
| `lib/sweep.ts` | 0 | **0** | 0 | Same normalized noncomment line set despite different Git blobs; inspect ordering/whitespace/line context before calling equivalent. |
| `lib/scanClient.ts` | 0 | **0** | 5 | Recovery adds empty evidence-batch path and conditional secondary evidence initialization; audit behavior on missing/nonresponsive RPC and retry. |
| `views/SellerKeys.tsx` | 16 | **0** | 46 | Recovery adds busy/ownership tokens and async vault write/unlock guards; confirm cancellation, replacement and double-submit behavior. |
| `views/Settings.tsx` | 9 | **9** | 22 | Source *replacement*, not proven lost function: donor broad reset of all session config and flags is replaced by per-field change detection and per-slot `sessionOnly` map handling; recovery additionally displays proof-retention controls. Requires regression for in-place settings, session-only RPC flag preservation, and cross-tab changes. |
| `views/Pay.tsx` | 13 | **0** | 22 | Recovery adds local payment request file input, QR/file source-specific errors and session invalidation, and proof QR `sourceIdentity`. Requires native camera/file cancellation + cross-tab source identity testing; do not restore old input code. |

**Preliminary result:** five of these six donor paths have **zero** code lines unique relative to *both* recovery and main under this bounded text criterion. Settings' nine lines are replaced by a more granular update mechanism in recovery, **not yet behaviorally proven equivalent**. No safe independent donor cherry-pick was established. This strongly disfavors wholesale browser-file copy-over and reinforces the existing #372 ownership/Firefox/WebKit gates.

Other 24 browser paths with two independently diverged blobs remain without this depth of semantic review; see `DONOR_TREE_DIFF.json`. Do not treat this page as finished feature parity or proof of no regressions.

## Required regression plan before v1.0/v1.1 recovery integration

1. Verify `wallet.ts` rejects malformed receipt hashes/status/provider types without losing valid wallet attempts or reusing a conflicting hash; execute #427 → #440 → #441 → #443 stack in order.
2. Verify `scanClient.ts` empty router evidence does not falsely qualify payments; simulate failed primary/secondary RPC and stale/cancelled scans.
3. Verify `SellerKeys.tsx` asynchronous vault write, unlock preflight and abort/retry state, including rapid multiple clicks and tab-close/reopen scenarios. No real keys or funds.
4. Verify `Settings.tsx` state updates handle primary/secondary RPC map changes independently, preserve `sessionOnly` flags for unaffected slot, reset flags only where changed, preserve proof/invoice retention separation, and do not expose private RPC/session values.
5. Verify `Pay.tsx` QR/file transitions invalidate outdated camera/file callbacks and file errors, reject stale proof sources, and retain privacy/custody restrictions in native Firefox and WebKit.

No source changes to #372, no independent approval and no deployment were made by this audit. The generation-11 integration lease remains held by another coordinator.


## Second targeted batch — six additional browser paths

A further complete-file, three-source comparison (two-source when file is absent from main) identified:

| Path | Donor-only normalized lines absent from recovery | Donor-only lines also absent from main | Important recovery-only behavior / next regression |
|---|---:|---:|---|
| `components/ReceiptPanel.tsx` | 3 | **0** | Recovery adds archive write-in-flight ownership and a focused print target; test duplicate archive click and print isolation |
| `features/btc/BtcView.tsx` | 1 | **0** | Recovery additionally clears provider-check state on invalidation; test stale async provider checks after flow reset |
| `lib/relayerClient.ts` | 1 | **1** | **Do not import donor behavior:** donor enumerates `client_queue_full` with explicitly pre-broadcast relayer refusal types. Recovery/main omit that success-adjacent classification. Preserve uncertain-outcome handling to avoid unsafe duplicate submission; test request timeout / queue-full before and after possible broadcast |
| `views/Scan.tsx` | 6 | **0** | Recovery binds tag listing to the current seller key, vault-unlock authorization and session guard; test unlock/relock, stale promise completion and key switching |
| `components/MetadataRetentionControls.tsx` | 22 | **22** | The file is new in both branches, with rewritten implementation: recovery adds separate invoice/proof scope policies, registry revisions and focus refresh; test cross-tab retention policy and stale destructive confirmation |
| `components/WalletDisclosure.tsx` | 2 | **2** | Recovery tightens focus restoration after sensitive disclosure: rejects body/root/disabled targets and verifies activeElement before falling back; test keyboard/disabled target, focus loss and background-tab behavior |

These high raw line-delta counts for new files are **replacements** and cannot be interpreted as lost features without caller/tests review. `relayerClient.ts` is the clearest explicitly **unsafe old donor difference**, because treating `client_queue_full` as definitely pre-broadcast can compromise retry-safety; do not resurrect it.

Across the **12** audited browser paths in this R33 note (with overlap to R32's prior paths), no safe unrepresented cherry-pick has been identified; 18 of the 30 custom-divergent source paths remain for this level of examination. Audit result is source-bound, not an executed multi-browser acceptance.
