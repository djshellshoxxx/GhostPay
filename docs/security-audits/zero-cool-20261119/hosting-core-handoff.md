# Hosting core and CLI completion handoff

Assigned scope is complete: **16 paths, 16 distinct blobs, 181,479 bytes, 192 selected-ref appearances across all 12 final pins**. Every assigned source file was fully read. Every pinned commit/path/blob mapping and blob size matched `hosting-source-inventory.json`; no assigned production source remains unread.

Deliverables: `hosting-core-review.md`, `hosting-core-coverage.json`, and this handoff. All other repository paths were left unchanged by this reviewer.

## Findings and classifications

- **ZC-HC-DOC-01 — Low documentation defect:** `src/package-docs.mjs:52-53` incorrectly includes a subpath among isolated mirror origins; ordinary archives include that guide through `src/cli.mjs:344-347`. The CLI already refuses subpaths without `--allow-shared-origin` (`768-770`) and warns again (`646`). Keep this related to existing WEB-APP-03, not a second runtime isolation vulnerability.
- **ZC-HC-H01 — Informational local hardening:** fullValidation's header/privacy callback uses ordinary `readFile` at `src/cli.mjs:207-226`, bypassing the inventory's identity/no-follow/exact-size checks. Requires a concurrently writable local input tree. Packaging subsequently guards reads and scans/hashes the exact stored bytes; preview/profile operate from private verified copies. Do not count it as a remote archive exploit. The privacy reviewer confirmed no independent callback-read byte bound in external-refs.
- **ZC-HC-O01 — Operational exception-path defect:** `src/core/atomic.mjs:122-135` leaves a failed-restore backup for recovery, but caller cleanup at `160-165` then deletes non-null backups. Requires a commit failure after an earlier target replacement plus a restore failure. Preserve recovery backups and report their locations. Do not classify this as a remote authentication/write bypass.

No additional High/Medium security finding, archive traversal, expected-digest bypass, or command-execution path was established in the assigned source. The report documents the checked boundaries and the limits of private-directory assumptions.

## Evidence and validation

Coverage JSON contains each exact path, blob, byte size, `hosting-feature` domain, 12 ref/commit sources, `reviewed` status, line count, and file-specific notes. Source was read from the pinned Git blobs; an initial truncated source fragment was reread before completion. Local metadata checks resolved all 192 source appearances and checked all 16 blob sizes.

No tests, reproductions, exploit execution, remote probes, dependency installations, runtime package commands, production edits, commits, pushes, PRs, or third-party messages were performed. The automatic-approval rejection of public GitHub publication was respected. Root retains whole-audit synthesis and any permitted delivery decision.
