# Pages Spec 18 recovery integration — 2026-11-18

## Scope and exact source

This lane integrates the approved scheme-1 EVM export/recovery implementation and its selected-export consent fix
onto the current Pages main. It also closes one visible privacy-disclosure gap and repairs an integration test
that still expected wording replaced by the reviewed archive-metadata disclosure.

| Source | Exact commit |
| --- | --- |
| Live main at lane creation | `dfc75ef2087fa6463ae59e0818abec01796c578d` |
| Spec 18 PR #213 | `ebf7c92c3be1c7aebd37fc58b5567e114fb932fc` |
| Recovery consent/disclosure PR #229 | `18110015e99efbeb4f23d47cd88bd6f917010108` |
| Ownership claim | `2073f4d1` |
| Main + #213 integration | `7aebde36` |
| Main + #213 + #229 integration | `705ded7c` |
| Missing single-export RPC disclosure regression | `5fec1093` |
| Single-export RPC disclosure correction | `933bdedc07dfeb6024f1ea23045bacbbc81972fb` |
| Final code/test source | `f2ed1ed4240f91ef2fb41f3edaf3ea6546e87e60` |
| Final code/test full tree | `cc322bbd3f7ea43fc749baf3ba9eeb3074213eb7` |

The branch is `integration/ghostpay-recovery-completion-20261118`. This document and later completion-status
corrections do not change runtime, tests, dependencies, crypto formats, network scope, deployment or publication.
The coordinator owns the final combined candidate, hosted qualification and any remote integration.

## Integration choices

The #213 merge has two conflicts. The CI script-test line retains both main's `scripts/agent/*.test.mjs` and
#213's `scripts/recovery/*.test.mjs`; neither test set is removed. The worker registry preserves both histories
and adds this lane's explicit ownership. #229 conflicts only in that registry, also resolved additively.

The implementation preserves three separately identified formats, the existing three-key keystore, the
re-authentication requirement, independent raw-key recovery, and all session/lock cancellation guards. It
does not import #222, change the checkpoint format, or change sweep/payment signing behavior.

Overlaps for the coordinator are limited to `session.ts`, the export entry points in `Scan.tsx` and
`SellerKeys.tsx`, recovery entries in the four locale catalogs and `securityKeys.ts`, the CI script-test line,
and the ownership registry. The coordinator must retain unrelated privacy/scanner corrections when merging.

## Findings and repairs

### R-1: single-export RPC disclosure omitted

`exportOnePayment` deliberately asks the retained scan RPC for `eth_getCode` before encrypted or raw
payment-key export. The address-bearing request can tell the provider which address the seller controls.
The old single-payment panel did not explain that request before the export action. The archive hint already
mentioned its code check; a secret-export gesture alone did not communicate the single-payment lookup.

The payment-details panel now explains the address, request-time and connecting-IP exposure before its
credential and secret-export controls. It states that no private key is transmitted. The new message is
security-critical, and unreviewed Spanish, Arabic and Japanese catalogs use the English source. No transport,
RPC selection, crypto or signing logic changes. Opening the panel and exporting a public record still make
no request. Recovery of an existing export remains independent of network access.

The extended existing UI regression fails on `5fec1093` before the disclosure and passes with the fix. It
checks both the visible disclosure and absence of RPC calls merely from opening payment details.

### R-2: archive assertion diverged from the reviewed disclosure

#229 changes the archive warning from "Master keys are never included" to "Master keys are not included"
while adding the readable-header and cross-entry linkage disclosures. #213's payment UI test retained the
old string. The first complete 12-file selection at `933bdedc` therefore reports 134 passed and one failed.

Commit `f2ed1ed4` updates the selector and additionally requires the public authenticated-header and
archive-entry linkage explanation. The encrypted archive's existing derivation, count, chain, address-query,
download, decryption and passphrase-clearing assertions remain intact.

## Source review

This lane independently inspected the original codec and browser integration, including strict parsing,
bounded KDF parameters, authenticated headers and format domains, scalar/address verification, plaintext
buffer disposal, fail-closed credential matching, cancellation after asynchronous boundaries, and the
#229 operation/selected-export identity guard. No additional concrete source blocker was established.

