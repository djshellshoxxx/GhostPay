# Deployment readiness and proposed owner decisions

Checkpoint: 2026-11-19. Integration branch: `release/ghostpay-beta-qualification-20261119`; implementation checkpoint `c5a2b09ea5dd7ee19400f29cbaddbe5cd93acc0a`; evidence checkpoint `4eb69699a59da84d17d0baa5dfe8dd6c9baaef9a`. Observed main: `c977b5d6723f6822c3b5d86cd6b231712c53c395`. [Draft PR #278](https://github.com/djshellshoxxx/GhostPay/pull/278) is the review entry point. Local and connector-published commits have identical trees and ordered source parents but different metadata; use [PUBLICATION_MAP.json](PUBLICATION_MAP.json) for their exact mapping.

**Verdict: BLOCKED.** No public demonstration, testnet beta, main promotion, tag or GitHub Release has been completed by this lane. A builder's `release: true` field describes its clean build mode, not an approval or readiness verdict.

## First milestone: payments-disabled demonstration

Required public functions are generation, public/authenticated private export, encrypted backup, exact-file verification, restore, invoice creation/viewing and help. With no authenticated deployment manifest, every payment, scan and sweep path must remain disabled. Mainnet is prohibited.

| Gate | Current state |
| --- | --- |
| Lean source and hardening | Implemented; full application build and scoped guards passed |
| Full candidate checks and real browser acceptance | Incomplete; browser startup denied before assertions |
| Final Pages inventory/integrity/reproducibility | Pending current source qualification |
| ADR-0029 and dedicated origin | Owner decision/configuration missing |
| Exact hosted CI and approved merge | Not satisfied |
| Live commit/assets/routing/browser smoke | Not executed |

Qualified demonstration completion is 0/1 (0%); an implementation percentage cannot make it ready.

## Reviewable hosting proposal

Use a dedicated custom domain or an isolated Pages account/organization with no other same-origin sites. `/GhostPay/` is routing, not browser-origin isolation. The current shared account origin is not accepted for sensitive-key hosting by this work.

Proposed ADR decision, for an actual approving owner to complete in a reviewed change:

> Accept the lean payments-disabled demonstration on the specifically approved dedicated HTTPS origin. Mainnet remains prohibited. Testnet activation requires its additional signing, deployment, real-wallet and independent-review gates. Record approver, date and exact origin.

This is a proposal, not an approval record. [ADR-0029](../adr/ADR-0029-github-pages-static-beta.md) remains Proposed; ADR-0015 applies.

| Setting | Prepared requirement |
| --- | --- |
| Pages source | GitHub Actions |
| Hosting identity | Owner-selected dedicated host/account, verified DNS, enforced HTTPS |
| GHOSTPAY_PAGES_ORIGIN | Exact approved HTTPS origin, without path or trailing slash |
| GHOSTPAY_PAGES_ALLOW_SHARED_ORIGIN | Unset; no exception approved here |
| Demonstration deployment manifests | None; paymentsEnabledChainIds must be empty |
| Release verification keys | No payment activation without separately approved keys and signed manifests |
| github-pages environment | Main-only deployment policy; retain required reviews/protections |
| Existing gh-pages/history | Preserve; no branch deletion |
| Deployment dispatch | main/deploy:true only after actual required approvals and checks |

A local inspection build can record the existing shared origin and warn about it; such an artifact is not approval to publish there. Choosing a different approved origin requires rebuilding and re-verifying the exact artifact.

## Build and verification procedure

Use Node 22 and the pinned lockfile. A resource-only Node wrapper may limit V8 heap; it must not bypass the original typecheck, builder, CSP, bundle or verification commands. Record actual Node/npm versions and wrapper hashes. The existing builder clears inherited application switches and derives its timestamp from HEAD.

```sh
npm ci --ignore-scripts
npm run build:libs
bash scripts/pages/build-pages.sh /absolute/new/output-directory
node scripts/pages/verify-pages-artifact.mjs /absolute/new/output-directory/site /absolute/new/output-directory/evidence/SHA256SUMS --expect-commit FULL_SOURCE_SHA
node scripts/pages/serve-pages.mjs /absolute/new/output-directory/site --port 4180 --base /GhostPay/
```

The output directory must not already exist. Use a clean relevant source tree and GP_COMMIT equal to HEAD; never use GHOSTPAY_PAGES_DEV for release evidence. Build twice at the same source/config/toolchain and compare the complete served inventory and bytes. Trust the expected checksum inventory through an independently reviewed source. Neither verifier authenticates an untrusted checksum file or guarantees an arbitrarily mutating filesystem.

After approved main promotion and deployment, independently check live build-info.json, every checksum, subpath navigation and actual browser workflows. A local build is not a published milestone.

## Second milestone: EVM testnet beta

Choose a supported testnet, such as Base Sepolia or Ethereum Sepolia, and obtain authorized deployment/fee-recipient decisions. Verify deployed bytecode, addresses and immutables. Approve the offline release signing identity and public fingerprint; configure public verification keys only. Sign and include the reviewed deployment manifest, then repeat exact-source artifact/security/CI qualification on the dedicated origin.

Perform real-wallet invoice/payment/confirmation/scan/receipt/native-sweep/independent-recovery and failure/recovery acceptance, preserving actual transaction evidence. No such results or hashes are invented here. ERC-20 gas-funded flows require separate acceptance. The external security review remains mandatory where required by policy.
