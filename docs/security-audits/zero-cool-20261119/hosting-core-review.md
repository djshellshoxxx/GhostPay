# Hosting feature: core and CLI security review

Review date: 2026-11-20 UTC. Reviewer: `hosting_core_review`. Method: defensive static source inspection only.

## Completion and source identity

The assigned scope is complete: **16 production paths, 16 distinct path/blob versions, 181,479 bytes, and 192 appearances across the 12 pinned snapshots** in `scope-refs-final.json`. All ten `src/core/` modules, `src/cli.mjs`, `src/demo/demo-site.mjs`, `src/overlay/mirror.mjs`, `src/package-docs.mjs`, `src/version.mjs`, and `src/wizard.mjs` were read in full from their Git blobs. All 192 commit/path lookups matched the supplemental inventory; all 16 blob sizes matched. No assigned version remains unread. A small truncated portion of an initial combined source display was reread before completion; truncated output was not accepted as coverage.

Every assigned file has the same blob in `main`, `release`, `consolidation`, `privacy-snapshot`, `quick-hide`, `clipboard`, `format`, `erc20-simulation`, `main-final`, `recovered-fixes`, `unique-code`, and `tor-completion`. Therefore the findings and observations below apply equally to the original main pin `c977b5d6723f6822c3b5d86cd6b231712c53c395`, final main pin `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`, and Tor completion pin `14a7526842b3cb055452b721d237a7e68813ff0c`. Full path/blob/size/source mappings and per-file dispositions are in `hosting-core-coverage.json`.

Repository guidance read: `AGENTS.md`, `docs/ai/WORKFLOW.md`, and `docs/ai/HANDOFF.md`. Supporting hosting documentation read: `README.md`, `HANDOFF.md`, `docs/INTERFACES.md`, and `docs/ARTIFACT-METADATA.md` within `tools/portable-hosting-kit/`. Historical qualification statements in the hosting handoff were treated as previous claims, not tests executed by this review.

## Assessment

**No new High or Medium security finding, authentication bypass, archive path escape, or remote command-execution path was established in this assigned source.** One Low documentation defect is confirmed. Two additional observations concern concurrent local input changes and recovery after multiple filesystem failures; they are recorded separately and should not be counted as remotely exploitable vulnerabilities.

The important trust boundaries are implemented coherently: checksums are distinguished from authenticity, untrusted archive names are checked before extraction, extraction uses the same buffers that were verified, and preview/profile commands operate on private verified copies. Those guarantees do not make arbitrary website JavaScript trustworthy or turn operator-controlled directories, process environment, and configuration into a sandbox.

## ZC-HC-DOC-01 — Low: Generated operator instructions incorrectly describe subpaths as isolated origins

**Status:** Confirmed documentation defect. **Confidence:** High. **Applicability:** Every pinned snapshot. **Not a runtime isolation bypass.**

**Evidence.** `tools/portable-hosting-kit/src/package-docs.mjs:52-53`, blob `edcbcdb2aa709a8cc3b12ddcde0925dc8e6320a8`, puts “subpath” in the parenthetical list of mirror origins and says each has separate browser storage, sessions, and wallet permissions. `src/cli.mjs:344-347`, blob `5b4445881537af302d3d94e6cd0c4e41aa7adaa1`, places that generated `OPERATOR.md` in ordinary packages. Paths on the same origin do not provide independent localStorage/IndexedDB or origin-level permission boundaries.

**Prerequisite and actual impact.** An operator or downstream recipient relies on the packaged instructions when deciding whether to host a sensitive app alongside another app under a different path of the same origin. The instructions can mislead that deployment decision. This review does not establish an existing shared-origin deployment or any resulting secret disclosure.

**Existing countermeasures and severity limit.** The CLI already refuses non-root `basePath` configurations without `--allow-shared-origin` and explains the shared cookies, storage, and permissions at `src/cli.mjs:768-770`; profile generation repeats the warning at `src/cli.mjs:646`. The main hosting README also describes the correct boundary. The inconsistent packaged guide therefore does not remove the default CLI gate and should remain a Low documentation finding, related to the pre-existing WEB-APP-03 origin-isolation concern rather than a second runtime vulnerability.

**Remediation.** Correct `operatorGuide()` to require dedicated origins and explicitly state that subpaths on one origin share origin-scoped browser storage and permissions. Avoid suggesting that a path prefix supplies isolation. Keep the generated guide consistent with the existing CLI refusal and profile warning.

## ZC-HC-H01 — Informational hardening: Full-validation callbacks bypass guarded inventory reads