A separate branch-archaeology agent reviewed `933bdedc` and `f2ed1ed4` and found no introduced blocker.
Its review confirms that the disclosure precedes credential inputs and secret-export actions, the public
record remains request-free, and the updated archive test strengthens the relevant assertion.
The reviewer independently ran the payment-export UI and security-key suites at `f2ed1ed4`: **24 passed,
2 files, exit 0, no skips**, using one worker and a 768 MiB heap. Its log is
`security-tooling-evidence/recovery-independent-export-ui.log` in the session scratch directory.
These are AI-assisted reviews, not a professional security audit.

## Executed verification

Environment: Linux executor, Node `v24.22.1`, npm `11.9.0`, repository-pinned dependencies installed with
`npm ci --ignore-scripts --prefer-offline --no-audit --no-fund`. No dependency or lockfile changed.

| Check | Result and source boundary |
| --- | --- |
| Dependency install | Exit 0. |
| `npm run build:libs` | Exit 0 on `705ded7c`; later deltas are web text/tests/docs, with all library source unchanged. |
| Missing-disclosure regression | Before: 1 failed, 11 intentionally unselected. After: 1 passed, 11 intentionally unselected. These filtered runs do not replace the full selection. |
| Complete focused web recovery/session/vault/i18n selection | **135 passed, 0 failed, 0 skipped, 12 files** at `f2ed1ed4`; 32.62 seconds. |
| Independent export UI and security-key selection | **24 passed, 0 failed, 0 skipped, 2 files** at `f2ed1ed4`; 7.17 seconds. Overlaps the selection above. |
| Core-crypto full coverage | **75 passed, 9 files**; statements 98.50%, branches 98.16%, functions 100%, lines 98.21%; original thresholds passed. |
| ux-vault full coverage, first attempt | **Incomplete:** 331 of 348 collected tests passed; the `portable-parity.test.ts` worker received SIGKILL. Coverage was incomplete and below thresholds. This is not a passing run. |
| ux-vault full coverage, isolated retry | **348 passed, 0 failed, 0 skipped, 9 files, exit 0**; 172.63 seconds. Statements 96.99%, branches 94.24%, functions 99.50%, lines 98.88%; original thresholds passed with a 768 MiB heap and one worker. |
| Independent Node recovery suite after library build | **15 passed, 0 failed, 1 skipped**; the skip is raw-key Foundry interoperability before its binaries were supplied. |
| Supplemental raw-key Foundry interoperability | **1 passed, 0 failed, 0 skipped** with available Foundry **1.5.1**, commit `b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2`, on loopback Anvil. It derives the expected address and accepts a signed synthetic transfer. This is not the required Foundry 1.8.5 qualification. |
| Whole-web TypeScript | Exit 0 with 1536 MiB heap at `933bdedc`; only the reviewed archive test assertion changes afterward. |
| ux-vault lint | Exit 0 on retry with 768 MiB heap; the earlier concurrent attempt was killed with 137. |
| Scoped web lint | **Blocked by executor memory.** Initial 1536 MiB and sequential 768 MiB attempts were killed with 137. A three-file 512 MiB probe reports explicit JavaScript heap exhaustion (134); the final 640 MiB probe is also killed with 137. No source lint diagnostic was emitted and no configuration or rule was weakened. |
| Locale validation | 4 catalogs, 0 errors, 434 fallback/existing warnings. |
| Locale extraction | 2,229 used keys, 0 missing from English, 136 unused. |
| Secret scan | Exit 0, no committed environment files or key material found. |
| Actions pin check and whitespace check | Exit 0. |

The first independent Node invocation ran concurrently with the initial library build and reports 14 passes,
one missing-built-codec failure and one native-tool skip. The successful post-build run above supersedes
that dependency-ordering attempt, without relabeling it as a pass. Tests repeated by a reviewer or narrower
selection overlap; their totals must not be summed as distinct coverage.

Commands from repository root unless a directory is shown:

