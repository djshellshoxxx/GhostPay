# Independent quality review of supplemental hosting findings

Review date: 2026-11-20 UTC. Reviewer: `/root/hosting_findings_quality`. Scope: adjudication of H-AD-01, HF-01, ZC-HC-DOC-01, ZC-HC-O01 and HF-N01 from the three hosting reports. This is a defensive static review, not another complete-source coverage claim.

## Decisions and counting

The five observations have source support, but they describe different kinds of defects. None establishes a remotely exploitable production service, a default-CLI response-splitting vulnerability, or a new High/Medium security finding.

| Item | Independent disposition | Recommended severity and counting |
| --- | --- | --- |
| H-AD-01, parser-error transport header | Confirmed missing validation at a raw serialization boundary; the request-derived header requires an optional programmatic configuration absent from the production CLI caller. | **Informational conditional library hardening**, Low repair priority. Keep one observation; exclude from confirmed default-CLI/deployed-vulnerability counts. |
| HF-01, directory containment | Confirmed false negative for an ordinary descendant whose first relative component starts with two dots. The same helper protects the CLI's original input against profile replacement. | **Low local correctness/availability defect**; informational security severity under the operator-controlled path model. One root cause across export and CLI callers. Add the conditional local input-loss consequence described below. |
| ZC-HC-DOC-01, subpath/origin instructions | Confirmed incorrect isolation guidance is included in generated packages. Existing CLI refusal and warnings remain effective. | **Low documentation defect**, one documentation item. Link to WEB-APP-03; do not count it as an additional runtime isolation bypass. |
| ZC-HC-O01, failed rollback cleanup | Confirmed cleanup contradicts the promise to retain a backup after restoration fails. | **Low operational recovery defect**; informational security severity without an attacker-controlled filesystem boundary. Keep outside remote-vulnerability counts. |
| HF-N01, inherited MIME lookup | Confirmed type/allowlist-contract defect in the helper. Packaging and verification use an own-property policy check. | **Informational API hardening**, one observation. No verified-package or ordinary CLI serving bypass established. |

For a register that includes operational and documentation defects, this adjudication contains **three Low items and two Informational observations**. That is not a count of three exploitable security vulnerabilities. A security-only summary should retain the Low documentation issue with its scope, separate the two local operational defects, and list the two library-hardening observations separately. There are **zero established High/Medium findings and zero established remotely exploitable findings among these five**. Do not duplicate HF-01 across its two callers or ZC-HC-DOC-01 as a second instance of the existing runtime origin-isolation concern.

## Source identity and method

The review used all twelve exact commits in `scope-refs-final.json`. Unless explicitly marked otherwise, line anchors below refer to `main-final`, **`773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`**. `tor-completion` means **`14a7526842b3cb055452b721d237a7e68813ff0c`**. Original main is **`c977b5d6723f6822c3b5d86cd6b231712c53c395`**. Paths in the following table and findings are relative to `tools/portable-hosting-kit/src/`.

Every commit/path association for the following evidence files was independently resolved locally. The affected logic and callers are unchanged across all twelve pins; the static-export and header deltas were read completely to check this conclusion.

| Evidence path | Exact blob identity and applicability |
| --- | --- |
| `serve/preview.mjs` | `07d074f2a42993380714752ca01d5d6e77e8701b`, all twelve |
| `serve/routing.mjs` | `b02f9ef440c4404d0ece1480531f54efef08fe30`, all twelve |
| `serve/headers.mjs` | `ae6571b9784a49dce019cf9776cd7f2d4b47cbc7`, eleven non-Tor pins; `d0bce8f92792580ea517d72b40a2653ea70111eb`, Tor completion |
| `profiles/static-export.mjs` | `f72bf8517d82f1fb7a34a6a687c403d105cff144`, original main and erc20-simulation; `42009b42e5b03d4bb88fd2b51925a064abc445b3`, other ten |
| `cli.mjs` | `5b4445881537af302d3d94e6cd0c4e41aa7adaa1`, all twelve |
| `core/atomic.mjs` | `d6099cdbaffc8767c13de1532d399b0f1d4eec46`, all twelve |
| `core/package.mjs` | `cd7207c96ed47f9c3b1effae9997eedbecab2d6b`, all twelve |
| `core/paths.mjs` | `8077026c02dd422a34fd4c38aa577179786bb4a6`, all twelve |
| `core/validate.mjs` | `9a9d6f655fba74d08177af0e9ae0baeed15edcc3`, all twelve |
| `core/verify.mjs` | `c006df5aacaf9669d5f7cf400cfa24c8feb385eb`, all twelve |
| `package-docs.mjs` | `edcbcdb2aa709a8cc3b12ddcde0925dc8e6320a8`, all twelve |
| `policy.mjs` | `4f13b17785cb53213f7dc6abce3902b34ca1fa5e`, all twelve |
| `overlay/mirror.mjs` | `dcb33bd5b7238b12e50a71268a996f3522f8638d`, all twelve |
| `config/host-config.mjs` | `267551801dfebc4f71622a4d7aa8d9019196870a`, eleven non-Tor pins; `ba5f2c311c77fabc1d85d66dc05f94388c7f616b`, Tor completion |

