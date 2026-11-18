# Recovery review and repair — 2026-11-18

## Scope and source

Reviewed PR #213 at `ebf7c92c3be1c7aebd37fc58b5567e114fb932fc`, based on the consolidated source at
`5467c158069c5bab264b6a653ac56e89e13f3e13`. The recovery work is reachable from the lean Pages application through
`AppLean` → `AppShell` → `SellerKeys`/`Scan`. It supports EVM ERC-5564 scheme 1 only. Bitcoin, Solana, TRON,
policy accounts, ERC-4337 accounts and EIP-7702 delegations are not newly enabled by this work.

## Finding RECOVERY-01 — cancelled master import can act on a later export

Severity: medium. The effect requires a local recovery action and a delayed browser vault read; no remote attacker
or stolen key was demonstrated. `StealthExportRecovery.onLoadMaster` checked mounting and session identity after
`loadedKeysRecoverable()`, but did not check whether the user had closed or replaced the decrypted export. The
completion called `install()`, which reads the current `held` value. Closing an export, opening another, and then
completing the old storage read could load the later export without its own confirmation. A negative read could
instead show an obsolete replacement confirmation after an idle lock and reopen.

Regression source: `edf4fb79ed35c5d81912ddc304eaf1783a05297e`. The test-only commit adds two tests using real
`saveEncryptedVault` and `loadedKeysRecoverable`; only `MemoryKeyVaultStore.get` is delayed. Before the source fix,
the recovery component suite reported 2 failed and 9 passed. The repair captures the export object and a new
operation controller before checking recoverability; stale, closed, locked or replaced operations cannot install
keys or show replacement confirmation. Existing session guards and the unsaved-key gate remain in place.

## Finding RECOVERY-02 — combined-key authority needs explicit disclosure

The existing UI describes the scope of a payment private key by itself. It did not disclose that a holder of the
private viewing key and public announcement can subtract the shared-secret tweak from that payment private key to
recover the master spending key. The repair explains this boundary in the payment/recovery warning, raw-export
confirmation, archive warning, recovery guide, format reference and standalone recovery help. It changes no
cryptographic primitive, key derivation, format bytes, custody or spending authority. The three changed messages
were already classified as security-critical. English fallback text is retained in the unreviewed Spanish, Japanese
and Arabic draft catalogs; no native-language review is claimed.

## Finding RECOVERY-03 — archive headers disclose linked payment metadata

The versioned keypair format encrypts private-key bodies, while authenticating public headers as additional data.
Anyone with a file can read its chain, count, included addresses/public keys and announcement locators without the
passphrase, linking every archive entry. This is a format privacy limitation, not a private-key leak. The follow-up
changes the existing security-critical archive warning and recovery guide to disclose this explicitly. It preserves
the format, encryption, derivation, import/export behavior and current custody arrangements. The other three locale
drafts use the same English fallback and retain their unreviewed status.

## Verification completed

Environment: Linux; Node.js `v24.22.1`; Vitest `5.0.5`. Dependencies were installed by the coordinator from the
existing lockfile and copied into this isolated worktree. Workspace symlinks resolve to this worktree's packages.

From `apps/web`:

```sh
../../node_modules/.bin/vitest run src/components/StealthExportRecovery.test.tsx --maxWorkers=1
```

Before fix: 2 failed, 9 passed. After fix: 11 passed, 0 failed, 0 skipped.

```sh
../../node_modules/.bin/vitest run src/components/StealthExportRecovery.test.tsx src/components/StealthExportPayment.test.tsx src/lib/paymentKeyExport.test.ts src/lib/keyVault.secretExport.test.ts src/views/Scan.stealthExport.test.tsx src/views/SellerKeys.stealthExport.test.tsx src/i18n/securityKeys.test.ts src/i18n/translator.test.ts --maxWorkers=1
```

Result: 8 files, 78 tests passed; no failures or skips.

The final test-only lint adjustment adds an explicit microtask flush to the two new async `act` callbacks.
The component suite was rerun afterwards: 11 passed, 0 failed, 0 skipped. No assertion or production behavior changed.

From `packages/ux-vault`:

```sh
../../node_modules/.bin/vitest run src/stealth-export-portable.test.ts src/stealth-export-portable.property.test.ts --maxWorkers=1
```

Result: 2 files, 64 tests passed; no failures or skips.

From repository root:

