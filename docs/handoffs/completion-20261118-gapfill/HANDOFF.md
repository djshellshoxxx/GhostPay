# Handoff — completion run 2026-11-18 (gap-fill coordinator, PR #211)

AI-assisted engineering, not a professional audit. Start `main` = `5467c158`. Integration branch
`nodata/wonderful-darwin-kd1h22`, head `f2f35909`. Ledger: [LEDGER.md](LEDGER.md). Security rows:
[SECURITY_CLOSURE.md](SECURITY_CLOSURE.md).

## What this run did
This was the second coordinator. PR #209 (`claude/ghostpay-completion-audit-ot5jjm`) claimed first and runs spec 18,
security lanes B1-B4 and the D/E/F finders. This run took only the rows #209 did not claim, on paths it does not own,
and ran no duplicate finders. Each lane was reviewed independently before it was integrated:

| Lane | Rows | Result | Merge |
|---|---|---|---|
| G1 | SEC-11, SEC-12, SEC-28 (policy-scheme doc), audit 24 F3 doc | SEC-11 Fixed (client gate, leaf proven against the root); SEC-12 default kept, owner numbers needed; doc matches the shipped `PolicyRef` ABI | `62d2ff29` |
| G2 | SEC-13 | No clipboard path for BTC/SOL/TRON secrets (OD-02 default); docs corrected | `44714f41` |
| G3, G3b | SEC-22 (scan cursor slots) | Slot names from HKDF(viewing key); every legacy v1/v2 slot swept; name cached per key set | `675270d5`, `6ff3dd85` |
| G4 | SEC-30 (SEC-29 rejected) | Focus behaviour pinned by `e2e/focus-scope.spec.ts`; the SEC-29 overlay change failed review and was not integrated | `407868a1` |
| G5, G5b | TB-08, review findings N-02..N-04 | CLI-side Solana/TRON formats and Solana derivation equal the web packages (shared vectors, crypto review); TRON `build()` fails closed (`MEMO_NOT_BOUND`); CLI reports the Solana cluster, refuses mainnet, surfaces legacy errors | `b290426e`, `1b28f355` |
| G1c, G1d | Dropped b85e0b59 hardening (N-09, from PR #218's triage); review findings N-10, N-11 | Decoder, signing guard, leaf recomputation and secret-copy order restored; signing reads its input once; the send gate binds R and metadata (a swapped R would have paid an address the seller cannot find) | `f2f35909` |

## Final qualification at `f2f35909`
Code head for qualification: `6ff3dd85` (full run) and `f2f35909` (after G1c/G1d; affected suites plus reruns). Later
commits are documentation only. Commands as in CI; clean `npm ci --ignore-scripts` + `npm run build:libs` first.

| Step (at `6ff3dd85`) | Result |
|---|---|
| `npm ci --ignore-scripts`, `npm run build:libs`, root `npm run typecheck`, root `npm run lint` | pass |
| `node scripts/i18n/check.mjs` (0 errors), `node scripts/i18n/extract.mjs` | pass |
| `npm test` (every workspace) | **one failure, environment**: `@ghostpay/confidential-contracts` `hardhat test` cannot download solc (`HH502`, `getaddrinfo ENOTFOUND binaries.soliditylang.org`); every other workspace passed |
| `ci:scan-secrets`, `ci:check-actions`, `ci:check-tx-origin`, `npm audit --omit=dev --audit-level=high` | pass |
| `apps/web` full build; Playwright full profile / lean profile (`--trace off`) | pass: 79 passed, 1 skipped / 67 passed, 3 skipped |
| Foundry v1.8.5 from the GitHub release (tarball sha256 `6c66ffcc55fa4249197721baa3098bc208014ea1d8aa04b2ed50ac6bccffb226`; the repository pins the version only, not a digest) | fetched |
| `forge build`, `forge test` (packages/contracts) | pass: 490 tests, 34 suites |
| Relayer anvil e2e (`ANVIL_BIN=… REQUIRE_ANVIL=1 CI=true npm test -w apps/relayer`) | pass: 475 tests |

At `f2f35909`: policy-scheme 111 passed / 7 skipped (anvil), web `src/features/policy src/i18n` 332 passed / 4
skipped, policy-scheme and web typecheck 0, eslint 0, i18n check 0 errors, secret scan OK; `npm test -w apps/web` (coverage + no-coverage configs) 199 files passed / 2 skipped, 2737 tests passed / 13 skipped; Playwright full profile 79 passed / 1 skipped.

Hosted CI: earlier heads of PR #211 show red aggregator checks only because newer pushes cancelled their runs
(`RESULTS: cancelled`); see the PR comments. The final push is the first one CI can run to completion.

## Unfinished rows and their dependencies
1. **POST-209** (blocked on PR #209 landing; agreed with its coordinator): merge `main` (merge commit, never rebase);
   resolve the `docs/ai/ACTIVE_WORK.md` top-of-file insertion and any `apps/web/locales/*.json` /
   `apps/web/src/i18n/securityKeys.ts` conflicts (keep both sides' keys, rerun `node scripts/i18n/check.mjs` and the
   `securityKeys` test); then update the four SEC-22 lines `docs/threat-model/PRIVACY_THREAT_MODEL.md:106`,
   `docs/threat-model/THREAT_MODEL.md:30`, `apps/web/locales/en.json:273`, `docs/user/privacy-limits.md:40`
   (numbers at `5467c158`) and the `apps/web/src/AppShell.tsx:147` clipboard comment if #209 left them.
2. If PR #218 (`claude/exciting-brown-7v69cr`, owns `packages/cli/src/**`; agreed G5b's three CLI files stay here) lands
   first: merge `main`, run the full CLI suite. #218 adds `packages/cli/src/global-switches.test.ts` (every value-taking
   option must treat `-h` as its value; legitimately free-text options go in `ANY_STRING_ACCEPTED`) and honours
   `--help/-h/--version` only in flag positions. G5b added no option, so only test expectations could need adjusting.
3. After PR #213 lands: add `test-vectors/meta-address-sol-tron-v1.json` to `test-vectors/README.md`.
4. **SEC-22c** (unclaimed, engineering-closable): pseudonymize or encrypt the remaining plaintext identifiers — vault
   `meta.metaAddress`/`signer` (`packages/ux-vault/src/keystore-portable.ts:16,85`), reconciliation storage key and
   `sellerKeyId` (`packages/ux-vault/src/reconciliation-portable.ts:407-432`), tag timestamps
   (`apps/web/src/lib/tags.ts:8-20`), sweep/duplicate attempt journals (`apps/web/src/lib/sweepAttemptJournal.ts:5-14`,
   `duplicateAttemptJournal.ts:4-23`). Each needs a storage-format migration; claim it in `ACTIVE_WORK.md` first.
5. Optional: move `MEMO_NOT_BOUND` into `TronErrorCode` (`packages/chain-tron/src/errors.ts`); bind the GPT1 memo into
   a locally encoded `Transaction.raw` (as `@ghostpay/tron-adapter` `buildTrc20Transfer` does) before re-enabling
   TRON payment building.
6. Mark PR #211 ready only when its head is green and POST-209 is done.

## Owner checklist (decisions are the owner's; recommendations only)
| ID | Decision or action | Recommendation |
|---|---|---|
| OD-01 | Re-authentication before revealing or exporting secrets in a vault-less session (BTC/SOL/TRON reveal included) | Require an encrypted vault (or WebAuthn user verification) before any reveal/export; until then keep reveal explicit and clipboard-free as shipped |
| OD-11 | Per-chain minimum policy delay on L2s (factory `MIN_DELAY` = 1 h) | Floor ≥ the chain's documented forced-inclusion / sequencing window + margin, enforced in the UI; numbers must be taken from docs.optimism.io / docs.arbitrum.io (unreachable from this session) |
| UX-01 (new) | Contextual help: keep the hover preview (which collapses on pointer-leave and shifts layout, R-03/SEC-29) or expand help only on click/focus | Click/focus-only expansion: it removes the layout shift without an overlay that can intercept clicks (the overlay attempt broke `contextual-help.spec.ts:108`) |
| OA-07 | CodeQL, Dependabot and secret-scanning alert inventories | Export them or grant access; no session could read them |
| SonarCloud | "Security Rating on New Code" issues | Add `sonarcloud.io` to the cloud environment's allowed domains (Network access → Allowed domains, https://code.claude.com/docs/en/cloud-environments#network-access) or export the issue list |
| Snyk | Results, if Snyk is used | No Snyk configuration in the repository |
| Others | OD-02..OD-19, OA-01..OA-06 | Unchanged; see `docs/handoffs/post-consolidation-20261118/BLOCKERS_AND_DECISIONS.md` (PR #205) |

## Resume
```bash
cd GhostPay && git fetch origin && git checkout nodata/wonderful-darwin-kd1h22 && git pull --ff-only
```
```bash
npm ci --ignore-scripts && npm run build:libs
```
```bash
git merge --no-edit origin/main
```
Lane branches `claude/completion-20261118-gapfill/*` were local to the cloud container and are fully merged; nothing
needs them. Commit messages carry the RED/GREEN evidence of each change.
