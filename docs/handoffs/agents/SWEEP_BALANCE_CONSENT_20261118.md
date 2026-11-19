# Sweep balance consent review and repair — 2026-11-18

## Source and ownership

- Worker: ChatGPT recovery reviewer, Caveman workflow; independent reviewer: ChatGPT privacy reviewer.
- Target: the static GitHub Pages EVM beta. Branch: `chatgpt/ghostpay-sweep-balance-consent-20261118`.
- Refreshed main/base: `dfc75ef2087fa6463ae59e0818abec01796c578d`.
- Test-first regression commit: `de9da9cd994dd2a18ae091028784fb715bf81c44`.
- Repaired runtime, catalogs and DOM tests: `d03d529f5b785dcd129b302d122b191d3d066214`.
- Reviewed extraction source: PR #222 at `2bc2098298d90928eb1acafad969f28316bb05fc`. Only its explicit balance-query
  consent requirement is extracted. Its destination ledger, network profiles and experimental changes are not imported.

The final handoff commit adds this document, the claim milestone, and explicit balance-read clicks at two further
existing E2E navigation reentries. It does not change runtime sources, catalogs or DOM tests from `d03d529f`.
Those two E2E additions retain the existing second-sweep refusal assertions. Fresh hosted CI is required on the
published final head; earlier checks do not qualify a different candidate.

Owned changes: `apps/web/src/views/Sweep.tsx`, `Sweep.privacy.test.tsx`, existing setup steps in `Sweep.test.tsx`,
balance-query text in `apps/web/locales/{en,es,ja,ar}.json`, its classification in `src/i18n/securityKeys.ts`, and
explicit setup clicks in `e2e/{sweep,core-journey,pages-devnet,devnet-journey}.spec.ts`. The integration owner approved
the test adaptations. No shared RPC interface, chain library, contract, dependency or payment enablement changes.

## Findings and behavior

Main starts a sensitive balance query when Sweep opens with default settings or an optional local proxy. Its existing
required-private-path consent is also persistent: after a click, a new app-context value restarts the effect and repeats
the query. Asset changes at the same address inherit consent. Changing the selection or unmounting while RPC creation
is pending does not stop the old request from subsequently naming the address.

The repaired view performs its balance read in the explicit button handler. Effects only clear state and invalidate
pending work; they never call the RPC. Each click makes one UI invocation of `readBalance`. Ordinary rerenders,
destination edits, request failures and newly available settings do not repeat that invocation. A further click is
required to refresh. Neither failure nor an unavailable RPC selects a secondary provider or a scan transport.

The operation is bound to the selected payment, chain, asset, configured RPC URL, RPC factory and session identity.
The session-version guard also rejects a cleared or replaced session even before React receives an updated context.
Changing scope, locking the app or unmounting invalidates pending work. The view checks this boundary after asynchronous
RPC creation, before passing the address to `readBalance`, and again before applying a response or error. A scope
change clears the old balance and quote. A refresh also clears the quote because its amount depends on the balance.

This is not an HTTP cancellation mechanism. An already-sent request cannot be recalled. The existing shared
`createClient` transport retains its bounded retry policy (two retries by default), including chain verification.
The one-invocation-per-click claim must not be presented as a one-HTTP-attempt guarantee. An explicit signing or
status-check action retains its existing RPC behavior.

The warning still tells users when a required private scan path is bypassed. Both warning variants disclose the
one-time address, token contract for a token balance, and connecting IP visible to the Settings RPC. They do not
promise Tor routing: protection depends on the user's browser or network setup. The existing scan disclosure's
`sweepAuto` message now describes the explicit button, so the source key's legacy name does not leave incorrect
automatic-read text in the interface. Changed sensitive text remains English in the unreviewed locale drafts;
no native translation review is claimed.

## Executed acceptance

Dependencies and library distributions were reused from the coordinator's main checkout at the same base.
The package sources matched that base, and workspace links resolve inside this worktree. No install or library rebuild
was needed. All Vitest runs used one worker and synthetic test data.

