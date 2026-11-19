# Independent integration-lock review

Source: 9e28830b48455b53e95910310152346323c422ba.
Implementation SHA-256: 95e5686a116f8b4b5373fe7b82a1989fb59fc23c6c4a0f781599ca15c5ef9192.
Test SHA-256: 4ca3aadc0847964802a3c81818dcad2ffbcca937a6d22e1dcfe7d876225176af.
Reviewer: independent branch-review worker; not the implementation author.
Scope: cooperative Git-ref ownership, configured-remote behavior, race and failure paths. No external repository writes.

## Executed baseline

node --test scripts/tests/integration-lock.test.mjs

8 passed, 0 failed, 0 skipped; 17389.667474 ms. This includes real bare-repository races on absent and released lock refs. Source and test files were identical to the reviewed commit after execution.

## Finding LOCK-REVIEW-01: implicit tag publication (blocking)

At publish(), git push inherits push.followTags. In a local bare-remote fixture: acquire a lock; set push.followTags=true; create an annotated v0.0.0-lock-review tag pointing to the acquired lock commit; call heartbeat. The remote changes from main + lock refs to main + lock + refs/tags/v0.0.0-lock-review. Only-lock mutation guarantees do not hold, and a version tag can invoke the repository release workflow.

Required repair: explicitly disable follow-tags during lock pushes and add a real-Git regression proving the full remote ref set is unchanged except the lock. Do not relax hooks or force ref updates.

## Finding LOCK-REVIEW-02: heartbeat crosses expiry check (blocking correctness gap)

heartbeat() checks time in owned(), then reads time again without rechecking the prior expiry. A two-value clock returning old expires_at minus 1 ms followed by old expires_at plus 1 ms permits renewal. Observed new heartbeat 2026-11-19T07:47:07.858Z, old expiry 2026-11-19T07:47:07.857Z. This contradicts the documented expiry behavior. A second-read rollback after an earlier heartbeat also needs to be refused or eliminated by using one checked time.

Required repair: validate the transition timestamp against prior heartbeat and expiry, or reuse the checked ownership timestamp; add an explicit boundary regression.

## Additional independent probes

- Successful remote write followed by lost client acknowledgement: a Git wrapper completed the push, then returned exit 1. acquire() rejected with 'Integration lock update rejected or unconfirmed; re-read remote state before proceeding.' status() observed held ownership. No false success was reported. Recovery still requires the caller to re-read and reconcile.
- fetch.prune=true plus fetch.pruneTags=true: status() preserved a local-only tag in the tested fixture.
- Split fetch/push destination validation, wrong owner/token, expiry without takeover, server rejection, and simultaneous sibling-commit contention passed the baseline tests.

## Decision

Do not establish the remote lock with this exact revision until LOCK-REVIEW-01 and LOCK-REVIEW-02 are repaired and independently rechecked. This review does not assert enforcement against arbitrary repository maintainers; cooperative clients and expected target-head checks remain necessary.
