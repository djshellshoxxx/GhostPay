# Strict network selection integration repair

Product base: `521194c0`; ownership claim: `9d3674fd`. This defect was found during the independent review of the
actual merged #243/#248/#249/idle/#251 browser source. The reviewer implemented the scoped repair on an isolated
branch; the integration coordinator owns its independent acceptance and complete candidate qualification.

## Confirmed composition defect

The retained #249 `readNetworkSelection` rejects a present v1 preference unless it contains all four exact valid
fields. The new #251 `networkAuthorization.snapshot` instead supplied defaults for missing fields. Production
`createDefaultServices.createRpc` now enters through this common authority and no longer invokes the older selected
RPC helper, so preserving the strict helper in the tree did not preserve its policy at the active boundary.

Consequently, a present empty or truncated selection could receive a new grant and dispatch. Omitting `rpcMode`
from an acknowledged own-node preference could restore single-provider behavior. This affected the EVM boundary
as well as Bitcoin, Solana and TRON action grants; it was not limited to the Settings display.

The new regressions exercise actual authorization and its fetch boundary with controlled transports. They cover
an empty record, each of the four omitted fields, and an acknowledged private selection with the own-node field
lost, across all four chain families. **All 24 cases failed before the runtime change:** each dispatched once
instead of refusing. Eight positive/default/deletion cases passed. The baseline selected only this new group;
the existing 90 cases were skipped by the test-name filter, not removed or exempted.

## Repair and resulting behavior

The common authority now passes its already captured raw selection to `readNetworkSelection` and accepts only
`status: 'ready'`. It neither performs a second storage read nor maintains a competing schema. A missing record
retains the established fresh-install defaults. A present incomplete, unknown-field, wrongly typed or
unacknowledged selection fails closed. Existing observed-record tracking still rejects deletion after the
authority has observed a saved preference, including before a storage event arrives. An explicit valid saved
replacement restores the intended selection.

The full `networkAuthorization.test.ts` suite then passed **122 of 122 tests**, including all new chain-family
dispatch regressions. Three older own-node fixtures were completed with the two missing profile fields, so they
describe valid saved v1 records; their existing assertions were retained. No failure expectation was weakened.

The raw snapshots/currentness checks, action and endpoint binding, own-node/private-path checks, session and lock
revocation, bounded response handling and same-origin release-hash exception remain in place. Scan privacy/lane
records keep their separate legacy-field compatibility. No dependency, scanner, CI gate or test threshold changed.

## Evidence and qualification boundary

The paired JSON receipt records the exact baseline and corrected source blobs, canonical parser blob, commands,
Node/Vitest versions and SHA-256 hashes of the saved logs. RED: exit 1, 24 failed / 8 passed / 90 filtered-out tests,
3.82 seconds. GREEN: exit 0, 122 passed, 1.96 seconds. The secret scan and diff whitespace check also passed.

The one-worker runner borrowed the integration worktree's installed dependencies and resolved every workspace
package to this isolated worktree's source. There was no install or library build. This is focused runtime
qualification of the common boundary, not a full combined typecheck, lint, coverage, browser, security or release
qualification. Those remain required for the exact integration candidate.
