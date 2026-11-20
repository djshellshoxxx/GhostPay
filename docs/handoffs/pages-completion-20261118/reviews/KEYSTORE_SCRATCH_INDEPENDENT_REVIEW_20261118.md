# Independent passphrase-scratch cleanup review — 2026-11-18

Reviewed commit: `e8c77e7e8699dd16b86b7a1ff90b834594d07105`.
Comparison base: `ea8f8d655caa9fa361cfbcfa3e4e41f474dfa929`.
Reviewer: branch-archaeology/security-tooling worker; author/coordinator: root worker.
No runtime or test source was edited by the reviewer.

## Finding and result

No introduced blocker was found in the bounded change. The old `derive` helper gave scrypt a temporary normalized
UTF-8 passphrase buffer inline and wiped only the returned derived key. The new helper owns `passBytes`, awaits the
same scrypt call, awaits the same AES-GCM import, and wipes both owned buffers from one `finally`. KDF parameters,
NFKC normalization, output size, allowed key uses and on-disk format are unchanged.

The input remains live while derivation is pending, so cleanup does not corrupt an asynchronous KDF. A KDF
rejection reaches `finally` before any raw key exists; optional raw cleanup handles that state. Import rejection
still wipes both buffers. The comment accurately limits erasure to owned byte arrays and does not claim deletion
of the caller's immutable string or any browser/library-managed copies.

The four regression cases test real encrypt/decrypt interoperability, KDF rejection, import rejection and the
pending-derivation lifetime. Their retained baseline run reports four failures; the coordinator's final focused
log reports **4 passed, 0 failed, 0 skipped**, Vitest 5.1.0, 621 ms. The reviewer read those logs but did not execute
a second overlapping test run. The full package/combined-candidate gate is independent of this focused result.

## Reviewed file identity

| File | SHA-256 |
|---|---|
| `packages/ux-vault/src/keystore-portable.ts` | `d934e2e968172a1edf4406257a875bcfd406063dc9dc4e9e6a8a6737180cc5b2` |
| `packages/ux-vault/src/keystore-portable-memory.test.ts` | `a0016d95953294ab6a99d0c55358d7318f3be96d1ca9b1e401a40c6819d6d0f0` |

Evidence: `qualification/keystore-memory-red.log`, `qualification/keystore-memory-green.log`, and the coordinator's
separate typecheck/lint/build logs. This is an AI-assisted source review, not a professional security audit.
