# Review: SECURITY_QA_DEVOPS_PLAYBOOK.md + threat-model/THREAT_MODEL.md vs CI, scripts and tree

Date: 2026-10-21. Branch: claude/remote-extensions-1. Read-only review of tracked docs; this file is the only file written.
Scope: docs/SECURITY_QA_DEVOPS_PLAYBOOK.md (PB), docs/threat-model/THREAT_MODEL.md (TM), .github/workflows/{ci,nightly,release}.yml, scripts/*, packages/contracts (test/, echidna.yaml, foundry.toml), apps/web (index.html, public/_headers, public/ghostpay-embed-v1.js, eslint), apps/relayer, docs/audits/*, docs/operators/*, docs/adr/ADR-LOG.md.

Sources: repo files only. External primary sources (EIP-5564, GitHub secure-use docs) could NOT be fetched in this session (DNS/proxy errors, 2026-10-21). Every external claim below is therefore UNVERIFIED. Haiku audit reports in docs/remote/audits/ were not relied on.

Severity: Critical / High / Medium / Low. Line numbers are as of this checkout.

## Summary

- 24 findings: 3 High, 16 Medium, 5 Low (counts below).
- Largest gap: PB blueprint (lines 106-186) describes workflows that do not exist; nightly.yml and docs/operators/release-and-verify.md wrongly say Echidna harnesses do not exist.
- One CI step references a missing script (ci.yml:114), so the contracts job cannot pass as written.

## Findings

### F-01 High: CI step calls a missing script
- Location: .github/workflows/ci.yml:114 (`bash scripts/check-natspec.sh`).
- Evidence: no file scripts/check-natspec.sh in repo (scripts/ holds 8 files). PB section 5.1 (line 549-606) requires NatSpec gate; PB line 606 says "CI checks missing public NatSpec". The gate does not exist, so the job fails at that step, or the spec claim is false.
- Proposed spec text (PB section 5.1, after line 606): "NatSpec gate: `scripts/check-natspec.sh` (path normative). Exits non-zero on any public contract/function/event/error lacking @notice/@param/@return. Until the script exists, the gate status is NOT IMPLEMENTED and ci.yml step must be removed or the script added. Test: a fixture contract with a missing @param must fail the script."

### F-02 High: Echidna described as absent when harnesses exist; spec and CI disagree
- Location: .github/workflows/nightly.yml:16-19; docs/operators/release-and-verify.md:121; PB lines 344, 364.
- Evidence: nightly.yml says "Echidna: no harness contract or echidna.yaml exists". Actual: packages/contracts/echidna.yaml exists; packages/contracts/test/echidna/{EchidnaPolicy,EchidnaRouter,EchidnaSweep}.sol exist. But nightly.yml has NO Echidna job. PB line 344 requires "nightly stateful campaigns"; PB line 364 names `RouterEchidnaHarness` (does not exist). Result: spec requires a job that is not wired, and two docs state a false absence.
- Proposed spec text: PB section 3.1 Echidna bullet: "Harnesses: test/echidna/EchidnaRouter.sol, EchidnaSweep.sol, EchidnaPolicy.sol. Run one contract per invocation with packages/contracts/echidna.yaml (per its header comment). Status: harnesses present; nightly job NOT WIRED. Acceptance: nightly job runs each harness with a fixed corpus dir and fails on any property violation." Correct nightly.yml:16-19 and release-and-verify.md:121 to say harnesses exist and the job is missing.

### F-03 High: PB blueprint does not match any workflow, yet completion criteria assert conformance
- Location: PB lines 106-186 (blueprint), 659 (completion criteria), 145, 153, 170, 179-186.
- Evidence: PB jobs `quality`, `testnet-smoke`, `publish-static` (tag-gated), `publish-tor` (self-hosted runner) and cron "17 4 * * 2" do not exist. Actual nightly cron is "17 3 * * *" (nightly.yml:4). Referenced scripts absent: scripts/validate-chain-config.sh, scripts/verify-release-artifact.sh, scripts/pin-ipfs.sh, scripts/deploy-onion-static.sh, script/SmokeSepolia.s.sol. PB line 96/97 (IPFS, Tor) is disabled per release.yml:140-144 and ADR-0015. Only "Template only" (line 104) marks the block; section 659 "Workflows use SHA-pinned Actions..." is stated as a completion criterion with no status.
- Proposed spec text: add to PB line 104: "Status per job: implemented in ci.yml | nightly.yml | release.yml | NOT IMPLEMENTED. Current files are authoritative; this block is target state. Any job marked NOT IMPLEMENTED is not a release gate." Replace the blueprint's cron with the actual value or note the target.

### F-04 Medium: Slither failure threshold contradicts CI
- Location: PB line 342 ("fail on high/critical"), PB line 145 (`slither . --fail-high`) vs ci.yml:120 and nightly.yml:62 (`--fail-medium --exclude-informational --exclude-low`).
- Evidence: CI is stricter than PB in one place and PB is internally inconsistent (342 vs 145).
- Proposed spec text: PB 3.1 Slither bullet: "Normative command: `slither . --filter-paths "lib|test|script" --fail-medium --exclude-informational --exclude-low`, slither-analyzer pinned 0.11.6, solc 0.8.28. Suppressions require inline slither-disable plus entry in docs/audits/00-slither-triage.md." Update PB line 145 to the same command.

### F-05 Medium: REQUIRE_ANVIL is not honored by the relayer e2e; CI comment is false
- Location: ci.yml:48-53 (comment says apps/relayer/src/e2e.anvil.test.ts honours it "once ... reads it"); apps/relayer/src/e2e.anvil.test.ts:16 (`available = existsSync(...)`, `describe.skipIf(!available)`); only packages/policy-scheme/src/anvil.test.ts:7 reads REQUIRE_ANVIL.
- Evidence: in CI the relayer real-contract e2e can silently skip, which is the exact failure ci.yml:50-51 says must not happen (audit G-09/O-06). PB 1 line 27-33 "must run, not skip" is not enforced.
- Proposed spec text: PB 1 (Test layers): "Any test that depends on anvil or forge artifacts must, when REQUIRE_ANVIL=1, fail (not skip) if a dependency is missing. Acceptance: a CI-only test that deletes ANVIL_BIN must fail the job." Implement the check in apps/relayer e2e; until then mark status NOT IMPLEMENTED.

### F-06 Medium: PB command examples are wrong or non-existent
- Location: PB line 130 (`npm run format:check`), 364 (`echidna . --contract RouterEchidnaHarness`), 365 (`myth analyze contracts/GhostPayPaymentRouter.sol`), 370 (`npm run test:e2e` at root), 143/362.
- Evidence: root package.json scripts: typecheck, test, lint, build, build:libs, ci:scan-secrets, ci:check-actions, release:build, release:repro. No format:check, no root test:e2e (test:e2e exists only in apps/web). Format gate is `forge fmt --check` (ci.yml:102). contracts/GhostPayPaymentRouter.sol does not exist (router is packages/contracts/src/GhostPayRouter.sol). PB line 553 annotates the router path but the command block at 355-372 was not corrected.
- Proposed spec text: replace PB 355-372 with the commands that ci.yml, nightly.yml and root package.json actually run (`forge fmt --check`, `forge build --sizes`, `forge test`, `forge snapshot --check`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e --workspace @ghostpay/web`, `npm run build`, `npm audit --omit=dev --audit-level=high`). Mark Echidna/Mythril lines with their status.

### F-07 Medium: Mythril required by spec, has no configuration, status not stated
- Location: PB lines 93, 345, 365; nightly.yml:18-19 (admits no config).
- Evidence: no mythril config or job in repo (`find` for "*mythril*" returned nothing). PB 345 "bounded symbolic analysis ... in nightly/release-candidate jobs" is a requirement without status.
- Proposed spec text: PB 3.1 Mythril bullet: "Status: NOT IMPLEMENTED. Owner: unassigned. Acceptance: nightly job with pinned Mythril version, fixed timeout, command on packages/contracts/src/GhostPayRouter.sol and GhostPaySweepRelayer.sol, results triaged in docs/audits/. Until then, no claim of symbolic coverage in docs."

### F-08 Medium: Release environment approval described as enforced; repo cannot prove it
- Location: .github/workflows/release.yml:6-7 and 74-79, 114-119; TM section 4.5 row E (line 199: "Required reviewers ... (to be configured) | Owner action").
- Evidence: workflow comments state a maintainer "must approve" the release environment. Whether required reviewers exist is a GitHub setting not visible in the repo. TM says not configured.
- Proposed spec text: PB section 2 Operating rules (line 12): "Release gate: `release` environment with required reviewers. Status is set by the owner and must be checked with `gh api repos/<o>/<r>/environments/release` before each release; the repo cannot prove it." Change release.yml:7 to "(must be configured by the owner; not verifiable from this file)".

### F-09 Medium: "Signed tag" requirement is presence-only; PB does not say so
- Location: PB line 95 ("Release candidate: signed tag"), line 199; release.yml:41-46 (regex for a `-----BEGIN (PGP|SSH) SIGNATURE-----` block only); verify-release.sh:72-80 (checklist; signature check is manual).
- Evidence: a forged or unrelated signature block passes CI. TM 4.5 correctly says "presence check only", PB does not.
- Proposed spec text: PB 2 stage 4: "Signed tag: CI checks signature block presence only. Authenticity requires `git verify-tag` against the maintainer key obtained out-of-band (docs/operators/release-and-verify.md). Passing CI does not establish authenticity."

### F-10 Medium: Committed foundry.toml points at a sandbox path; CI rewrites it at build time
- Location: packages/contracts/foundry.toml:5 (`solc = "/tmp/claude-0/tools/solc/solc"`); sed rewrites in ci.yml:42,101; release.yml:59; nightly.yml:38,57; scripts/release-build.sh does not rewrite it.
- Evidence: the committed config is not the config that CI uses. PB 2.1 (line 252) and 2.1 gen-release-manifest.mjs:51 record solc as "not-recorded" unless GP_SOLC_VERSION is set. A local `forge build` and the release build compile with different settings than the committed file says. A /tmp path in a tracked file is also a leaked sandbox artifact.
- Proposed spec text: PB 2 Release manifest: "solc version must be recorded from the same source the build uses (not a sed rewrite). Normative: committed foundry.toml carries `solc_version = "0.8.28"`; a local override is kept in an untracked file." Add to release-build.sh a check that `forge config` reports 0.8.28, and remove the sed steps.

### F-11 Medium: CSP claims differ across TM, PB and the actual header files
- Location: TM 4.1 row E (line 143: "CSP `script-src 'self'`"), TM 6.1 (line 229: "connect-src https: wss:"), apps/web/index.html:10, apps/web/public/_headers:5 (`connect-src 'self' https: wss:`), PB 2.7 (line 195: "GitHub Pages may not provide arbitrary response headers").
- Evidence: the threat model presents CSP as a control without saying (a) connect-src is broad by design (DEVIATIONS.md item 20), (b) `frame-ancestors` in meta CSP is ignored by browsers (index.html:9-10 has no frame-ancestors; _headers has it), and (c) on a host that ignores _headers the meta CSP is the only control. Browser behavior of meta-CSP directives is a standards question: UNVERIFIED this session.
- Proposed spec text: TM 4.1 E row: "CSP enforced via `_headers` (frame-ancestors, object-src, base-uri) where the host honors it; on hosts that do not, only the meta CSP in index.html applies (script-src 'self', connect-src 'self' https: wss:). connect-src is broad by design (apps/web/DEVIATIONS.md item 20)." Add a test: scan-bundle already checks _headers; add a host matrix row.

### F-12 Medium: Merchant embed script has no threat-model coverage
- Location: apps/web/public/ghostpay-embed-v1.js (header lines 1-14: "Pay with GhostPay" button loaded by merchant pages); TM sections 2 (observer table), 4.1 (invoice link STRIDE), 3.1 (flow).
- Evidence: a third-party page loads and executes a script from the GhostPay origin and opens a popup. Not in TM. PB line 16 requires a threat-model update for every new "wallet flow or network transport", and Proposal 2 (PB line 489-494) lists related rules, but TM has no row. The script's own header cites "Feature 2" in docs/POST_LAUNCH_FEATURES_SECURITY_ROADMAP.md.
- Proposed spec text: TM 4.1 new rows: "S: merchant page spoofs a GhostPay button linking to attacker invoice (mitigation: same-origin check on link in embed script; residual: merchant page is trusted for display); I: merchant page reads link attributes (fragment visible to host page)." TM section 2: add "Merchant host page | link attributes it renders, button clicks | keys, payer wallet."

### F-13 Medium: Bundler/paymaster threats in PB section 2 have no status and no code basis
- Location: PB lines 272-280 (Relayer, bundler, paymaster), 543 (Proposal 3), TM 4.4 (sweep relayer only).
- Evidence: grep for paymaster/userop/ERC-4337 finds only OpenZeppelin lib sources under packages/contracts/lib and no GhostPay code. PB section 2 checklists therefore have no target.
- Proposed spec text: PB 2 "Relayer, bundler, and paymaster": add "Status: N/A in tree; no bundler or paymaster is implemented. Applies only after Proposal 3 Phase B." TM 4.4: note that the relayer is a sweep relayer (GhostPaySweepRelayer) and that paymaster/bundler rows are out of scope until Proposal 3 is built.

### F-14 Medium: QR and service-worker threats listed in PB, absent from TM; service-worker status unstated
- Location: PB line 266 (service-worker cache), 270, 308 (service-worker cache poisoning), 517 (QR); TM 3.1 line 45 ("QR rendered locally") with no STRIDE row; apps/web/src/lib/qr.ts exists; `serviceWorker` not found in apps/web/src or apps/web/public.
- Evidence: TM mentions QR only as a flow label. QR content (bearer link) is not an STRIDE row. PB's service-worker checks have no referent.
- Proposed spec text: TM 4.1 row I: "QR code encodes the full bearer link; visible to anyone who sees the screen or photo (apps/web/src/lib/qr.ts). Control: warning at creation (PB Proposal 2)." PB 1 UI row: "Service worker: N/A (none in tree). Re-open this check if one is added."

### F-15 Medium: Secret scan coverage is narrower than the spec implies
- Location: scripts/scan-secrets.sh:10 (env files), :16-18 (key pattern with excludes `:!docs :!.github :!**/test/** :!**/*.test.ts :!test-vectors :!**/*.md :!packages/contracts/lib`); PB 13 and PB 2.1 line 92 ("secret scan").
- Evidence: detects only `PRIVATE KEY-----` and 0x+64-hex on a line containing "private|secret". No history scan, no seed-phrase, no API-token or RPC-key pattern. Test/doc paths are excluded entirely, so a key in a test file is not detected. PB 13 names RPC keys, IPFS credentials, SSH keys, deployer keys as things that must not reach forks; the scanner does not cover RPC or IPFS token shapes.
- Proposed spec text: PB 2 stage 1: "Secret scan: scripts/scan-secrets.sh checks (a) env files, (b) private key blocks, (c) 0x+64-hex with keyword. It does NOT check history, seed phrases, RPC URLs with embedded keys, or tokens. Exclusions require an entry in docs/security/scan-allowlist.md with owner and expiry. Acceptance: a fixture with each pattern class must fail the script." Consider adding a maintained scanner (e.g. gitleaks) as a separate, versioned step; not verified this session.

### F-16 Medium: "No unexpected egress" is untestable as written
- Location: PB line 30 (UI row: "No transaction mismatch or unexpected egress"), 306-323 (network checks), TM 4.3 row I (line 168: "Worker has no network API").
- Evidence: no allowlist of permitted origins is defined anywhere. apps/web/index.html:10 permits `https:` and `wss:` to any host. The test "bundle scan" (scan-bundle.mjs) checks CSP text, not runtime egress.
- Proposed spec text: PB 1 UI row: "Egress: permitted origins = the same origin plus the user-selected RPC and relayer origins from settings. Test: Playwright run records every request; any origin not in the allowlist fails the test. Allowlist lives in apps/web/e2e/egress.allowlist.json (to be created)."

### F-17 Medium: Release manifest does not record what the spec says; placeholders not flagged as gaps
- Location: PB line 199 (fields: signed tag/commit, compiler and tool versions, test/fuzz/static/audit summaries, supported token/oracle matrix, known limitations); scripts/gen-release-manifest.mjs:71-81 (evidence fields "not-recorded"), :81 (unrecordedFields).
- Evidence: the manifest does record the list (it is honest), but PB does not mark these as deferred, so PB reads as currently delivered.
- Proposed spec text: PB 2 Release manifest: "Current build records: commit, lockfile sha256, tool versions (solc only with GP_SOLC_VERSION), SBOM and tarball hashes, deployment manifest hashes, attestation pointer. NOT recorded (status not-recorded in manifest): signature status, test/fuzz/static summaries, audit summaries, supported-token matrix, IPFS CID, onion hash."

### F-18 Medium: "Release owner" and "owner decisions" are undefined roles
- Location: PB line 12 ("release-owner sign-off"), line 14, TM 4.5 row E ("Owner action"), TM 8 (fee recipient "owner"), release.yml:142 ("owner decision ... docs/adr/").
- Evidence: no document names the release owner or how sign-off is recorded. ADR-LOG.md has owner-decision items (ADR-0006, 0015) but no sign-off record format.
- Proposed spec text: PB 1 Operating rules: "Release owner: the person named in docs/operators/release-and-verify.md. Sign-off is recorded as an approved review on the release PR and an entry in docs/adr/ADR-LOG.md for hosting decisions."

### F-19 Medium: Egress, timing and correlation tests require infrastructure the repo does not contain
- Location: PB lines 322-323 ("timing/amount correlation on synthetic activity", "measure IP/DNS leakage ... controlled endpoints"), 332 (retention review), TM section 9 (line 315, "not performed, audit D-13").
- Evidence: no controlled endpoints, testnet harness, or leakage scripts exist. TM 9 states this honestly; PB presents them as a test plan without status.
- Proposed spec text: PB 3 pen-test checklist header: "Status: manual; no automation exists. Results go to docs/audits/ with date and commit. Not run as of 2026-10-21 (audit D-13)."

### F-20 Low: TM says "Phase B" items done, no dates or owners on "In progress"
- Location: TM section 1 line 5 ("In progress ... not verified by this document") and section 7 (lines 285-296) statuses.
- Evidence: "In progress" has no owner, date or branch reference. docs/remote/modules-needed.md:17 gives an owner for S3-01 only as "In progress elsewhere".
- Proposed spec text: TM line 5: "In progress entries must name the branch or PR and a date of last verification, e.g. 'In progress (branch X, verified 2026-10-21)'. Without that, treat as Open."

### F-21 Low: Ambiguous PRIVACY.md reference
- Location: TM section 4.4 table, row I ("Hashed IP, no persistence, no bodies in logs (PRIVACY.md)").
- Evidence: the only PRIVACY.md is apps/relayer/PRIVACY.md (no root file). Ambiguous path in a threat model.
- Proposed spec text: TM 4.4 I row: "(apps/relayer/PRIVACY.md)".

### F-22 Low: check-actions-pinned.sh checks format, not correspondence
- Location: scripts/check-actions-pinned.sh:29-35; PB line 99-100, 190.
- Evidence: the script verifies a 40-hex SHA and a `# vX.Y.Z` comment; it cannot verify the SHA is the tagged release or was reviewed (PB line 104 requires "reviewed" SHA). Dependabot (.github/dependabot.yml) updates actions weekly but no check ties SHA to tag.
- Proposed spec text: PB 2 security notes: "check-actions-pinned.sh verifies format only. Reviewer confirms that each SHA matches the version comment at review time; Dependabot PRs are reviewed under the same rule."

### F-23 Low: Reproducibility check compares two files only
- Location: scripts/repro-check.sh:43 (compares tarball and sbom.cdx.json only); scripts/release-build.sh:70-72 (SHA256SUMS also covers release-manifest.json).
- Evidence: release-manifest.json and SHA256SUMS are not compared, so a non-reproducible manifest passes the nightly job. PB section 2 says "artifact reproducibility" (line 32) without naming the files.
- Proposed spec text: PB 1 Supply chain row: "Reproducibility: tarball, sbom.cdx.json and release-manifest.json must be byte-identical across two builds (scripts/repro-check.sh must compare all three; currently compares two)."

### F-24 Low: Stale-sample disclaimer is not per section; normative status unclear
- Location: PB line 3 (global supersession clause), line 553 (only sample annotated), lines 249-252 and 584-586 (router text in review checklists still assumes the old API without annotation).
- Evidence: a reader can take PB 3.1 (lines 569-597 are annotated; 380-388 are not) as current. Global clause covers conflicts only where the reader spots them.
- Proposed spec text: PB header: "Each section is labelled NORMATIVE (matches code and CONTRACTS_SPEC.md), TARGET (not built), or STALE (superseded). Labels are required for every section before this document is used as a gate."

## Consistent items (checked, no finding)

- ci.yml has no `secrets.` references; PB 13 (fork PRs must not receive secrets) is met by `pull_request` triggers and `permissions: contents: read` (ci.yml:9-11).
- Router constants match PB and TM: METADATA_LENGTH 57, EPHEMERAL_KEY_LENGTH 33, FEE_BPS 25, immutable ANNOUNCER and FEE_RECIPIENT, nonReentrant (packages/contracts/src/GhostPayRouter.sol:48-57). Fee floor formula matches FEE_SCHEDULE.md.
- Relayer deadline bounds match TM 4.4 (MAX_DEADLINE_WINDOW_SECONDS=1800, minimum 30 at apps/relayer/src/config.ts:19,261).
- Invariant prefixes in PB 1 match tree (invariant_* functions in packages/contracts/test).
- Audit IDs cited in TM (S3-01..S3-19, G-21, G-26, O-13, D-13, M-01..M-03, L-02, D1..D10) exist in docs/audits/0{1,2,3,4}-*.md.

## Counts

- High: 3 (F-01, F-02, F-03)
- Medium: 16 (F-04 through F-19)
- Low: 5 (F-20 through F-24)
- Total: 24

## Unverified

- External standard and doc claims in PB (EIP-5564 metadata layout, GitHub secure-use recommendations, Slither/Echidna/Mythril upstream behavior) were not checked; web fetch failed this session.
- Browser behavior of meta-CSP directives (F-11) is not verified.
- "Two noble majors installed" (TM section 1, THIRD_PARTY.md) not checked against package-lock.json in this review.
- The vitest config sketch in PB lines 59-75 was not compared against repo vitest config.
