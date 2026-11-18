# SonarCloud vulnerability triage — 2026-11-18

**AI-assisted triage, not a professional audit.** Source: the SonarCloud public API for project
`djshellshoxxx_GhostPay`, read 2026-11-18. Every finding was re-checked against `main` `5467c158`.

## Why the rating is stale

- SonarCloud last analysed `main` on **2026-11-04 at `14f9b267`**, and the last pull-request analysis was **#84 on
  2026-11-07**. Nothing after that, including the consolidation merged in #203, has been analysed.
- `main` therefore shows **security rating E (5.0) with 107 open vulnerabilities** against two-week-old code. The
  quality gate on new code reads OK (new-code security rating A, 0 new vulnerabilities).
- **Owner action:** re-enable analysis (SonarCloud → Administration → Analysis Method, and check the SonarCloud
  GitHub App installation), so `main` and open PRs get analysed again. Then mark the false positives below in the
  SonarCloud UI with the reasons given. This triage cannot change SonarCloud state: that needs a project token.

## Summary

| Disposition | Count |
|---|---|
| FIXED | 53 |
| FALSE POSITIVE | 23 |
| ACCEPTED | 16 |
| ROUTED | 8 |
| OBSOLETE | 3 |
| THIRD-PARTY | 2 |
| OPEN (low) | 2 |

What decided the E rating: two path-traversal BLOCKERs in `docs/audits/poc/static-server.mjs` (real, localhost-only
PoC helper, **fixed**). The other BLOCKER/CRITICAL rows are false positives, accepted test fixtures, or vendored code.

## All 107 findings

