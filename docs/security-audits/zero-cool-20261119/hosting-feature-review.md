# Static-export feature and helper-closure review

## Disposition

Completed a defensive static review of the static-export feature and its complete first-party import closure across the twelve pinned snapshots below. The reviewed union contains **8 production paths, 11 distinct `(path, blob)` versions, 108,230 source bytes and 2,378 source lines**. Every distinct version has a `reviewed` disposition in `hosting-feature-coverage.json`. Counts include unchanged lines repeated across distinct versions; they are not counts of independently changed statements.

**No new medium/high security issue or remotely reachable vulnerability was established within this assigned closure.** HF-01 is a confirmed Low local directory-containment correctness/availability defect; independent caller review also establishes a conditional original-input-loss possibility in CLI profile replacement. HF-N01 is a direct-caller MIME-lookup hardening opportunity. HF-N02 records filesystem ownership assumptions. Neither the original-to-latest timestamp change nor the final Tor branch's header-validation change introduces a distinct security regression established here.

This is source-review evidence, not execution qualification. No application tests, generated profiles, network requests, live probes, exploit reproductions, installations or production-source modifications were performed. The test source described below was read, not run. No commit, push, PR, remote write or public publication was attempted by this worker.

## Scope and exact identities

Reviewer: `/root/hosting_feature_review`. Local branch: `audit/zero-cool-core-20261119`. Parent supplied the final read-only census cutoff **2026-11-20 06:29:30 UTC**. The first eight aliases come from `scope-refs.json`; the four additions are coordinator-supplied snapshots. Each exact SHA was resolved locally as a commit object.

