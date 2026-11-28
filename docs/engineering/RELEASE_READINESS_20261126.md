# Release readiness — GitHub Pages browser beta (2026-11-26)

AI-assisted qualification record by coordinator `session_01Tj2YczsZkZSBgfB5BugRcS` (nifty-bohr). **Not an audit, not a
release authorization.** Nothing was deployed, published or tagged, and no real funds were used. Testnets and local
anvil only.

## Pinned candidate

- `main` `4eb02bb36470eb88f3529b01108f380b1b54af71` (PR #727). Its non-docs tree equals `3603960c` (PR #723):
  `git diff 3603960c 4eb02bb3 -- ':!docs'` is empty.
- Since then `main` has moved on to `cdddda0b` (PR #725, scan checkpoint idle-suspension guard). That commit is **not**
  covered by this record.
- Scope follows [STOP_WORK_20261125](../ai/STOP_WORK_20261125.md). The stopped products (F01, F02, F04, F08, F09, F11,
  F12, F13, P07, F14) are excluded from beta and v1.0 and are not qualified here. Only their dormancy matters.

## Verdict

**Not ready to release without owner decisions.** The automated checks that could run here and in hosted CI passed.
No functional failure in the core payment, scan, receipt and recovery flows was found.

Release still needs four things:

1. The owner decides on GP-PAGES-01. The November 27 owner decision on IDLE-M1 is recorded below.
2. The Mythril gate is dispositioned.
3. Exact-SHA Pages-on-anvil and beta-acceptance runs are done.
4. The browser and device checks no automation here covers are done (see "Not run").

## Hosted CI on the pinned SHA

| Workflow | Run | Result |
|---|---|---|
| CI (push to `main`, `4eb02bb3`) | 45882424415 | 27/27 jobs success. Includes `ts-test (web)` with `REQUIRE_ANVIL=1`, the other `ts-test` groups, `ts-typecheck`, `ts-lint`, `contracts-test`, `contracts-coverage`, `contracts-slither`, `contracts-static`, `contracts-extra` (pool, payer-hiding), `e2e (full)`, `e2e (lean)`, `lean-candidate`, `ghostid-native` (3), `secrets-and-egress` |
| Hosting kit (`3603960c`, same non-docs tree) | 45878204272 | success |
| Nightly `contract-analysis / mythril` (latest, `9d92472a`) | 45821745974, job 139915485428 | **failure** (the run's only failed job of 6) |
| Pages artifact on anvil, beta acceptance | — | Not triggered by pushes to `main`. The nearest exact-head evidence is on PR heads, e.g. #723 `dc172e61` (42 hosted checks reported green) |

## Local qualification on `4eb02bb3`

Clean worktree. `npm ci --ignore-scripts && npm run build:libs`, Node 22.23.5, Foundry 1.8.5, Chromium 1243 from
`/opt/pw-browsers`, 4 CPUs.

| Check | Command | Result |
|---|---|---|
| Web unit, Anvil required | `ANVIL_BIN=… REQUIRE_ANVIL=1 npm test -w apps/web` | 4358 passed, 2 failed, 13 skipped. Both failures are the `REQUIRE_ANVIL` guard tests (`registry.anvil.test.ts` "has anvil and solc", `paymentEvidence.anvil.test.ts` "requires local policy evidence Anvil artifacts"). They failed because solc could not be installed here (see "Unavailable"). Hosted `ts-test (web)` passed them |
| Repository script tests | `node --test scripts/{testnet,regtest,tests,agent}/*.test.mjs` | 275 tests: 274 pass, 0 fail, 1 skip |
| Recovery scripts (standalone decoder, raw-key spending on anvil, keystore reader) | `REQUIRE_ANVIL=1 node --test scripts/recovery/*.test.mjs` | 48/48 pass, 0 skip |
| Browser e2e, full profile | `GHOSTPAY_LOCAL_BUILD_PROFILE=full npm run test:e2e -w @ghostpay/web` | 193 passed, 3 skipped (lean-only cases) |
| Browser e2e, lean profile | `GHOSTPAY_LOCAL_BUILD_PROFILE=lean npm run test:e2e -w @ghostpay/web` | 180 passed, 6 skipped (profile-conditional) |
| Native reconciliation IndexedDB | `node apps/web/scripts/test-reconciliation-idb.mjs` | PASS (exact-ciphertext CAS, two-tab race/reorg refresh, stale-session abort, no external egress) |
| Secret scan, action pins | `bash scripts/scan-secrets.sh`, `bash scripts/check-actions-pinned.sh` | OK, OK |

## Phase-7 checklist against evidence

| Area | Evidence (local e2e specs on `4eb02bb3` unless noted) | State |
|---|---|---|
| Production-equivalent static build | Both e2e profiles build with the bundle scan; hosted `lean-candidate`; Hosting kit | Pass |
| Wallet connection and chain changes | `flows`, `core-journey`, `network-isolation`, `devnet-journey` | Pass (injected test wallet only) |
| Seller invoice creation and export | `core-journey`, `invoice-minimization`, `payment-request-file*`, `qr-invoice-image`, `print-targets` | Pass |
| Buyer payment execution | `core-journey`, `flows`, `payment-request-file-attempt`; hosted `ts-test (web)` anvil cases | Pass on mocks/anvil. The Pages-on-anvil journey was not run on this SHA |
| Seller scanning and reconciliation | `reconciliation`, `core-journey` (late payment, unavailable header), `stopped-scan-payment-export`, IndexedDB check | Pass |
| Receipt generation and verification | `receipt-lean`, `core-journey`, `print-targets` | Pass |
| Recovery from independently exported backup | `recovery`, `independent-keystore-recovery`, `stealth-archive-recovery`, `individual-stealth-export`, `backup-ownership`, `product-backup-retry`, `devices-mobile-restore`; `scripts/recovery` 48/48 | Pass |
| Privacy controls and local-data handling | `sensitive-clipboard`, `invoice-link-clipboard`, `idle-session`, `idle-freeze`, `passphrase-vault`, `network-isolation` | Pass |
| RPC outage and malformed responses | `https-rpc-compatibility`, `settings-rpc-reflow`, `browser-checks`, plus unit suites | Pass |
| Responsive UI and accessibility | `accessibility` (axe, 320 px reflow, 200 % text, forced colours), `devices`, `devices-mobile-*`, `responsive-pages` | Pass for automated rules only. axe reports `incomplete` items (`label-content-name-mismatch`, `color-contrast` under forced colours) |
| No GhostPay-operated backend | `network-isolation`, `pages-devnet` egress assertion (PR-head runs), `secrets-and-egress` | Pass in automation |

## Unavailable here (not a pass)

- **solc download blocked.** `forge build` could not fetch `https://binaries.soliditylang.org/linux-amd64/list.json`:
  the network proxy refused the tunnel. That blocked local `forge test`, the two `REQUIRE_ANVIL` guard tests above,
  `scripts/beta/acceptance.sh` (devnet deploy) and `scripts/beta/browser-devnet.sh`. Hosted CI covers contracts and web
  anvil tests on this SHA. The beta acceptance and Pages-on-anvil journeys are not covered for this exact SHA.
- The first IndexedDB run failed only because the script resolved a Playwright Chromium path that is not installed in
  this container. Rerunning with the installed Chromium passed.

## Not run

- Firefox, WebKit and Safari engines; real mobile devices and their downloads.
- Third-party wallet extensions and hardware wallets. Only injected test providers were used.
- Native assistive-technology review (VoiceOver, NVDA).
- Tor Browser acceptance.
- Real public testnet RPC providers.
- Any mainnet or real-funds path, which is out of scope by policy.

## Confirmed failures

- **Nightly Mythril gate fails on `main`.** Latest run 45821745974, job 139915485428; it was also failing on 2026-11-22
  and 2026-11-25. Eleven historical records carry AI-assisted dispositions (intended behaviour or analyser artifact) in
  [`docs/audits/security-remediation-20261118.md`](../audits/security-remediation-20261118.md). The CI job is not wired
  to a disposition checker, so it stays red. **Decision needed:** accept and wire the dispositions, or remediate.

## Unresolved security and owner decisions

| Id | Severity | Item | Source |
|---|---|---|---|
| GP-PAGES-01 | Owner decision | A shared `*.github.io` origin lets sibling pages read, forge or block the persistent wallet-attempt journal and lock. A custom domain removes this | REMAINING_WORK item 4 |
| IDLE-M1 | Closed by beta owner acceptance, November 27 | Anyone at the unlocked keyboard can export sole-copy keys under a passphrase they choose when no vault credential is tied to the keys. The seller warning describes this residual risk. | [SECURITY_FINDINGS](SECURITY_FINDINGS.md) |
| Mythril gate | Release gate | See "Confirmed failures" | Nightly |
| KEYS-B1 | Blocker for anything further from #372 | Mythril and Tor gates red on #372. Not applicable to what is already on `main` | SECURITY_FINDINGS |
| LATE-M1 | Medium (availability) | An unreadable reconciliation vault blocks scan checkpoints even with no registered invoices. Fails closed | SECURITY_FINDINGS |
| Cross-document checkpoint race | Low | Remains after #723 (documented there) | PR #723 |
| LATE-L1, REV-I5, REV-I6, QA-I1 | Low/Info | Fail-closed follow-ups | SECURITY_FINDINGS |

REV-L2 (pre-send check read the `localStorage` mirror) is fixed in source by `141b3f96` (from #545, on `main` through
#500 `c8e131c1`). `Pay.tsx` `assertNoPaymentAttempt` now reads inside `withAttemptJournal`. The tracker row is updated
with this record.

## Next actions

1. Owner: decide GP-PAGES-01 (custom domain) and the Mythril disposition.
2. Run the Pages-on-anvil (`BROWSER_DEVNET_MODE=pages bash scripts/beta/browser-devnet.sh`) and
   `scripts/beta/acceptance.sh` on the exact release SHA, in an environment that can install solc 0.8.28.
3. Do manual Firefox/WebKit/mobile, assistive-technology and third-party wallet passes on the built Pages artifact.
4. Re-run this record on the final release SHA; `cdddda0b` and later are not covered here.
