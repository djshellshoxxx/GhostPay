> Historical lane record. The final [catalogue](../FINDINGS.md), [branch matrix](../branch-applicability.md), [quality review](../findings-quality-review.md) and [unified coverage](../coverage.json) supersede earlier provisional status, pending queues and branch-wide wording below. UTC worker dates may fall on November 20; the user-facing audit date is November 19, 2026 (America/Los_Angeles).

# GhostPay static hosting and latest Tor feature review

## Result and scope

The assigned latest hosting closure is complete: **92 distinct paths, 106 path/blob units, 24 immutable selected heads**. Coverage includes the entire 80-file portable-hosting-kit tree, both hosting workflows, the new static Tor deployment sources and acceptance scripts, every selected `deploy/TOR.md` version, and the main static-export timestamp precision change. The ledger has **92 complete reads and 14 complete deltas** from fully read bases. The 18,674 summed source-version lines are not independently reread duplicate lines; identical blobs are mapped to all carrying heads.

Two findings were identified: one medium artifact-recovery defect and one low operator-documentation inconsistency. Neither is a claim of demonstrated third-party compromise. Application, payment, cryptographic, and browser-e2e source is assigned to other reviewers and is not claimed here.

| Area | Distinct paths | Path/blob units | Summed variant lines |
|---|---:|---:|---:|
| Portable hosting kit | 80 | 92 | 17,637 |
| Static Tor deployment | 7 | 7 | 435 |
| Tor acceptance scripts | 2 | 2 | 287 |
| Hosting workflows | 2 | 2 | 205 |
| `deploy/TOR.md` | 1 | 3 | 110 |
| **Total** | **92** | **106** | **18,674** |

The exact ledger, all full Git blob IDs, line counts, carrying full head SHAs, read methods, delta bases, findings, and exclusions are in `hosting_latest_review.json`. No units are pending. The separately agreed supplemental legacy-hosting read is complete, adding three paths/blobs and 649 lines. **Combined coverage is 95 paths, 109 path/blob units, 95 complete reads and 14 complete deltas, with 19,323 summed variant lines.** The original latest-hosting closure remains the 106 units shown above.

## HOST-LATEST-01 — Medium: failed rollback cleanup deletes a retained recovery backup

**Source:** `tools/portable-hosting-kit/src/core/atomic.mjs` blob `d6099cdbaffc8767c13de1532d399b0f1d4eec46`, lines 122–135 and 144–169; `src/core/package.mjs` blob `cd7207c96ed47f9c3b1effae9997eedbecab2d6b`, lines 178–180. Both blobs are carried by all 24 selected heads.

The multi-file commit helper keeps backup copies of old targets. If a later target replacement fails, `rollback()` attempts to restore earlier targets. Its catch intentionally leaves the backup path intact when that restoration itself fails. The caller then removes every remaining non-null backup in its catch cleanup, including a backup deliberately retained after failed restoration.

The affected path needs a commit failure after at least one existing target has been replaced, followed by a second restore failure for that target while backup deletion can still succeed. This is a filesystem recovery defect; it does not need an attacker. The package writer commits the archive and its SHA-256 sidecar together, so the outcome can be a new archive with an old sidecar and loss of the previous archive's available recovery copy. The fresh-directory preparation path limits exposure in the new static Tor wrapper, but the shared packaging helper remains in the workflow's dependency closure.

Existing tests exercise a single failed filesystem operation (`test/core/atomic.test.mjs:19–55` and the one-shot fault helper in `test/core/helpers.mjs:100–110`). Those cases do not cover a second failure during rollback. This conclusion follows from source control flow; no fault was induced.

**Remediation:** Track whether each backup was restored. Retain any backup whose restoration failed and include its recovery path and rollback error in the surfaced failure. Delete only temporary files and backups proven redundant after a successful commit or restoration. Align the all-or-nothing and crash-safe descriptions with the actual guarantees.

**Safe acceptance criteria:** Unit-level injected filesystem failures can cover both the initial commit failure and the later restoration failure. Original bytes remain available under a reported recovery path; a normal rollback restores both outputs; a successful commit still produces a matching archive/sidecar pair. These are proposed criteria, not test results.

## HOST-LATEST-02 — Low: generated operator guide describes subpaths as isolated origins

**Source:** `tools/portable-hosting-kit/src/package-docs.mjs` blob `edcbcdb2aa709a8cc3b12ddcde0925dc8e6320a8`, lines 46–55, carried by all 24 heads. The contrary correct guidance is in kit `README.md:104–107` and the shared-origin guard in `src/cli.mjs:769–770`.

The generated `OPERATOR.md` groups “subpath” alongside clearnet, onion and I2P mirror origins and says those have separate browser storage, sessions and wallet permissions. A path is not a separate origin. The CLI correctly requires acknowledgement for subpath hosting, and the kit README correctly says subpaths share origin-scoped state. The packaged operator guide can nevertheless mislead someone relying on that artifact alone.

**Remediation:** Describe the browser boundary as scheme, host and port, explicitly state that paths on the same origin share storage and permissions, and retain the dedicated-origin recommendation. Acceptance is consistent wording in the generated guide, README and existing refusal/acknowledgement behavior. This is a documentation defect, not evidence of a newly demonstrated browser exploit.

## Reviewed latest changes and boundaries

The newest feature head is `14a7526842b3cb055452b721d237a7e68813ff0c`. The main freshness head is `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`; current integration and recovered heads are listed in the exact ledger alongside the original 20 selected heads.

