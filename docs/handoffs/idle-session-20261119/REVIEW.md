# Independent idle-session review

These are separate AI-assisted engineering reviews, not an external professional audit.
The implementation and review work used the Caveman investigate-first workflow. Each
confirmed behavioral issue received a regression before its correction.

## Review lanes

| Reviewer | Scope | Source-review outcome |
| --- | --- | --- |
| Clock/lifecycle reviewer | Independent clocks, callback generations, activity ordering, lifecycle transitions, full/lean cases | Initial 28 failures and 2 async-before-event failures reproduced. Final 68-case suite passed in isolation, including recovery-housekeeping cases; the earlier combined worker kill remains recorded separately. |
| Vault/session reviewer | Synchronous authority revocation, pending crypto/import/save work, retained recovery, secret-buffer boundaries | Initial 11 failures reproduced. Final 16-case session suite passed after holder-snapshot and observer-dispatch corrections. Reviewed the coordinator's housekeeping patch independently. |
| Integration reviewer | Branch ancestry, active overlaps, scope, privacy/recovery preservation, current main changes and hosted gates | #227 is already in #238. No contract, dependency or CI-policy changes in the idle feature. New main's #241 transport protection and #237 log retention must be preserved. |
| Coordinator | Independent review of session API implementation and final composition | Found holder resampling and throwing-observer problems; both received failing regressions and corrections. Retained-copy recovery-input lifetime was separately reproduced and repaired. |

## Findings and disposition

| Finding | Failure mechanism | Correction and regression |
| --- | --- | --- |
| Invalid activity baseline | Activity sampled each clock twice, allowing an unchecked non-finite baseline | One validated clock pair; invalid/negative/throwing clock tests in `AppShell.idleClock.test.tsx` |
| Stale callbacks | Timer and lifecycle callbacks could outlive activity reset, wallet replacement or effect cleanup | Timer revision, lease identity and active-effect checks; queued callback regressions |
| Replacement session expiry | Prior locked latch survived new key installation | Synchronous session-identity subscription; replacement's independent deadline regression |
| Late custody answer | A disposed effect or synchronous lock listener could redirect disposal to another wallet | Capture ownership before notifications; guard asynchronous custody answers by lease, session revision and effect lifetime |
| Activity before lock | A target handler could borrow keys before the bubbling activity listener ran | Capture-phase activity plus sensitive-boundary expiry checks |
| Promise before browser event | A guarded async continuation could finish after sleep before timers/focus events | Synchronous expiry callback in guards and borrowing APIs; no-event promise regression |
| Retained authority | Sole-copy keys and pre-expiry guards stayed usable while storage was pending or unavailable | Synchronous session suspension, generation invalidation and constrained encrypted backup guard |
| Temporary secret lifetime | Borrowed async scalars outlived lock until their promise settled | Track owned buffers; wipe on revocation and settlement; reject stale results |
| Borrowed wallet mismatch | A second expiry observation could switch the holder after capturing its guard | Capture holder and revision together before opening temporaries |
| Observer exception | One throwing listener could prevent remaining lock/clear observers running | Failure-isolated session/custody notifications, including final disposal |
| Recovery form lifetime | New recovery passphrases could remain indefinitely after the first suspension | Re-arm only transient cleanup on subsequent input, preserving suspended authority and custody-decision identity |

## Preserved boundaries

- No new authentication mechanism, custody architecture, plaintext persistence or encryption/KDF change.
- Existing imported-key, signer-only, downloaded-backup and encrypted-vault custody rules remain.
- Retained recovery intentionally stays available to whoever controls the tab. No confidentiality or physical-erasure claim is made for that exception.
- Settings, RPC consent, privacy defaults, frame/origin refusal and full/lean packaging are preserved.
- No assertions, coverage thresholds, required security gates or branch protections are weakened.
- Actual Chromium execution, physical OS sleep, Tor and real-device acceptance must be distinguished from jsdom and synthetic clock/lifecycle tests.

## Integration review

Main advanced during the work from `dfc75ef2087fa6463ae59e0818abec01796c578d`
to `58d89b39b27a66454ebf392bcd35d5c68b57b2f8`. The new main adds browser transport
isolation and beta-log retention. Its runtime changes do not overlap the idle feature;
the shared ownership registry must retain both claims. The beta workflow and its
handoff already have identical blobs in #238. The three modified transport libraries
must be rebuilt before final combined qualification.

Exact final source identities, executed commands, results and the consolidation outcome
are recorded in [COMPLETION.md](COMPLETION.md). Review clearance alone does not clear CI.
