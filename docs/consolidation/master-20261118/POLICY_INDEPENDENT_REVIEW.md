# Policy validation recovery: independent source review

Date: 2026-11-19. Implementation reviewed: `63e67ff403c5daf45dbec5bf500a24ac386b6342`, compared with ownership checkpoint `6316b0c4` on the runtime-recovery branch. Reviewer: independent CI/release reviewer, separate from the recovery author.

## Result

No blocking source finding was found in the 11-path recovered policy validation delta. This is source review only. No tests, coverage, builds, lint, typechecks, deployments or remote mutations were performed by this reviewer. Exact combined-head hosted qualification remains required.

## Crypto and custody review

The signer reconstructs the digest before revealing a secret copy. It captures the supplied top-level fields once, restricts the primary type and field specification to the four policy-account structs, requires the expected domain fields/name/version and a valid chain/account, rejects own/hidden/inherited salt, validates message primitives into a new local record, and recomputes the struct/domain digest. The manual ABI hash and viem typed-data hash must agree, and the caller's claimed digest must match. Signing and signature recovery subsequently use only the recomputed local digest, so a later getter cannot substitute a Permit or a different digest. The key copy remains protected by finally zeroization, including owner mismatch and signing failure paths.

The new shared struct-hash helper preserves the original type hashes, field order and ABI types. It introduces no cryptographic primitive, derivation, scheme identifier or serialized signing-format change. As the documentation states, field-shape validation is not a substitute for builder-level amount/deadline/destination policy. expectedOwner remains optional; the review does not expand that existing API guarantee.

The withdrawal builder recomputes a proof leaf from the selected token, limit and uint64 window, in addition to verifying membership. The inspected PolicyAccount.requestWithdraw implementation uses the same double-hashed ABI leaf. This prevents an inflated limit, another token, changed window or inner-node/root substitution from being accepted under an unrelated genuine proof. Restored limit trees receive the same field-to-leaf check before their proof fields are returned.

Announcement checking now completes public argument validation before creating its viewing-secret copy. Every subsequent path is inside the existing try/finally. This avoids a live copy on invalid policy hash or deployment arguments without changing scheme derivation or mismatch behavior.

## Payment boundary review

The decoder re-encodes the ABI call and requires exact canonical bytes, rejects nonpayment methods, verifies the predicted policy account, validates the compressed ephemeral point, and parses router metadata. ERC-20 metadata must name the call's token, contain gross minus the fixed fee, and satisfy minNet. Native calldata cannot independently verify msg.value, and the decoder documentation preserves that limitation.

Both prepare and final send compare the decoded method/account/owner/policy hash/R/metadata against the locally derived payment, including the derived view-tag prefix. Existing review-byte identity, router, token, amount, session, chain, deadline, approval and duplicate-attempt checks remain. Final authority checks still run through the existing wallet submission boundary after asynchronous work.

The examined regressions include self-consistent foreign Permit/type/domain variants, shape and digest-swapping getters, hidden/inherited salt, malformed values, original builder outputs, inflated/restored/inner-node limit leaves, secret-copy tracking, canonical calldata, valid but different R, changed view tags, simultaneous metadata changes, and zero wallet sends on rejection. The updated token/amount fixtures keep metadata internally consistent so their intended final comparison remains exercised.

This delta does not claim asset-coverage UI, generalized multichain support, deployment readiness, or full policy-feature completion.

## Reviewed Git blobs

| Path | Blob |
|---|---|
| apps/web/src/features/policy/pay.selfcheck.test.ts | a719bc51a3a4cb227e20ddcdf7ccd0e650f8ab9d |
| apps/web/src/features/policy/pay.ts | 1da6869e3d9322004d29ede85ac20923f31d1777 |
| apps/web/src/features/policy/send.test.ts | aa1b08c198e72dc55854551183670d37061984b0 |
| apps/web/src/features/policy/send.ts | 04ac08be009c2942b394f35975171325738ce12a |
| packages/policy-scheme/README.md | ac0576535fc4c0fec527d4b0d944761a5e4c5560 |
| packages/policy-scheme/src/derive.ts | ce4be42c09dec5e77b34f185c2af717687143330 |
| packages/policy-scheme/src/eip712.ts | 2f7679ede1e91ad43690fbe3f6fbfc4ab65910d7 |
| packages/policy-scheme/src/limits.ts | 2836251024e902ab3bbfd203b90f6ebacd42a9db |
| packages/policy-scheme/src/negative.test.ts | 2c165a79511ed3cec13f5aeb8d4c403aea64f14d |
| packages/policy-scheme/src/router.test.ts | 1dac985854f331b2d0c1887e7d87d874b9d47c3f |
| packages/policy-scheme/src/router.ts | 35f20d3f07e02f42fac244552f4b50bce292402f |
