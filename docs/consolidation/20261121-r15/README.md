# GhostPay R15 — 475-branch inventory and source-pinned integration handoff (2026-11-21 UTC)

## Scope and immutable checkpoints

- Repository: `djshellshoxxx/GhostPay`. Read-only confirmed `main` commit: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Continuation parent: draft PR #403, head `bb668e18b1bad2e92811c22ca57cb019b1b4b281`, stacked on #401 → #380. This R15 record is a child, **not** another authoritative ledger.
- Previously verified exact-head coverage: R9 #378 compared **447** SHA-pinned branches against this unchanged `main`; R12 #401 reconciled **468** heads; R13 #403 reconciled **470** names and SHA refs and classified 59 300-file-capped histories; R14 #406 handoff reconciled **473** exact heads (terminal pagination and matching refs), with three additions vs R13. These remain the primary evidence; see their commit-pinned documents.
- This cycle re-paginated the full live GitHub branch-name search: **100, 100, 100, 100, 75, 0**, reaching a terminal empty page; **475 names**. The *two known* branches added since the R14 snapshot are scoped fixes #406 and #407. We did **not** recover fresh immutable SHA refs for all 475 names and cannot attest that every earlier head was unchanged or claim 475 fresh SHA-pinned comparisons. No false claim of exhaustive re-verification is made.
- New additions independently compared from their **exact heads** to frozen main:
  1. PR #406, `automation/20261121/bug/pos-runtime-guard-r14`, head `506604288e31c195c852fa2e8896e131da34bc3b`: ahead **13**, behind **0**, **6** changed paths. Owned package/static POS guard + dedicated regressions + coordination/handoff.
  2. PR #407, `automation/20261121/bug/undo-maxpending-bound-r2`, head `24caac5117f7dd19d7cf8b9cacae6c29f84956d0`: ahead **4**, behind **0**, **4** changed paths. Owned UX UndoQueue capacity guard + isolated regression + coordination/handoff.
- Their exact-main changed-path lists are recorded in `SOURCE_OVERLAP_R15.json`. Counts and path-based classification are **not** assertions of semantic uniqueness or merge safety. The unrelated-history `gh-pages` ref remains excluded from source merges.

## Specific semantic recovery findings among the 24 R13 divergent capped heads

All findings below compare immutable donor blobs against frozen `main` and active recovery/privacy draft #372 head `055d33e042c63edf1d5bbbdd7833d3c1ef93733d`. They do not imply approval or mainline integration.

- **QR type fail-closed protection**: `automation/20261120T0035Z/worker/qr-flag-coverage` at `4493793ad2c438fcc0f45f96851eac8967cb607a` has `qrKinds.ts` blob `a85e1011cdface74c87683146ff7428654b7830d`, which is **byte-identical** to #372; current main blob is `68de6518783cc57bd7f3a66d0588d530e27d21b6`. #372 also carries the donor's `qrKinds.test.ts` blob `257b634250f033ddec042b67941fec23ffba1323` (main: `e918e36848f4e01322afbdf41cf561b3222cc14a`). The additional runtime non-string guard and tests are already in a PR-owned stack. **Do not create a second QR donor PR.**
- **Receipt-transaction-hash correctness**: `automation/20261120T0115Z/worker/receipt-hash-validation` at `acbf39ee21ad35e9d14df958fa16fbcc2e230cae` adds validation that `eth_getTransactionReceipt` returns a hash matching the requested transaction. Main `wallet.ts` blob `fb1d864f3223ce007e35d81c19a308df88657121` lacks this receipt check. #372's `wallet.ts` blob `20f6b7001b56bc9c0e5c543672083a63c93f74da` **contains** the `receiptHash` guard and #372's `wallet.test.ts` blob `0eef38ea9deb736072515d3240eeabfbd6b5e49b` includes mismatched/missing/malformed receipt-hash regressions. Donor code blob differs because #372 composes additional changes; **test-by-test semantic review is still required**, not a blind cherry-pick.
- **Clipboard privacy timer/ownership**: donor `automation/20261120T004531Z/feature/clipboard-guard` at `6c648770f5647ca7993cc108ef9e5ede9b46b4c9` adds `clipboardPrivacy.ts` blob `5e55f2ca693ef3112e8d12409572b29d96ef86a8`; current main has no such path. #372 already contains a substantially expanded `clipboardPrivacy.ts` blob `a9d84e38c348e4c2b238f52cf506263117babc13`, with copy-intent ownership, cleanup cancellation, digest-only matching, guarded reads and pending-clear ordering. Treat donor as **overlapping and apparently superseded in #372**, subject to behavior/test review. Do not blindly replace newer implementation.
- **CSP hardening**: `chatgpt/ghostpay-tm-hardening-20261118` at `c17e5c387e3c2b83f48b02ac33a669c44c69ced6` has `apply-csp.mjs` blob `79016d47eec0e5a85da365c4d8220fe3fee05a63` and `privacy-csp-bundle.test.mjs` blob `d86959ef4ba6418eec5737fdb9e54db7d2859a1f`; **both blobs match #372 exactly** and are absent in main. Its `scan-bundle.mjs` differs from the newer #372 version and needs focused semantic inspection; replacing the #372 script wholesale is not safe.
- **Network isolation settings acceptance**: `codex/network-isolation-complete-20261119` at `3ae0b4f642a8941592fad48c26e9ed1bbec327f4` contains `Settings.test.tsx` blob `42b9398464d133305a757477315e677d09d0f8b6`. Main uses `f898ade764504ab8aee0024194afed15f35f92fb` while #372 uses expanded test blob `7bf77779c2128ca6782f79fce0cf0600e2419360`. Relevant network-profile and fail-closed assertions appear in donor; compare individual tests, not whole-file hashes, before declaring full redundancy.

