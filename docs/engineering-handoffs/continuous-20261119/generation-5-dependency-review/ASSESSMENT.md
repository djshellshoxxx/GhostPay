# Generation 5: current development-dependency advisory review

**The current production audit reports zero vulnerabilities; the full audit retains 17 low-severity package entries arising from two existing advisories. No new Pages dependency defect or supported drop-in update was established.** The same affected package names, advisory records, severity, ranges, lock nodes and dependency links were present in the earlier preserved audit. The full audit remains exit 1; this report does not suppress it or change the established gate.

Repository: djshellshoxxx/GhostPay. Source: `3dc86fbc49e919e664230b63dae372ff79430fc5`. Review branch: `review/ghostpay-dependency-gen5-20261119`. Worker: `dependency_review_gen5`, with an independent bounded elliptic/Hardhat subreview. Only this evidence directory and the additive ownership claim changed.

## Actual observations

| Observation | Result |
| --- | --- |
| Coordinator production audit | Exit 0; zero reported vulnerabilities |
| Coordinator full audit | Exit 1; 17 low, zero moderate/high/critical entries |
| Distinct underlying advisories | Cookie GHSA-pxg6-pf52-xh8x and elliptic GHSA-848j-6mx2-7j84 |
| Installed/locked scope | All 17 affected lock entries have `dev: true`; ancestry leads to confidential-contracts development tooling |
| Independent graph queries | `npm explain cookie --json` and `npm explain elliptic --json` both exited 0 |
| Prior comparison | Same package set and severity/range/nodes/via fields; npm's selected recommended upgrade wrapper differs in some rows |
| Lean artifact inspection | None of the 17 package names appears among 374 module records in the coordinator's final lean module report |

The production result is advisory-database evidence, not proof that production dependencies contain no vulnerabilities. The lean check inspects the coordinator-created build manifest and its hash; this reviewer did not rebuild the browser application. It supports this concrete artifact boundary without certifying arbitrary future imports.

The workspace introducing these tools is [confidential-contracts/package.json](../../../../packages/confidential-contracts/package.json), an isolated fhEVM testnet proof of concept. It declares Hardhat 2.29.2 and the FHEVM/Hardhat plugins as development dependencies. Exact lock nodes, graph queries and source hashes are retained in [FINDINGS.json](FINDINGS.json) and [RECEIPT.json](RECEIPT.json).

## Finding matrix

The count of 17 describes package entries propagated through dependency relationships, not 17 independent vulnerabilities. C = cookie GHSA-pxg6-pf52-xh8x; E = elliptic GHSA-848j-6mx2-7j84. Every row is reported low and is development-only in the exact lockfile.

| Package | Locked version | Root advisory | Direct workspace dependency |
| --- | --- | --- | --- |
| @ethersproject/abi | 5.8.0 | E | no |
| @ethersproject/abstract-provider | 5.8.0 | E | no |
| @ethersproject/abstract-signer | 5.8.0 | E | no |
| @ethersproject/hash | 5.8.0 | E | no |
| @ethersproject/signing-key | 5.8.0 | E | no |
| @ethersproject/transactions | 5.8.0 | E | no |
| @fhevm/hardhat-plugin | 0.4.2 | E/C | yes |
| @nomicfoundation/hardhat-chai-matchers | 2.1.2 | E/C | yes |
| @nomicfoundation/hardhat-ethers | 3.1.3 | E/C | yes |
| @nomicfoundation/hardhat-network-helpers | 1.1.2 | E/C | yes |
| @sentry/node | 5.30.0 | C | no |
| cookie | 0.4.2 | C | no |
| elliptic | 6.6.1 | E | no |
| ethereum-cryptography | 0.1.3 | E | no |
| ethereumjs-util | 7.1.5 | E | no |
| hardhat | 2.29.2 | E/C | yes |
| secp256k1 | 4.0.5 | E | no |

## Cookie: preconditions and bounded optional hardening