```sh
npm ci --ignore-scripts --prefer-offline --no-audit --no-fund
npm run build:libs
npm test --workspace @ghostpay/core-crypto --workspace @ghostpay/ux-vault -- --maxWorkers=1
NODE_OPTIONS=--max-old-space-size=768 npm test --workspace @ghostpay/ux-vault -- --maxWorkers=1
node --test scripts/recovery/*.test.mjs
ANVIL_BIN=/workspace/scratch/07167523f342/toolchain/foundry/anvil CAST_BIN=/workspace/scratch/07167523f342/toolchain/foundry/cast REQUIRE_ANVIL=1 node --test scripts/recovery/raw-key-anvil.test.mjs
NODE_OPTIONS=--max-old-space-size=1536 npm run typecheck --workspace @ghostpay/web
NODE_OPTIONS=--max-old-space-size=768 npm run lint --workspace @ghostpay/ux-vault
node scripts/i18n/check.mjs
node scripts/i18n/extract.mjs
npm run ci:scan-secrets
npm run ci:check-actions
git diff --check
```

From `apps/web`:

```sh
../../node_modules/.bin/vitest run src/lib/session.test.ts src/lib/keyVault*.test.ts src/lib/paymentKeyExport.test.ts src/components/StealthExport*.test.tsx src/views/Scan.stealthExport.test.tsx src/views/SellerKeys.stealthExport.test.tsx src/i18n/securityKeys.test.ts src/i18n/catalog.test.ts src/i18n/translator.test.ts --coverage.enabled=false --maxWorkers=1
NODE_OPTIONS=--max-old-space-size=768 ../../node_modules/.bin/eslint --config ../../eslint.config.js src/components/StealthExport*.tsx src/lib/keyVault.ts src/lib/keyVault.secretExport.test.ts src/lib/paymentKeyExport*.ts src/lib/session.ts src/lib/stealthExport.ts src/views/Scan.tsx src/views/SellerKeys.tsx src/views/Scan.stealthExport.test.tsx src/views/SellerKeys.stealthExport.test.tsx src/i18n/securityKeys.ts e2e/stealth-export.spec.ts e2e/stealthExportFixtures.ts
```

The lint command above is the blocked full-scope retry, not a passing command. The later three-file probes
select `StealthExportPayment.tsx`, its test and `securityKeys.ts` with the same repository config and rules.

Logs remain under the current session's `analysis-security/` scratch directory with `recovery-*` names.
This handoff contains the durable source/result summary; local log paths do not imply hosted artifacts.

## Spec 18 acceptance and remaining gates

| Requirement | Implemented and locally exercised | Remaining acceptance |
| --- | --- | --- |
| K01: matched key/address derivation and public record | Strict scheme/chain/announcement validation and independent public/address comparison. | Final combined source qualification. |
| K02: authenticated single-key encryption | Bounded scrypt/AES-GCM format, strict header/body validation, corruption/wrong-passphrase/wrong-chain refusal. | Final combined coverage and browser acceptance. |
| K03: deliberate browser export | Payment panel, vault/keystore re-authentication, encrypted default and second-confirmation raw download; no request before the action. | Actual browser journeys at the intended Pages configuration. |
| K04: independent recovery | Separate Node crypto implementation, fresh-file interoperability, raw-key synthetic spend with available cast. | Pinned Foundry 1.8.5 and third-party wallet/device acceptance. |
| K05: bounded encrypted bulk archive | Ordering, duplicate/conflict policy, atomic key/address validation and bounded archive implementation/tests. | Final combined coverage and browser archive journey. |
| K06: separate encrypted master backup | Master pair only; new-session recovery and archive-omitted payment derivation; re-authentication and cancellation tests. | Actual fresh-browser and physical-device recovery acceptance. |

Whole-web typed lint and final combined build/CI remain gates; the executor failures do not waive them.
No browser pass is claimed. The CI worker's fresh Chromium launch fails with exit 134 on a required socket
operation in this executor. Test discovery and jsdom tests do not replace Playwright execution. Desktop/mobile,
Firefox/WebKit and Tor Browser acceptance remain unqualified here.

The archive's authenticated public header still reveals and links its entries. A private viewing key plus a
one-time private key and its public announcement can reconstruct the master spending key. Provider queries
can correlate an exported payment. JavaScript strings and browser-managed memory cannot be securely erased.
These disclosed limitations are not changed by this integration.

No deployment, release publication, mainnet operation, remote branch deletion or remote history rewrite was
performed by this lane. Hosted exact-head CI and the coordinator's final combined review remain required.
