# Consolidation progress — 2026-10-22

Status: incomplete; do not squash or promote yet.

Working base: integration/consolidated-2026-10-21 at 4836369.
Sources: claude/inspiring-fermat-vxv689 at c1c4ac9 and claude/laughing-bardeen-4t20ys at e96cee1.
Required main-branch policy note: docs/CONSOLIDATION_STATUS.md, commit ed7d709.

## Inventory

Bardeen: no source-only paths. Five shared files differ: package-lock.json and four source files (chain-adapters errors/logs, core-crypto index/stealth). Integration retains newer payment-verification codes, transaction hash handling and optional deep scans; do not overwrite with the older source versions. Behavioral validation remains pending.

Fermat: nine source-only paths and 150 differing shared files. Source-only paths: apps/relayer/src/{breaker.ts,hardening.test.ts,netsafety.test.ts}; docs/research/{chain-data.json,chain-data.md,compliance.md,hosting.md}; docs/tools/check-links.mjs; packages/invoice-schema/src/text-hygiene.test.ts.

The source breaker must be compared against the integrated GuardedBreaker in relayer-guard; integration already tests probe timeout and user-error recovery. Do not import an unused duplicate implementation blindly.

## Local work requiring recovery/validation

Ported invoice-schema hidden/control character validation, typed ForbiddenCharacterError, memo-only LF support, and source property/regression tests while preserving newer passphrase errors/APIs. Also copied the research files and link checker. These code changes are LOCAL ONLY, not committed to GitHub.

npm ci --ignore-scripts completed (725 packages). Direct TypeScript builds of core-crypto and invoice-schema passed. git diff --check passed. The restored checker scanned 321 Markdown files and reported six broken links: wiring and audit pages for hygiene, metadata-hardening and net-transport.

Targeted Vitest invocation exited nonzero; its diagnostic log could not be retrieved because the execution server disconnected. A concurrent build:libs result is unknown. No test pass or full build pass is claimed. Recover local changes if available; otherwise re-port from the pinned Fermat snapshot and apply its errors.ts changes selectively so passphrase errors remain.

## Next work

Recover execution environment, rerun targeted tests with bounded worker count, review failures. Review all remaining shared-file changes and relayer tests. Scan every other branch for unique relevant work. Run complete regression checks and record skips. Only then squash/promote and update the main status note. Feature completion, code audit and security audit remain outstanding.