```sh
ANVIL_BIN=/workspace/scratch/07167523f342/toolchain/foundry/anvil CAST_BIN=/workspace/scratch/07167523f342/toolchain/foundry/cast REQUIRE_ANVIL=1 node --test --test-concurrency=1 scripts/recovery/*.test.mjs
node scripts/i18n/check.mjs
git diff --check
```

Independent recovery result: 16 tests passed, 0 failed, 0 skipped. This includes a separate Node `crypto` decoder
opening newly written GhostPay exports, wrong-passphrase/tamper rejection, master recovery of an archive-omitted
payment, and a raw one-time private key signing a successful loopback Anvil transfer through Foundry `cast`.
Foundry was **v1.5.1**, commit `b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2`; this is local independent interoperability
evidence, not qualification against the repository's pinned v1.8.5 CI toolchain. Only public synthetic test keys and
local test currency were used. Locale check: 4 catalogs, 0 errors, 431 warnings; the added warnings reflect deliberate
English fallback for unreviewed sensitive text. Whitespace check passed.

After building the additional test dependency `@ghostpay/relayer-guard`, the following checks passed from the
repository root:

```sh
NODE_OPTIONS=--max-old-space-size=1536 npm run typecheck -w @ghostpay/web
NODE_OPTIONS=--max-old-space-size=1536 node_modules/.bin/eslint --config eslint.config.js apps/web/src/components/StealthExportRecovery.tsx apps/web/src/components/StealthExportRecovery.test.tsx
```

The whole-web typecheck passed on production source `67f0d2fe3b00ea8f64cd8b1df8c0b563f791f6a3`; scoped lint
passed after the final test-only microtask adjustment. Default-heap attempts were killed with exit 137 and a
768 MiB attempt exhausted the V8 heap; the 1536 MiB cap completed successfully. No compiler check was disabled.

## Clean Pages artifact verification

The clean lean Pages build subsequently passed on exact source `1b0dd02e78d1d3f8dd117977c589eaa62671b3da`:

```sh
NODE_OPTIONS=--max-old-space-size=1536 bash scripts/pages/build-pages.sh /workspace/scratch/fb6d03ffb806/recovery-pages
```

The static verifier accepted 16 files. `paymentsEnabledChainIds` is empty; payments remain disabled on every chain.
The SHA-256 digest of `evidence/SHA256SUMS` is
`b922ec899f5c92c6401f0842d48188662527662008a30b9c0b6d65c509d3762c`. No artifact was published or deployed.
This is build evidence for `1b0dd02e`, not an assertion that a later source commit produced those exact bytes.

The subsequent RECOVERY-03 follow-up changes disclosure strings and documentation only. It does not change the
format or runtime logic. Its locale/security-message checks are recorded below; a second full build was not run.
Fresh hosted CI is still required on the final follow-up head and any integrated candidate.

Follow-up verification:

```sh
# From apps/web:
../../node_modules/.bin/vitest run src/i18n/securityKeys.test.ts src/i18n/translator.test.ts --maxWorkers=1
# From repository root:
node scripts/i18n/check.mjs
git diff --check
```

Result: 16 tests passed across 2 files, with no failures or skips; 4 catalogs checked with 0 errors and 431 warnings;
whitespace check passed. The existing `stealthExport.archive.hint` remains security-critical and unreviewed locale
drafts retain English fallback. No runtime or byte-format change is part of this disclosure follow-up.

## Qualification still pending

- `playwright install chromium` failed because the downloaded archives were empty or truncated (`End of central
  directory record signature not found`). The system Chromium `156.0.8078.79` exists, but a separate launch probe
  aborts at `process_singleton_posix.cc` with `socket() failed: Operation not permitted (1)`. The six-test focused
  browser suite did not execute. No browser, mobile-device or Tor pass is claimed, and no sandbox bypass was attempted.
- Final combined-source CI, source-matched security gates, external-wallet/device testing and Tor Browser testing
  remain release qualifications. This repair does not certify the complete beta or authorize deployment.

## Integration

Apply all recovery-review commits after PR #213's pinned base, including the final disclosure follow-up, then
requalify the resulting exact head. Root coordinates shared locale and integration changes. Other active PRs' session, Scan, AppShell and CI edits
were not changed here. Keep the original export-format compatibility and recovery tests. No remote branch, PR,
deployment, release, mainnet configuration or real-fund action was changed by this agent.
