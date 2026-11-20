# Signed invoice-file consolidation qualification

Independent reviewer: `invoice_file_completion`, delegated by the unique-code consolidation coordinator.
Date: 2026-11-20. Branch: `feature/ghostpay-invoice-file-completion-20261120`.

## Result

The current signed invoice-file implementation has no blocking issue from this bounded source review,
and its five focused feature/QR/DOM test files pass: **105 tests, 5 files, exit 0**.
The repaired full and lean browser gates remain required. Neither local browser execution nor final
combined-source qualification is claimed.

Canonical source: [PR #310](https://github.com/djshellshoxxx/GhostPay/pull/310) at
`1de98f6c9371010883253450446e6f7294da84fa`, tree `bb171ebd63e38dce3496e3a7e84990c3dd020fc1`.
Execution source: `7ae2f73fec9097c316620b846a8853f413d7fb15`, tree
`a85b29155f2baa76912a8b38924d0124d481e7c2`. Its sole difference is this lane's ownership
entry; all product and test files match canonical source exactly. Detailed commands, counts,
source identity and log digests are in [EVIDENCE.json](EVIDENCE.json).

## Existing repair recovered and independently reviewed

During discovery, the original feature owner published the memo-locator correction as `1de98f6c`.
This lane fast-forwarded its isolated branch to that canonical head and preserved the author's work.
The original owner's checkout, branch, pending evidence and other repair candidates were not edited.

The original full browser job in [run 44692101562](https://github.com/djshellshoxxx/GhostPay/actions/runs/44692101562)
failed four new fixtures at exact bare-memo lookups. Source renders a paragraph containing
`Memo:` followed by the value. The repaired positive checks match the complete paragraph within the
accessible `Review payment` region. Global substring absence checks now detect a memo with or
without its label. New negative checks cover the wrong-passphrase state and removal of request B
when request A is reopened. Existing envelope, preview, signature, amount, wallet, network,
storage, URL and invalid-file checks remain intact. No runtime repair was needed for this finding.

This review inspected the codec, file selection and invalidation lifecycle, download helper,
CreateInvoice/Pay integration, and the exact repaired browser test blob
`085bbccd0ad1d434e8c6f67965d7fbdf1fe72d4f`. The wrapper continues to carry the original
signed fragment. Import stays local and staged until explicit opening. Signature, pinning,
passphrase and supported-profile decisions remain in the existing invoice path. Replacement,
clear, disclosure close, visibility, scope, session, app-lock and unmount invalidation remain guarded.
The requested-file transport adds no encryption or seller-identity claim.

## Actual execution and limits

| Check | Result |
| --- | --- |
| External dependency lock identity | SHA-256 `e025d878c55cc215315286fc2df277ce5c79116c1507bba79419c789669e0e4e` matches the source checkout used for copying installed dependencies. |
| Own-source internal library builds | 18 required workspaces rebuilt serially at 512 MiB heap; exit 0. No donor library build output was copied. |
| Focused DOM, existing QR integration and real QR raster interoperability | 105/105 tests in 5/5 files; 94.37 seconds; original Vitest configuration, one concurrent worker; exit 0. This is not full-suite coverage evidence. |
| Original full-profile focused Playwright runner | The unchanged build subprocess was killed with exit 137 during web TypeScript compilation. Runner exit 1; no browser assertion or successful artifact. |
| Installed Chromium launch diagnosis | The same executable/launch argument used by the supported project configuration aborts before page creation: `socket() failed: Operation not permitted (1)`. |
| Lean local browser execution | Not attempted after the process-level browser restriction was confirmed. No local browser pass is claimed. |

One initial browser invocation was deliberately interrupted before any test result to correct a
mistyped build commit label. The subsequent blocked invocation used the actual execution-source
SHA recorded above. Neither attempt is passing evidence.

The compiler/browser failures are retained as environment limits. The original gates, assertions,
source, timeouts, skips and coverage thresholds were not changed to obtain a result. The root
coordinator requested that further heavy checks stop after the bounded selection completed to
avoid concurrent process kills. The latest observed [repair CI run 44769994546](https://github.com/djshellshoxxx/GhostPay/actions/runs/44769994546)
was queued at 16:13 UTC; that observation is not a successful result. The existing repair handoff
records its author's separate lint/typecheck evidence; those checks were not independently rerun here.

## Integration handoff

A structural merge probe against recovered-fixes source `0e926f8b4cf7f307c3174f3a03298ff310cb1808`
found no product/test conflict. The sole conflict was `docs/ai/ACTIVE_WORK.md`; retain both sets
of ownership records when resolving it. This probe does not qualify the combined tree.

1. Recheck the canonical F03 and target heads before integrating; preserve any intervening work.
2. Require full and lean browser jobs plus all applicable checks on the actual repaired head.
3. Resolve only additive ownership records if the same probe still holds, then qualify the final
   combined source with the repository's existing gates.
4. Keep broader F03 reusable policies, wallet-URI conversion and provider abstractions separate;
   this implementation delivers signed-invoice request-file interchange only.

The root coordinator owns publication, integration and main promotion. This lane changes only
its ownership and independent evidence records and does not update another worker's branch.