1. **RED, main runtime plus the committed regression tests:** from `apps/web`,
   `npx vitest run src/views/Sweep.privacy.test.tsx --maxWorkers=1 --reporter=json --outputFile=/workspace/scratch/fb6d03ffb806/sweep-consent-red.json`
   exited 1: **14 failed, 2 passed**. Failures reproduce default automatic reads, repeated reads after context changes,
   inherited asset consent, stale requests after scope/session/unmount changes, and retries caused by view effects.
2. **GREEN, configured web suite:** from `apps/web`,
   `npx vitest run src/views/Sweep.privacy.test.tsx src/views/Sweep.test.tsx src/i18n/securityKeys.test.ts src/i18n/translator.test.ts src/lib/scanPrivacy.test.ts --maxWorkers=1 --reporter=json --outputFile=/workspace/scratch/fb6d03ffb806/sweep-consent-green.json`
   exited 0: **120/120** in five files. Breakdown: consent **17**, existing signing/sweep **55**, critical-message
   policy **12**, translator **4**, scan privacy **32**. An earlier exploratory broader run exposed seven legacy
   navigation/reload setup points; those now click the read button, with all original assertions retained.
3. **Whole web typecheck at `d03d529f`:** from the repository root,
   `NODE_OPTIONS=--max-old-space-size=1536 npm run typecheck -w @ghostpay/web` exited 0.
4. **Scoped lint:** from the repository root,
   `npx eslint --config eslint.config.js apps/web/src/views/Sweep.tsx apps/web/src/views/Sweep.privacy.test.tsx apps/web/src/views/Sweep.test.tsx apps/web/src/i18n/securityKeys.ts apps/web/e2e/sweep.spec.ts apps/web/e2e/core-journey.spec.ts apps/web/e2e/pages-devnet.spec.ts apps/web/e2e/devnet-journey.spec.ts`
   exited 0. The two final E2E reentry additions were checked again with scoped ESLint.
5. **Locale validation:** `node scripts/i18n/check.mjs` exited 0: **4 catalogs, 0 errors, 415 warnings**.
   Warnings include deliberately unchanged English in unreviewed locale drafts.
6. **Independent review at exact `d03d529f`:** the privacy reviewer verified source blobs and a clean worktree,
   then ran from `apps/web`:
   `../../node_modules/.bin/vitest run src/views/Sweep.privacy.test.tsx src/views/Sweep.test.tsx --coverage.enabled=false --maxWorkers=1`.
   Result: **72/72**, two files, exit 0. The reviewer found one overly categorical Tor sentence; it was corrected
   before this source commit. The reviewer reported no remaining source blocker after that correction.
   The reviewer also inspected the final two E2E reentry clicks and corrected comment, confirmed no assertion was
   removed or weakened, and verified that runtime, DOM-test and catalog sources still match the tested source.

## Remaining gates and scope limits

- The branch needs exact-head hosted CI and the integration owner's publication/review. This worker made no remote
  mutation, merge, deployment or release, and used no real funds.
- Browser E2E setup has been adapted but has not executed on this branch. Earlier browser launch in this session
  failed with `socket() failed: Operation not permitted (1)`; that is an environment blocker, not browser acceptance.
  Actual browser provider behavior, mobile accessibility and Tor/network behavior still need their existing gates.
- No new Pages artifact was built by this worker for this extraction. Runtime reachability is confirmed in source:
  `AppLean` uses `AppShell`, which imports this core `Sweep`; the full app shares it. A static build is still distinct
  from hosted browser qualification.
- This changes EVM native/ERC-20 Sweep consent only. Bitcoin, Solana, TRON and experimental privacy features are
  unchanged and gain no qualification from these results. Lean imports do not acquire the optional full-app features.
- The repair preserves existing transaction signing, vault step-up, journal persistence, uncertain-outcome locks,
  same-nonce replacement and second-sweep refusal behavior. Their existing 55 DOM tests pass; broader application
  or protocol suites are not claimed by this handoff.