| Severity | Rule | Location (as analysed) | Disposition | Reason / evidence |
|---|---|---|---|---|
| BLOCKER | `javascript:S7639` | `scripts/devnet/e2e.mjs:36` | ACCEPTED | public anvil mnemonic (`test ... junk`) used only after asserting chainId 31337; file owned by open PR #218 |
| BLOCKER | `jssecurity:S2083` | `docs/audits/poc/static-server.mjs:25` | FIXED | component-wise containment (`path.relative`) replaces `startsWith(dist)` (sibling-prefix bypass reproduced RED); malformed `%` escapes now 400 instead of a hung request; `static-server.test.mjs` 4/4 |
| BLOCKER | `jssecurity:S2083` | `docs/audits/poc/static-server.mjs:28` | FIXED | component-wise containment (`path.relative`) replaces `startsWith(dist)` (sibling-prefix bypass reproduced RED); malformed `%` escapes now 400 instead of a hung request; `static-server.test.mjs` 4/4 |
| BLOCKER | `pythonsecurity:S2083` | `packages/contracts/lib/forge-std/scripts/vm.py:125` | THIRD-PARTY | vendored forge-std helper script; not shipped, not first-party |
| BLOCKER | `typescript:S6418` | `packages/chain-solana/src/pda.ts:10` | FALSE POSITIVE | `TOKEN_PROGRAM_ID` is the public Solana SPL Token program address, not a secret |
| CRITICAL | `javascript:S1523` | `docs/audits/poc/poc-04-browser-csp-xss-referrer.mjs:16` | FALSE POSITIVE | deliberate `javascript:` XSS payload used as test input by an audit PoC; never evaluated by the app |
| MAJOR | `docker:S6506` | `infra/integration/Dockerfile.runner:20` | FIXED | `--proto =https --proto-redir =https`; downloads were already SHA-256 pinned, so this closes the residual downgrade path |
| MAJOR | `docker:S6506` | `infra/integration/Dockerfile.solana:15` | FIXED | `--proto =https --proto-redir =https`; downloads were already SHA-256 pinned, so this closes the residual downgrade path |
| MAJOR | `docker:S6506` | `scripts/regtest/Dockerfile.bitcoind:7` | FIXED | `--proto =https --proto-redir =https`; downloads were already SHA-256 pinned, so this closes the residual downgrade path |
| MAJOR | `githubactions:S6505` | `.github/workflows/ci.yml:208` | ROUTED | workflow owned by open PRs #213/#220; recommend `--only-binary :all:`/`--require-hashes` for pip and https-only curl |
| MAJOR | `githubactions:S6506` | `.github/workflows/nightly.yml:119` | ROUTED | workflow owned by open PRs #213/#220; recommend `--only-binary :all:`/`--require-hashes` for pip and https-only curl |
| MAJOR | `githubactions:S8541` | `.github/workflows/ci.yml:311` | ROUTED | workflow owned by open PRs #213/#220; recommend `--only-binary :all:`/`--require-hashes` for pip and https-only curl |
| MAJOR | `githubactions:S8541` | `.github/workflows/nightly.yml:57` | ROUTED | workflow owned by open PRs #213/#220; recommend `--only-binary :all:`/`--require-hashes` for pip and https-only curl |
| MAJOR | `githubactions:S8541` | `.github/workflows/nightly.yml:123` | ROUTED | workflow owned by open PRs #213/#220; recommend `--only-binary :all:`/`--require-hashes` for pip and https-only curl |
| MAJOR | `githubactions:S8541` | `.github/workflows/nightly.yml:144` | ROUTED | workflow owned by open PRs #213/#220; recommend `--only-binary :all:`/`--require-hashes` for pip and https-only curl |
| MAJOR | `githubactions:S8543` | `.github/workflows/ci.yml:208` | ROUTED | workflow owned by open PRs #213/#220; recommend `--only-binary :all:`/`--require-hashes` for pip and https-only curl |
| MAJOR | `jssecurity:S6549` | `docs/audits/poc/static-server.mjs:25` | FIXED | component-wise containment (`path.relative`) replaces `startsWith(dist)` (sibling-prefix bypass reproduced RED); malformed `%` escapes now 400 instead of a hung request; `static-server.test.mjs` 4/4 |
| MAJOR | `jssecurity:S8707` | `docs/audits/poc/static-server.mjs:25` | FIXED | component-wise containment (`path.relative`) replaces `startsWith(dist)` (sibling-prefix bypass reproduced RED); malformed `%` escapes now 400 instead of a hung request; `static-server.test.mjs` 4/4 |
| MAJOR | `jssecurity:S8707` | `docs/audits/poc/static-server.mjs:28` | FIXED | component-wise containment (`path.relative`) replaces `startsWith(dist)` (sibling-prefix bypass reproduced RED); malformed `%` escapes now 400 instead of a hung request; `static-server.test.mjs` 4/4 |
| MAJOR | `jssecurity:S8707` | `docs/remote/pages-site/src/build.mjs:104` | FALSE POSITIVE | operator-run local CLI/script; the path is the operator's own argument (no remote input, no privilege boundary crossed) |
| MAJOR | `jssecurity:S8707` | `examples/merchant-checkout/checkout.mjs:48` | FALSE POSITIVE | operator-run local CLI/script; the path is the operator's own argument (no remote input, no privilege boundary crossed) |
| MAJOR | `jssecurity:S8707` | `examples/subscription-cron/run.mjs:28` | FALSE POSITIVE | operator-run local CLI/script; the path is the operator's own argument (no remote input, no privilege boundary crossed) |
| MAJOR | `jssecurity:S8707` | `examples/subscription-cron/run.mjs:59` | FALSE POSITIVE | operator-run local CLI/script; the path is the operator's own argument (no remote input, no privilege boundary crossed) |
| MAJOR | `jssecurity:S8707` | `examples/subscription-cron/run.mjs:66` | FALSE POSITIVE | operator-run local CLI/script; the path is the operator's own argument (no remote input, no privilege boundary crossed) |
| MAJOR | `jssecurity:S8707` | `examples/subscription-cron/run.mjs:73` | FALSE POSITIVE | operator-run local CLI/script; the path is the operator's own argument (no remote input, no privilege boundary crossed) |
| MAJOR | `jssecurity:S8707` | `examples/subscription-cron/run.mjs:75` | FALSE POSITIVE | operator-run local CLI/script; the path is the operator's own argument (no remote input, no privilege boundary crossed) |
| MAJOR | `jssecurity:S8707` | `examples/subscription-cron/run.mjs:81` | FALSE POSITIVE | operator-run local CLI/script; the path is the operator's own argument (no remote input, no privilege boundary crossed) |
| MAJOR | `jssecurity:S8707` | `scripts/devnet/write-state.mjs:11` | FALSE POSITIVE | operator-run local CLI/script; the path is the operator's own argument (no remote input, no privilege boundary crossed) |
| MAJOR | `jssecurity:S8707` | `scripts/devnet/write-state.mjs:39` | FALSE POSITIVE | operator-run local CLI/script; the path is the operator's own argument (no remote input, no privilege boundary crossed) |
| MAJOR | `jssecurity:S8707` | `scripts/gen-release-manifest.mjs:19` | FALSE POSITIVE | operator-run local CLI/script; the path is the operator's own argument (no remote input, no privilege boundary crossed) |
| MAJOR | `jssecurity:S8707` | `scripts/gen-release-manifest.mjs:58` | FALSE POSITIVE | operator-run local CLI/script; the path is the operator's own argument (no remote input, no privilege boundary crossed) |
| MAJOR | `jssecurity:S8707` | `scripts/gen-release-manifest.mjs:59` | FALSE POSITIVE | operator-run local CLI/script; the path is the operator's own argument (no remote input, no privilege boundary crossed) |
| MAJOR | `jssecurity:S8707` | `scripts/i18n/pseudo.mjs:12` | FALSE POSITIVE | operator-run local CLI/script; the path is the operator's own argument (no remote input, no privilege boundary crossed) |
| MAJOR | `pythonsecurity:S8707` | `packages/btc-silent-payments/test-vectors/reference.py:239` | FALSE POSITIVE | operator-run local CLI/script; the path is the operator's own argument (no remote input, no privilege boundary crossed) |
| MAJOR | `pythonsecurity:S8707` | `packages/contracts/lib/forge-std/scripts/vm.py:41` | THIRD-PARTY | vendored forge-std helper script; not shipped, not first-party |
| MAJOR | `shell:S6505` | `scripts/integration/run-in-runner.sh:110` | FIXED | `npx --no --` so a missing local vitest fails instead of installing from the registry |
| MAJOR | `shell:S6506` | `packages/pool-circuits/scripts/install-circom.sh:11` | FIXED | `--proto =https --proto-redir =https`; downloads were already SHA-256 pinned, so this closes the residual downgrade path |
| MAJOR | `text:S6389` | `apps/web/src/i18n/message.test.ts:211` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `apps/web/src/lib/displayText.test.ts:15` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `apps/web/src/lib/displayText.test.ts:16` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `apps/web/src/lib/hardening.test.ts:57` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `apps/web/src/lib/hardening.test.ts:106` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `apps/web/src/lib/hardening.test.ts:107` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `docs/audits/poc/poc-03-invoice-parser-fuzz.mjs:67` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `docs/audits/poc/poc-04-browser-csp-xss-referrer.mjs:16` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/address-safety/src/text.test.ts:7` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/address-safety/src/text.test.ts:8` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/address-safety/src/text.test.ts:73` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/i18n/src/format.test.ts:65` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/i18n/src/format.ts:20` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/i18n/src/format.ts:24` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/invoice-schema/src/text-hygiene.test.ts:56` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/merchant-billing/src/csv.test.ts:24` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/merchant-billing/src/payouts.test.ts:60` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/merchant-ledger/src/ledger.test.ts:214` | ROUTED | file owned by open PR #220; same escape rewrite recommended |
| MAJOR | `text:S6389` | `packages/payment-uri/src/fuzz.test.ts:129` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/payment-uri/src/negative.test.ts:54` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/plugin-api/src/manifest.test.ts:44` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/ux-fiat/src/fiat.test.ts:112` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/ux-fiat/src/fiat.test.ts:348` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/ux-i18n/src/a11y.test.ts:23` | OBSOLETE | file no longer exists on `main` |
| MAJOR | `text:S6389` | `packages/ux-i18n/src/message.test.ts:185` | OBSOLETE | file no longer exists on `main` |
| MAJOR | `text:S6389` | `packages/ux-i18n/src/message.test.ts:186` | OBSOLETE | file no longer exists on `main` |
| MAJOR | `text:S6389` | `packages/ux-intake/src/nlamount.test.ts:194` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/ux-intake/src/payload.test.ts:30` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/ux-links/src/amount.test.ts:90` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/ux-links/src/handle.test.ts:38` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/ux-links/src/handle.test.ts:120` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/ux-links/src/request.test.ts:59` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/ux-links/src/tip.test.ts:93` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/ux-notify/src/redact.test.ts:36` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/ux-presets/src/validate.test.ts:28` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/ux-presets/src/validate.test.ts:29` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/ux-presets/src/validate.test.ts:109` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/ux-privacy/src/policy.test.ts:126` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/ux-receipts/src/core.test.ts:182` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/ux-receipts/src/core.test.ts:187` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/ux-receipts/src/receipt.test.ts:51` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/ux-receipts/src/receipt.test.ts:393` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/ux-schedule/src/template.test.ts:40` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/ux-vault/src/contacts.test.ts:38` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/ux-vault/src/contacts.test.ts:69` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/ux-vault/src/schema.test.ts:100` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `text:S6389` | `packages/ux-vault/src/vault.test.ts:113` | FIXED | raw bidi code points rewritten as `\uXXXX` escapes; 1141 literals in 30 files proven value-identical |
| MAJOR | `typescript:S2068` | `packages/invoice-schema/src/passphrase.ts:6` | FALSE POSITIVE | `PASSPHRASE_ALG` is an algorithm identifier (`A256GCM-PW`), not a password |
| MINOR | `docker:S6471` | `infra/devnet/Dockerfile.anvil:5` | OPEN (low) | local devnet images marked UNTESTED (`foundry:latest`); add a non-root `USER` when they are qualified |
| MINOR | `docker:S6471` | `infra/devnet/Dockerfile.web:3` | OPEN (low) | local devnet images marked UNTESTED (`foundry:latest`); add a non-root `USER` when they are qualified |
| MINOR | `javascript:S4036` | `docs/audits/poc/poc-10-history-db-leak.mjs:25` | ACCEPTED | developer tooling resolves tools from the developer's own PATH by design |
| MINOR | `javascript:S4036` | `scripts/build-workspaces.mjs:35` | ACCEPTED | developer tooling resolves tools from the developer's own PATH by design |
| MINOR | `javascript:S4036` | `scripts/devnet/e2e.mjs:222` | ACCEPTED | developer tooling resolves tools from the developer's own PATH by design |
| MINOR | `javascript:S4036` | `scripts/devnet/e2e.mjs:328` | ACCEPTED | developer tooling resolves tools from the developer's own PATH by design |
| MINOR | `javascript:S4036` | `scripts/devnet/e2e.mjs:329` | ACCEPTED | developer tooling resolves tools from the developer's own PATH by design |
| MINOR | `javascript:S4036` | `scripts/regtest/e2e.mjs:99` | ACCEPTED | developer tooling resolves tools from the developer's own PATH by design |
| MINOR | `javascript:S4036` | `scripts/testnet/make-manifest.mjs:98` | ACCEPTED | developer tooling resolves tools from the developer's own PATH by design |
| MINOR | `javascript:S5332` | `docs/audits/poc/static-server.mjs:21` | FALSE POSITIVE | `http://x` is a parse-only URL base for `req.url`; never contacted (now commented) |
| MINOR | `jssecurity:S5145` | `docs/audits/poc/poc-05-relayer-http.mjs:29` | ACCEPTED | console output of local test/PoC scripts to the developer's own terminal; no log pipeline |
| MINOR | `jssecurity:S5145` | `docs/audits/poc/poc-11-relayer-breaker-stuck-half-open.mjs:39` | ACCEPTED | console output of local test/PoC scripts to the developer's own terminal; no log pipeline |
| MINOR | `jssecurity:S5145` | `scripts/integration/btc-regtest.e2e.mjs:55` | ACCEPTED | console output of local test/PoC scripts to the developer's own terminal; no log pipeline |
| MINOR | `jssecurity:S5145` | `scripts/integration/btc-regtest.e2e.mjs:57` | ACCEPTED | console output of local test/PoC scripts to the developer's own terminal; no log pipeline |
| MINOR | `jssecurity:S5145` | `scripts/integration/solana-local.e2e.mjs:117` | ACCEPTED | console output of local test/PoC scripts to the developer's own terminal; no log pipeline |
| MINOR | `jssecurity:S5145` | `scripts/integration/solana-local.e2e.mjs:119` | ACCEPTED | console output of local test/PoC scripts to the developer's own terminal; no log pipeline |
| MINOR | `jssecurity:S5145` | `scripts/regtest/e2e.mjs:94` | ACCEPTED | console output of local test/PoC scripts to the developer's own terminal; no log pipeline |
| MINOR | `jssecurity:S5145` | `scripts/regtest/esplora-shim.mjs:31` | ACCEPTED | console output of local test/PoC scripts to the developer's own terminal; no log pipeline |
| MINOR | `typescript:S5332` | `apps/relayer/src/server.ts:238` | FALSE POSITIVE | test fixture URL or parse-only base (`http://relayer.invalid` is pinned by privacyInvariants.test.ts); never contacted |
| MINOR | `typescript:S5332` | `packages/hops/src/helpers.testutil.ts:24` | FALSE POSITIVE | test fixture URL or parse-only base (`http://relayer.invalid` is pinned by privacyInvariants.test.ts); never contacted |
| MINOR | `typescript:S5332` | `packages/hops/src/helpers.testutil.ts:24` | FALSE POSITIVE | test fixture URL or parse-only base (`http://relayer.invalid` is pinned by privacyInvariants.test.ts); never contacted |
| MINOR | `typescript:S5332` | `packages/pool-relayer/src/server.ts:168` | FALSE POSITIVE | test fixture URL or parse-only base (`http://relayer.invalid` is pinned by privacyInvariants.test.ts); never contacted |
