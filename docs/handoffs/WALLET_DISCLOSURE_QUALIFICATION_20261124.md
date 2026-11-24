# PR #589 duplicate-retry qualification recovery

## Provenance and bounded ownership

- Repository: `djshellshoxxx/GhostPay`.
- Exact parent: [#589](https://github.com/djshellshoxxx/GhostPay/pull/589), `697cb7314c323b574bfbb1f102244265046dd93a` on `codex/287-wallet-request-preview`.
- Existing base: `qualify/ghostpay-native-browsers-20261121-5ceb`; this continues the parent's privacy integration stack.
- Continuation branch: `codex/recover-wallet-disclosure-qualification-20261124`.
- Source checkpoint: `6f3d35437d411065b28efea4085760cbf27412e8`; browser qualification targets this exact implementation.
- Worker: `/root/resume_payment_safety`; coordinator owns publication and independent review.
- Owned source: seven retry assertions across `apps/web/e2e/flows.spec.ts`, `apps/web/e2e/devnet-journey.spec.ts`, `apps/web/e2e/pages-devnet.spec.ts` and `apps/web/src/views/Pay.test.tsx`. The clean-profile import and pending-cancellation status ranges remain outside this change.

## Why the existing assertions failed

#589 moved `onWalletRequest` from before `submitTx` to immediately after the actual provider invocation in `sendViaWallet`. A duplicate attempt is rejected by `beginAttempt` before a second provider call. The existing `Pay.tsx` handling then correctly uses `refusedAfterEarlierRequest`: the earlier attempt still needs review, even though this retry did not reach the wallet. Its warning must not claim that nothing was sent.

The old tests expected the lower-level "previous wallet attempt" diagnostic. This continuation expects the deliberately preserved "may already have been submitted" warning and the instruction to review the wallet and recorded transaction outcome. It also explicitly rejects a false "Nothing was sent" message. Existing send counts, hashes, journal records, nonces, balances, explicit clearing and second-send checks remain intact. Product code and callback timing are unchanged.

Confirmed parent failures:

- [Beta acceptance run 45337514963, job 138253002105](https://github.com/djshellshoxxx/GhostPay/actions/runs/45337514963/job/138253002105): the two retry assertions at parent `devnet-journey.spec.ts:156,291`.
- [Pages run 45337514959, Anvil job 138253003304](https://github.com/djshellshoxxx/GhostPay/actions/runs/45337514959/job/138253003304): the three retry assertions at parent `pages-devnet.spec.ts:427,826,1020`.
- [Native browser run 45337515114, Firefox full job 138253001755](https://github.com/djshellshoxxx/GhostPay/actions/runs/45337515114/job/138253001755): parent `flows.spec.ts:138` received the conservative warning instead of the stale expected text.
- Local targeted `Pay.test.tsx` reproduction with exact locked dependencies: the rejection/clear/retry test failed at parent line 732 with the same received warning. The 67 unselected tests were reported skipped in that targeted baseline; they were not claimed passed.

## Dependency provenance

`node_modules` was copied from the coordinator's successful canonical installation of this exact lockfile in `gp-privacy-571`. Installed versions include Playwright `1.65.1`, Vitest `5.1.0`, Vite `8.3.8` and viem `2.57.19`.

Library output was copied only after the other worker's successful `NODE_OPTIONS=--max-old-space-size=512 npm run build:libs` in the exact-lock `privacy-569-resume` donor. All 66 package directory trees match; the 65 packages with `dist` supplied 2,292 files, each verified against its donor SHA256 manifest. Provenance:

- Package tree: `2b408279895ca472473ccff309db3a81443f1660`.
- Lockfile SHA256: `1b22ab3e9f780d27a01b1beaa8c31b223b3649106e454e78fc50ac8d6900f517`.
- Donor source: `c30283d28ec15f0c4fddb8a80d1c5f60ee590401`.
- Donor successful build-log SHA256: `931bfa4e33bc93c2ebcd7815f542dac347e0f05db480a14b21e04f4df87fc749`.

No dependency manifest, generated package output, browser configuration, workflow or runtime source is changed.

## Validation

Commands run from `apps/web` unless stated otherwise:

| Check | Command and observed result |
| --- | --- |
| Baseline reproduction | `../../node_modules/.bin/vitest run --maxWorkers=1 src/views/Pay.test.tsx -t 'surfaces a user rejection and blocks a blind retry until explicit clearing'` — **1 expected failure** at the stale assertion, **67 unselected**. |
| Payment and disclosure unit suites | `../../node_modules/.bin/vitest run --maxWorkers=1 src/views/Pay.test.tsx src/lib/wallet.disclosure.test.ts` — **93 passed in 2 files** after the correction. |
| Web typecheck | `NODE_OPTIONS=--max-old-space-size=2048 ../../node_modules/.bin/tsc -p tsconfig.json --noEmit` — **passed**. |
| Typed lint | `NODE_OPTIONS=--max-old-space-size=2048 ../../node_modules/.bin/eslint --config ../../eslint.config.js src/views/Pay.test.tsx e2e/flows.spec.ts e2e/devnet-journey.spec.ts e2e/pages-devnet.spec.ts` — **passed**. |
| Native Firefox full profile | `NODE_OPTIONS=--max-old-space-size=2048 ../../node_modules/.bin/playwright test --config playwright.native.config.ts --project=firefox e2e/flows.spec.ts -g 'retains a late wallet hash'` — **1 passed**, including original typecheck, full build, CSP processing and bundle scan. |
| Native Firefox lean profile | The same command with `GHOSTPAY_LOCAL_BUILD_PROFILE=lean` — **1 passed**, including the original lean build gates. |
| Real-Anvil Beta journey | Repository-root `bash scripts/beta/browser-devnet.sh` with the existing port/browser/compiler environment options — **3 passed**, including both repaired reload/retry scenarios, original full-build gates and 3 synthetic-chain transactions independently asserted on-chain. |
| Real-Anvil Pages journey | Repository-root `BROWSER_DEVNET_MODE=pages bash scripts/beta/browser-devnet.sh` with the existing environment options — **16 passed**, including all three repaired retry assertions, unchanged clean-profile restoration and unchanged same-nonce cancellation. Original lean build, CSP, bundle scan, site verifier and served-artifact hash checks passed. |
| Secret and whitespace scans | Repository-root `bash scripts/scan-secrets.sh` and `git diff --check` — **passed**. |

The native replay uses the exact installed Playwright `1.65.1` with its cached Firefox revision `1572` (Firefox `159.0`), original test configuration and port 4173. Both focused profile runs had one pass, zero failures and zero skipped cases.

Real-chain qualification uses Foundry/Anvil `1.8.5` (`51a52c59cffd940f76eddd0b4bb1791aa4b5ac7f`), solc `0.8.28+commit.7893614a`, and Chrome for Testing Headless Shell `156.0.8078.4` through the original `GHOSTPAY_CHROMIUM` option. The unmodified runner deploys only its public development fixtures to fresh loopback Anvil. The Beta invocation used `BROWSER_DEVNET_PORT=8550`, `BROWSER_DEVNET_WEB_PORT=4184`, `BROWSER_DEVNET_KEEP=1` and `FOUNDRY_SOLC` pointing to the verified compiler; its retained artifacts were `/tmp/ghostpay-browser-devnet.p37tAU`. No external chain or real funds were used.

The final Pages invocation used the same options plus `BROWSER_DEVNET_MODE=pages` and `BROWSER_DEVNET_PAGES_PORT=4185`; retained artifacts were `/tmp/ghostpay-browser-devnet.NWBgFc`. It verified the served `/GhostPay/` artifact against 16 SHA256SUMS entries at exact implementation `6f3d35437d411065b28efea4085760cbf27412e8`. All 16 tests passed in 2.2 minutes. The original cancellation case passed in 44.6 seconds with no timeout or status-assertion change. Both Anvil runs exited zero and shut down their local servers normally.

Independent source review by `/root/resume_package_qualification` examined exact checkpoint `6f3d35437d411065b28efea4085760cbf27412e8` against the parent and found no blocking issues. It corroborated the actual provider-handoff ordering and retained transaction/clearing assertions, and confirmed no overlap with the other worker's clean-profile or pending-cancellation ranges. That reviewer made no edits and claimed no additional test run.

## Remaining gates

This narrow repair must not be described as fixing every native-browser gate: the parent native run also contains unrelated layout and page-crash failures under separate investigation. Local replay covers the failing retry case in Firefox full/lean; the entire native suite and WebKit matrix were not rerun. The exact Playwright WebKit revision `2388` was not available in this runner's cache, and no browser or dependency configuration was changed to bypass that limit.

Live ownership was refreshed after implementation: #589 still points to the exact parent, and no matching disclosure/retry successor was found among the then-open PRs. Hosted CI must qualify the eventual published child. Keep original required gates and preserve all parent branches. No deployment or shared merge is authorized by this handoff.