The [maintainer advisory](https://github.com/jshttp/cookie/security/advisories/GHSA-pxg6-pf52-xh8x) concerns malformed names, paths or domains supplied to cookie serialization; these fields can alter other parts of the serialized cookie. Versions below 0.7.0 are affected; 0.7.0 is the first patched version. The installed version is 0.4.2.

The actual path is Hardhat 2.29.2 → @sentry/node 5.30.0 → cookie `^0.4.1`. Sentry's request-data helper in `@sentry/utils/esm/node.js` dynamically calls `cookie.parse` on an incoming Cookie header. That inspected boundary does not call the advisory's `serialize` API. This is narrower than claiming every possible use of the package is unexploitable.

Current registry queries return only 0.4.1 and 0.4.2 within `^0.4.1`. Sentry releases allowed by Hardhat's `^5.18.1` constraint end at 5.30.0 and retain the affected cookie range. No patched cookie update fits those declared contracts.

A concrete optional partial-hardening candidate is a nested root override `"@sentry/node": { "cookie": "0.7.2" }`. That patched release is available and supports the current Node runtime. It deliberately overrides Sentry's range and was not applied or represented as already compatible. Qualification would inspect the parser/API delta, compare ordinary and malformed header parsing through Sentry, regenerate only intended lock changes, verify the actual audit reduction, validate the dependency tree, and run the original confidential-contract compile/type/test lane. It might remove the cookie/Sentry audit entries while leaving the elliptic family; that outcome needs execution and independent review. There is no identified Pages runtime serialization exposure requiring an unreviewed override in the frozen candidate.

## Elliptic: no published patch; major migration conflicts

[GHSA-848j-6mx2-7j84 / CVE-2025-14505](https://github.com/advisories/GHSA-848j-6mx2-7j84) describes incorrect RFC 6979 nonce truncation and faulty ECDSA signatures. The advisory lists elliptic through 6.6.1 as affected with no patched release. Its key-exposure condition involves a faulty signature and a corresponding correct signature for the same inputs. This is not a generic timing finding.

The [upstream reporter](https://github.com/indutny/elliptic/issues/321) distinguishes an earlier digest issue from the remaining nonce-width issue. Inspected ethers-v5 `SigningKey` selects secp256k1 and requires a 32-byte digest; the `secp256k1` wrapper also validates a 32-byte message and its fallback selects that curve. No GhostPay-specific exploit was demonstrated; these observations are not a waiver. The [proposed upstream repair](https://github.com/indutny/elliptic/pull/345) remains open, so an unmerged fork is not a reviewed published patch.

The introduction paths are Hardhat → ethers-v5 ABI/hash/provider/transaction/signing-key modules → elliptic, and network-helpers → ethereumjs-util → ethereum-cryptography → secp256k1 → elliptic. The first remains even if the helper path migrates. A transitive `fixAvailable: true` does not prove that a compatible update satisfying the whole workspace exists.

| Package | Current registry evidence | Relevant constraint |
| --- | --- | --- |
| elliptic | Latest 6.6.1, already installed | No published patched version |
| Hardhat 2 | Latest stable 2.x is 2.29.2, already installed | Retains ethers-v5 ABI and Sentry 5 |
| @fhevm/hardhat-plugin | Latest 0.4.2, already installed | Peers require Hardhat `^2.0.0` and hardhat-ethers `^3.1.3` |
| Audit-proposed hardhat-ethers | 4.2.2 | Requires Hardhat `^3.18.0`, conflicting with current FHEVM peers |
| Installed network-helpers | 1.1.2 | Hardhat `^2.26.0` peer; ethereumjs-util ancestry |

The [official Hardhat migration guide](https://hardhat.org/docs/migrate-from-hardhat2) describes changes to configuration, plugins, network connections and extension APIs. This workspace currently uses side-effect plugin imports and a compiler subtask override. A Hardhat 3 migration belongs in a separately qualified confidential-contract tooling task, coordinated with a compatible FHEVM plugin family. It is not a patch-level correction for the static Pages candidate.

## Decision and successor work

Preserve the current lockfile and gates in this candidate. Record production-zero and full-17-low honestly. Do not equate npm's major recommendation with a safe automatic repair or remove the findings through suppression.

The smallest concrete optional follow-up is the cookie-only nested override above, with actual compatibility tests and independent review. The remaining elliptic family needs a reviewed upstream replacement or supported FHEVM/Hardhat migration. Recheck current registry releases and peer ranges when that work is undertaken. No runtime application, contract, fee, wallet or deployment change follows from this assessment.

## Evidence and limitations

- `FINDINGS.json` records all 17 packages, exact versions and root-advisory propagation.
- `RECEIPT.json` pins repository inputs, inspected installed sources, commands, audit provenance and compressed-file hashes.
- `evidence/` preserves the coordinator's raw audit JSON, independent graph queries, registry snapshots and lean module inspection. The earlier audit remains at its original source identity under `docs/release/evidence/recovered/`.
- Registry and graph queries completed successfully. No dependency installation or mutation, security exploit test, migration test or full dependency source audit is claimed. Root executed the audit commands; this worker independently analyzed their preserved output.
- No advisory was suppressed and no gate changed. This internal assessment does not replace required external review or approve a release.
