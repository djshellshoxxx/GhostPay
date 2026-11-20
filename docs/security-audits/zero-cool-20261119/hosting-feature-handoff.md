# Static-export feature review handoff

## Completion

Worker `/root/hosting_feature_review` completed its assigned defensive source review on 2026-11-20 UTC. The coordinator's final read-only census cutoff is **2026-11-20 06:29:30 UTC**. Work remains local on `audit/zero-cool-core-20261119` in `/workspace/scratch/95717c2024fa/GhostPay-audit`.

Owned deliverables are complete:

- `hosting-feature-review.md`: findings, source pins, delta assessment, trust boundaries and evidence limits.
- `hosting-feature-coverage.json`: every reviewed path/blob, exact byte size, all ref/commit aliases, actual-closure membership, disposition and review notes.
- `hosting-feature-handoff.md`: this completion record.

The manifest contains **11 reviewed unique path/blob versions across 8 paths**, totaling **108,230 source bytes and 2,378 source lines**. There are no pending versions. This is the union of exact paths over twelve snapshots: the eight in `scope-refs.json`, plus `main-final=773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`, `recovered-fixes=6c65cc3fd31c9ae361f932bee4a3449d89ed776c`, `unique-code=885b9569e6fc99e43bf01d23305494275e10120e` and `tor-completion=14a7526842b3cb055452b721d237a7e68813ff0c`.

## Scope reconciliation for root

The initially assigned six paths are `src/profiles/static-export.mjs`, `src/errors.mjs`, `src/policy.mjs`, `src/serve/headers.mjs`, `src/serve/routing.mjs` and `src/types.mjs`, all beneath `tools/portable-hosting-kit/`.

The final Tor branch changes `headers.mjs` to import `validateOnionOrigin` from `src/config/host-config.mjs`; that module imports `src/version.mjs`. Both additional paths were fully reviewed, including the entire old host-config comparison baseline and complete new version. No CLI or adapter expansion was needed. Please include these new dependencies when reconciling the feature domain and deduplicate any overlapping coverage from the Tor reviewer by exact `(path, blob)` identity.

There are 96 union ref/path identity pairs (8 paths × 12 refs), but 74 actual feature-closure ref/path pairs (six in each of the first eleven snapshots, eight in tor-completion). The manifest's `in_feature_closure_sources` records this distinction. Ten distinct source versions occur in an actual per-ref import closure; the eleventh is the fully reviewed older host-config comparison baseline. Do not claim all eight paths were imported by static-export on the earlier refs.

Every source was read completely except the new header version, assessed from its complete baseline and complete three-hunk diff. Both export versions and both config versions were read completely in addition to their deltas. Commit objects, Git blob types, byte sizes and recomputed Git blob SHA-1 identities were verified locally.

## Findings and interpretation

- **HF-01:** confirmed low-priority local correctness defect in `within`: it classifies all relative names starting with two dots as outside, instead of distinguishing a parent segment. Consequently some actual nested local input/output roots can miss the overlap rejection. Both export blobs/all twelve refs are affected. Security severity is informational under the documented local generation model; no remotely triggered traversal, arbitrary overwrite or concrete loss was established. The report gives narrow remediation and benign classification-fixture guidance.
- **HF-N01:** informational MIME lookup hardening. `contentTypeFor` can retrieve inherited properties and violate its `string | null` contract. The core policy gate already uses `Object.hasOwn`, so do not promote this to a proven package-validation or default-CLI bypass. Direct API/overlay callers are the relevant assumption.
- **HF-N02:** explicit stable-filesystem trust boundary. Path-based `lstat` plus a leaf `O_NOFOLLOW` does not pin mutable ancestors. The documented private verified input copy and operator-controlled output ancestry matter. No remote party's ability to mutate them was established; do not report a generic remote file-disclosure vulnerability.
- The timestamp delta introduces no distinct security regression established here. The older Date-transfer implementation remains only on original main and erc20-simulation; latest main carries the mtimeMs/string-seconds change.
- The Tor header delta consolidates onion-origin validation and adds the complete config/version closure. It tightens canonical origin/checksum validation without changing header-policy minimums. No distinct new security regression was established.

The hosting-adapters reviewer separately raised a conditional raw-response concern in `preview.mjs`. This worker confirmed only the in-scope fact that `transportHeaders` concatenates the supplied request target unchanged in both header versions, and that the Tor origin validation does not sanitize it. Complete preview/control-flow substantiation and its finding belong to that reviewer; do not infer a default CLI exploit from this helper alone.

## Validation and restrictions

No application tests, hosting service, live probes, exploit reproduction, installations, production edits, commits, pushes, PRs, deployments or other remote writes were performed. The complete static-export test source was inspected for intended benign timestamp regression coverage, not executed. JSON/identity/import-closure consistency checks concern audit evidence only and do not establish runtime correctness.

Only these three assigned audit files were written. The earlier automated rejection of public publication remains in force; no attempt was made to bypass or retry it. Root can integrate these local notes into its local audit reconciliation. Public publication is not authorized by this handoff.

## Outstanding work

No blocker or unread source remains in this assignment. Root owns report integration and deduplication, any separately authorized fixes/tests, other feature domains and all decisions about later disclosure or publication.
