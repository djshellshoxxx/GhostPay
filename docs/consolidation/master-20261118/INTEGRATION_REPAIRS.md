# Integration failure repairs — 2026-11-18

Starting source: PR #238, `198aa5baff22272453733a0f3dcfcac0e0994eec`.
These repairs preserve the existing checks and behavioral assertions. Hosted failures were inspected before edits.

## Bulk-cancellation fixture lint

The no-call `getLogs` fixture used an async function with no await, failing the existing require-await rule.
It now returns a rejected promise explicitly. Calling the method still fails the regression; no assertion or lint rule changes.

## Browser hostile-text journey

The test installed a dialog listener that dismissed every dialog. The combined candidate introduces an intentional
beforeunload warning for unbacked seller keys; dismissing that warning cancels `openFresh`'s navigation to about:blank.
Both hosted browser profiles reproduced ERR_ABORTED in that exact helper call. The test now accepts only a
`beforeunload` dialog, records that the expected custody warning occurred exactly once, and continues to record/refuse
every script-created dialog. Existing inert DOM, marker and empty malicious-dialog assertions are retained.

## Workspace map and privacy dependency boundary

The existing package-map and exact dependency-closure tests reproduced failures locally before editing. #222 adds
`@ghostpay/hygiene` and `@ghostpay/metadata-hardening` to the web closure and the latter to the relayer. The generated
map is regenerated from package manifests. The closure remains an exact finite set: arbitrary added or removed packages
still fail; the original pending-owner list remains distinct and unchanged.

The reviewed production imports are:

| Consumer | Imported helper | Behavior and boundary |
| --- | --- | --- |
| `apps/web/src/lib/sweep.ts` | `DestLedger`, `fundingGuard` from hygiene | In-memory destination history and address comparisons; #230 removes plaintext persistent history. Existing testnet and address guards remain. No derivation/network helper is enabled by these imports. |
| `apps/web/src/lib/relayerClient.ts` | `padBody` from metadata-hardening | Adds bounded random padding to the existing explicit relayer request; the existing provider/endpoint/cancellation controls still apply. This does not hide request contents from the relayer. |
| `apps/relayer/src/server.ts` | `stripPad` from metadata-hardening | Validates and removes the bounded hex padding member before the existing strict request parser. This is the paired decoder for the existing optional relayer. |

The helpers reuse existing noble/viem and internal packages; they introduce no new external dependency, infrastructure,
endpoint, custody model or eager I/O. Their manifests add no new transitive package beyond the recorded exact closure.
The master consolidation directive authorizes reconciliation of this existing privacy functionality. The source-boundary
review is recorded separately from the earlier owner-reviewed lean milestone and does not claim production acceptance.
Broader barrel exports remain subject to tree-shaking, existing bundle/egress checks and combined hosted qualification.

The recovery session-race regression is resolved in the retained #239 source using an explicit sealing handshake and an
attached rejection assertion before cancellation. That test must be executed on the combined candidate; it is not repaired
by weakening the session guard or adding an arbitrary sleep.
