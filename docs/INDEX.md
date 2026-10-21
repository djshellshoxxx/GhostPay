# Documentation index

A map of every documentation file in GhostPay: its purpose, type and status. Links are relative to this file (`docs/`).

**Status key.** The status comes from each file's own text.
- **verified**: the file states that checks, tests or tool runs were actually executed (results are as the file reports them).
- **unverified**: the file says its claims are unverified, that it is haiku-written or static-only with nothing executed, or that sources could not be retrieved.
- **n/a**: a specification, design, runbook, user guide or record that makes no claim about checks having been run.

Nothing here is an independent audit. The project has no third-party audit, and nothing is deployed (see [README](../README.md)).

## Reading order

1. [README](../README.md): project status, what is and is not built, package map.
2. [MASTER_BLUEPRINT](MASTER_BLUEPRINT.md): concept and architecture baseline (superseded where it conflicts with the next items).
3. [SPEC_REVIEW](SPEC_REVIEW.md): corrections applied on 2026-10-21. These take precedence over the earlier specs.
4. [CONTRACTS_SPEC](CONTRACTS_SPEC.md) and [APP_AND_RELAYER_SPEC](APP_AND_RELAYER_SPEC.md): normative contract spec and app/relayer implementation targets.
5. [remote/STATUS](remote/STATUS.md): real local check results for the remote-extension branch.

**Note on `docs/remote/*`.** These files are remote-extension work (branch `claude/remote-extensions-1`). Their claims are as stated per file. Many are haiku-written or static reviews. Check the status column before relying on any of them.

## Root and top-level docs

| File | Purpose | Type | Status |
|---|---|---|---|
| [README](../README.md) | Project overview, status table (unaudited, nothing deployed, testnet only) and package map | user guide | n/a |
| [SECURITY.md](../SECURITY.md) | Vulnerability reporting route, scope and contributor ground rules; treats code as pre-audit | spec | n/a |
| [THIRD_PARTY.md](../THIRD_PARTY.md) | Register of third-party components with exact versions, licences and review notes (generated tables) | report | n/a |
| [MASTER_BLUEPRINT](MASTER_BLUEPRINT.md) | Concept and architecture baseline for private invoices and stealth settlement | spec | n/a |
| [SPEC_REVIEW](SPEC_REVIEW.md) | Errors and contradictions found in the specs and how each was resolved | report | n/a |
| [CONTRACTS_SPEC](CONTRACTS_SPEC.md) | Normative Solidity spec: router, sweep relayer, policy account, constants and interfaces | spec | n/a |
| [APP_AND_RELAYER_SPEC](APP_AND_RELAYER_SPEC.md) | Implementation targets for the web app views and the relayer service | spec | n/a |
| [DEVELOPER_SPECIFICATION](DEVELOPER_SPECIFICATION.md) | Developer-ready design baseline: modules, data formats, security invariants | spec | n/a |
| [FEE_SCHEDULE](FEE_SCHEDULE.md) | Normative fee types, rates and where each is enforced; owner decisions marked [OWNER] | spec | n/a |
| [MULTICHAIN_SPEC](MULTICHAIN_SPEC.md) | Plan and constraints for chains beyond EVM (Bitcoin silent payments, Solana) | spec | n/a |
| [DEPLOYMENT_MANIFEST](DEPLOYMENT_MANIFEST.md) | Per-chain deployment manifest: implemented format versus features not yet built | spec | n/a |
| [POST_LAUNCH_FEATURES_SECURITY_ROADMAP](POST_LAUNCH_FEATURES_SECURITY_ROADMAP.md) | Proposed post-launch features, each with a developer spec and security assessment | spec | n/a |
| [SECURITY_QA_DEVOPS_PLAYBOOK](SECURITY_QA_DEVOPS_PLAYBOOK.md) | Operational standard for development, security, QA and release readiness | runbook | n/a |

## Architecture decisions

| File | Purpose | Type | Status |
|---|---|---|---|
| [adr/ADR-LOG](adr/ADR-LOG.md) | Accepted decisions, e.g. pinned stealth derivation (ADR-0001), invoice signing key, envelope encryption, no admin or blocklist in contracts | ADR | n/a |

## Threat model and tools

| File | Purpose | Type | Status |
|---|---|---|---|
| [threat-model/THREAT_MODEL](threat-model/THREAT_MODEL.md) | Threat model v2: assets, assumptions, threats and their open or mitigated status; pre-audit | spec | n/a |
| [tools/third-party-table.mjs](tools/third-party-table.mjs) | Script (not Markdown) that regenerates the THIRD_PARTY.md tables from the lockfile | package doc | n/a |

