# Policy asset coverage and focus recovery

Date: 2026-11-19. Base: `af9355ae2c1a37969304a89a58d57d76f2132493`, the combined recovery plus selected invoice signer completion. Branch: `integration/ghostpay-policy-assets-reconciled-20261119`; ownership claim `623cb5c8` preceded edits.

## Scope and result

Asset implementation is committed at `f58bb5d8`; the standalone focus regression is committed separately at `64ebf9f0`. These recover existing useful work from [PR #211](https://github.com/djshellshoxxx/GhostPay/pull/211), whose original head `a92658b1ef6b95ff0145b2e1933d0047d51289d5` and branch remain unchanged. No full stale-branch merge was performed.

The CI/release lane performed the initial source triage and then authored this recovery. That earlier assessment is not counted as independent review of this implementation. The integration lead owns independent review, combined qualification, publication and integration.

The library predicate checks which assets a policy record can withdraw, rebuilding the limits tree and proving the token leaf against the committed root. The seller view lists the covered assets. The payer review blocks an asset excluded by a loaded verified record, and describes the uncertainty when only the meta-address is available. The check runs again through the existing guard before wallet submission, so a record imported after review can block the send.

The delay note keeps the existing factory floor and every existing preset. It introduces no per-chain delay number or claim that a rollup cancellation bound has been verified. The API documentation now describes the actual `PolicyRef` ABI and its linkable policy hash, and documents the coverage API; the implementation ABI is unchanged.

The focus-only commit restores the original browser regression: a rejected paste retains focus on the Read control; loading a valid pasted invoice removes that control and moves focus to main. AppShell runtime is unchanged.

## Provenance and preservation

Eight original scoped patches applied cleanly, without manual conflict resolution:

| Original commit | Recovered scope |
|---|---|
| `46ab81d2bc1060982867787d824ea2880d4899fa` | Policy token coverage predicate, export and tests |
| `5f683cb833164d205f3d02cbc0c282af783ddeb5` | Seven English coverage/delay strings |
| `00f9134b88e213a4a11c6e06e4abf64ddabdfe68` | Seller/payer UI, logic and regression tests |
| `b542c839841f552686fd10f6e85273c170fc89b8` | Delay limitation note and unchanged-preset regression |
| `001162ac6069cff3e3636ee131edabfe54ec8c5a` | Seven es/ar/ja strings and security-key classification |
| `0f0063ed00c2a3d501b289ad3785b188d92f2e7a` | Related API coverage/privacy/delay documentation only; the already integrated README is retained |
| `a08f47bb33ef59d9cffcdd348edfcc001ee5ba4e` | Actual PolicyRef ABI documentation |
| `1f5c2d73df398ee866c9f80635ba7a9bb7967872` | Rebuilt leaf proof, hostile-tree regressions and corrected selector documentation |

The focus regression is exact source `407868a1f3c5753786cad612636c079064d693ca`, blob `36a3719bd750bc0d412948a9858ee16a67907c59`. The blob string written in the focus commit message was mistyped; this independently read Git object and the machine receipt give the correct value. The code itself is unchanged from the original.

Of the fifteen asset source/test/documentation paths, ten match the final PR #211 blobs exactly. The other five are additive unions in the four catalogs and `securityKeys.ts`. Every prior catalog key/value and catalog metadata field is unchanged, including all recovery and signer entries; each catalog gains exactly seven messages. The existing `paysDerivedPayment` helper is retained byte-for-byte, preserving R/full-metadata binding. Nine separately checked boundary files, including policy send/decoder/signing, AppShell, invoice Pay and session code, are unchanged from the base. Exact source and resulting blobs are in `policy-assets-recovery-2026-11-19.json`.

## Validation actually performed

| Check on the recovered worktree | Result |
|---|---|
| Original patch application / staged diff check | Eight patches applied cleanly; no whitespace errors |
| Original final blobs and combined-boundary preservation | Ten exact original blobs; five additive locale/security unions; prior catalog values and the payment binding helper preserved |
| `node scripts/i18n/check.mjs` | Exit 0: four catalogs, zero errors, 701 warnings |
| `node scripts/i18n/extract.mjs` | Exit 0: 2,328 used keys, zero missing English entries, 139 unused |
| `bash scripts/scan-secrets.sh` | Exit 0: no committed env files or key material found |
| New local runtime regressions / coverage / browser / lint / typecheck / build | Not run; coordinator paused heavy work after repeated resource exits 137 |

The original commits record failing-first coverage/UI/proof regressions and subsequent passes in their historical source context. Those statements were inspected as provenance; they are not represented as a new execution on this candidate. Log sizes and SHA-256 digests for the actual local checks are in the machine receipt. Catalog warnings and machine-drafted translations are not a human translation review.

Independent source review and the exact combined-head hosted matrix remain required. No dependency, compiler, contract runtime, crypto format, security gate, coverage threshold, deployment setting or remote state was changed. Larger Solana/TRON interoperation and the shared secret-clipboard behavior remain separate work; the known strict Mythril findings are not closed by this recovery.
