# Independent Bitcoin preview source review

Reviewer: `/root/branch_recovery`. Author/qualification worker:
`/root/security_recovery`. Date: 20 November 2026 (Pacific).

Result: **APPROVED for the bounded source change**, with no blocking finding.
This is independent source review, not an independently executed test suite or
approval to merge an unqualified combined candidate.

## Exact inputs and scope

- Reviewed composition: `cd5f01ff1d6fef2041654d213509d1a1ec3e0be6`.
- Common worker base: `95a1e93c62bbc378e02716a23c05a1993d0f79db`.
- Existing donor PR #338: `692cac58b1c345137264936e60bee7b1e2eed8b2`.
- `packages/btc-silent-payments/src/spend.ts`: mode `100644`, blob
  `4bd08c0b56f7321e0ea06941e4f48e0659f66273`.
- `packages/btc-silent-payments/src/spend.preview.network.test.ts`: mode `100644`,
  blob `8ffcf80a6a37178fe36ada08340e58fb43926a17`.

Both product/test mode-and-blob tuples equal the existing donor exactly. The
composition differs from its common base only in these two paths and the additive
ownership registry. The author has not silently rewritten the original fix.

## Source reasoning

`previewSweep` now passes a recognized silent-payment address and the selected
network to the existing strict decoder before vsize, fee or send-amount preview.
That decoder validates canonical case, Bech32m encoding, the network HRP,
supported version, payload length and compressed public points. Network mismatch
and malformed-input errors retain their existing typed error behavior. It reads
public address data only, with no network or spending-key access.

The regular-address script path, signing path, fee-rate bounds, dust checks,
amount summation, vsize formula and fee-share limit are unchanged. Matching-network
inputs therefore retain the existing calculations. The test exercises both
mainnet/testnet mismatch directions, a malformed prefix and legitimate network
controls with explicit vsize/fee/send-amount assertions.

Nonblocking documentation debt: `previewSweep`'s existing `@throws` list does not
enumerate the strict decoder's `NETWORK_MISMATCH`, `UNSUPPORTED_VERSION` and
`INVALID_POINT` variants. The donor's source behavior is consistent with the
declared preview/signing validation contract; this omission does not weaken it.

## Execution boundary

Reviewer executed Git diff and exact mode/blob comparisons and inspected the
decoder, preview and tests. The reviewer did **not** rerun Vitest, typecheck, lint,
browser tests, live chain operations or whole-package qualification. The author
reported separate RED/GREEN evidence and an interrupted full-suite attempt;
those outcomes belong to the author's evidence and are not relabeled here.
Final integration remains coordinator-owned and subject to the lease and exact
combined-source gates.