**Status:** Confirmed code-path difference; impact requires a concurrently mutable local source tree. **Confidence:** High for the source behavior. **Applicability:** Every pinned snapshot. **Not an established remote artifact exploit.**

**Evidence.** `src/cli.mjs:199-226` first obtains the inventory from `validateSite`, then maps entries to absolute paths and implements the header/privacy `readBytes` callback with ordinary `readFile(abs)` at lines 207-213. It does not use the retained `InventoryEntry` or `readInventoried`. The guarded path at `src/core/inventory.mjs:134-160`, blob `28b1c41bd4ea5494c772706839073087d31d88d2`, checks directory identities and supplies the file identity to `readFileExact`; `src/core/hash.mjs:61-109`, blob `3d9613977e76c984329b7e3068291b8a65ee85f0`, uses regular-file/no-follow checks, the inventoried length, and an EOF check. The raw CLI callback lacks those constraints.

**Prerequisite and bounded impact.** Another process must be able to change the local input tree between inventory/scanning and these callback reads. Under that prerequisite, the callback can read changed bytes, follow a replacement final symlink, block on a nonregular replacement, or read beyond the inventoried length. The header/privacy result can describe a different moment of the input, and resource use is no longer bounded by the inventoried size for that callback. No ordinary immutable archive can trigger this race after `openVerified` has established its private copy. No disclosure channel beyond the data these validation stages normally report was established here.

**Counterevidence against a broader finding.** `src/core/package.mjs:149-161`, blob `cd7207c96ed47f9c3b1effae9997eedbecab2d6b`, performs guarded reads again, scans the exact bytes, and hashes those same buffers. Preview/profile operate through `src/cli.mjs:493-519` and re-check response headers from their private verified copies at lines 527-532. Those controls remain in place. The observation is not a claim that a changed file can silently evade a caller-supplied digest or that profiles serve the original mutable input.

**Remediation.** Retain the entries in the callback map and use `readInventoried(entry)` for both header and privacy reads. For the strongest consistency guarantee, derive the privacy/header reports and final archive from one captured set of bytes. Document exclusive control of the input during packaging until that stronger invariant is implemented.

**Coordination.** The assigned privacy-module reviewer confirmed that the external-reference scanner relies on the callback's bounded input and has no independent byte-size guard around that read. This report's primary evidence is the fully reviewed CLI callback; ownership of the scanner's complete source remains with that reviewer.

## ZC-HC-O01 — Operational observation: Failed rollback can discard the retained recovery backup

**Status:** Confirmed exception-path defect. **Confidence:** High. **Applicability:** Every pinned snapshot. **Classification:** Local recovery/availability issue, not an authentication or remote write bypass.

**Evidence.** In `src/core/atomic.mjs:122-135`, blob `d6099cdbaffc8767c13de1532d399b0f1d4eec46`, `rollback()` catches a failed restore rename and leaves `s.bak` set, with a comment saying the backup is left in place. Its caller then unconditionally tries to remove every remaining non-null backup in the catch cleanup at lines 160-165. `src/core/package.mjs:177-180` uses this helper for the archive and checksum sidecar.

**Prerequisite and actual impact.** At least one target has been replaced, a subsequent commit step fails, and restoring a previously replaced target also fails. If removal of the backup then succeeds, the previous bytes that were being retained for recovery are deleted and the multi-file output can remain partially updated. This needs multiple local filesystem failures or concurrent interference. A normal single failure with successful rollback does not exhibit the defect. Independent review narrows the checksum qualification: a new archive may remain internally consistent while its neighboring external sidecar is stale. Ordinary archive verification does not automatically read that sidecar. An explicit expected-hash comparison detects the mismatch but cannot recover the deleted backup; see `hosting-finding-quality-review.md`.

**Remediation.** Track restore failures, retain the corresponding backups, and report their paths for operator recovery. Do not promise all-or-nothing crash consistency across multiple independent renames; a durable publication design would need a separate transaction mechanism if that property becomes a requirement.

## Boundary review and supporting controls

### Artifact identity and authenticity

`src/core/manifest.mjs:48-57` commits the entrypoint and sorted path/size/SHA-256 records. The parser requires known schema/version, exact field sets, internally consistent counts/digests, valid portable paths, and exact reserialization (`148-162`, `191-197`, `242-311`, `358-377`). A matching content digest covers the site only; it intentionally does not authenticate the claimed app ID, provenance, operator guide, or other metadata.

