# Release blocker queue

Verdict at candidate `73124433c08c8ef6835f11d03709060c6eea7a3f`: **BLOCKED for demonstration and testnet beta.**

Fixable engineering gaps and external release dependencies are listed separately by action, without changing mandatory gates. Source presence is not deployment readiness.

| Priority | Blocker | Milestone | Exact next action / owner |
| --- | --- | --- | --- |
| 1 | Direct native sweep lacks qualified explicit gas/fee preview | Testnet | Implement review bound to the actual fee/transaction assumptions; reproduce stale/changed fee behavior and verify refusal or renewed consent before signing |
| 2 | Strict Mythril findings and current security clearance incomplete | Required security/merge gates | Run exact-source configured analyzers, retain complete outputs and investigate the 11 historical records. No exception or suppression is authorized |
| 3 | CodeQL High reconciliation and external review incomplete | Required security/release gates | Obtain current hosted analysis and finding-level evidence; arrange independent external review of exact release source |
| 4 | Resolved: two transaction-fixture type errors | Historical build failure | Test-only runtime EIP-1559 envelope validation is integrated; full application typecheck/build and focused 19-case helper file now pass |
| 5 | Complete final-source tests, coverage, lint and build matrix not yet passed | Both | Execute unchanged required matrix after final source edits; inspect failures individually |
| 6 | Browser environment fails before startup assertions | Both | Use a supported environment for Chromium/Firefox/WebKit, /GhostPay/ local-chain journey, mobile/keyboard/accessibility and negative cases; no skipped gate counted as passed |
| 7 | New artifact verifier and policy-fixture work arrived during qualification | Both/full workspace | PR #276 is independently reviewed and integrated (101 Pages tooling tests pass); use it on the final artifact. Inspect #275 where full policy tests apply; preserve deferred runtime scope |
| 8 | Exact release artifact and independent reproducibility evidence incomplete | Both; signed release additional | Produce clean source-pinned site, exact file inventory, hashes, module report and provenance; independent-machine reproduction per release policy |
| 9 | Fresh hosted candidate CI not complete | Both/main promotion | Publish isolated reviewed branch through approved workflow, await actual required jobs, inspect logs, then qualify resulting main |
| 10 | Another worker holds the integration lease | Main promotion | Re-read lease/ACTIVE_WORK and coordinate normal handoff; do not steal lease, force-push or merge coordination history |
| 11 | ADR-0029 owner acceptance outstanding | Public demonstration and beta | Owner records acceptance/rejection in reviewed ADR; resolve ADR-0015 hosting decisions before deploy:true |
| 12 | GP-PAGES-01 origin isolation undecided | Public demonstration and beta | Owner chooses dedicated custom domain or isolated Pages account; configure DNS/HTTPS and exact GHOSTPAY_PAGES_ORIGIN |
| 13 | Pages environment and publication approval unavailable | Public demonstration | Set Actions source and main-only environment, confirm candidate/approved artifact, authorize exact deployment, then verify live smoke |
| 14 | Approved release key, fingerprint and signed testnet manifest unavailable | Testnet | Owner provides public verification key configuration, offline signing authority and reviewed testnet manifest; never place secrets in repo |
| 15 | Authorized testnet contract deployment and bytecode proof unavailable | Testnet | Authorized deployer executes chosen testnet procedure; record addresses, code hashes, immutables and deployment identifiers |
| 16 | Real wallet/testnet acceptance not performed | Testnet | Payment, confirmation, scanning, native sweep, independent recovery and failure/recovery on the deployed site; retain actual transaction evidence |
| 17 | Release tag/assets not approved or qualified | 1.0.0-beta.1 | After required conditions pass, verify tag absence, create reviewed release assets/provenance and publish without replacing an existing tag |

The demonstrated sweep-authority, balance-consent, stale-callback, entry-session, clock and jitter defects were corrected with regression evidence. Their closure is scoped to those implementations, not to the entire release.

## Owner decisions prepared for review

[DEPLOYMENT_READINESS.md](DEPLOYMENT_READINESS.md) contains the proposed dedicated-origin settings and deployment sequence. Required inputs are the owner-selected hostname/account, documented ADR decision, Pages environment configuration, signing public-key/fingerprint decision, authorized testnet deployer/fee-recipient choices and external reviewer. No private key should be supplied through documentation or chat.

An external dependency blocking publication does not prevent safe source work. Continue the queue through remaining engineering and reproducible evidence before requesting final approval of the exact deployment. Preserve all completed work if local resources stop execution.

## Publication provenance

Implementation commit identities above refer to preserved local development history. The GitHub connector preserves each tree and ordered parent history while normalizing commit metadata. `PUBLICATION_MAP.json` maps implementation commits to their published identities. Fresh publication, artifact and hosted-check records will be appended after final qualification.
