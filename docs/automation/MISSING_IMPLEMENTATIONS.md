# Missing implementation review

## Current source-backed gaps — 20261120T0115Z

The receipt-correlation gap at wallet.ts478–505 is repaired by #298 with real consumer regressions
and independent execution. #297 completes the existing clipboard candidate's test/lint qualification;
it does not implement a second clipboard helper or activate the feature.

The five owner-required #286 privacy UX features remain in the beta backlog. At #278 417f7c71 and
#293 6c648770 there is no global masking setting; clipboard cleanup has no production prop caller,
Settings, persistence/i18n or end-to-end flow. Existing lock/account, encrypted-ledger reveal and fixed-name
export controls are partial building blocks, not full acceptance of the new requirements.
The older nine-family assessment at a1386906 is preserved as scoped historical source evidence.

The independent documentation review checked 18 Wiki Home/Sidebar links; User Guide and Developer Guide
remain prominent. Home still contains dated November 15–16 status prose. #259/#273 documentation owners
retain reconciliation; this cycle does not overwrite their branches or claim live Wiki publication.

Source review, focused tests and a payments-disabled development Pages artifact do not supply full web
coverage, browser/device/wallet acceptance, enabled-payment release evidence, signed manifests or independent
external security approval. Existing missing implementation and historical records below remain intact.


## Current reconciliation — 20261120T0035Z

Integration-lock implementation is already present in audited #278: the exact #261 script/test blobs
match and the metadata control ref exists. Sixteen canonical #261 automation files were absent from
that candidate, so this checkpoint preserves the existing lineage. Five unique source-pinned handoffs
for #280/#281/#282/#285/#289 are copied byte-for-byte. Main's newer continuation history through
rotation 207 is preserved before adding this cycle. Larger #262/#264 document inventories stay with
their existing owners.

The original #285 guide omitted bearer-warning preservation; #278/#290 already corrected it.
The new primitive-key rejection was implemented and independently verified, then deduplicated
against #290. Only genuinely additional regression coverage remains in #295, not a second runtime fix.

Recovery/keypair export, session, signing, payment and mobile/accessibility requirements are not
declared complete by this bounded audit. #278's newer 417f7c71 needs its own complete browser,
security, external acceptance and source-matched qualification. No placeholder/test bypass substitutes.
Active Wiki guide owners retain Home/Sidebar and both prominent guide sections; live publication
is not claimed and owner reconciliation of stale status prose remains unfinished.

## Historical missing-implementation analysis

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
