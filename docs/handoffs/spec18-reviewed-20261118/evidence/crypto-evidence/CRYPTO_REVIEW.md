# Spec 18 independent crypto and recovery review

Base: PR #238 `198aa5baff22272453733a0f3dcfcac0e0994eec`; fixed candidate snapshot committed by the coordinator as `1e3c3466`. Final reviewed source is `7c1e710a0a4bd38928b3b74814ba4b0ec4865305`; exact reviewed file hashes are recorded in `source-manifest.json`. This is an AI-assisted review, not a professional audit or release qualification.

## Scope and results

Reviewed the portable export codec, its unit/property tests, standalone reference reader and tests, normative formats, deterministic vectors, and independent recovery instructions. Scope is ERC-5564 scheme-1 EVM EOAs only. No new format, KDF cost, derivation, dependency, account model or network was introduced.

The existing codec authenticates every header field with domain-separated AES-GCM, validates exact schemas before KDF work, bounds scrypt parameters and input sizes, uses fresh salt/IVs, rejects duplicate addresses, checks every decrypted scalar against its public identity, and fails atomically. The master pair excludes the invoice-signing key; the viewing-key plus payment-key authority expansion is disclosed. The standalone reader independently reconstructs all supported formats with built-in crypto and the two pinned noble dependencies.

## Confirmed finding and fix

**RECOVERY-PIPE-WIPE (low):** The standalone reader wiped piped passphrase buffers only after successful iteration. An input error or cancellation after one chunk left that chunk intact. A new `main()` regression supplied synthetic bytes and an error containing the same marker: the error remained redacted, but the test failed with `input failure retained passphrase bytes`. The fix moves cleanup to `finally`, erases the complete buffer and every received mutable chunk, and avoids an argument spread over unbounded input chunks. The regression then passed. Immutable strings and engine copies remain outside best-effort erasure.

No additional crypto or offline recovery blocker was found in this review. This conclusion is bounded to the inspected code and executed tests. Browser UI, lifecycle and full product release gates are separate.

## Executed evidence

- Node 22.23.5 standalone recovery: 22/22 passed, including fresh read-restricted directories with no GhostPay packages, all five formats, archive authority and master derivation of an omitted payment. No test skipped.
- Foundry 1.8.5 `cast` and Anvil at commit `51a52c59cffd940f76eddd0b4bb1791aa4b5ac7f`, `REQUIRE_ANVIL=1`: raw-key address reconstruction and successful signed loopback transfer passed 1/1. No public network or real funds.
- Candidate ux-vault TypeScript build and full typecheck: exit 0.
- Core crypto original coverage suite: 76/76 passed across 10 files; statements 98.5%, branches 98.16%, functions 100%, lines 98.21%.
- Final standalone rerun after the final cleanup loop: 22/22 passed on the ending source, with zero failures or skips.
- First original vault coverage run: exit 1, 262 tests passed but two workers received SIGKILL (`portable-parity.test.ts`, `stealth-export-portable.test.ts`). Coverage was incomplete and thresholds failed. Kill cause unproven. The serialized retry passed all 353 tests across 10 files with original thresholds unchanged: statements 97%, branches 94.24%, functions 99.5%, lines 98.89%. Runtime was 170.85 s; `RUSAGE_CHILDREN` maximum was 455,032 KiB (not aggregate simultaneous process-tree memory).

The exact commands, outcomes and logs must be read with their source identities. A coverage failure or unavailable browser assertion must not be reported as a pass.
