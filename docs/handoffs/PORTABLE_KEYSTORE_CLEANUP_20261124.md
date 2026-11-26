# Portable keystore owned-buffer cleanup — 2026-11-24

## Exact source

- Isolated branch: `integration/portable-keystore-cleanup-20261124`.
- Base: `3e927a9c41f08c42f753786c541b4f8bcfb30d10`, tree
  `dbbeff91379c9b6d2e6d6460ee802481965cea20`.
- Claim: `cd003acffa8a42821c1f1721b9f5791ffeb57987` (before source edits).
- Qualified-source candidate: `8e2d90affba9a2db24ca9b41d5637940f941bd72`, tree
  `afe833b2bd28e83ac27d6651e43194e1072c1fcd`.
- Donor: `9bad95e5cc0ee73f5adb8d2c587161074b21e080`; original local commit
  `e8c77e7e8699dd16b86b7a1ff90b834594d07105`. Only source and four existing
  ordinary lifecycle tests were recovered, without the donor registry or
  historical branch.

Parent-fit verification: the current production blob exactly matched the donor
parent, `59e998e772e26be386aea4b8369d5240222ea1f9`. Recovered production blob
`330cebb6652fa6e54a10536eec7292af5cde129d` and regression blob
`83b0c06b59479d1dd1ea70f445366b0ab372b53c` match the donor exactly.

## Behavior and preservation

The private `derive` function names its locally owned normalized-passphrase byte
buffer and holds derivation inside `try/finally`. The finally clause wipes that
buffer and any returned derived bytes after asynchronous derivation/key import
finishes or rejects. It retains the input until the asynchronous work completes.
It does not change or claim to erase the caller's immutable passphrase string.

Everything outside `derive` in `keystore-portable.ts` is byte-identical to the
base. Within `derive`, NFKC normalization, scrypt parameters (`N`, `r`, `p`,
`dkLen: 32`, `maxmem: 2 ** 29`), AES-GCM key import, nonextractability and
`encrypt`/`decrypt` usages remain unchanged. Version-1 serialization, KDF
ceilings/defaults, authentication data, metadata/key checks and diagnostics are
preserved. No API, format, workflow, dependency, caller or feature activation.

The four original donor cases check real encryption/decryption and v1 format,
derivation rejection, key-import rejection and retention until asynchronous
derivation finishes. Fixtures are synthetic ordinary lifecycle cases; no new
security reproduction or stress scenario was added.

## Qualification

All five requested gate commands passed on the exact source above, without
fixture corrections or assertion changes. Node `v24.22.3`, npm `11.19.1`; tests
used one worker. Installed external dependencies were reused with checkout-local
workspace links. Unchanged dependency outputs came from the coordinator's build;
ux-vault was rebuilt in this isolated checkout.

| Gate | Result |
|---|---|
| Complete ux-vault coverage suite | **310 tests, 12 files passed**, including all four donor lifecycle cases; no skips |
| Existing web consumers | **84 tests, 4 files passed**: keystore, keyVault, session, BackupPanel; no skips |
| ux-vault build | Passed |
| ux-vault full typecheck | Passed |
| ux-vault full lint | Passed |

Total: **394 passing tests across 16 files**. Vault coverage: statements
**96.39%**, branches **93.37%**, functions **99.68%**, lines **98.67%**. Existing
95/90/95/95 thresholds remain unchanged. Whitespace validation passed.

Commands from the task root:

```sh
npm run build -w @ghostpay/ux-vault
npm run test -w @ghostpay/ux-vault -- --maxWorkers=1
npm run typecheck -w @ghostpay/ux-vault
npm run lint -w @ghostpay/ux-vault
```

Web command from `apps/web`:

```sh
../../node_modules/.bin/vitest run src/lib/keystore.test.ts src/lib/keyVault.test.ts src/lib/session.test.ts src/components/BackupPanel.test.tsx --maxWorkers=1
```

The coordinator's scratch `portable-keystore-qualification/results.json` and
per-gate logs record the exact commands, source, durations and exit codes. The
final commit adds only this handoff after qualification; production and tests
retain the exact reviewed and tested source. No full-web coverage, native-browser
run or fresh hosted gate is claimed for this isolated recovery.

## Integration boundaries

The root coordinator already independently reviewed the donor/parent fit and
owns final composition, review and hosted gates. This worker changes only the
two owned package files and additive claim/handoff documentation in its isolated
worktree. No donor/root-worktree or remote ref mutation. Local package and web
unit tests do not constitute native-browser or final hosted approval.
