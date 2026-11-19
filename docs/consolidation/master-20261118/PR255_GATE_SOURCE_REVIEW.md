# PR255 strict-gate preservation review

**Preserve as active, unqualified work. No strict Mythril gate weakening was found in the scoped source review. This is not approval of the full PR or of finding exceptions.**

Runtime reviewed: `4a3c9af62da162e531814ef88d8877113ace4211`, based on main `58d89b39b27a66454ebf392bcd35d5c68b57b2f8`. During review, the PR advanced to `ea47fa75eabb0be2045081ffeb120fc2bfae67ab`, merging qualified main `e454de6abfefda70d82784fafc1d8949b277c334`. The GitHub response and subsequent local Git comparison show 22 changed paths for that advance and none in contract/analyzer/workflow paths. All nine reviewed analyzer, deployment and workflow blobs match exactly between these heads; no earlier test result is treated as current-head qualification.

## Gate behavior

- `packages/contracts/scripts/run-mythril.sh` still runs all five production targets with the default 900-second symbolic budget, depth 3, solc 0.8.28, optimizer 200 and Cancun. Every nonzero process outcome or nonempty issue array sets a sticky failure status. The script exits that status.
- Strict JSON validation now rejects duplicate keys and invalid constants before the existing shape/success/error/empty-issues check. Mandatory per-invocation completeness validation applies even when optional evidence recording is disabled.
- `mythril-compat.py` observes the original termination checks and report serialization. Internal timeouts return 124; missing instrumentation, an unexpected report count, hidden report exceptions or logged errors return failure. The wrapper restores patched methods and writes a fresh exclusive sidecar. Source inspection supports this intent; native hook effectiveness was not independently executed in this lane.
- The workflow keeps exact requested-head checkout, both analyzers and the real runner exit status. Passive evidence collection and upload run after failures without converting those failures into success. No `continue-on-error`, suppression or disposition invocation was introduced.
- The new disposition helper remains **unwired**. Production runner/workflow references do not call its CLI or `checkDispositions`. Its offline `ownerApproval` fields require a separate authenticated review; strings in a source-controlled record cannot themselves establish owner authorization.

## Separate useful work and limits

The nonzero-fee deployment acknowledgment also binds chain ID, fee token, current token runtime codehash, flat fee and recipient, checked before broadcast. Its read-only preflight computes the same domain-separated digest. The production Solidity runtime and Foundry configuration have no diff from the source baseline. This is distinct from accepting the underlying economic risk or permitting deployment.

The PR remains draft and explicitly says current-source Mythril, Echidna, coverage and hosted qualification are incomplete. Reported 502 Forge and 112 tooling results belong to the stated earlier source and were not rerun here. Historical 11-finding output stays provenance, not closure. No tests, native analyzers, source changes or remote mutations were performed by this review.

Disposition: **E, active candidate**. Any future proposal to activate finding exceptions is separately **H, owner decision**, and remains outside this review. Retain strict failure semantics and source-pinned incomplete evidence while the owner finishes qualification.
