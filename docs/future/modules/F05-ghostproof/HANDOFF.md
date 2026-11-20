> **Coordinator update — 2026-11-20:** Current-main integration, whole-web TypeScript, scoped typed lint, module coverage, lean build and bundle validation now pass. See [COORDINATOR_VERIFICATION.md](COORDINATOR_VERIFICATION.md) and [PUBLICATION.json](PUBLICATION.json). Earlier pending/resource statements below are historical; hosted CI and full feature/UI integration remain separate.

# F05 offline receipt review handoff — 2026-11-20

## Source and scope

- Branch: `future/f05-ghostproof`.
- Original specification: `a241d0a5556c23bf2670f6ba17e7c928b41d7eb4`.
- Main reconciled: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
- Main/spec reconciliation: `7d64e0f4` (only ownership-registry conflict; both sets of claims retained).
- Product and tests: `726d16dc560f8b12e4c71f6c04895fd1dcbd34f4`.
- Worker: `future_features/f05_ghostproof`; coordinator owns publication and independent review.

Owned source is `apps/web/src/features/future/ghostproof/`. The only dependency
change declares the existing workspace `@ghostpay/ux-receipts` for the web app and
adds its matching lockfile entry. No external dependency version or integrity
changed. Existing receipt providers, live receipt UI and active fixes remain separate.

## Independent review correction — 2026-11-20

- Latest product correction: `d44604ce463cec708c77a230b068f0ac44669280`.
- Complete canonical invoice-binding strings are now required; deliberate trimming
  of caller-configured trusted signer pins is preserved.
- The independent reviewer inspected the full milestone and this two-file follow-up.
  Final focused replay passes **67/67 tests in 2 files**; the original 62-test and
  coverage results below remain pinned to the initial product commit.
- [Independent review](INDEPENDENT_REVIEW.md) records source identities, the resolved
  observation and both actual replay results. No introduced blocking defect remains
  in the reviewed milestone. Whole-web checks, browser/provider integration and
  production activation remain separate gates.

## Delivered behavior

`reviewReceipt(text, options)` checks serialized receipts with the shared strict
JSON parser and real digest/signature providers. Duplicate fields, unknown fields,
unknown formats, invalid signatures/digests, invalid clocks and oversized input
return fixed errors without echoing input. The signed format retains its 65,536
UTF-8-byte cap; the unsigned format retains its stricter 8,192 UTF-16-unit cap.
Existing parser depth and safe-integer limits remain in force.

The immutable review keeps separate dimensions:

| Dimension | Result meaning |
|---|---|
| Digest assurance | `self_consistent_unverified`; this format has no signature |
| Signature assurance | `signed_statement`; the existing signature validates |
| Signer trust | No signer, embedded key only, verified invoice key, or explicitly supplied trusted key |
| Invoice binding | Fields match supplied invoice context, or no binding was checked |
| Invoice authentication | Caller verified the invoice, did not verify it, or supplied none |
| Chain/freshness | Always `not-checked` / `unknown` in this offline adapter |

A supplied signer pin is a requirement: a different valid invoice key cannot
bypass it. Binding checks invoice digest, chain, asset, amount and optional
transaction/recipient through the existing provider. A matching pin does not
authenticate an unsigned invoice. The caller must obtain binding context from
its verified invoice workflow; imported receipt fields cannot establish trust.

Every disclosed field is immutable plain text. Withheld fields are not reconstructed.
No generic payment-success flag, explorer request, wallet call, storage write,
automatic export or network-verifier port exists. Payment finality, funds ownership,
audience/challenge binding and zero-knowledge claims remain unsupported.

`createReceiptImportSession()` holds one current review. Aborting the caller's
session signal clears pending or completed state. New imports supersede previous
ones, and late digest results cannot restore old state. Clear/dispose remove
listeners, abort owned work and discard the review. Malformed options and failed
listener installation return typed errors without stranding `checking`. Options
and binding terms are copied before work; accessors are rejected without invocation.

Callers must abort on lock/identity changes and discard any view they previously
retained. JavaScript cannot revoke already returned copies or guarantee zeroization.
WebCrypto may finish after cancellation; its late result is discarded.

## Qualification

Author checks used the normal repository Vite/Vitest configuration with one worker.
No repository threshold, timeout, assertion or global exclusion was weakened.

- **62 tests passed, 0 failed**, including real signatures and digests, wrong invoice
  and pin, malformed/oversized formats, unsupported claims, no network, cancellation,
  late completion, supersession, disposal and error-path cleanup.
- Scoped runtime coverage: **98.66% statements, 98.11% branches, 100% functions,
  99.09% lines**; original 90/85/90/90 thresholds passed.
- Scoped strict TypeScript for source/tests passed with ES2022, Bundler, strict,
  unchecked-index access and exact optional properties.
- Scoped repository ESLint passed. Initial lint failures were three redundant
  type assertions and two multiline test-call layouts, fixed without suppression.
- `git diff --check` passed before the product commit.

Exact product-head replay logs: [focused tests](verification/focused-tests.txt)
and [scoped typecheck](verification/scoped-typecheck.txt).
The first test attempt could not load the Vite configuration because an unrelated
`chain-adapters` build was missing; no assertions ran. After the coordinator built
baseline libraries and copied source-identical artifacts, configured tests passed.

Whole-web typecheck/build, combined integration, independent review and hosted/browser
qualification are coordinator-owned, not asserted here. The initial coordinator
whole-web typecheck was killed by the OS with exit 137 and no TypeScript diagnostic;
a serial retry is pending. No UI, device, wallet, chain or P12 proof-provider
qualification is implied by the author unit results.

## Acceptance and remaining work

| Spec case | This milestone |
|---|---|
| F05-A01 | Digest stays self-consistent/unverified |
| F05-A02 | Signed invoice/asset/chain/amount and optional payment-fact mismatch rejection |
| F05-A03 | Audience/challenge proof unavailable; no new proof format |
| F05-A04 | Tamper rejection for current digest/signature formats; selective proofs pending |
| F05-A05 | Offline review; no network verifier and fetch unused |
| F05-A06 | Chain/freshness stay unchecked/unknown; lookup not implemented |
| F05-A07 | Import lifecycle covered; generation pending |
| F05-A08 | Existing-format caps and unknown-format rejection; P12 artifacts pending |
| F05-A09 | No settlement claim offered; reorg-aware generation pending |
| F05-A10 | Immutable review; generation/export consent pending |

Next bounded task: build a localized, accessible import-review component using this
adapter and the application's real session signal, still disabled. Qualify file
size before allocation, keyboard flow, clear/dispose and stale render suppression,
and offline egress. Then integrate P12/P05-backed evidence selection and generation
only when those providers are implemented and independently reviewed. Do not label
ordinary receipts as selective-disclosure proofs or enable a route based on unit
test success alone. No production route imports this module.

## Research and reuse

The coordinator consulted the primary [W3C Verifiable Credentials Data Model 2.0](https://www.w3.org/TR/vc-data-model-2.0/)
terminology/trust model, which separates cryptographic verification from claim truth
and issuer trust. This supports separate assurance, trust and chain-evidence labels;
GhostPay does not implement that standard here. No external implementation code
was copied. Existing GhostPay parsers and cryptography retain format ownership.