`deploy/tor-static/prepare.mjs` requires an explicit whole-archive SHA-256, a regular archive file, onion host configuration, and a fresh output path. It verifies a private copy, requires packaged response headers, and passes the same expected whole-archive hash to the subsequent profile-generation copy. This avoids treating an earlier verification of one input read as sufficient for later bytes. The generator writes profiles and runtime files; it does not start Tor, access identities, or publish a service.

The generated static Tor override removes published web ports, places the web service on the internal site network, and gives the Tor service the separate network needed for its transport. The identity volume is confined to the Tor service. Read-only roots, dropped capabilities, restricted users and restrictive runtime paths are represented in configuration. The Docker context allowlist contains only the pinned build/runtime files. Runtime checks reject unexpected arguments, require the intended Tor build features/version threshold, and check data-directory ownership/mode before configuration validation. These are source observations, not claims that a built or deployed image passed them.

The validation-only Tor workflow and hosting-kit workflow have read-only repository permissions, pinned action references and no deployment step. The Tor workflow source includes merged-configuration checks and runtime/config checks; it is not proof that these checks have run on the audited heads. Root owns the shared repository setup action and web build dependencies.

The latest onion-origin change centralizes canonical, checksum-valid HTTP onion-origin validation across configuration parsing, direct Tor adapter calls and header helpers. It rejects noncanonical forms and advertised ports inconsistent with the generated service. Earlier selected variants and their test changes were reviewed through complete deltas; the ledger preserves their separate identities.

The static-export precision change carries numeric `mtimeMs` from the file handle and writes numeric seconds in string form, avoiding the previous `Date` conversion near a whole-second boundary. The added source tests cover fractional-second boundaries, epoch and pre-epoch timestamps; the differential fixture includes the boundary case. No test was executed, and no runtime equivalence claim is made.

The kit's CLI imports nginx/container, Tor/I2P, wizard/demo and verification/export modules. Container profile generation also requires the nginx generator. Because these dependencies and mixed tests are interconnected, the entire 80-file kit tree was read; nginx and I2P bodies were not silently excluded as unrelated. Generated profiles remain inert until a separate operator action, and the docs distinguish artifact consistency from authenticity, page delivery from wallet/RPC behavior, and ordinary-browser checks from Tor Browser qualification.

## Method, exclusions and limits

Review consisted of bounded complete Git object reads and complete untruncated diffs from previously read blobs. Inventory/search output was used only to enumerate work. When an output was truncated, the relevant body was reread in full. No application/test/config source was edited. No project code, test, analyzer, scanner, vulnerability reproduction, browser flow, network probe, transaction, deployment or remote write was performed. Historical pass claims inside handoff/docs were treated as repository statements and are not audit results.

`infra/publish/ipfs-publish.sh` is explicitly excluded: IPFS publication is outside current static Tor/Pages scope and is not in this import/invocation closure. The exclusion ledger records its exact path/blob/head mapping without counting its body as reviewed. Root owns the top-level web source, Pages toolchain, repository setup, shared static-header inputs and supplemental legacy header/nginx/compose configuration. Legacy full-stack selfhost scripts are a separately labelled supplemental read.

No live Tor or I2P reachability, Tor Browser secure-context behavior, wallet compatibility, upstream source-release authenticity, current CVE status, image provenance, or production-host behavior was independently evaluated. Repository docs that make version/security claims were read as claims. The completed source coverage is not a runtime certification.

## Supplemental legacy-hosting closure

The following source bodies are fully read and mapped to all 24 selected heads. They are supporting legacy hosting tools, not imported modules of the latest static Tor wrapper.

| Path | Full Git blob | Lines | Method |
|---|---|---:|---|
| `infra/proxy/check-headers.sh` | `b9e9e0fe54ca8900c3615e25888e9406d94c9311` | 57 | Complete numbered read |
| `deploy/selfhost.sh` | `e353f5537e8f5571e0c3e085c6e25d1e1af59cb1` | 399 | Complete numbered read, 1–210 and 211–399 |
| `deploy/selftest.sh` | `5e6f9bf87eb0f6d0ba80a7546dbff361170fc910` | 193 | Complete numbered read |

The selfhost helper verifies a private archive copy and performs both expected-hash/attestation checks and structure validation before extraction. Its installation flow deliberately keeps a separate start confirmation and an interruption marker for backup retention. The accompanying selftest source covers missing/mismatched authenticity inputs, private-copy attestation arguments, installation/start separation, and interrupted-install backup preservation. None of those tests was run.

The proxy header checker compares source strings and selected route blocks; it is a configuration consistency check, not a parser proving the effective headers of a running server. Root owns the corresponding static server configuration bodies and the release-verification dependencies.

No additional confirmed finding was added from these three bodies. A potential discrepancy between values read from an env file by `selfhost.sh` and effective variables inherited by Compose was sent to root for assessment with the separately owned Compose source. It remains an unconfirmed review candidate because runtime precedence was not verified during this read-only pass.

### HOST-CAND-01 — Informational, unconfirmed: effective Compose inputs

`deploy/selfhost.sh` reads values only from its selected env file (`envval`, lines 110–118), validates the resulting web-dist path (146–161), then invokes Compose with the ambient environment intact (280–285, 394–398). Root independently observed interpolation of `GHOSTPAY_WEB_DIST` and image/UID values in the separately reviewed Compose configuration. Official Compose precedence verification remains with root. Until that verification establishes whether these inputs can differ, this is an informational legacy operational candidate, not a confirmed vulnerability and not a new-static-Tor finding.
