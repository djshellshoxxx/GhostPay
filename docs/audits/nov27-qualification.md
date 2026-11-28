# November 27 qualification evidence

## ERC-20 browser qualification

Run [46083775711](https://github.com/djshellshoxxx/GhostPay/actions/runs/46083775711)
built six loopback fixtures on checkout `3877ddccb594f8afe2d9acb6810b35f22070f7e7`,
PR #753 head `1d7bd4ea632b41fee8fcece68d9a8fadd2b0b9a0`, tree
`27a3d0f7b0b90f7061bf74b6a224618df91fe51a`. Each ZIP's SHA-256 matched the
Actions artifact API. Each contained one `qualification.json`. All eight
expected filename/title-hash pairs per lane matched the collector membership
at the pinned PR head. The records contain one passing execution per case,
zero retries, exit zero, no reported failures and successful recovery of the
original payment.

| Browser | Mode | Actions artifact | SHA-256 of ZIP |
|---|---|---:|---|
| Chromium 156.0.8078.4 | Plain | 15238257253 | `018cfab531863854f7533b971ad5d7b3ba33999ca022449835320a6dd9fe3ba3` |
| Chromium 156.0.8078.4 | Permit | 15238227347 | `d3ead1f5179ba0e5b6b4cc4edf3e2258b0910790321a007fd8b2542247040dfc` |
| Firefox 157.0 | Plain | 15237898028 | `d59f6c05b7b0500f4b56c305c2d985e77e8c88004e8fb59ca92fd377a4f81739` |
| Firefox 157.0 | Permit | 15237639139 | `2ebac852a3351637e7a5cf739d89a0a84a2111e35148dee78bc8e2c8114648f4` |
| WebKit 27.2 | Plain | 15238850942 | `5c34d138ebb97e00affafacf351e211cb854db35454c64ad612e9f86e798e716` |
| WebKit 27.2 | Permit | 15238875771 | `c6d9cf5b71d9108d2c458677dd214f2ab665fed3f4fdb49655162e2740a0c59e` |

The collector regression suite passed 59/59 locally with
`node --test scripts/tests/erc20-report-membership.test.mjs` using #753's
workflow and harness. Each hosted record describes a particular test-signed
lean build on a disposable chain. The manifest-free release demo and future
source revisions require their own qualification.

## Independent payment-state verifier

[PR #665](https://github.com/djshellshoxxx/GhostPay/pull/665) head
`db6f3da67737346c28edf2ed9d8bae44e86bce56` retains the W5 payer and seller
runners. Its bounded oracle, synthetic chain and generator tests passed 54/54
with `W5_PROPERTY_SCALE=10 node --test verification/independent-beta/harness/selftest.test.mjs`.
These tests exercise the verifier's own logic. Payer and seller browser results
need a source pin and bundle fingerprint from the candidate under test.

## Development dependency advisory

On the `b890a76603b924829fdbe2b4fb2c5626f0cf4e36` lockfile,
`npm audit --package-lock-only --omit=dev --json` reported zero vulnerabilities.
The full audit reported 15 Low dependency entries tracing to a single advisory,
[GHSA-848j-6mx2-7j84](https://github.com/advisories/GHSA-848j-6mx2-7j84).
The lockfile marks `elliptic@6.6.1` as development-only. The confidential
contract workspace installs Hardhat 2.29.2 and its testing plugins. The ethers
v5 signing-key and secp256k1 development paths both resolve to elliptic. The
audited demo's Vite module inventory contains no `node_modules/elliptic`
module.

The advisory lists no patched elliptic version. The latest compatible Hardhat
2.x release inspected, 2.30.0, retains the same ethers dependency; its only
changed direct dependency from 2.29.2 is EDR. The latest 1.x network helper is
already locked at 1.1.2. npm's suggested Hardhat and network-helpers 3.x moves
conflict with the FHE plugin's required Hardhat `^2.0.0` peer. No compatible
remediation was available at this check. Reassess when the signing library or
the complete compatible Hardhat plugin stack changes.
