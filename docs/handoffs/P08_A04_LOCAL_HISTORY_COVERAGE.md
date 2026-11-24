# P08-A04 local history coverage

The `feature/p08-local-history-coverage` branch starts at the [owning P08 specification](https://github.com/djshellshoxxx/GhostPay/tree/80bc065fa666b31445ad6a1078e0d751dcfe4259). Main was `e0cb4681e453af77bb10be45ba61b4d19579f41b`. The parent specification's documentation claim and the ledger sources shared by #341 and #372 are preserved. Worker `/root/store` owns the two new files under `packages/hygiene/src/future/linkability/`, this note and an additive task claim.

The internal classifier consumes a trusted local provider result. A complete snapshot for the requested chain, profile and immutable history revision distinguishes zero observations from a populated local history. Missing, partial, imported, unscoped, mismatched, stale or out-of-bounds evidence yields unknown coverage. The output contains only a coverage classification.

The existing destination ledger supplies rows filtered by chain, but has no profile/revision completeness attestation. An empty row list or a scanner block-range coverage claim cannot establish complete local destination history. The fixtures explicitly supply that missing contract for a single synthetic profile and immutable revision. No production adapter, package entry-point export, network call, risk rule or Pages consumer has been introduced. The next integration step is a reviewed local provider that attests the requested scope and counts only observations within it.

## Qualification

Source commit [6f582107](https://github.com/djshellshoxxx/GhostPay/commit/6f5821072f4de73a1bd22a9d9b381a44fee471f6) has the independently reviewed tree `0d4f473a28ad807f2d01664183a3f311913995c8`. The original focused test on the unimplemented spec line failed to import the missing classifier. Independent review found the initial fixture counted the whole ledger. The corrected controls include a second testnet and demonstrate both an empty and populated selected chain. The independent reviewer reran all 14 targeted tests and measured 100% new-module coverage. The seeded property ran 256 cases with seed `20261124`.

The following commands passed from the repository root using a byte-identical dependency lockfile and source-equivalent workspace libraries.

```sh
npm run test -w @ghostpay/hygiene -- --maxWorkers=1
npm run typecheck -w @ghostpay/hygiene
npm run build -w @ghostpay/hygiene
NODE_OPTIONS=--max-old-space-size=320 npm run lint -w @ghostpay/hygiene
npm run ci:scan-secrets
npm run ci:check-actions
npm run ci:check-tx-origin
git diff --check 80bc065f..HEAD
```

All 156 tests passed. Full hygiene package coverage was 100% for statements, functions and lines, and 99.69% for branches (325/326). The uncovered branch is in the existing ledger. Pages profile qualification and hosted review of the composed tree remain integration gates.
