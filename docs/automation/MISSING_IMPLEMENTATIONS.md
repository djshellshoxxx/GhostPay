# Missing implementation review

## AUTO-001 — no shared integration lock or durable cycle tracking

The baseline source and all current refs contain no `scripts/automation/` implementation, no
`docs/automation/` tracking area, and no known integration lock ref. Per-workflow GitHub concurrency
groups do not provide a shared lock for independent automation cycles and local coordinators.

Owner: root coordinator. Branch: `automation/20261119T073600Z/coordinator/integration-lock`.
Proposed completion: atomic append-only Git-ref ownership, live assertions, heartbeat/release,
fail-closed interruption recovery, a runbook and source-pinned cycle tracking. Regression requirements:
real concurrent initial/released acquisition, stale identity, expiry, malformed state, uncertain/rejected
push, destination consistency and unchanged main. Implemented local source d3749e45 passed 10/10 real-Git tests and independent review. The connector-created remote lock was independently read back by the approved CLI. Git CLI writes remain unavailable here; the documented connector protocol supplies the same atomic coordination. Hosted source qualification remains separate.

## UI-IMPORT-001 — incomplete shared cancellation lifetime

The generic import component documents shared camera/paste/image cancellation, but tab visibility
was applied only to camera work. See [BUG_BACKLOG.md](BUG_BACKLOG.md) for the reproduced gap.

## Already owned or deliberately deferred

Recovery, selected signer policy, private scan, network authorization and idle-session follow-ons have
active PR owners. External signed manifests, external-wallet/manual-device acceptance, and third-party
security review cannot be supplied by placeholder source. Paused relayer/native/CLI products and
unapproved financial or custody changes remain out of scope. This cycle does not claim a full audit of
every maintained specification or mark those requirements complete.