These five candidates are **PR-owned overlap/supersession candidates**, not proven ancestry-redundant from `main`. Remaining divergent histories from R13 still require per-commit review. Do not collapse 59 capped histories into a "safe" count.

## Live integration and browser qualification checks

| PR | Exact head | Observed exact-head workflow status | Required next gate |
| --- | --- | --- | --- |
| #406 merchant POS | `506604288e31c195c852fa2e8896e131da34bc3b` | CLI, Beta, Pages, Hosting **success**; CI **queued** | CI + package/static parity + independent review |
| #407 UndoQueue | `24caac5117f7dd19d7cf8b9cacae6c29f84956d0` | CLI, Beta, Pages, Hosting **success**; CI **queued** | CI + bounded package tests + independent review |
| #402 self-check types | `3c9b96d0a10a976cb2143a8a62bbd4e31fc9f565` | CLI, Beta, Pages, Hosting **success**; CI **queued** | CI + integrate into parent #395; requalify |
| #404 amount noise | `699c8db24451a5ff6c034b1f247c48e6cc0bdd45` | CLI, Beta, Pages, Hosting **success**; CI **queued** | CI + independent review |
| #405 timestamp types | `11117b9fff062d859c9db123ff62641cc0479192` | CLI, Beta, Pages, Hosting **success**; CI **queued** | CI + parent #384 aggregate qualification |
| #386 signer/Firefox child | `51c019d0cd3b010b7399bb0a3e85af543bc6a1ce` | CI, Tor, Pages, Beta, Hosting **success**; **native browser failure** | Firefox/WebKit root-cause investigation; don't suppress tests |
| #381 browser test parent | `df0e715686bc42d270617692a7e310a8b362e840` | Native browser **failed**, CI **failed** | Needs #386 and further browser qualification |

Native browser failure evidence from workflow `44897636269`: Firefox lean **8 failed / 114 passed / 5 skipped**, Firefox full **8 failed / 127 passed / 2 skipped**; the eight browser failures end in `page.evaluate: Page crashed` at `e2e/accessibility-audit.ts:25`. WebKit lean **1 failed / 133 passed / 5 skipped**: `idle-session.spec.ts:92` timed out clicking the Seller keys navigation button after history restoration; WebKit full passed. This is not evidence that a production wallet privacy fault was disproved. Inspect browser traces, page lifecycle, visibility/navigation state and crash causes before changing assertions. Preserve verified post-lock key absence.

## Ownership, decisions and continuation

- `automation/ghostpay-integration-lock:integration-lock.json` blob `97523a9ce00231ac883b32178ab48a547eb0dd8f`: **held**, owner `994a0d214fb9-root-r3`, generation **11**. Historical expiry does not authorize seizure. No protected merge while held.
- `main` remains `eb59d93cffed7848c4aac37d0e9650b87239c6da` as observed. No merge/release/deployment or real-money operation was performed.
- This work is docs-only and source inspection; **no repository Vitest, TypeScript typecheck, lint, build, E2E, or live-wallet transaction was executed locally** because GitHub checkout was DNS-unavailable. Hosted statuses above were read, not executed by this worker.
- **Next executable priority**: complete #406/#407 exact-head CI and independent source/parity review; separately diagnose native Firefox `Page crashed` and WebKit history navigation in #386 without weakening privacy assertions; integrate only after actual release of the lock. Then reconcile #402 → #395, #405 → #384, and separately recover #372 after full Firefox/WebKit/custody qualification.
- **Census continuation**: refetch immutable head SHAs for the entire latest 475-name inventory, diff against R14's 473 exact refs to detect moved/deleted heads, and compare any moved/new heads to *then-current* main; inspect remaining 24 R13 divergent histories per commit, treating the five above as overlap candidates. Avoid new duplicate feature branches, custody services, API relayers, remote dependencies, or broad production merges.

No release-readiness claim is made. This source-pinned record must be reconciled into #403 → #401 → canonical #380, not copied into competing ledgers.