## Audits

| File | Purpose | Type | Status |
|---|---|---|---|
| [audits/00-slither-triage](audits/00-slither-triage.md) | Triage of two Slither detectors on the contracts, both judged by-design and suppressed inline | audit | n/a |
| [audits/01-completeness-audit](audits/01-completeness-audit.md) | Spec-to-code traceability audit (209 rows: 106 Done, 31 Partial, 55 Missing, 10 Deviates, 7 Planned) | audit | verified (all package suites executed) |
| [audits/02-security-review-contracts](audits/02-security-review-contracts.md) | Contract review: Slither, Mythril and 42 adversarial Foundry tests; 0 Critical, 0 High, 3 Medium | audit | verified (forge and Mythril run) |
| [audits/03-security-review-client-relayer](audits/03-security-review-client-relayer.md) | Review of client, libraries, relayer and CI with proof-of-concept scripts; existing suites were not run | audit | verified (PoCs run; existing suites not run) |
| [audits/04-independent-design-analysis](audits/04-independent-design-analysis.md) | Whole-system design analysis, e.g. the sweep undoes the privacy the product sells | audit | n/a |
| [audits/poc/](audits/poc/) | Directory: proof-of-concept scripts (`poc-01` to `poc-11`), `run-all.sh` and a static server for audit 03 | audit | verified (per audit 03: PoCs run) |

## Operator runbooks

| File | Purpose | Type | Status |
|---|---|---|---|
| [operators/chain-enablement-checklist](operators/chain-enablement-checklist.md) | Checklist of network facts to verify before enabling a chain; current chain parameters are not provider-verified | runbook | n/a |
| [operators/deployment-runbook](operators/deployment-runbook.md) | Steps to deploy the router and sweep relayer and publish a manifest; nothing deployed yet | runbook | n/a |
| [operators/local-scanner-and-rpc](operators/local-scanner-and-rpc.md) | How to run a local scanner and RPC to reduce what leaks when scanning | runbook | n/a |
| [operators/mirror-hosting](operators/mirror-hosting.md) | Requirements for any static mirror host; hosting is intentionally not configured (ADR-0015) | runbook | n/a |
| [operators/relayer-runbook](operators/relayer-runbook.md) | Operating the sweep relayer: quote, check, simulate, broadcast from a hot key; pre-audit | runbook | n/a |
| [operators/release-and-verify](operators/release-and-verify.md) | Release pipeline and how users verify artifacts; workflows linted locally, not yet seen running on GitHub | runbook | verified (actionlint, shellcheck and local runs stated) |

## Remote-extension work (`docs/remote/`)

### Status, research and reports

| File | Purpose | Type | Status |
|---|---|---|---|
| [remote/STATUS](remote/STATUS.md) | Real local results per package: typecheck, lint, test counts, coverage; contracts 368 forge tests pass | report | verified |
| [remote/anonymization-research](remote/anonymization-research.md) | Options for further anonymisation, including chained payments; claims labelled [P] primary or [U] unverified | research | unverified (contains [U] claims) |
| [remote/onion-i2p-research](remote/onion-i2p-research.md) | Tor and I2P hosting and client options; many project sources could not be fetched | research | unverified |
| [remote/contracts-assurance](remote/contracts-assurance.md) | Echidna property-fuzzing results for the contracts; Mythril and mutation testing not covered here | report | verified (Echidna run) |
| [remote/mutation-results-local](remote/mutation-results-local.md) | Local gambit mutation-testing results for the contract sources | report | verified |
| [remote/modules-needed](remote/modules-needed.md) | Ranked list of security and support modules still needed, each with a status | report | n/a |
| [remote/third-party-additions](remote/third-party-additions.md) | Proposed THIRD_PARTY.md rows for `@scure/btc-signer` and `micro-packed` | report | n/a |

### Audits (`remote/audits/`)

