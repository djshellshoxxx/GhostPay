# Recovered-key authority and independent recovery qualification

## Source

Base: `b529a720cfbfa3c1056cc71085b4f163078e7591`, the existing master consolidation. Its Spec 18 source already combines PR #239 atomic wallet replacement and download retry with PR #240 exact-byte/BOM verification and PR #256 idle-session revocation. Comparing the earlier local reconstruction (`2176e4937a905d3c5603b5db9560d8675d0b51c5`) established that its feature source was already present. That duplicate reconstruction was not integrated.

## Reproduced residual defect

The recovered payment/master holders did not use the session's synchronous expiry boundary. Without a browser event or React subscriber, a recovered payment could still return raw private-key text after the idle deadline or a new wallet installation. A recovered master could replace the loaded wallet after expiration. Both asynchronous decrypt paths could hand keys to a caller after authority expired.

Six tests exercise those paths and the unchanged fresh, empty-session recovery control. On the source-pinned base, five fail and the control passes. The fix captures the recovery's session revision, checks it before and after each secret loan or installation, rechecks after asynchronous decryption, and disposes stale recovered boxes before propagating failure. An already-disposed holder retains its original closed-export behavior. Fresh recovery still needs no loaded seller wallet. Cryptographic formats and the existing consent UI are unchanged.

## Independent decoder compatibility

The fresh-directory recovery test used a Node permission flag that Node 24 rejects. It now selects the supported stable flag (or the earlier spelling when necessary), always enforces the same filesystem allowlist, and explicitly asserts that the original repository cannot be read. It never falls back to unrestricted execution.

## Executed evidence

- Baseline, `paymentKeyExport.expiry.test.ts`: **5 failed, 1 passed**.
- Fixed source, `paymentKeyExport.expiry.test.ts`, existing `paymentKeyExport.test.ts`, and `session.atomicity.test.ts`: **39 passed**, 3 files, zero failures or skips (Node 24.22.3, Vitest 5.1.0, serial worker with bounded heap).
- Independent Node 24 fresh-directory recovery: **1 passed**, covering all five file formats, archive recovery, master recovery of an omitted payment, and enforced repository-read denial.
- Node 22 focused replay and independent isolation replay are in progress at this source checkpoint.
- `git diff --check`: passed.
- Full typed ESLint of the two changed TypeScript files reached the explicit 512 MiB JavaScript heap limit and exited 134. It is not a lint pass; no rules were changed. Earlier broader builds/coverage attempts were resource-killed and are not used as qualification evidence.

Dependency cache versions match the base lockfile. This is focused engineering qualification. The coordinator must run required combined-source CI and independent review before promotion. No merge, release, mainnet, third-party-wallet, hardware, physical-sleep, or Tor Browser qualification is claimed.
