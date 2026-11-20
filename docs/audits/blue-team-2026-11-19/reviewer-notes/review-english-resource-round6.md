> Reviewer checkpoint. Earlier pending lists describe the time of that handoff. Final completion and finding dispositions are authoritative in [coverage.md](../coverage.md) and [findings.md](../findings.md). Earlier BROWSER-01 wording about absent Pay route coverage is superseded by the correction in the canonical register.

# English resource review — round 6

## Outcome

All four unique `apps/web/locales/en.json` blobs in `source-scope.json` have complete **composed** review coverage. No additional distinct core finding was established. The receipt-file help text adds corroborating evidence to **PN-05**. Independent source inspection also confirms **ROOT-Q01** and **ROOT-Q02** as test qualification gaps.

No application, contract, test, build, mutation or network probe was executed. No source or configuration file was changed.

## Exact coverage and inherited work

| English resource blob | Representative source SHA | Lines | Method |
|---|---|---:|---|
| `f37853282e922f1817b948d5bada66dc84c3ad34` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` | 2,530 | Root's inherited ranges 1–300 and 966–987, plus this worker's complete numbered reads of 301–965 and 988–2530 |
| `cc7464eac7f565bff3f08849e82b0533c176cd09` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | 2,262 | Composed base plus every line of the complete 325-line candidate-to-main zero-context blob diff |
| `b35b0ee93bca647a80ddd12d1a49dee86845409b` | `137628961463fc5abd8b7927b2efe6b18a0a206a` | 2,549 | Composed base plus complete quick-hide diff |
| `a8e46fafce5cacc633239ef044ce1c91ed766870` | `e4d54a6829fcc861de7af1669c0e0f64f62aa137` | 2,513 | Composed base plus complete diff; this variant only deletes the 17-line native-review block |

Principal candidate `e22c1748a3de6eb02f5be3abe27d634b238c67c6` resolves to the first blob. Frozen main `c977b5d6723f6822c3b5d86cd6b231712c53c395` resolves to the second. Both identities were checked separately with read-only Git object queries.

This worker independently read **2,208 remaining candidate lines**. The other **322 candidate lines** are explicitly credited to root's `review-root.json:partial_coverage`. No independent full-file read of any English version is claimed. The JSON report records exact unchanged target ranges inherited through each diff, including the ranges that transitively originate in root's work.

Source text was read in chunks of at most 100 lines. An initial aggregate-output truncation affecting candidate lines 301–400 was repaired by rereading that entire chunk. Initial broad metadata output was also truncated; subsequent targeted JSON reads supplied the coverage metadata.

## PN-05: additional confirmed wording evidence

At the candidate, `help.receiptFile` in `apps/web/locales/en.json:2062` says verification checks exact recipient binding when the required invoice context is available. The actual Pay import field renders this help at `apps/web/src/views/Pay.tsx:1256`.

The import path supplies the prepared one-time address when its context is current (`Pay.tsx:678–687`). The shared binder nevertheless compares that address only when the receipt itself contains `stealthAddress` (`packages/invoice-schema/src/receipts.ts:147–155`). A valid minimal receipt intentionally omits the address, so there is no recipient comparison even with the prepared payment context.

This is the **same issue already recorded as PN-05**, not a new finding or severity. Its correction should cover both `pay.receipt.intro` and `help.receiptFile`, while preserving the intended minimal receipt format. Signature, invoice digest, chain, asset and amount checking remain separate. The resource's surrounding receipt text correctly limits the signature to seller-key attestation and does not claim independent chain proof.

All anchors above use candidate `e22c1748a3de6eb02f5be3abe27d634b238c67c6`. The source blobs independently inspected for this corroboration were `a991e6aa7ac6bb2cea5758a1d79409c513758311` for the receipt binder and `c44a7789d5c0a7c9952944c11e5dfcbdd00ba099` for Pay.

## ROOT-Q01: independently confirmed qualification gap

Complete independent candidate reads:

- `packages/contracts/test/GhostPayRouter.invariant.t.sol`, blob `bd526370803a3098359f8e3d70661edf26edd2be`, lines 1–236.
- `packages/contracts/foundry.toml`, blob `59bf7337ea5fe8526869f22e9595e022027b4712`, lines 1–42.

The `payBadMetadata` handler calls the router with deliberately inconsistent metadata, then executes `revert("bad metadata accepted")` if that call succeeds (lines 103–119). The success-body revert is a handler revert; it does not persist an acceptance result for a later invariant. The configured run has `fail_on_revert = false` (configuration line 26). Its selected handlers include this action (lines 185–191), but the invariant assertions at lines 201–235 contain no persistent bad-metadata acceptance check.

An unexpected successful router call followed by this handler revert is rolled back, including the router's state changes. The action therefore does not independently establish metadata rejection under this configuration. Root's classification as a **test qualification gap** is supported; this does not demonstrate that the runtime router accepts invalid metadata.

Separate guards exist. This worker narrowly inspected explicit unit assertions for invalid metadata at `GhostPayRouter.t.sol:339–373` and the metadata-amount fuzz assertion at `GhostPayRouter.fuzz.t.sol:84–99`. Persisting unexpected success in a dedicated counter or flag, with a corresponding invariant assertion, would make this handler's intended qualification explicit.

## ROOT-Q02: independently confirmed qualification gap

Complete independent candidate reads:

- `packages/contracts/test/echidna/EchidnaRouter.sol`, blob `ec05b5b11a522ab32ec666d2af277db3357d445d`, lines 1–204.
- `packages/contracts/test/mocks/FeeOnTransferToken.sol`, blob `faaa773c23969663e2f2bfa154555dbdf2035631`, lines 1–27.

`payFotToken` has empty success and catch bodies (Echidna lines 93–107). It records no unexpected acceptance. The property at lines 168–170 checks that the router retains no fee-on-transfer token; the recipient accounting properties at lines 173–185 use the ordinary token. The canaries at lines 188–203 likewise do not track exercise of the lossy-token rejection path.

The mock rounds its burn upward at line 21, so each nonzero transfer is lossy. If lossy forwarding were to succeed while leaving no such token at the router, these properties would not independently reject that outcome. This is a **test qualification gap**, not evidence of a current runtime bypass.

The separate Foundry unit rejection at `GhostPayRouter.t.sol:447–458` and the invariant at `GhostPayRouter.invariant.t.sol:230–235` were also inspected. Recording successful lossy-token calls as a persistent property failure would express the Echidna harness's stated requirement directly; negative-path exercise should be tracked separately.

## Scope limits and remaining work

No assigned English resource range or requested ROOT-Q check remains. The companion JSON contains exact coverage, supplementary partial reads and source pins.

Bitcoin, Solana, TRON, policy, merchant and other optional-feature strings occur inside the shared resource. Their incidental reading did not add their runtime implementations to audit scope. The copy review does not certify every behavior described in the catalog. Existing BROWSER-01, PN-01 through PN-05 and SN-K01 were not duplicated. Root owns integration into the final audit notes.