| File | Purpose | Type | Status |
|---|---|---|---|
| [remote/audits/bugs-btcapps](remote/audits/bugs-btcapps.md) | Bug hunt in btc-silent-payments, relayer and web; vitest and tsc run for two packages, web tests not run | audit | verified |
| [remote/audits/bugs-contracts](remote/audits/bugs-contracts.md) | Bug hunt in contract sources; forge run with reduced fuzz runs; Slither and Echidna not run | audit | verified |
| [remote/audits/bugs-policyrouter](remote/audits/bugs-policyrouter.md) | Bug hunt in GhostPayPolicyRouter; forge suites run (82 tests, then 9 fuzz tests at 10k runs) | audit | verified |
| [remote/audits/bugs-policyscheme](remote/audits/bugs-policyscheme.md) | Policy-scheme client against PolicyAccount; vitest and anvil probes run, several checks not run | audit | verified |
| [remote/audits/bugs-tslibs](remote/audits/bugs-tslibs.md) | Bug hunt in core-crypto, invoice-schema and chain-adapters; existing suites green plus scratch probes | audit | verified |
| [remote/audits/code-btcapps](remote/audits/code-btcapps.md) | Haiku static read of btc-silent-payments, relayer and web; nothing executed | audit | unverified |
| [remote/audits/code-contracts](remote/audits/code-contracts.md) | Static code audit of the contracts; tests inventoried, not run | audit | unverified |
| [remote/audits/code-policyrouter](remote/audits/code-policyrouter.md) | Static audit of GhostPayPolicyRouter; no build, tests or Slither run | audit | unverified |
| [remote/audits/code-tslibs](remote/audits/code-tslibs.md) | Static code audit of the TypeScript libraries; nothing executed | audit | unverified |
| [remote/audits/security-btcapps](remote/audits/security-btcapps.md) | Haiku static security read of btc-silent-payments, relayer and web; nothing run | audit | unverified |
| [remote/audits/security-contracts](remote/audits/security-contracts.md) | Static security review of the contracts; no forge, fuzzing, Slither or Mythril | audit | unverified |
| [remote/audits/security-tslibs](remote/audits/security-tslibs.md) | Static security review of the TypeScript libraries; nothing executed | audit | unverified |

### Security specs (`remote/security-specs/`)

| File | Purpose | Type | Status |
|---|---|---|---|
| [remote/security-specs/incident-response](remote/security-specs/incident-response.md) | Draft incident response, disclosure, bounty scope and emergency procedures; owner placeholders | spec | n/a |
| [remote/security-specs/key-lifecycle](remote/security-specs/key-lifecycle.md) | Draft requirements (KL-n) for generating, storing, backing up, rotating and zeroising keys | spec | n/a |
| [remote/security-specs/privacy-ops](remote/security-specs/privacy-ops.md) | Draft privacy operations spec: RPC choice, logging, telemetry; haiku-written and unreviewed | spec | unverified |
| [remote/security-specs/relayer-abuse](remote/security-specs/relayer-abuse.md) | Draft requirements for relayer abuse, DoS, fee griefing, sybil resistance and the breaker | spec | n/a |
| [remote/security-specs/supply-chain](remote/security-specs/supply-chain.md) | Draft supply-chain spec: pinning, SBOM, reproducible builds, release signing | spec | n/a |
| [remote/security-specs/review-contracts](remote/security-specs/review-contracts.md) | Review of CONTRACTS_SPEC and DEVIATIONS against contract source: 2 High, 9 Medium, 14 Low; forge and Slither not run | report | unverified (external claims marked unverified) |
| [remote/security-specs/review-multichain](remote/security-specs/review-multichain.md) | Review of MULTICHAIN_SPEC and the Bitcoin and chain-adapter docs against code; some items marked unverified | report | unverified (some items marked unverified) |
| [remote/security-specs/review-playbook](remote/security-specs/review-playbook.md) | Review of the playbook and threat model against CI, scripts and tree; external sources not fetched | report | unverified |
| [remote/security-specs/review-policy](remote/security-specs/review-policy.md) | Review of the policy-guarded account scheme; no code run, external standards not re-checked | report | unverified |
| [remote/security-specs/review-relayer-app](remote/security-specs/review-relayer-app.md) | Review of APP_AND_RELAYER_SPEC against relayer and web code; no tests run | report | unverified |

### Specs for new packages (`remote/specs/`)

| File | Purpose | Type | Status |
|---|---|---|---|
| [remote/specs/address-safety](remote/specs/address-safety.md) | Spec for address-poisoning and display-text safety checks; not implemented | spec | n/a |
| [remote/specs/ops-monitor](remote/specs/ops-monitor.md) | Spec for a read-only chain-side anomaly watcher; implemented as packages/ops-monitor | spec | n/a |
| [remote/specs/relayer-guard](remote/specs/relayer-guard.md) | Spec for relayer availability and abuse controls; implemented in packages/relayer-guard, not wired in | spec | n/a |
| [remote/specs/secret-box](remote/specs/secret-box.md) | Spec for closure-held secret bytes; implemented in packages/secret-box | spec | n/a |
| [remote/specs/tx-review](remote/specs/tx-review.md) | Spec for the pre-sign transaction decoder and reviewer; not implemented | spec | n/a |

