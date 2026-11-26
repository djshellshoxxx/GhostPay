# Account/vault/session privacy: post-integration fuzz, stress, QA and audit (2026-11-26)

Worker: Claude Code session `ghostpay-68`. Branch `claude/account-privacy-audit-20261126`.
Audited source: main `e1d0eb0f7c8688ae280f774f36e01e08d2435deb` (#697 `045ac2d3` = #691 `6b4bbe17` + main; #698 = #692
`c7b9badc`), whose tree equals the reviewed head `f45025b5f2cfa27f938c10c35490b42768b8ae0a`.

## Method

- Independent read-only passes, each given the code rather than a conclusion: a security review (securitymaxxing
  `diff` method plus the `ghostpay-security-invariants` checklist), a correctness review (feature-dev code-reviewer)
  and a silent-failure review (pr-review-toolkit). Every reported item was traced in source before acting on it.
- Light fuzzing with the pinned `fast-check` dev dependency and fixed seeds, plus bounded stress cases.
- Exploratory QA through the existing component and full-app jsdom harnesses. Hosted CI remains the browser gate on
  this memory-constrained host (local Playwright is not run).

## Confirmed defects fixed here

1. **An unsaved returned hash was invisible unless the matching wallet reconnected** (silent-failure review, item 1).
   The open-tab limitation text (`walletAttempts.unsaved`) rendered only inside the owner-scoped list. After a wallet
   change, lock or account switch revoked checkout while the save failed, the user saw only "connect to reveal" and had
   no reason to keep the tab open; nothing guarded unload.
   - `WalletAttempts` now states, with no account, chain, hash or count, that a returned hash in this tab has not
     finished saving whenever the shown owner cannot see it, with a "Retry saving" button that rewrites only existing
     evidence (no wallet or RPC request).
   - `duplicateAttemptJournal` installs a generic `beforeunload` guard while a browser-store returned hash is unsaved
     and removes it after the complete durable write. Injected stores never install it.
   - Regression: `apps/web/src/components/WalletAttempts.unsaved.test.tsx` (3 cases).
2. **`retryReturnedAttempts` rejected at the first failure while other writes still ran** (found by the new stress
   test). The retry button re-enabled and reported failure mid-flight. It now settles every write (`allSettled`) and
   then rethrows the first failure. Regression: the 96-hash case in `duplicateAttemptJournal.returned.stress.test.ts`.
3. **Pay reopened Prepare/Send for a public invoice already handed to the wallet** (security review, item 3; invariant
   WEB-APP-02, `docs/audits/17`). The #691 revocation handler reset a public invoice to `ready`; after reconnecting, the
   non-permit Prepare path showed Send again and only the journal refused at click time. Pay now records, without any
   hash, account or outcome, that a payment request for that open invoice may have reached a wallet (phase `done` or
   `submitted`, or the synchronous wallet-request callback) and shows "Payment already requested" instead of the
   wallet/Prepare controls until the user forgets the invoice. A same-tick wallet event is covered by a ref.
   Regression: two cases in `WalletPrivacy.lifecycle.test.tsx` (`done` and `pending`).

All six regression cases failed on `e1d0eb0f` and pass with the fix.

## Reviewed and not changed

- **IDLE-M1 (owner decision).** An idle-suspended tab keeps sole-copy keys, including `signerOnly` ones the old lock
  wiped, and still allows encrypted export, so someone at the device can export them under their own passphrase. This
  is the owner-accepted #689 recovery-only design; `docs/user/session-security.md` and `app.idle.suspended.body` state it
  truthfully. Reducing exposure (for example retaining only the signer for `signerOnly`) needs a partial-keystore format,
  a recovery-critical format change. Recorded by #706 in `docs/engineering/SECURITY_FINDINGS.md`; not duplicated here.
- Revoking on any wallet lifecycle event, including a same-account `accountsChanged`, is the fail-closed direction
  required by acceptance; it suppresses success and embed notices after revocation by design (acceptance item 3).
- A conflicting returned hash fails every journal read in the tab until reload: fail-closed, no duplicate risk.
- Pay and Retry silent `catch` paths while keys are suspended are unreachable: AppShell forces the seller view and
  disables other routes while suspended (`AppShell.tsx` view selection and nav).
- Clear of a record whose hash is unsaved: fixed separately by #706 (JRNL-L4).

## Fuzz and stress coverage added

- `duplicateAttemptJournal.returned.fuzz.test.ts`: model-based interleavings of begin, returned hashes (including a
  conflicting second hash), storage failures, explicit clears and retries, partly concurrent, through an explicit store
  (150 runs) and the IndexedDB snapshot plus localStorage mirror (40 runs). Properties: one durable record per attempt,
  no returned hash lost unless explicitly cleared, a resolved save stays durable, recovery saves every non-conflicting
  outcome, a recorded key never starts again, and the browser fallback fully drains.
- `useWalletPrivacy.fuzz.test.tsx`: 300 random sequences of capture/begin, lock, session clear/load/suspension,
  provider events, wallet swaps (including A -> B -> A with identical session objects) and rerenders. Exactly the
  current generation stays live, aborted signals never revive, no listener leaks, unmount revokes everything.
- `duplicateAttemptJournal.returned.stress.test.ts`: 96 concurrent returned hashes through intermittent write
  failures, a 500-call retry storm coalesced into one lock grant, and a 48-hash burst with a re-reading subscriber and
  bounded change events.

## Evidence (local, Windows host with about 4 GB shared RAM; `--coverage=false`)

- New fuzz, stress and regression files: 4 files, 9/9 passed after two test-model corrections (a wallet connecting
  where none was observed revokes nothing; a test used the hash as its action key). Pay terminal cases 2/2 passed.
- Red/green: the 6 regression cases failed with the three runtime files at `e1d0eb0f` and passed with the fix.
- A first full-suite run surfaced one more defect in this change: the unload guard assumed `window.addEventListener`,
  so a stubbed environment made `finishReturnedAttempt` throw before retaining the hash (`send.test.ts`). The guard is
  now best effort and can never prevent retention or persistence; `send.test.ts` 37/37.
- Affected suites (74 files: journals, wallet, WalletAttempts, Pay, lifecycle, policy, registry, i18n, boundary): 62/70
  executed files passed in a run contaminated by that mid-run edit. Clean rerun of the 7 failing files: 4 passed; the 3
  policy files failed 6 cases with `findBy` timeouts. The same files on `e1d0eb0f` code failed 5 cases, with a
  different set each run; the two cases failing only with this change pass in isolation. Treated as host load timeouts;
  hosted CI is the gate. `LanguagePicker.test.tsx` is the known pre-existing passive-effect race.
- `npm run typecheck -w @ghostpay/web` passed; ESLint on every changed file is clean; `node scripts/i18n/check.mjs`:
  4 catalogs, 0 errors (warnings are English-source fallbacks, as before).
- Not run: local Playwright, full/lean browser, beta, Pages-artifact and mobile lanes (hosted CI gates), deployment,
  live wallets or funds.
