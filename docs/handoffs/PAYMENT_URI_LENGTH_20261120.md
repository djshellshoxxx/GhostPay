# GhostPay QA-02: payment URI builder aggregate encoded-length repair

Cycle: `20261120T0641Z`, sequential bug-repair coordinator (no independent native workers spawned). Product base: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5` (main after PR #267). Isolated branch: `automation/20261120T0641Z/bug/payment-uri-aggregate-length`.

## Finding and scope

Source-pinned finding CORE-QA-01 / QA-02 from [read-only QA PR #309](https://github.com/djshellshoxxx/GhostPay/pull/309) reproduced against previous main `c977b5d6723f6822c3b5d86cd6b231712c53c395`, with valid NFC text and optional fields yielding encoded Bitcoin, Solana and TRON URIs longer than the shared parser's 2,048-character bound. The original QA reported strings of 2,124, 2,770 and 2,071 characters respectively. This is a library API round-trip defect, not an established active EVM checkout failure or funds-loss issue.

This cycle inspected exact base blobs (and the existing QA evidence): `query.ts` `80de3effdd263a1db7ecc26bd7360025f12e6112`, `bitcoin.ts` `8fdbbacaefe656aefd75f5f76073b1d6020c2e79`, `solana.ts` `788de919c7d3cbdc6412aa381928e6233c0ffe45`, `tron.ts` `551be6bfce45a9de93622e2438965f629cdb5cf1`. The current QA owner had no code repair in PR #309; active recent PR descriptions did not show a competing targeted fix. Reconfirm overlap before integration.

## Test-first implementation

- Ownership claim committed at `25162a9cdf6e62d7a906e6ab6eaad7cc43a00981` before edits.
- Seven maintained Vitest test cases committed at `3056602a49225ba1c13afee281b27d4c85c4ea53` before the production fix. They cover three known overlength examples, each builder's exact 2,047/2,048/2,049 encoded boundary with NFC multibyte and ASCII suffix under decoded text caps, optional token/reference/silent-payment/amount fields, matching parser semantic retention and ordinary ASCII controls.
- Implemented a single shared `boundBuiltUri` in `query.ts` and invoked it at the final output boundary of all three builders. It raises the existing fixed-message `PaymentUriError('TOO_LONG')` without truncation or changing parsed semantics. Source commits: `45298df4fc76652bbec0a9c18fd667e1c7dd28b4`, `1884816be0e34ebe7cabfdf497e044bb06bb5072`, `14729c3d7ec1c05f380f3af690868c6161df5406`, `0153ea4e177b2997872d839dc3f284305602e33d`.

No dependencies, workflow gates, contract, privacy policy, central service, wallet, release or deployment settings were modified.

## Qualification and remaining gates

Git CLI checkout was attempted; `git ls-remote https://github.com/djshellshoxxx/GhostPay.git HEAD` failed with `Could not resolve host: github.com`. The authenticated connected GitHub tool can read/write source, but no full checkout, repository Vitest, coverage, ESLint, TypeScript or browser tests have executed locally in this cycle. The previous QA's 199-case pass is historical baseline evidence, not evidence for these new sources.

Required on this exact final head (not a historical donor): 
`npm ci --ignore-scripts` in an authorized environment; `npm run test --workspace @ghostpay/payment-uri`, `npm run typecheck --workspace @ghostpay/payment-uri`, `npm run lint --workspace @ghostpay/payment-uri`, and relevant integration/web/browser checks. Inspect all hosted PR runs, including skipped/failed/pending required jobs. Independently review the full change and re-run the maintained boundary regressions. Compare current base/other active PRs and recheck the integration metadata lock before any protected or shared merge. Pages/release deployment triggers and external beta/security approvals are separate gates; this draft does not authorize any deployment.

Do not mark QA-02 resolved until genuine independent verification and accepted integration. QA-01 SellerKeys, QA-03 decimal option errors, QC-01 ledger test synchronization and the unresolved Mythril findings remain separate work owned by other tasks or unclaimed; no finding was suppressed.

## Next cycle

1. Read actual GitHub Actions results for the exact draft PR source (do not infer success while queued).
2. Repair only concrete failures without weakening requirements or test assertions.
3. Obtain independent verification and classify as implemented/verified/merge-ready independently.
4. Reinspect currently advancing PRs #306, #307, #308, #310 and integration lock state; the latter is a metadata-only branch and must never be merged/deleted.
5. If still blocked, preserve the isolated branch and PR; do not merge to main or deploy.