| Alias | Exact commit |
|---|---|
| main | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| release | `417f7c71daf8645e1432f2ec8f070110879b80bd` |
| consolidation | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` |
| privacy-snapshot | `d6819796a9542acc488b896786faffe83b913d9b` |
| quick-hide | `137628961463fc5abd8b7927b2efe6b18a0a206a` |
| clipboard | `6c648770f5647ca7993cc108ef9e5ede9b46b4c9` |
| format | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` |
| erc20-simulation | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` |
| main-final | `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5` |
| recovered-fixes | `6c65cc3fd31c9ae361f932bee4a3449d89ed776c` |
| unique-code | `885b9569e6fc99e43bf01d23305494275e10120e` |
| tor-completion | `14a7526842b3cb055452b721d237a7e68813ff0c` |

All abbreviated source paths in this report are relative to `tools/portable-hosting-kit/src/`. `profiles/static-export.mjs` imports `errors.mjs`, `serve/headers.mjs` and `serve/routing.mjs`, and references `types.mjs`. Those serving helpers import `errors.mjs` and `policy.mjs`; all remaining type references lead to `types.mjs` or back to `errors.mjs`.

The `tor-completion` header version additionally imports `validateOnionOrigin` from `config/host-config.mjs`. That module imports `errors.mjs` and `version.mjs`, references `types.mjs`, and otherwise uses the Node crypto builtin. The feature closure therefore expands from six to eight paths on that snapshot. The complete older host-config source was also read for comparison. The JSON distinguishes **96 union ref/path identity pairs** from **74 actual feature-closure ref/path pairs** using `in_feature_closure_sources`: ten distinct versions are in an actual per-ref feature closure, plus one reviewed host-config comparison baseline.

| Path | Exact blob | Bytes | Lines | Snapshot coverage |
|---|---|---:|---:|---|
| `profiles/static-export.mjs` | `f72bf8517d82f1fb7a34a6a687c403d105cff144` | 6,913 | 145 | main, erc20-simulation |
| `profiles/static-export.mjs` | `42009b42e5b03d4bb88fd2b51925a064abc445b3` | 7,110 | 149 | Other ten snapshots |
| `errors.mjs` | `80d71210dd00b6f03a03a41943656fc41091741c` | 2,115 | 55 | All twelve |
| `policy.mjs` | `4f13b17785cb53213f7dc6abce3902b34ca1fa5e` | 10,561 | 232 | All twelve |
| `serve/headers.mjs` | `ae6571b9784a49dce019cf9776cd7f2d4b47cbc7` | 22,004 | 459 | Except tor-completion |
| `serve/headers.mjs` | `d0bce8f92792580ea517d72b40a2653ea70111eb` | 21,782 | 455 | tor-completion |
| `serve/routing.mjs` | `b02f9ef440c4404d0ece1480531f54efef08fe30` | 8,528 | 230 | All twelve |
| `types.mjs` | `cc9c73bd51da2342eb14a71d592fcf416c577dfe` | 5,707 | 121 | All twelve |
| `config/host-config.mjs` | `267551801dfebc4f71622a4d7aa8d9019196870a` | 11,350 | 261 | Except tor-completion; comparison baseline |
| `config/host-config.mjs` | `ba5f2c311c77fabc1d85d66dc05f94388c7f616b` | 11,788 | 264 | tor-completion |
| `version.mjs` | `29920000142c3aaa39de04b185e447b0255f78f1` | 372 | 7 | All twelve; feature import only at tor-completion |

Every version was read completely, except the new header version, for which the complete 459-line baseline and complete three-hunk delta were read. Both static-export versions and both host-config versions were read completely in addition to their full deltas. Git blob type, size and identity were verified with `rev-parse`, `cat-file`, and recomputation of the Git blob SHA-1 over its exact bytes. The complete import statements and type references leave no unresolved first-party dependency.

The CLI, preview server, nginx/container generators, packaging internals and Tor/I2P adapters are outside this worker's complete-source review. Narrow contextual excerpts of `core/validate.mjs`, `core/paths.mjs`, and the CLI overlap-check call site were inspected to avoid overstating findings; they are not marked completely reviewed here. Other workers own the broader feature surfaces.

## HF-01 — Containment misclassifies ordinary names beginning with two dots

**Priority:** low correctness/defensive-hardening priority; informational security severity under the documented local generation model. **Confidence:** high from source logic. **Affected:** both static-export blobs, hence all twelve snapshots; unchanged by the timestamp fix.

**Evidence:** `profiles/static-export.mjs` lines 23–25 defines `within(parent, child)` by rejecting every relative path for which `rel.startsWith('..')` is true. Lines 112–115 call it in both directions to refuse nested input/output roots. An ordinary descendant whose first basename begins with two dots is treated like actual parent traversal. The child remains below its parent, but the helper reports otherwise, allowing the intended overlap check to be missed.

**Impact and trust assumptions:** the caller controls the local `siteDir` and `outDir`. The resulting layout violates the API's separation contract and can leave generated material inside an input tree used by later local tooling. This is not a demonstrated request-path traversal, arbitrary overwrite or remotely triggered disclosure. Existing-output refusal, exclusive file creation and temporary-tree publication remain present in this direct export function; no loss was executed or observed. Remote URL paths are not used as its filesystem destination arguments.

**Coordinator correction from independent caller review:** the same helper is used by `cli.mjs:623–630` before profile replacement. If a locally selected existing, marked profile output contains the original unpacked input in a relationship misclassified by the helper, `replaceDirAtomic` can publish the new profile and recursively remove the old output tree, including that original input. This is a conditional local data-loss possibility inferred from the full call chain, not an executed deletion. Both operator-controlled paths and the existing-output marker are material prerequisites. See `hosting-finding-quality-review.md`; retain one root cause across export and CLI callers.

**Narrow remediation:** distinguish the exact parent marker and a parent marker followed by the platform separator from an ordinary basename with the same prefix. Preserve equality handling and absolute-path rejection. `core/paths.mjs` lines 134–136 already contains the more precise strict-descendant approach; align semantics rather than maintaining subtly different containment helpers. No production fix was made.

**Proposed safe validation, not executed:** benign classification fixtures for equal paths, ordinary descendants, two-dot-prefixed descendant basenames, actual parents, siblings and distinct roots on supported platforms, covering both directions of the overlap guard.

## HF-N01 — MIME lookup should require an own property

**Classification:** informational API hardening; no normal package-validation bypass established. **Confidence:** high for the source behavior. **Affected:** `policy.mjs` blob `4f13b17785cb53213f7dc6abce3902b34ca1fa5e`, all twelve snapshots, lines 226–231.

The MIME table is a frozen ordinary object. Its lookup tests only whether the retrieved value is `undefined`, so an inherited object property can produce a non-string value instead of the documented `string | null` result. `serve/routing.mjs` lines 78–80 treats any non-null result as an allowlisted type. Static export also applies that helper to caller-supplied overlays at lines 75–87.

The defensible impact is an inconsistent type/allowlist contract for direct callers or directly supplied overlays. The core policy gate already uses `Object.hasOwn(MIME_TYPES, ext)` in `core/validate.mjs` lines 32–47, rejecting off-list extensions. The profile workflow is documented to operate on a verified copy. This evidence does not establish a remotely reachable package or serving bypass.

**Narrow remediation:** require an own property before reading the MIME entry, or use a prototype-free mapping, and maintain the `string | null` return contract. **Proposed safe validation, not executed:** pure lookup tests should return `null` for unknown extensions and inherited-property names while preserving known MIME strings.

## HF-N02 — Filesystem checks require stable, controlled ancestry

**Classification:** explicit trust boundary, not a demonstrated remote vulnerability. `profiles/static-export.mjs` lines 50–67 inspects intermediate directories through path-based `lstat`, then opens the leaf with `O_NOFOLLOW` where available. It resolves source/output roots at lines 106–118 and later performs path-based writes, timestamp updates and rename at latest-version lines 120–146.

These checks reject already-present symlinks in a stable input tree. They do not pin every intermediate directory against another local writer throughout all asynchronous operations. Resolving output ancestry once likewise does not establish integrity against an actor able to replace that ancestry during generation. The prerequisite is concurrent local write authority over input/output paths or their ancestors; no such remote-request or ordinary-artifact capability was established here.

The repository's `tools/portable-hosting-kit/README.md` at `main-final`, lines 41–42, documents private verified input copies for profile generation. That is material input-side mitigation. Output ancestry should also remain controlled by the operator. Server-readable modes on the generated static assets are not themselves a secrecy defect: these assets are intended to be served.

**Narrow remediation:** document stable private-input and controlled-output-parent preconditions next to `exportStatic`; avoid reading its no-symlink comment as an unconditional race-resistant guarantee. If hostile concurrently mutable trees become a supported use case, use a separately reviewed descriptor-anchored filesystem design. Adding another path check alone does not establish that stronger guarantee. This audit does not claim the present CLI exposes such a hostile-write boundary.

## Changes assessed and positive controls

### Timestamp precision change

Between original `main` and `main-final`, only static-export changes within the initial six-file closure: 12 inserted and 8 removed lines. The reader returns `Stats.mtimeMs`; the writer converts milliseconds to string seconds before `utimes`. Overlays still pass `null`. File bytes, selection, required-header validation, exclusive writes, cleanup and final rename do not change.

The complete source of `tools/portable-hosting-kit/test/profiles/static-export.test.mjs` was read at `main-final` (blob `2945afd04781da84e71b89b51d4f1fe02dd1ab8a`, 8,394 bytes, 150 lines). Added cases cover a fractional timestamp near a second boundary, epoch and pre-epoch values, root/nested base paths, and byte preservation. These are inspected regression intentions, **not executed/passing test results**. Actual filesystem/platform timestamp fidelity remains an execution-qualification matter.

The Date-based source remains only in original `main` and `erc20-simulation`. The timestamp-preserving blob is present in the other ten snapshots, including latest main. Do not report the old timestamp behavior as outstanding on latest main.

### Tor completion header-validation change

The complete header delta replaces its standalone onion-origin shape check with `validateOnionOrigin`. The new transitive dependency requires a canonical HTTP origin, no port, expected hostname form, and checksum/version checks. Header grammar, regex escaping, combination order, required-policy minimums and transport selection are unchanged. The new helper is deliberately stricter than the earlier shape-only helper, which accepted a broader scheme form and stripped a trailing slash. No distinct security regression was established.

The complete host-config module also rejects unknown keys, restricts TCP listeners to explicit loopback addresses, validates conservative socket/base-path alphabets, and keeps application trust settings out of public host configuration. Its checksum check establishes address format, not independent operator ownership. No Tor daemon, service or public origin was contacted.

`transportHeaders` still appends the supplied request target directly to an onion origin. Callers must establish that it is valid for their response-writing mechanism. The separate hosting-adapters reviewer is assessing a conditional raw-response path in `preview.mjs`; that caller is outside this worker's complete-source scope. The Tor origin-validation delta does not sanitize request targets, and this report does not certify arbitrary raw-response callers safe.

### Controls retained

- File filtering rejects non-normalized relative paths, controls, backslashes and literal dot segments, and drops hidden/non-served names. Request routing decodes once and rejects invalid UTF-8, controls, empty segments and dot segments. No distinct remote traversal path was established in this source.
- Base-path grammar excludes dot-leading segments and server-configuration metacharacters. Routing selects listed files and a validated HTML entrypoint; directory redirects encode their segments.
- Export validates output paths' header policy before writing, omits `_headers`, refuses an existing `www`, writes files exclusively, and publishes a completed temporary tree by rename. HF-01 qualifies its directory-overlap assertion.
- Header parsing rejects malformed names/values, unsupported patterns, server-managed headers and unsupported substitutions. Required-header checks prohibit CSP/nosniff detachment and constrain script sources, referrer values and scriptable-file coverage.
- A bare static export does not configure response headers. `tools/portable-hosting-kit/README.md` at `main-final`, lines 93–102, explicitly documents that it is a document root for header-capable profiles and is not a drop-in deployment for a host relying on `_headers`. This documented boundary is not a new missing-CSP finding.
- Error/type/version modules add no independent filesystem, network or execution surface. Secret scans are explicitly heuristic; absence of a pattern match is not evidence that arbitrary content is secret-free.

## Evidence limits and continuation

Coverage is complete for the assigned source union at the pinned cutoff. This worker did not qualify nginx/preview parity, CLI staging, deployed response headers, Tor behavior, platform-specific races or third-party runtime behavior. Complete CLI/adapters remain outside this bounded review; other audit domains and final reconciliation remain coordinator-owned.

Only `hosting-feature-review.md`, `hosting-feature-coverage.json` and `hosting-feature-handoff.md` were written by this worker. The previously blocked publication action was not retried. These local notes do not grant or imply permission for any remote write.
