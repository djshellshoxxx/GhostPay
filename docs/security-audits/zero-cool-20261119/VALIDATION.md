# Validation and execution record

## What was actually checked

This was a defensive static source audit with local Git/evidence consistency checks. Production code and dependency lockfiles were not changed. The code-source completion claim is supported by the per-file review ledgers, not by tests or scanners.

| Check | Actual result | Scope and meaning |
| --- | --- | --- |
| Exact source identity and coverage reconciliation | Passed: 670/670 unique versions, 546 paths, 6,218 ref/path identities, zero missing/pending rows | All final pins; Git tree identity/size and recomputed blob hashes matched. Three overlapping supplemental reviews were deduplicated. |
| `bash scripts/check-actions-pinned.sh` | Exit 0; 111 action references pinned | Initial-main checkout. This is an action-reference policy check, not workflow behavior qualification. New Tor workflow actions were separately source-reviewed; its workflow was not run. |
| `bash scripts/check-tx-origin.sh` | Exit 0; 39 Solidity sources checked with no `tx.origin` match | Initial-main repository check. Its broader scan count is not a claim that every one of those contracts received a full audit. |
| `bash scripts/scan-secrets.sh` | Exit 0; no match under its configured patterns/exclusions | Initial-main check. This is a limited pattern scan, not proof that the repository contains no secrets. Only its summary was retained in the audit record. |
| Read-only branch census / fetch | Initial and final branches/commits recorded; latest relevant snapshots included | No remote writes. Cutoff is 2026-11-19 22:29:30 Pacific. |
| Production dependency advisory query | Both distinct lockfiles: exit 0, zero reported vulnerabilities | Registry snapshot with dev dependencies omitted; no dependency installation or remediation. |
| Full dependency advisory query | Both distinct lockfiles: exit 1, 17 Low entries; zero Moderate/High/Critical | The advisory exit code reports findings, not command failure. Two underlying advisories propagate through development-toolchain parents. |

Final documentation JSON/link/scope/whitespace validation is recorded in `documentation-validation.json` after the final local checks. The source identity result is independently preserved in `coverage-summary.json`.

## Dependency queries and interpretation

Queries used Node `24.22.3` / npm `11.19.1` with `npm audit --package-lock-only --ignore-scripts --json --fetch-retries=0 --fetch-timeout=15000`, adding `--omit=dev` for the production query. No install scripts ran and no lockfile changed. The second lockfile was queried in an isolated temporary copy with its root and all 68 workspace manifests so npm's workspace graph was retained.

| Lockfile Git blob | Pinned refs | Production advisories | Full-tree entries |
| --- | --- | ---: | ---: |
| `8ce2a5bb315cd84f45d3351131de0914337224ae` | main, erc20-simulation, main-final, recovered-fixes, unique-code, tor-completion | 0 | 17 Low |
| `539274d58048bc3edf066ca1a7891f247b2aea36` | release, consolidation, privacy-snapshot, quick-hide, clipboard, format | 0 | 17 Low |

The raw results are `npm-audit-main-production.json`, `npm-audit-main-full.json`, `npm-audit-candidate-production.json` and `npm-audit-candidate-full.json`.

The 17 entries are **not 17 independent core vulnerabilities**. They trace to two advisory records through development packages including the Hardhat/FHE toolchain; no active browser production path was established in this audit:

- [GHSA-pxg6-pf52-xh8x / CVE-2024-47764](https://github.com/advisories/GHSA-pxg6-pf52-xh8x): cookie versions below 0.7.0 accept out-of-bounds cookie name/path/domain characters. The retrieved advisory identifies 0.7.0 as the patched version.
- [GHSA-848j-6mx2-7j84 / CVE-2025-14505](https://github.com/advisories/GHSA-848j-6mx2-7j84): elliptic versions through 6.6.1 are listed for a risky cryptographic implementation. No patched version was identified in the retrieved record.

Track those development dependency chains with their maintainers. No forced audit fix, dependency rewrite or assumption that every vulnerable transitive API is reached was made. Zero production registry advisories is a point-in-time metadata result, not proof of dependency safety or independent review of cryptographic internals.

## Latest Tor source-pin check

The official [Tor release announcement](https://forum.torproject.org/t/security-release-0-4-9-17/22454) and [download page](https://download.torproject.org/tor/) identify stable 0.4.9.17 on the audit date, matching the new recipe's version pin. The upstream checksum URL could not be read by the web reader because it returned an unsupported content type. No upstream signature was verified and no source archive or image was built. The source checksum is therefore recorded as an existing recipe pin, not independently authenticated by this audit. The recipe itself already records that provenance limit.

## Not executed

No Vitest, Playwright, Foundry, contract analyzer, application build, hosting CLI/profile generation, Docker Compose, Tor/I2P process, browser acceptance, real-chain query, wallet connection, transaction, exploitation or vulnerability reproduction was run as part of this audit. Existing tests and previous CI reports were used as source/context only; they are not fresh passing results.

No runtime claim of chain consensus, finality, endpoint honesty, anonymity, cross-wallet cryptographic interoperability, complete memory erasure, filesystem race immunity or release readiness follows from source review alone. These limitations are specific to what the review did, rather than reasons to omit source findings.

## Repository-change and publication boundary

The authorized changes are audit notes under `docs/security-audits/zero-cool-20261119/` and the coordinator's appended claim in `docs/ai/ACTIVE_WORK.md`. Production sources, manifests, lockfiles, application tests, security gates and workflows are unchanged. A local documentation commit is permitted.

An earlier attempted push was rejected by automatic approval review because the user had authorized repository notes but had not explicitly authorized publishing security findings to a public GitHub remote. During the November 20 continuation, after the user replied “continue” to the publication question, a push of the exact completed audit commit was also rejected because the review system still required explicit public-disclosure authorization. No remote write succeeded during those attempts; no alternate publication route was attempted. A read-only remote check confirmed the branch remained absent at that point.

The user later explicitly instructed publication of the completed audit notes to the public GitHub repository. The shell push then failed for missing GitHub credentials; authenticated connector publication succeeded. All 58 transferred documentation blobs matched their local Git identities, and the new remote tree matched local checkpoint `d54e055cdd5fc6f5637f60cf2a542dca6211a4cd` exactly: `916ffd898870c810a5c81ad2899b86d41cd8e7e9`. A public Git fetch independently confirmed that tree at published commit `9c17c871ea71f23b5ce2897188086b5291917461`. Main remained at `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`. No PR, main merge, production-source modification or deployment was made.

Publication bookkeeping and the user-requested continuation prompt are documentation-only follow-ups. They do not constitute new application qualification or an extension of source coverage. See `PUBLICATION_STATUS.md`; the original `documentation-validation.json` remains a historical record of the earlier audit finalization.

The follow-up documentation checks parsed all 30 audit JSON files, resolved all 84 relative Markdown links in the audit directory, passed `git diff --check`, confirmed documentation-only writes, and verified that the original `docs/ai/ACTIVE_WORK.md` content remains an unchanged prefix before this audit's appended claim. No application tests were needed or run for these documentation changes.

A fresh reviewer checked the continuation prompt and publication updates against the source-pinned handoffs, independently confirmed the first published/local tree identity, and found no blocking source-integration or authorization problem. Its wording corrections were incorporated before final publication.
