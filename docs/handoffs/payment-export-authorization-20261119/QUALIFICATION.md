# Payment export after scan cancellation or expiry

## Scope and result

This continuation starts at PR #262 input `c40b7581b9b996f33612186bc91960c65273cb64`,
tree `41a1aaca7c9b48bdda4d9cbad7dcda7084045e5f`, on isolated source branch
`codex/ghostpay-export-authorization-20261119`. It completes the explicit
payment-key export path after its originating scan authority ends.

Previously, Scan retained the guarded scan RPC as the export client. Cancelling
a scan deliberately retained discovered payments, but that RPC still closed over
the aborted scan signal. The mandatory account-code check after re-authentication
therefore failed. A completed scan's expired network grant caused the same problem.

The repair retains an export wrapper with the original verified scan endpoint and
chain. Only an explicit secret export after re-authentication invokes it. Each
account-code check obtains fresh `payment-key-export` authority, permitting only
an empty-parameter `eth_chainId` and `eth_getCode` for the exact payment address at
`latest`. The wrapper checks the original seller/session/scan preferences before
and after awaited work, forwards the export operation's own cancellation signal,
and disposes authority on every exit. It preserves selected private endpoints,
own-node/required-proxy policy and the existing disclosure, without fallback or
renewing the old scan capability. Public-record export stays local.

Two existing `Scan.awaitCurrent` promise rejections identified in hosted PR #248's
lint log `135425979082` also now preserve Error instances and replace non-Error
values with a fixed local Error. The existing settled/cancellation ordering remains.

## Source reconstruction and provenance

The local ownership claim and regressions were committed before runtime changes:

- `b1c45dc7`: scoped ownership claim.
- `c6eb1aa6`: cancelled/expired scan export regressions.
- `4a639926`: observe the immutable real authority through a service wrapper,
  replacing an invalid attempt to spy on a frozen object's property.

The executor became unavailable before the runtime patch could be committed.
The coordinator authorized reconstruction through the connected repository API.
The published sequence uses the exact base tree, an additive claim, the corrected
original two-case regression source, then the recorded runtime/expanded-test and
inventory changes. These reconstructed commits have their own identities; they
are not claimed identical to the local commit hashes or an unrecovered local tree.
Existing files were fetched from the exact base and changed only at checked,
unique replacement anchors. Every published changed blob must be read back and
compared with its submitted contents before coordinator integration.

## Tests and evidence

Actual behavioral RED used the unchanged #262 runtime and the corrected fixture.
Both explicit-export cases failed because no private-key file was downloaded
(2 failed, 7.37 seconds). This is distinct from an earlier original-config startup
failure resolving unbuilt `@ghostpay/secret-box`, which executed no tests.

An initial post-repair run downloaded the expected valid private-key file in both
cases, then failed the exact endpoint assertion: Settings canonicalizes
`https://rpc.test` to `https://rpc.test/`. The assertion now compares against
`new URL(endpoint).href`; it still requires the exact original endpoint. That
observed run demonstrates that the repaired path reached download, not a final
GREEN result. It is not relabeled as a pass for reconstructed source.

The final regression source additionally checks:

- The real production RPC initialization and exact-address authority, independent
  grants per explicit action, and disposal after success or failure.
- An original custom proxy endpoint under own-node/required-proxy settings, with
  the old cancelled scan grant remaining unusable.
- Forbidden methods, wrong addresses, malformed/extra parameters, historical
  blocks, missing bindings, secondary/fallback endpoints and direct exceptions.
- Cancellation before issuance and during chain verification or account-code
  reads, late responses, wrong-chain initialization, changed seller/scan scope,
  and caller mutation of the original parameter array.
- The mounted Scan flow after cancelled, expired and private cancelled scans;
  public records and incorrect credentials issuing no new grant; and changed
  settings/profile records being refused before their storage event arrives.

These additional cases are authored assertions until an actual execution is
recorded. No assertion, coverage threshold, lint rule, test timeout or original
test configuration was weakened.

## Environment and interrupted qualification

External dependency versions matched the #262 lockfile. Workspace compiled outputs
were incomplete; the original-config first attempt failed before collecting tests.
Scoped execution therefore used Node 24.22.3 / Vitest 5.1.0 with the original Vite
configuration plus temporary manifest-derived workspace source aliases. The local
alias file and node_modules symlink are not committed. These runs do not qualify
the repository's fully built original configuration or hosted browser gates.

All runs used one worker and disabled file parallelism, with
`NODE_OPTIONS='--max-old-space-size=512 --max-semi-space-size=8'`.

The final combined helper/authority/UI attempt (`66282`) produced only the Vitest
RUN banner, stalled, and was interrupted with exit 130. A subsequent isolated replay
of the original two UI cases (`5416`) used an external 90-second timeout and exited
137 with the shell reporting the timeout process killed. It also produced no case
results. Lightweight reads stalled during these attempts. Neither attempt is a
test pass or an assertion failure; final GREEN remains unverified.

The egress inventory's existing `evm-scan-verification` surface now catalogs the
explicit code-check action. Its local seller-key record excludes that separate
read from the zero-egress claim, preserving all 37 surface IDs. The existing
reference-count refresh command was attempted with a 192 MiB heap and 30-second
external timeout; it exited 124 without a recorded result. During reconstruction,
the new helper's count entry was reconciled by inspecting the unchanged AST
inventory rule: one `authorize` call/reference and one `createRpc` call/reference;
all other recorded counts stay unchanged. This is source inspection, not a passing
inventory-runner result. The runner must still verify the complete snapshot.

Final source review and hosted CI must execute the focused regressions and
existing affected export/private-scan suites. Full web typecheck/lint, browser
qualification and release readiness are not claimed by this receipt.

## Continuation

The fixed source input is PR #262 at `c40b7581`. During reconstruction, the current
principal ref was observed at `cb7cfc9ec4f6c051e99805a25132c9458beb7af0`; the
coordinator confirmed its additional canonical-array source/tests/evidence and
will preserve that work when integrating.

The independently reviewed private-scan browser-selector fix is PR #269 at
`f9195f3f030e36125473753347d4be3357ac667e`, based on c40. This isolated source is
intended for that focused continuation alongside separately owned inherited scan
lint repairs. This worker does not change #262, #269 or main.

At the coordinator's last observation, main remained `14ded337`; PRs #258, #265 and
#267 were separately reviewed narrow candidates awaiting complete hosted CI.
This work makes no broader feature-release, main-merge or deployment claim.
