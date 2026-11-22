# GP-BUG-R11 — vault unpadded base64url noncanonical trailing-bit aliases

## Exact source and scope
- Repository: https://github.com/djshellshoxxx/GhostPay
- Live baseline `main`: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Isolated branch: `automation/20261122-r11/bug/ux-vault-base64url-padbits`.
- Paths owned: `packages/ux-vault/src/bytes.ts`; new `packages/ux-vault/src/bytes.canonical.test.ts`; this handoff and additive claim in `docs/ai/ACTIVE_WORK.md`.
- Original source Git blob `9226a2d55abaf930c9d5a358e348f4d69944f479`; repaired source Git blob `3f1d304ae672da0d28cc9036b4f33786aef757af`. Local source files matched both exact Git blob hashes before source-equivalent replay.
- Original `errors.ts` Git blob `2f57fff99485eeca67622fa2356915c4a99f0356`.

## Observed defect (not a hypothetical hardening recommendation)
The exported `fromBase64Url()` in `packages/ux-vault/src/bytes.ts` already rejects padding, extra whitespace, invalid alphabet and base64url strings with length modulo four equal to one. However, native `atob` ignores nonzero **unused trailing bits** in the final base64url sextet. Consequently, multiple different text strings decode to identical vault bytes. `backupFromText()` calls this decoder, so the printable backup input also accepted these aliases even though its inverse promises a strict text representation.

Before repair, hash-matched TypeScript 5.8.3 / Node.js 22.16.0 reproduction:
- `Zh` and `Zi` decoded to the same `0x66` byte as canonical `Zg`.
- `AB` decoded to the same `0x00` byte as canonical `AA`.
- `AR` decoded to the same `0x01` byte as canonical `AQ`.
- `-_9` decoded to the same `0xfbff` bytes as canonical `-_8`.
- Five dedicated alias-rejection checks failed; 13 canonical, malformed-input and round-trip checks passed (18 total).

Root cause: validation of allowed characters and encoded length without verifying RFC 4648 unused pad bits are zero.

## Test-first implementation
1. Ownership claim commit `abe307c461c0b56c7aa7ec1b58bf52f9014b8cf1`, created before edits.
2. New dedicated Vitest regression commit `ad1d10e69cef9456630287fbaa6b5283751987d2`, before production repair.
3. Production fix commit `87ae713b28c7090f0f923794fb24e445cd8a2f2a`, six lines checking that the final sextet has no unused low bits when encoded length mod 4 is 2 or 3. Existing `VaultError('INVALID_INPUT')` and native decoding behavior otherwise preserved.
4. Recompiled exact repaired source blob with TypeScript 5.8.3 and executed on Node.js 22.16.0: **18/18 standalone assertions passed**, including all five prior failures, eight canonical samples and five malformed samples; separately **1,024 randomized byte-array encode/decode round-trips passed** and **10,800 noncanonical-variant probes rejected**.

These are *standalone hash-matched source checks*, not repository Vitest. Full workspace tests, lint, typecheck, build and native browser verification were not run locally; GitHub Actions on the eventual exact PR head remains authoritative.

## Ownership, review and integration gates
- The open PR inventory at the source-claim snapshot included **242 open PRs**, across three fully paged GitHub REST pages (100 + 100 + 42). Each changed-file list was individually checked against the two owned source/test paths; none overlapped. Recheck the current inventory before integration.
- PR #390 checked at head `b655bc273a6704c9c140287b8adcdf4085b91882`: CI, Pages, Hosting kit, Beta acceptance and CLI qualification all completed success; no submitted independent review. Its branch was not touched.
- Durable metadata lock `automation/ghostpay-integration-lock`: commit `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`, `integration-lock.json` blob `97523a9ce00231ac883b32178ab48a547eb0dd8f`, generation 11 **held** by `994a0d214fb9-root-r3`. Expired timestamp is not a takeover grant.
- One implementation/review coordinator only. A genuine independent reviewer was not available; self-inspection is not independent review.
- PR must remain draft and unmerged until exact-head all-required CI is green, native browser verification when applicable, independent review, conflict/dependency audit, and legitimate released/held integration ownership. No deployment, release, wallet/contract/funds action, additional dependency, or unrelated refactoring.

## Next isolated BUG-ONLY rotation
After the above PR qualifies or is handed off, select a **different unowned source module**, reproduce a separate functional defect before editing, commit a failing regression first and keep its own task branch and additive source-pinned handoff. Avoid editing owner-controlled PR #390, or any other concurrent worker's paths.