Source reads covered the relevant functions, callers and countermeasures. Repository-wide searches of JavaScript/TypeScript production paths at each pin found the same sole `startPreview` invocation in `cli.mjs:548`; imports by the container/nginx generators use validation constants/functions, not that server-starting API. These searches support the absence of an enabling production caller in the repository, not a claim about unknown external consumers or deployments.

The task ran on branch `audit/zero-cool-core-20261119`, observed local HEAD `aa3385e6de8e93ba9cb0dc5d0dc081329663a491`. That audit-branch identity is not substituted for the pinned product sources. Repository guidance was read; the coordinator's explicit ownership assignment limited this worker's writes to this report.

## H-AD-01: valid hardening observation; conditional reachability must remain prominent

`serve/preview.mjs:421-426` derives a method and target from the parser-error packet, then passes them to `parserRejectReply`. Its request-line gate at `75-76,324-334` calls the limited URI-parser check, rather than the complete control-character rejection used for decoded routing paths. `serve/routing.mjs:115-127,136-140` confirms that this path can preserve control characters in a target. No complete final header-value check appears before `sendRaw` serializes header pairs at `preview.mjs:306-310`. This supports the static data-flow finding without establishing how a particular Node parser, HTTP recipient, browser, or intermediary handles an individual malformed request or reply.

The dynamic transport value exists only when the programmatic caller supplies a clearnet `hostConfig` with a non-null `onionLocation`; the effective header policy must also leave that header unset for the generated value to be used. `serve/headers.mjs:402-412,435-441` validates the origin component and appends the request target. The Tor version's stronger origin validation changes neither the append operation nor raw serialization. `kitResponseHeaders` is at `431-437` in the Tor version.

The production caller at `cli.mjs:540-548` supplies no `hostConfig`. `startPreview` defaults it to null at `preview.mjs:365`, so this source-to-header path is inactive there. The server also enforces literal loopback TCP binding at `365-366,432-435`. An external consumer's choice to enable the optional configuration or publish access to loopback is not evidenced by this repository review.

**Adjudication:** retain as conditional library hardening. Do not label it confirmed response splitting, cache poisoning, browser script execution, or a vulnerability in an active Tor service. The established defect is the missing raw-output validation boundary under the stated options. The original report's Low repair priority is reasonable; an aggregate security severity of Informational better preserves the absent enabling caller and unestablished cross-user impact.

**Remediation:** make parser-error transport headers independent of the rejected request target, and validate all raw header names and values at the final serialization boundary. This is one issue spanning caller and sink, not separate findings for the helper and server. No payload or reproduction is included.

## HF-01: retain the local classification; expand the caller impact accurately

`profiles/static-export.mjs:23-25` treats any relative string beginning with two dots as outside its parent. That incorrectly includes ordinary descendant basenames with that prefix. Equality is handled correctly; actual parent traversal remains outside. The defective result can therefore defeat an intended overlap refusal, not the served-request path normalization. The timestamp-only delta does not change this helper or either overlap condition.

The feature report correctly identifies the local API separation defect at `static-export.mjs:112-115`. Its existing-output refusal, exclusive writes and temporary publication are meaningful controls for that function. However, those controls do **not** describe every caller of the shared helper.

`cli.mjs:21,623-630` also uses `within` to prevent the profile output from being inside or containing the operator's original unpacked input. `openVerified` first copies that input to private staging and records its original path at `493-504`. After the imperfect overlap gate, `generateProfiles` accepts an existing output only if its marker check passes at `598-609,647`, then calls `replaceDirAtomic` at `649`. On success that helper moves the old output aside, publishes the replacement and recursively removes the old tree (`core/atomic.mjs:281-308`, with removal at `37-39`).

**Source-supported consequence:** if a locally selected, already marked profile output contains the original unpacked input in a relationship misclassified by `within`, successful regeneration can remove that original input along with the old output tree. Private staging allows generation to finish from the copied content; it does not preserve the original after output cleanup. This is a conditional local data-loss possibility inferred from the complete call chain. No loss was executed or observed. The marker prerequisite remains essential for a nonempty output, and the operator still controls both paths.

The opposite nesting direction can leave profile material inside an input directory. Neither direction establishes a remote write primitive, archive escape or arbitrary-file overwrite. Count **one Low local correctness/availability defect**, with informational security severity under the current operator-controlled model.

**Correction to parent reports:** qualify the feature report's no-data-loss statement as no observed/reproduced loss within its direct-export assessment, and add the CLI consequence above. Qualify the core report's positive statement that the CLI checks input/output overlap: it attempts that check using HF-01's defective helper. Do not represent those reports as proving the original input is always protected against replacement.

