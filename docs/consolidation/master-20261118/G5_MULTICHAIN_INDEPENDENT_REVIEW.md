# Independent source review: #211 G5 Solana/TRON interoperability recovery

Reviewed 2026-11-19 by the CI/release review lane. Candidate `8c81265de08b821e6062d02baa26ba3b80571f9f`, base `736f1056537c79dbb0d2be3cd9cf071d0470bb24`, worktree `GhostPay-multichain-recovery`. Original PR: https://github.com/djshellshoxxx/GhostPay/pull/211 at `a92658b1ef6b95ff0145b2e1933d0047d51289d5`.

## Decision

No blocking source finding in the selected recovery. The port restores compatibility with the repository's already-existing web Solana and TRON formats; it does not introduce a new protocol. The source is suitable to integrate subject to the author's bounded tests and the combined candidate's applicable hosted checks. This is an independent source review, not a claim of successful local tests, external cryptographic audit, live chain interoperability, release readiness, or deployment approval.

## Provenance and preservation

`g5-multichain-independent-blobs.json` records the exact candidate/base/source blobs. All **34 selected product, test, vector and package-documentation paths** are byte-identical to original PR #211. The only additional changed path is the append-only ownership claim in `docs/ai/ACTIVE_WORK.md`. The eight cherry-picks preserve their original source hashes in their commit messages:

- `e2427c20387aa2e228309c49a1558d3edc6583ce`: shared web-format vectors and generator.
- `179a5b433f35396ca4f0961c99226dbb38e4e4cd`: chain-solana ADR-0017 compatibility.
- `28ce8a0b6fe22458505da6a77ae7c7cf81db8864`: chain-tron ADR-0019 meta-address and GPT1 memo.
- `c3d7d70207f74df4a6857231647dcf1ab87122c5`: CLI fixture compatibility.
- `b9af22a9c85c6a8674d8ac72d7f038954ce713b9`: TRON build rejection when the memo cannot be bound.
- `67a3c3c0f305eb0f82414c3623300a81afd59cc3`: CLI Solana cluster reporting and mainnet rejection.
- `b79bb24a81e254b3ca06501c8669c54403a19f0a`: fixed legacy-format error propagation.
- `90146562b7f7809746966edbedccb4a4e68e8a68`: TRON build limitation documentation.

Fourteen sampled boundary files are unchanged from the combined base: Solana point/scalar/RNG/signer implementations; the three affected package manifests; root manifest/lock; and the existing web Solana/TRON meta, derivation, announcement and scanner implementations. No workflow, dependency version, scanner exclusion or coverage threshold changes occur in this delta. `git diff --check 736f1056 8c81265d` passes.

## Cryptography and format review

The final Solana implementation matches `docs/adr/ADR-0017-solana-stealth.md` and the actual `packages/solana-stealth` source: `st:sol:` encodes version, cluster, spend/view points and the length-prefixed domain-separated SHA-256 checksum; `Z = rV`; the SHA-512 tweak binds `R`, `Z` and `S`; the SHA-256 view tag binds `R` and `Z`; and the memo is `gpst1:` plus base58 of exactly `R(32) || tag(1)`. Removing the previous multiplication by eight is justified by the unchanged `decodePrimeOrderPoint` boundary: all external points must re-encode canonically and be nonidentity, nonsmall-order and torsion-free before secret multiplication. The local deterministic signing nonce domain and byte construction remain unchanged.

Legacy `gpsol:` strings and the former base64url memo are rejected. Cluster bytes are checked and adapter parsing/building enforces the selected devnet/testnet cluster. Equal spend/view keys still fail with `KEY_REUSE`, deliberately stricter than the web decoder; the differential tests explicitly describe that difference. Nonempty metadata is rejected by the interoperable memo encoder rather than silently lost. The package's separate binary announcement format remains documented as an experimental event form, while the Solana adapter returns the compatible memo alongside its existing public derivation result. It still does not build or broadcast a transaction.

The final TRON implementation matches `docs/adr/ADR-0019-tron.md` and `packages/tron-adapter/src/meta.ts`: `st:trx:0x` translates internally to the unchanged core scheme-1 decoder and derivation, retaining compressed-point and distinct-key checks. It produces the same address conversion and exactly 38 bytes of `GPT1 || R(33) || tag(1)`. Public `st:eth:0x` input is rejected with the explicit legacy code rather than silently changing chain interpretation. Memo parsing copies the untrusted point bytes; the subsequent core announcement checker remains responsible for point validation and full ownership/address matching.

## Payment and error boundaries

`packages/chain-tron/src/adapter.ts` retains input validation for meta-address, owner/token address, positive uint256 amount and bounded positive fee limit. Its `build()` now always throws `MEMO_NOT_BOUND` before RNG or derivation. This is warranted: the old node-trigger body cannot bind the GPT1 memo into the signed `raw_data.data`, while the actual web scanner checks that memo against decoded `raw_data_hex` and the transaction hash. Returning an apparently payable request would risk an undiscoverable payment. The selected test verifies rejection and zero RNG draws. Fee capability remains unenforceable, and this recovery adds no network call or broadcast.

The CLI's Solana inspector reports the decoded cluster, permits only its existing experimental non-mainnet inspection surfaces and refuses a mainnet recipient. Error propagation is restricted to genuine `SolanaStealthError`/`TronError` instances with the fixed `LEGACY_META_ADDRESS` code; ordinary chain errors and lookalike objects stay generic. The regression checks both a useful fixed-format explanation and absence of the original recipient payload in the error output.

## Test quality and limits

The new tests compare both implementations directly, use shared vectors generated from the existing web packages, retain the existing independently recomputed web vector corpus, and exercise randomized round trips in both directions. They check invalid encodings, cluster mismatch, the intentional equal-key rejection difference, legacy formats, exact derivation/memo fields, ownership detection and derived spend scalars. This supplies meaningful interoperability coverage rather than merely duplicating an encoder with its own decoder.

The history lane owns current bounded package/CLI execution. No test, build, install, validator, RPC request, wallet action, container or remote mutation was run by this reviewer. Metrics in the cherry-picked package documentation are historical author results and must not be presented as this candidate's independently rerun results. The wider repository's release/analyzer blockers and the existing unaudited/testnet limitations remain unchanged.
