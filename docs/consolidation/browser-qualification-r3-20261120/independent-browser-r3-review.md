# Independent browser acceptance review — continuation R3

**Decision: APPROVE the bounded source and assertion-preservation changes. Zero blocking or nonblocking findings identified.** This is source review, not a claim that hosted CI, browser/devnet execution, integration or release gates passed.

Reviewer: `/root/r3_feature_completion`. Implementation owner: `/root/r3_browser_qualification`. Review date: 2026-11-20 UTC.

## Exact reviewed identities

| Role | Full identity |
| --- | --- |
| Base, PR #336 | `410353a23631234aa888e46f38df22291c699a26` |
| Base tree | `a506f54f1cd2c7ee5bbc007299e4a82a78d62a87` |
| Candidate | `5923fcbb13b73a6973f7dd21cf38daa573248ea5` |
| Candidate tree | `2e61abb2a3ed37379bd16ecc90306d2d765e2ed3` |

The candidate changes nine paths. Only `apps/web/src/components/WalletDisclosure.tsx` changes at runtime. The companion JSON records each changed path's base/candidate blob and sixteen byte-identical critical paths, including wallet sending, disclosure control, journal storage, the Pay view, browser authority assertions, inventory detector and configurations.

## Focus restoration

The prior cleanup treated `document.body` as a valid connected HTMLElement opener. A caller that lost focus while disabling its initiating control could therefore leave focus on the document root after a disclosure closed. The change explicitly excludes both document roots and disabled elements, preserves the hidden/inert/connected checks, and verifies that an attempted opener focus actually became active before returning. Otherwise it invokes the existing neutral privacy-control fallback.

The cleanup remains passive, after background inert removal, and retains the early return when a replacement disclosure exists. Its scope remains focus restoration: it does not alter focus trapping, the cancel/approve handlers, disclosure request data, explicit account/send approval, privacy revocation, controller lifetimes or provider invocation.

Mounted regressions cover the original focused caller, body and documentElement capture, and an opener disabled after the prompt appears. They retain cancellation and zero-provider-call/no-send expectations. The ordinary opener restoration control remains intact. Existing end-to-end quick-hide assertions still require the exact transaction payload to disappear from the accessibility snapshot, zero sends, focus on the header privacy switch and a fresh explicit approval before the original reviewed request can be sent. No browser assertion is removed to accommodate the runtime change.

The history shows the body regression and additional root/disabled cases before the runtime commit. This establishes commit ordering only; this reviewer did not rerun their reported RED/GREEN executions.

## Wallet journal, locale and keyboard fixtures

The corrected devnet and Pages tests match the actual unchanged authority boundary. `WalletAttempts` computes no visible records without a wallet and filters connected records by both account and chain. The Pay view starts with no wallet after reload and installs one only after the existing guarded, explicit disclosure/connection flow.

The tests now assert that persisted hashes are concealed while disconnected, independently inspect the stored journal, and restore positive hash-display assertions after reconnecting the matching wallet. They retain on-chain balances, transaction contents, fees, mined/pending status, duplicate refusal, single-send counts and nonce checks. Moving visibility checks to the authorized state preserves persistence and duplicate-prevention coverage while adding the missing disconnected-state privacy assertion.

The locale test similarly mounts without wallet authority, verifies the warning and absence of the account and clear control, then supplies the matching account/chain before the original English clear/payment-line assertions. Its translations and original outcome semantics remain covered.

The keyboard test adds the existing header privacy switch between the skip link and Home. Both original focus assertions and the remaining keyboard navigation sequence are retained. The production shell actually renders that switch before navigation.

## Final account reread

The fixture's `changeAccountOnRecheck` branch now changes the account returned by subsequent provider reads during `net_version`, without emitting `accountsChanged`. This targets the intended final account reread instead of prematurely entering the separately covered event-driven revocation path.

The actual unchanged `recheckWallet` reads accounts, reads/validates the chain, then reads accounts again and rejects a mismatch. `sendViaWallet` performs that recheck after disclosure and before `beginAttempt` or provider submission. The unchanged browser test still requires an account-change error, zero send calls, no transaction and no journal entry.

The general `changeAccount()` helper still emits `accountsChanged`, and separate lifecycle tests continue to use it. No provider event handling, wallet authority, duplicate-attempt protection or production transaction behavior changes.

## Privacy inventory

The entire inventory is byte-for-byte equivalent after reverting the single Pay reference count from seven to six. All 37 surface records, authority policies and detector assertions remain unchanged. The documented actual call count remains three.

Source inspection identifies seven `getRpc` references in Pay. The additional reference is `app.getRpc` in `refreshContext`'s dependency array, introduced by `74dccc41` when the callback dependencies stopped depending on the entire app object. It is not a new dispatcher. The three actual call sites retain explicit payment-preflight actions and cancellation/current-authority handling. Refreshing this one reviewed count is justified; disabling the detector or broadly accepting an unreviewed snapshot is unnecessary and was not done.

## Evidence and execution limits

This review read exact pinned Git objects, the complete patch, surrounding runtime/test code, provider/account authority, journal filtering, privacy/focus helpers, the shell's control order, historical Pay dependency changes and the inventory detector. `git diff --check` for the reviewed range passed. No contract, economic, dependency, workflow, coverage, timeout or skip gate changes appear in the candidate.

No repository tests, typecheck, lint, build, browser, local server/socket, devnet or live transaction were executed by this reviewer. No source, ref or remote state was changed. Only these two scratch review reports were written. Execution evidence from the implementation worker must retain that attribution, and exact-successor hosted/browser qualification plus fresh source/ownership checks remain required before coordinated integration.
