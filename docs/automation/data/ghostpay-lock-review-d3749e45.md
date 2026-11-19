# Independent integration-lock re-verification

Approved source: d3749e45633bd1825b5b773b11a9a975476e2ffe.
Reviewer: independent verification worker; implementation authored by the root coordinator.

## Executed verification

Command: node --test scripts/tests/integration-lock.test.mjs
Result: 10 passed, 0 failed, 0 skipped; 21753.863767 ms.
Post-run diff against the approved commit for both implementation and test files: empty.
Implementation SHA-256: 321d3ece9aeceac338fd958be84c0f97820a7456ebdf184275350a464e33eb4e.
Test SHA-256: fc2182e4da1c279299b0f84b0a8c2deb9c9a75bcb75d0b4b7c18087677eb6203.

## Resolved findings

- LOCK-REVIEW-01: explicit --no-follow-tags prevents implicit annotated-tag publication; the real-Git regression checks the full remote ref set and preserves the local tag.
- LOCK-REVIEW-02: the transition timestamp is checked against prior expiry and heartbeat; boundary expiry and rollback regressions pass without a ref update.

The suite also verifies durable cross-clone readback and history, wrong-owner/token rejection, expiry without takeover, one winner in forced concurrent absent/released-ref acquisition, rejected pushes, malformed state, split read/write destinations, CLI argument rejection, and unchanged main refs.

## Additional source review and limits

Every update uses the observed lock commit as its sole parent and pushes one fixed branch without force. No product branch is used as a lock ancestor. Cooperative lock ownership does not enforce policy against maintainers who ignore the protocol, and does not replace fresh target heads, branch policy, CI, or independent application review.

The earlier independent lost-ack probe confirmed a completed remote write followed by a Git error is reported as unconfirmed, with the held state recoverable through readback. The runbook sentence 'A failed push never establishes ownership' needs wording that distinguishes local uncertainty from server state; root was notified before publication. Prefer: 'A failed or unconfirmed push is not evidence of acquired ownership; the remote may already contain the attempted transition. Re-read and reconcile before retrying.'

## Decision

Approve the exact implementation above for establishing and exercising the cooperative remote lock. This is scoped local verification, not hosted CI, product release approval, or authorization to bypass other integration gates. No external repository mutation was performed by this reviewer.