### Pages prototype

| File | Purpose | Type | Status |
|---|---|---|---|
| [remote/pages-prototype](remote/pages-prototype.md) | Prototype: serving apps/web from GitHub Pages via the gh-pages branch | runbook | n/a |
| [remote/pages-theme/README](remote/pages-theme/README.md) | CSS-only visual theme overlay for the Pages prototype | runbook | n/a |

## Reviews (`docs/reviews/`)

Self-run, dated feature reviews by the documentation author. They are not independent. Each cites existing tests by name but records no run log.

| File | Purpose | Type | Status |
|---|---|---|---|
| [reviews/README](reviews/README.md) | Index of the Phase B feature reviews and what they are not | report | n/a |
| [reviews/2026-10-21-F1-gas-buffer](reviews/2026-10-21-F1-gas-buffer.md) | Review of the opt-in native gas buffer on ERC-20 payments | report | n/a |
| [reviews/2026-10-21-F2-embed-popup](reviews/2026-10-21-F2-embed-popup.md) | Review of the popup embed script and its tests | report | n/a |
| [reviews/2026-10-21-F4-local-tags](reviews/2026-10-21-F4-local-tags.md) | Review of local encrypted payment tags (TagVault, IndexedDB) | report | n/a |
| [reviews/2026-10-21-F6-jitter](reviews/2026-10-21-F6-jitter.md) | Review of the opt-in payment delay: sampling and scheduler | report | n/a |
| [reviews/2026-10-21-P1-quote-preview](reviews/2026-10-21-P1-quote-preview.md) | Review of quote and payment preview and the calldata equality gate; open items listed | report | n/a |
| [reviews/2026-10-21-P2-wallet-handoff](reviews/2026-10-21-P2-wallet-handoff.md) | Review of EIP-6963 wallet handoff and local QR codes; open items listed | report | n/a |

## User guides (`docs/user/`)

Pre-audit and testnet-only. Nothing is deployed.

| File | Purpose | Type | Status |
|---|---|---|---|
| [user/README](user/README.md) | Index of the user guides | user guide | n/a |
| [user/set-up-stealth-meta-address](user/set-up-stealth-meta-address.md) | Creating seller keys, backing them up and getting the address to share | user guide | n/a |
| [user/review-and-pay-an-invoice](user/review-and-pay-an-invoice.md) | Checking an invoice link before paying it | user guide | n/a |
| [user/receive-and-scan](user/receive-and-scan.md) | How a seller scans for payments; sellers get no notification | user guide | n/a |
| [user/sweep-and-gas-privacy](user/sweep-and-gas-privacy.md) | Sweeping one-time addresses and where privacy is easiest to lose | user guide | n/a |
| [user/privacy-limits](user/privacy-limits.md) | What stays public and what GhostPay does not hide | user guide | n/a |
| [user/fees](user/fees.md) | Fee types, when they apply and where they are enforced | user guide | n/a |
| [user/troubleshooting](user/troubleshooting.md) | Symptom-to-cause table for common errors | user guide | n/a |

## Packages

Each package has a README and, where present, a DEVIATIONS.md (choices where the spec was silent or differs from the code).

