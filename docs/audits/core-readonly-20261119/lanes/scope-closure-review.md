> Historical lane record. The final [catalogue](../FINDINGS.md), [branch matrix](../branch-applicability.md), [quality review](../findings-quality-review.md) and [unified coverage](../coverage.json) supersede earlier provisional status, pending queues and branch-wide wording below. UTC worker dates may fall on November 20; the user-facing audit date is November 19, 2026 (America/Los_Angeles).

# Support-path closure review

This lane closes support paths discovered during final import and Git-tree reconciliation. The JSON ledger records exact identities, snapshots and dispositions. All reads were static; no helper, test, container, recovery operation or deployment was executed.

## ROOT-Q03 — Local qualification can succeed with no checks

Low assurance. `scripts/dev/local-ci.sh` accepts arbitrary `--only` names (24–38), matches a fixed step list (40–45), initializes failure to zero (75) and returns it (76–87). An unsupported selection can match no step and still print `DONE fail=0` and return success. Blob: `9fded4999dea9bc50835fe10a4c1d817fa8b7cc8`. No reproduction was run.

The header and developer README also claim parity with CI/every package, while the array at 18–22 omits current package, contract and browser gates. Actual hosted CI is a separate control. Reject unknown names, require a nonempty executed selection outside listing mode, and reconcile the catalogue or narrow the parity claim. Report exact executed/skipped checks. No remote release bypass is established.

## ROOT-I01 — Legacy image recipes omit the build helper

Low availability, supplemental legacy infrastructure. `infra/web/Dockerfile:15–21` and `infra/devnet/Dockerfile.web:5–8` copy package files, packages and the web app, then invoke `npm run build:libs`. Root package.json defines that as `node scripts/build-workspaces.mjs --libraries`; neither recipe copies scripts. The helper is absent from the build-stage filesystem. These unverified recipes are separate from current Pages and portable Tor paths. No build was run or active outage claimed. Copy required inputs and qualify the exact recipe, or retire it.

## Other observations

- `infra/publish/torrc.example:3` points to `infra/proxy/Caddyfile.static`; the committed listener is `infra/web/Caddyfile.static`. Informational legacy path error.
- Legacy images contain documented mutable placeholders. Current portable Tor has separate pinning and identity-volume rules.
- The independent stealth-export recovery decoder and both tests were fully read. Strict structure, numeric/KDF bounds, authentication and key/address checks yielded no additional confirmed defect. Fixture keys are public test data.
- Shared integration configuration was read for EVM support; incidental other-chain/service wiring does not constitute review of those implementations.

Standalone embedding, CLI/merchant integrations, development orchestration, historical audit generators, experimental models, other-chain runners and IPFS publication remain excluded where outside selected core/latest imports. Documentation inventories do not count as executable source review.
