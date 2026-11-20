# Private transaction history: generation 2 handoff

## Released implementation

Branch `privacy/v1-history-20261120`, predecessor `814eb4d88f96cc797294a130583737d01cc19054`. Runtime and tested source **`4cc9026f4e9ee27905da70f75b0b8487f8f14a2b`**, tree `18d98f6bc267ff0feb4be60bff96d840175ffd49`. The final documentation commit contains no additional runtime changes.

The independent review confirmed a missing integration: all four production `WalletAttempts` instances omitted the current wallet. The existing component correctly concealed disconnected history, so the omission also made explicitly confirmed clearing unreachable even after connection. The original Pay blind-retry test and original Policy deliberate-repeat test both reproduced that failure. A new Registry test independently reproduced missing current-account history.

The production repair changes four props only: two Pay render paths, Registry, and PolicyPay now pass `wallet={wallet}`. No history component, journal format, persistence, connection authority, network, dependency or cryptography implementation was rewritten. Existing repository modules and tests were reused; no external source was copied. The standalone runtime commit is `4cc9026f4e9ee27905da70f75b0b8487f8f14a2b` for other feature branches that need this prerequisite.

## Independent source review

| Boundary | Finding and preserved behavior |
| --- | --- |
| Current wallet | WalletAttempts filters every record by exact chain and normalized account. Missing or unmatched wallet shows a neutral unresolved-request notice without account/hash rows or clear controls. |
| Temporary history reveal | In privacy mode, the additional history reveal requires both unlocked authority and an unmasked global privacy state. Its separate 30-second grant binds scope and privacy revision; reconnect, lock, route/session changes and invalid/rollback clocks revoke grants through the existing privacy module. |
| Presentation concealment | PrivacyBoundary uses native hidden, inert and aria-hidden, clears selections and moves focus to a safe control. Mounted DOM/workflow memory remains; this is visual concealment, not erasure. |
| Encrypted reconciliation | Ledger reset locks the vault, clears visible records and increments operation/read revisions. Session/scope changes and unmount prevent late reads from restoring obsolete data. Existing encrypted records remain untouched. |
| Duplicate-attempt safety | Unknown and submitted entries remain until explicit per-record confirmation. Neither elapsed time nor a returned hash implies a safe retry. New Registry coverage confirms a rejected confirmation leaves the exact journal bytes unchanged. |
| Provider lifecycle integration | The parallel v1 wallet feature owns account/chain/disconnect/app-lock state revocation. This branch wires the current state; combined lifecycle qualification is still required. |

## Actual verification

Commands, complete unmodified compressed logs, hashes and exits are in [history-gen2/evidence.json](history-gen2/evidence.json).

| Check | Result |
| --- | --- |
| Original Pay and Policy regressions before repair, source `894844ca` | **2 failed, 76 deliberately filtered**, exit 1, 9.02s |
| New Registry scope regression before repair, source `94c639f8` | **1 failed**, exit 1, 3.52s |
| Complete focused five-file selection at the runtime source above | **84 passed, zero skips**, exit 0, 45.32s |
| Secret scan and complete feature whitespace check | Passed |

The 84 cases comprise all 66 original Pay cases, 12 original Policy guard cases, the new Registry case, 4 WalletAttempts component cases and 1 encrypted reconciliation privacy case. The earlier failures and the first-generation five cases overlap this acceptance set; do not add them to the 84 as distinct coverage.

The new Registry test demonstrates initial concealment, matching account+chain disclosure, exclusion of a different account and a different chain, refused clearing, withdrawal concealment, byte-exact journal preservation, and no added RPC or send. No real wallet transaction was made.

Original full TypeScript, typed lint, complete coverage/nocov, original browser and hosted release gates were not executed by this worker. Coordinator attempts at full TypeScript are separately recorded resource failures, not passing qualification. This branch's 84 tests do not replace those gates.

## Fresh successor assignment

1. Reconcile this released history branch with the separate v1 wallet branch without losing any of the four props. Preserve standalone v1.0 behavior without a v1.1 dependency.
2. On the v1.1 disclosure candidate, adapt the new `RegistryView.history.test.tsx` to explicitly approve its account-access preview immediately after Connect. Keep the v1 test unchanged on this independent branch. The disclosure successor received both standalone runtime and tests-only SHAs.
3. Run the original `e2e/privacy-mask-history.spec.ts` history journey in the coordinator's browser gate window. Source review confirms it compares encrypted bytes before/after masking and vault lock, checks the accessibility snapshot, and asserts no extra request or plaintext localStorage hash. This worker did not execute it.
4. Qualify account/chain/disconnect/lock and late-completion behavior on the final combined exact source; keep original security/type/lint/coverage/build/hosted gates intact. Add only regressions for demonstrated remaining defects. No remote publication, deployment, blanket deletion or automatic unknown-attempt expiry.

Ownership is released after this evidence checkpoint.
