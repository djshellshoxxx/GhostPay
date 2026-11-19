# Deployment readiness and prepared owner decisions

**Verdict: BLOCKED.** No deployment, public smoke pass or `1.0.0-beta.1` release has been completed by this lane. Candidate `73124433c08c8ef6835f11d03709060c6eea7a3f` is local engineering source, not a qualified published artifact.

## Milestone A — payments-disabled demonstration

Required demonstration capabilities are seller key generation, public/authenticated private export, encrypted backup, downloaded-file verification, restore, invoice creation/viewing and help. Without an authenticated deployment manifest the demonstration must refuse payment execution, scanning and sweeping on every chain.

| Gate | Current evidence |
| --- | --- |
| Lean static implementation | Present; final artifact qualification pending |
| Mainnet disabled / invalid manifest refusal | Existing source and tooling; fresh artifact/runtime acceptance required |
| Full exact-source checks and browser workflow | Incomplete; browser startup blocked |
| Exact assets and reproducibility | Not yet qualified |
| ADR-0029 approval | Proposed, owner acceptance missing |
| Dedicated origin | Owner choice/configuration missing |
| Merge and deployment workflow | Fresh CI and integration lease handoff required |
| Published commit/assets/routes/smoke | Not executed |

No readiness percentage substitutes for these gates. Mandatory final-source browser evidence is 0/12 scenarios in the current environment; the demonstration has not been published.

### Proposed hosting decision

Accept only the lean, payments-disabled demonstration after its checks pass. Use a dedicated custom domain, or an isolated Pages account/organization with no other same-origin sites. The repository path `/GhostPay/` does not isolate browser storage or script authority from other sites on the same `github.io` origin.

The owner must record the actual decision in [ADR-0029](../adr/ADR-0029-github-pages-static-beta.md). Proposed acceptance wording, to be completed by the approving owner in a reviewed change:

> Accepted for the lean payments-disabled demonstration on the approved dedicated origin. Mainnet remains prohibited. Testnet activation requires its additional signing, deployment, acceptance and independent-review gates. Date, approver and origin are recorded with the decision.

This is a proposal, not an approval record. ADR-0029 remains Proposed until that review occurs. The existing ADR-0015 hosting gate still applies.

### Exact configuration to prepare

| Setting | Demonstration value/action |
| --- | --- |
| Pages source | GitHub Actions |
| Custom domain / dedicated account | Owner-selected isolated host; DNS ownership verified and HTTPS enforced |
| Repository variable GHOSTPAY_PAGES_ORIGIN | Exact `https://<approved-host>`, no path/trailing slash |
| GHOSTPAY_PAGES_ALLOW_SHARED_ORIGIN | Unset |
| Bundled deployment manifests | None; verify paymentsEnabledChainIds is empty |
| GHOSTPAY_RELEASE_PUBKEYS | No payment activation without separately approved signed manifests |
| github-pages environment | Selected deployment branch: main; preserve repository protections/review rules |
| Historical gh-pages branch | Preserve; do not delete |
| Pages workflow dispatch | main, deploy:true only after accepted ADR, required checks and explicit publication authorization |

Build source libraries from a clean installation. Use the repository's existing Pages build rather than a new deployment path:

```sh
npm ci --ignore-scripts
npm run build:libs
bash scripts/pages/build-pages.sh /absolute/new/output-directory
node scripts/pages/serve-pages.mjs /absolute/new/output-directory/site --port 4180 --base /GhostPay/
```

The release build requires a clean relevant source tree and `GP_COMMIT`, if supplied, equal to HEAD. The output must not already exist. Do not set the development-build switch when preparing a publishable release. Follow [the Pages guide](../pages/README.md) for the exact browser acceptance and smoke commands.

After qualification and approved main promotion, the manual Pages workflow builds, checks and attests the inventory, deploys and performs smoke verification. Verify live `build-info.json`, commit, every served checksum, subpath navigation and browser flows independently. A locally built artifact does not complete this milestone.

## Milestone B — EVM testnet beta

Additional gates remain open:

1. Choose a supported testnet, Base Sepolia (84532) or Ethereum Sepolia (11155111), and authorize deployment using the established procedure.
2. Verify contract source, deployed runtime bytecode, addresses and immutables; record actual identifiers.
3. Approve the offline release signing key and publish its fingerprint. Configure only compressed public verification keys in `GHOSTPAY_RELEASE_PUBKEYS`.
4. Produce and review the authenticated testnet manifest in both deployment and web bundle locations. The build must reject unknown signatures and mainnet.
5. Complete explicit native fee review, exact-source checks and independent release review.
6. Deploy the approved artifact to the dedicated origin. Run a real wallet payment, confirmation, seller scan, receipt, native sweep, independent recovery and a failure/recovery scenario.
7. Preserve actual transaction hashes, manifest hash, wallet version, RPC provider and deployment evidence appropriately. Local anvil and mocks are separate evidence.

Nothing here authorizes wallet signing or broadcasting. No testnet transaction or release-key identity is invented. ERC-20 direct sweeping requires funded gas and separate acceptance; Bitcoin/Solana/TRON/policy/pool services remain outside the release.

## Publication provenance

Implementation commit identities above refer to preserved local development history. The GitHub connector preserves each tree and ordered parent history while normalizing commit metadata. `PUBLICATION_MAP.json` maps implementation commits to their published identities. Fresh publication, artifact and hosted-check records will be appended after final qualification.
