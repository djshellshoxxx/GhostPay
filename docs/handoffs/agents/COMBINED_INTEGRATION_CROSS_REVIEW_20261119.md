# Independent combined integration review — 2026-11-19

**Verdict: PASS for the scoped source integration and recorded local checks.**
Reviewer: `contract_security`. Runtime source:
`6fe060e370ccf168899796708ae4d6bed5e990ef`. Coordinator evidence packet:
`ccfe55c99c4d4aaac92d10aaec90fbcc6b0e0410`. No suite was rerun for this review.

## Source and interaction checks

| Integrated scope | Independently matched checkpoint | Files |
| --- | --- | --- |
| OP accounting, receipt-status guard and fixtures | `a2afd126b0276cda9ec0429657bbd130e17827ea` | 6 |
| Configured secondary and canonical announcer readback | `8238f66b6beafb46a7a2d1598e5c4c354819fc86` | 4 |
| Two create-pull-request action pins | `f42553ab44d2bf8f544f0287656bbc184679014d` | 2 |

All twelve files match byte-for-byte. The four OP production modules also match
the previously reviewed `de253aaf` runtime. The remaining OP fixture delta only
makes unused arguments explicit and preserves asynchronous fake-RPC behavior.
Prior reviews remain in [OP_FEE_SOURCE_REVIEW_20261119.md](OP_FEE_SOURCE_REVIEW_20261119.md)
and [ACTION_RUNTIME_CROSS_REVIEW_20261119.md](ACTION_RUNTIME_CROSS_REVIEW_20261119.md).

The readback change executes before transaction clients are returned or the
relayer server is constructed. When a manifest and secondary URL are configured,
startup verifies both chain identities and requires agreement for every getter
and code read. The existing helper throws if either provider fails or their
results differ. Known-chain manifests must name the existing canonical
announcer; unknown development-chain behavior remains supported. No provider is
selected implicitly, and wallet/public transaction transports remain unchanged.

This startup guard does not replace or bypass the separate OP receipt guard.
Receipt-status validation, canonical block-hash fee reads, fee reservation and
actual settlement remain in their previously reviewed modules. Manifest reads
still use `latest`; the canonical announcer policy is distinct from receipt
block canonicality. Provider agreement cannot establish independent backend
ownership or prevent two colluding endpoints from agreeing.

## Qualification evidence

Both committed TypeScript build receipts pass. The exact eight-file relayer
selection passes **246/246**, including mandatory Anvil, OP/status, restart,
startup and provider cases; the three-file deployment selection passes **64/64**.
Neither final selection skips tests. Recorded environment: Node **22.23.4**,
**512 MiB** heap, `REQUIRE_ANVIL=1`.

The initial relayer run remains **241 passed / 1 failed / 4 skipped**: the
mandatory prerequisite found Anvil but neither required compiled artifact.
Its command and source are identical to the successful rerun. The eight raw
evidence files, their manifest and coordinator narrative match the pinned
evidence commit and their SHA-256 records.

The reviewer independently checked the copied artifact bytes and all **29**
unique source Keccak hashes from both artifacts against the exact runtime Git
objects and current files. Raw and parsed metadata agree on their complete
source maps and compiler identity. Foundry's parsed metadata normalizes other
documentation/default fields and remapping text; no whole-metadata-object
equality is claimed. Both artifacts record Solidity **0.8.28**, Cancun and
optimizer runs **200**. This verifies reuse of the existing artifacts, not a new
Foundry compilation or reproducible-bytecode campaign.

The [machine record](COMBINED_INTEGRATION_CROSS_REVIEW_20261119.json) contains
exact source hashes, receipt identities and artifact checks. Its
[read-only verifier](evidence/combined-integration-cross-review-20261119/verify.mjs)
uses local Git objects, artifact files and the checkout's existing Keccak helper;
it performs no RPC, EVM execution or compilation.

## Remaining qualification

The selected results do not establish full coverage, whole-workspace or full
test-source typechecking, public OP fee acceptance, or browser acceptance. The
known synthetic devnet announcer mismatch is a separate fixture-owner follow-up;
this review does not waive the strengthened readback or introduce browser skips.
Hosted checks on the resulting candidate and the unchanged strict Mythril
failure/owner decisions remain outstanding.