`src/core/verify.mjs:136-215` requires the manifest, SHA256SUMS, and actual tree to agree and treats missing, changed, and unexpected files as failures. It compares independently supplied digest/hash expectations (`253-292`) and never reports established authenticity when verification fails. CLI text and JSON preserve the distinction between `site-files-only`, `whole-archive`, and `none` (`src/cli.mjs:418-443`). The mirror overlay also explicitly says it cannot prove authenticity by itself (`src/overlay/mirror.mjs:21-37`). No claim that an attacker-controlled checksum is an authority was found.

### Archive, path, and extraction boundaries

`src/core/paths.mjs:58-82` rejects traversal forms, absolute/drive paths, backslashes, URL ambiguity characters, controls, non-NFC names, and portability hazards. Case/normalization collision handling is explicitly approximate (`108-114`); this review does not qualify every filesystem's Unicode behavior.

`src/core/zip.mjs:226-242`, `305-346`, and `356-418` check end records, structural bounds, file types, names, collisions, single-top-directory layout, matching local/central records, and complete tiling of the local-data region. Decompression is bounded by declared size, checks trailing compressed data, and verifies output length/CRC (`427-444`). The reader rejects symlinks and special-file attributes rather than materializing them.

`src/core/verify.mjs:376-395` extracts the already inspected buffers into a fresh staging tree, creates files exclusively, checks destination containment, and verifies the extracted tree before publication. `src/core/atomic.mjs:199-229` refuses an existing archive-derived destination. The Windows empty-directory-claim fallback explicitly has a short name-availability window (`231-252`); an adversary able to mutate the output parent concurrently is outside a strong private-directory guarantee, and this was not promoted to a remote archive vulnerability.

### Mutable inputs, staging, and output authority

Inventory excludes symlinks/special files, bounds traversal, records inode/time/parent identities, and rechecks those identities for guarded reads (`src/core/inventory.mjs:28-78`, `112-160`, `185-227`, `238-282`). Packaging rejects fabricated entries and output inside the input site, rescans the exact stored bytes, and self-verifies the generated archive (`src/core/package.mjs:42-59`, `85-99`, `149-180`).

Directory preview/profile inputs are copied with guarded reads and verified in private staging; archives are extracted from verified buffers (`src/cli.mjs:472-519`). Profiles do not continue to read the original input. The CLI attempts original-input/output overlap checks through resolved paths (`622-631`), but it reuses HF-01's defective `within` helper. Independent review establishes the conditional original-input-loss case for a misclassified nested input and marked existing output; see `hosting-finding-quality-review.md`. The CLI requires the generated-output marker before replacing a nonempty profile directory (`598-609`, `647-649`). That marker is an operator guard against accidental deletion, not an authentication token for hostile shared directories. Profile output is intentionally replaced wholesale and its generated guide says to keep keys and identities elsewhere (`741-747`).

### Process, configuration, and URL handling

The assigned runtime's external process use is the optional Git provenance path. It uses `execFile` with argument arrays, disables fsmonitor and optional locks, refuses configured filter drivers, and ignores submodules (`src/cli.mjs:241-278`). No shell-string construction or daemon activation was found in this source. The selected Git executable, inherited process environment, local repository/configuration stability, and operator-supplied paths remain local trust assumptions; this is not a general sandbox for a hostile same-user process.

Wizard answers and defaults pass through the shared host-config parser before return (`src/wizard.mjs:29-50`, `90-119`); the CLI reparses serialized configuration (`757-777`). The host-config implementation itself is covered by the adapter/config reviewer. The demo has fixed generated assets, text-node rendering for URL fragment content, and a same-origin JSON fetch (`src/demo/demo-site.mjs:15-51`); no additional active network client was found in these assigned modules. Overlay values are JSON-serialized rather than interpolated into executable script.

## Limits and unperformed work

This was source inspection and local Git metadata consistency checking only. No package command, preview server, browser, generated profile, Git provenance subprocess from product code, dependency install, test suite, exploit, reproduction, network probe, daemon, deployment, or publication was executed. No production source was modified. Only this report, `hosting-core-coverage.json`, and `hosting-core-handoff.md` were written by this reviewer.

Serving policy/routing, adapters, configuration parsing, nginx/container generators, privacy-scanner internals, and the new Tor deployment/workflow sources have separate owners. This report does not replace their coverage. It does not establish operating-system race resistance against a process already able to mutate private staging, artifact publisher trust, dynamic filesystem portability, or live Tor/I2P behavior. The prior automatic-approval rejection of public GitHub publication was respected; no remote write was attempted.