**Remediation:** use exact parent-segment semantics, preserving equality and absolute-path handling. `core/paths.mjs:134-136` supplies the correct strict-descendant distinction, but its equality semantics differ intentionally; a shared inclusive helper must preserve the existing overlap contract.

## ZC-HC-DOC-01: Low documentation defect, related to existing origin guidance

`package-docs.mjs:52-53` lists a subpath among mirror origins while promising separate browser state. `cli.mjs:344-347` includes the generated guide in ordinary packages. This is shipped guidance, not an unreachable comment.

The existing runtime controls remain material: `cli.mjs:768-770` refuses non-root base paths without the explicit shared-origin flag, and `646` repeats the warning during profile generation. The hosting README's lines `104-106` gives the correct relationship. Nothing in this documentation defect changes those checks or establishes that a deployment currently combines mutually untrusted applications on one origin.

**Adjudication:** retain one Low documentation finding. If the aggregate already tracks WEB-APP-03, link this as inconsistent generated guidance requiring correction rather than presenting a newly discovered runtime origin-isolation bypass. Avoid asserting that every cookie, session or wallet implementation has identical isolation behavior: the precise correction is that a path prefix does not provide a separate origin or isolate origin-scoped browser storage/permissions.

**Remediation:** require a dedicated origin in the generated guide and explicitly describe the shared-origin nature of different path prefixes. Keep it consistent with the existing CLI warning and refusal.

## ZC-HC-O01: confirmed recovery defect; refine the checksum countermeasure

`core/atomic.mjs:122-135` catches a failed restoration and leaves the backup path non-null. The caller's catch cleanup immediately attempts to remove every such backup at `160-165`. The source comment promising that an unrestored backup remains available is therefore contradicted by the following cleanup.

The necessary sequence is limited: a preexisting target has a retained backup and is successfully replaced; a later commit operation fails; restoring that earlier target also fails; removal of its backup succeeds. This is an exception-path recovery defect requiring multiple failures or interference. A first failure before any replacement, or a later failure followed by successful rollback, does not have this effect.

`core/package.mjs:177-180` publishes the archive and external checksum sidecar through this helper, so the defect has a production caller. Losing the recovery copy can leave a partially updated pair and prevent restoration of previous bytes. It does not grant any new filesystem authority or establish a remotely induced failure. The separate `replaceDirAtomic` implementation retains an unrestored old directory (`atomic.mjs:295-305`); do not incorrectly extend this cleanup bug to that function or merge it with HF-01.

**Correction to the core report:** “content verification still detects checksum inconsistency” is too broad if read as automatic detection of a mismatched external sidecar. `core/verify.mjs:253-261` compares the archive against an external expected hash only when that hash is supplied. Its internal checks can still accept a newly generated, internally consistent archive even when the neighboring old sidecar belongs to the previous version. `cli.mjs:383-401` obtains that expectation from the explicit option; it does not automatically read the neighboring sidecar. A deliberate comparison of the sidecar against the archive detects a mismatch, but neither internal checksums nor an expected-hash comparison recover a deleted backup.

**Adjudication and remediation:** retain as one Low operational recovery defect, separate from security-vulnerability totals. Track unsuccessful restorations, preserve their backups and report their recovery paths. Correct the unconditional all-or-nothing wording; retaining backups alone does not establish a crash-atomic multi-file transaction.

## HF-N01: confirmed helper defect; verification blocks the ordinary artifact path

`policy.mjs:30-54` freezes an ordinary object, and `226-231` retrieves a property without checking ownership. Some inherited properties therefore violate the advertised `string | null` result. `serve/routing.mjs:78-80` accepts any non-null result as allowlisted; `static-export.mjs:75-87` applies the same predicate to directly supplied overlays.

The material countermeasure is stronger than packaging alone: `core/validate.mjs:32-47` uses `Object.hasOwn`, and `core/verify.mjs:164-174` applies that policy again to manifest-declared files during archive/directory verification. Thus a self-consistent externally supplied artifact does not evade the stricter check merely by claiming one of these extensions. The CLI's own overlay is fixed to `_mirror/mirror.json` (`overlay/mirror.mjs:12-13,37`), not an arbitrary caller-selected extension.

**Adjudication:** one Informational API-hardening observation. The supported issue is inherited lookup and an inconsistent helper contract for direct inputs; this is not evidence of prototype mutation, secret disclosure, or a verified-package/normal CLI serving bypass. Requiring an own property before returning a MIME value fixes the narrow defect.

## Completion and limits

All five requested decisions are complete. No application, test, exploit reproduction, generated profile, parser probe, network request, installation, daemon or deployment was run. No production source or other audit file was edited. This worker wrote only `hosting-finding-quality-review.md`. The previously rejected public-publication action was not retried; there was no commit, push, PR, remote write or third-party message.

The coverage ledgers remain owned by their original reviewers and the coordinator. This independent challenge adds caller and severity corrections; it does not claim additional full-module coverage, live service verification, measured likelihood, or runtime acceptance evidence.