| Package | File | Purpose | Type | Status |
|---|---|---|---|---|
| address-safety | [README](../packages/address-safety/README.md) | Pure checks that an address or display text means what it appears to mean; not wired in | package doc | n/a |
| address-safety | [DEVIATIONS](../packages/address-safety/DEVIATIONS.md) | Deviations from the spec: not integrated, viem used for checksums | package doc | n/a |
| btc-silent-payments | [README](../packages/btc-silent-payments/README.md) | BIP-352 Silent Payments for the Bitcoin tier; all 28 official vectors pass | package doc | verified (vectors pass, per file) |
| btc-silent-payments | [DEVIATIONS](../packages/btc-silent-payments/DEVIATIONS.md) | Deviations, discrepancies and unverified items | package doc | verified (vectors pass, per file) |
| btc-silent-payments | [test-vectors/README](../packages/btc-silent-payments/test-vectors/README.md) | Provenance of the BIP-352 test vectors (downloaded 2026-10-21) | package doc | n/a |
| chain-adapters | [README](../packages/chain-adapters/README.md) | EVM adapter: invoice to checked router transaction, ERC-5564 scanning, fail-closed RPC | package doc | n/a |
| chain-adapters | [DEVIATIONS](../packages/chain-adapters/DEVIATIONS.md) | Deviations from and findings about the specs, for the lead to confirm | package doc | n/a |
| chain-adapters | [TODO-VERIFY](../packages/chain-adapters/TODO-VERIFY.md) | Items that could not be verified offline (issuer feed addresses, chain parameters) | package doc | unverified |
| contracts | [README](../packages/contracts/README.md) | Foundry package for the router, sweep relayer and policy accounts; latest local run 274 tests pass | package doc | verified |
| contracts | [DEVIATIONS](../packages/contracts/DEVIATIONS.md) | Deviations from CONTRACTS_SPEC (P, A and R items); Slither run and passing per file | package doc | verified |
| core-crypto | [README](../packages/core-crypto/README.md) | ERC-5564 scheme 1 stealth-address engine (secp256k1), pinned by ADR-0001 | package doc | n/a |
| core-crypto | [DEVIATIONS](../packages/core-crypto/DEVIATIONS.md) | Spec and SDK comparison: no maths discrepancy found | package doc | n/a |
| invoice-schema | [README](../packages/invoice-schema/README.md) | Invoice object, canonical serialisation, signing and URL-fragment envelope | package doc | n/a |
| invoice-schema | [DEVIATIONS](../packages/invoice-schema/DEVIATIONS.md) | Signature scope and other design decisions | package doc | n/a |
| ops-monitor | [README](../packages/ops-monitor/README.md) | Read-only operator probes; failing probes become warnings, not crashes | package doc | n/a |
| ops-monitor | [DEVIATIONS](../packages/ops-monitor/DEVIATIONS.md) | Deviations: no Anvil end-to-end run, fake RPC fixtures only | package doc | n/a |
| policy-scheme | [README](../packages/policy-scheme/README.md) | Client side of the policy-guarded account (scheme 0x47500002); experimental, not enabled | package doc | n/a |
| policy-scheme | [DEVIATIONS](../packages/policy-scheme/DEVIATIONS.md) | Choices where the spec is silent; Merkle proofs checked on vector trees | package doc | verified (per file) |
| relayer-guard | [README](../packages/relayer-guard/README.md) | Abuse and availability controls for the sweep relayer; not wired into apps/relayer | package doc | n/a |
| relayer-guard | [DEVIATIONS](../packages/relayer-guard/DEVIATIONS.md) | Deviations: not integrated, probe-timeout behaviour, forwarding-chain handling | package doc | n/a |
| secret-box | [README](../packages/secret-box/README.md) | Closure-held secret bytes; a guardrail, not a security boundary | package doc | n/a |
| secret-box | [DEVIATIONS](../packages/secret-box/DEVIATIONS.md) | Deviations from core-crypto SecretScalar, no Symbol.dispose, no GC wiping | package doc | n/a |
| tx-review | [README](../packages/tx-review/README.md) | Pre-sign decoder and reviewer for transactions and EIP-712 data | package doc | n/a |
| tx-review | [DEVIATIONS](../packages/tx-review/DEVIATIONS.md) | Deviations: not integrated, extra Intent fields, gas cap added | package doc | n/a |

## Apps

| App | File | Purpose | Type | Status |
|---|---|---|---|---|
| relayer | [README](../apps/relayer/README.md) | Gas-sponsorship relayer for GhostPaySweepRelayer: quote, check, simulate, broadcast; has an Unverified section | package doc | unverified (own Unverified section) |
| relayer | [DEVIATIONS](../apps/relayer/DEVIATIONS.md) | Deviations from APP_AND_RELAYER_SPEC, e.g. chainId as a top-level field | package doc | n/a |
| relayer | [PRIVACY](../apps/relayer/PRIVACY.md) | What the relayer necessarily sees and what it retains | spec | n/a |
| web | [README](../apps/web/README.md) | Static React 19 and Vite app (keys, create, pay, scan, sweep, settings); wallet, RPC and relayer mocked in tests | package doc | unverified (mocked interactions, per file) |
| web | [DEVIATIONS](../apps/web/DEVIATIONS.md) | Deviations from APP_AND_RELAYER_SPEC; wallets and RPC are mocks, Unverified section | package doc | unverified (own Unverified section) |
| web | [public/deployments/README](../apps/web/public/deployments/README.md) | No deployment manifest is shipped; payments stay disabled until one is published | package doc | n/a |

## Not indexed

- `packages/contracts/lib/` (vendored forge-std and OpenZeppelin, including their README, CONTRIBUTING and RELEASE_CHECKLIST files): third-party code, excluded.
- `node_modules/`: excluded.
