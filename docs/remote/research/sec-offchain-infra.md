# Research: off-chain security infrastructure

Retrieval date: 2026-10-21. Branch `claude/remote-extensions-1`. Scope: relayer hardening, static-site hosting, CI/supply chain, monitoring/IR, bug bounty, disaster recovery. Nothing in the tree was changed; this file is the only output.

## 0. Method, sources, reachability

Repo read: `README.md`, `SECURITY.md`, `docs/remote/modules-needed.md`, `docs/remote/security-specs/{incident-response,key-lifecycle,relayer-abuse,supply-chain}.md` (first sections), `docs/operators/{relayer-runbook,release-and-verify,mirror-hosting}.md`, `apps/relayer/src/{main,chain,config,secrets}.ts`, `apps/web/public/_headers`, `apps/web/index.html`, `.github/workflows/{ci,release}.yml`, `.github/dependabot.yml`, `scripts/*`. `docs/remote/audits/*` (haiku) were not relied on.

Reachability from this sandbox: only `raw.githubusercontent.com` and WebSearch worked. Blocked (DNS/ENOTFOUND or no connect): docs.github.com, docs.npmjs.com, docs.sigstore.dev, developers.cloudflare.com, docs.aws.amazon.com, docs.cloud.google.com, slsa.dev, openssf.org, cyclonedx.org, spec.openssf.org, rfc-editor.org, datatracker.ietf.org, web.dev. Several raw-GitHub paths returned 404 (SLSA spec, npm CLI config, AWS KMS docs repo, GitHub Dependency Review, push-protection docs). No haiku sub-workers were spawned.

Source tiers used below:
- **[P]** primary, fetched and read: raw source of project docs on GitHub (list in section 9).
- **[S]** secondary, from WebSearch result summaries only (incident reporting). Treated as unverified; the primary post-mortems were not reachable.
- **[K]** author knowledge, not re-fetched. Marked "unverified".

## 1. Where the project stands (relevant baseline)

Already done (verified in tree): all workflow actions pinned to full SHAs and checked by `scripts/check-actions-pinned.sh`; `permissions: contents: read` default with per-job restatement; `persist-credentials: false`; `npm ci --ignore-scripts`; Dependabot weekly for actions and npm; `release` Environment with required reviewers (documented, a repo setting); deterministic tarball, CycloneDX SBOM, `SHA256SUMS`, `actions/attest-build-provenance`; draft-only release; signed-tag-present check; `scan-secrets.sh`; strict CSP in `apps/web/public/_headers` (no third-party script, `frame-ancestors 'none'`); relayer key file mode 600 enforced, quote secret separate, low float, distroless container, systemd sandbox.

Gaps found (grep of `.github`, `scripts`, `docs/operators`): no `CODEOWNERS`; no CodeQL/zizmor/Scorecard/dependency-review workflow; no egress control on runners; no cosign/sigstore blob signature (only GitHub attestation + git tag); signature on tag is not cryptographically verified in CI; Dependabot has no `cooldown`; relayer signer is `privateKeyToAccount` over a file/env hex key (`apps/relayer/src/main.ts:13`), one `rpcUrl` per chain with no quorum; relayer `/metrics` and alert webhook "in progress"; `SECURITY.md` contacts unconfirmed; no bounty; no DR doc for relayer/frontend/manifest beyond runbook section 9 tables; `Dockerfile` base digest-pinning not verified here.

Cross-ref: `docs/remote/modules-needed.md` ranks manifest authentication (S3-01) and relayer-guard first; this file covers the layer around them.

## 2. Relayer hardening

### R1. Move hot key behind a signer abstraction; KMS/HSM first, MPC later
- Threat: host compromise or file read exfiltrates `RELAYER_KEY` (runbook s4: loss bounded by float, but the key is also the on-chain `feeTo` default).
- Change: in `apps/relayer/src` replace `privateKeyToAccount(...)` with a `viem` custom account (`toAccount({address, signTransaction, signMessage, signTypedData})`) backed by a `Signer` interface; implementations: file key (current), cloud KMS. AWS KMS key spec `ECC_SECG_P256K1`, usage `SIGN_VERIFY`, is listed by CDK enum docs [S: AWS CDK KeySpec pages surfaced by search; AWS KMS developer guide itself unreachable]. Google Cloud KMS secp256k1 support [K, unverified, docs.cloud.google.com unreachable]. KMS returns DER ECDSA without recovery id and not necessarily low-S: the adapter must normalise s to low-S and brute-force v by public-key recovery (unverified in this research; test against anvil e2e `e2e.anvil.test.ts`). Cosign docs list `awskms://`/`gcpkms://` key refs [P: cosign verify-blob], useful for R-release signing (C5).
- What it buys: key cannot be copied; compromise reduces to "can request signatures while host is up", bounded by IAM policy plus relayer logic. Does not stop a compromised process from signing arbitrary txs, so keep float low and add the KMS-side condition keys/alerts (CloudTrail on `Sign`) [K].
- Not recommended now: MPC/threshold signer (Fireblocks-style, tss-lib) is heavy for a gas-only hot wallet holding a few days of budget. Revisit only if float grows.
- Effort M. Residual: process-level misuse; KMS cost (about per-request pricing, unverified). Priority P2 (before any mainnet relayer; testnet can stay on file key). Needs owner decision (cloud vendor, cost, account).

### R2. Separate `feeTo` from hot key and make it a cold address by default
- Threat: fees accrue to the hot key (config default `feeTo` = hot key address, runbook s3).
- Change: `apps/relayer/src/config.ts`: make `feeTo` required for non-testnet chains (startup error when equal to hot-key address and `ALLOW_MAINNET=1`). Effort S. Residual: none significant. P1. No owner decision beyond providing the address (same as the open fee-recipient decision).

### R3. RPC trust: consistency quorum for reads, single-provider for writes
- Threat: D2 in `incident-response.md` (lying RPC). Simulation, balance and nonce reads come from one provider; a lying provider can make the relayer broadcast reverting sweeps (gas loss), or hide balance (breaker bypass). Runbook s9 says "cannot be detected".
- Change: `apps/relayer/src/chain.ts`: optional `rpcUrls[]`; run `eth_call` simulation and `eth_getBalance`/`eth_blockNumber` against 2 providers and require agreement (same block number tolerance, same result); broadcast to all. viem has a `fallback` transport [K, wevm docs path 404 via raw]; note that `fallback` is failover, not agreement, so quorum needs custom code (about 100 LOC). Pin `eth_chainId` on startup per provider (already done for the web adapter per `_headers` comment).
- Effort M. Residual: both providers can be influenced by the same upstream/eclipse; only helps against one malicious/faulty provider. P3. No cost beyond second provider plan.

### R4. Rate limiting, abuse, griefing
- Already specified in `docs/remote/security-specs/relayer-abuse.md` and `modules-needed.md` rank 2 (`packages/relayer-guard`). Research adds nothing beyond: wire the module in, then front the service with an edge limiter (Cloudflare rate limiting rules or proxy `limit_req`) so floods never reach Node [K]. Add a cheap pre-auth check: reject bodies > few KB at the proxy; require `Content-Type: application/json`.
- Effort S after relayer-guard lands. P2.

### R5. Secrets handling for the relayer
- Threat: key/quote secret in env or world-readable file, leaks via logs/crash dumps/`/proc`.
- Change: prefer systemd `LoadCredential=`/`SetCredentialEncrypted=` (systemd feature, [K], unverified here) over `EnvironmentFile`; set `NODE_OPTIONS=--disable-proto=delete`? (not needed). Disable core dumps (`LimitCORE=0`, `PrivateTmp=yes` already likely; verify in `apps/relayer/deploy/ghostpay-relayer.service`). Keep RPC URLs (they contain API keys) as credentials too. Rotation script in `docs/operators/relayer-runbook.md` s4 should include quote secret overlap (accept two secrets during rotation) to avoid invalidating in-flight quotes: `apps/relayer/src/quoteToken.ts` change, effort S.
- P3. No owner decision.

### R6. Admin surface and egress
- Change: bind metrics to loopback or require the bearer token (already planned); put `/v1/*` behind TLS reverse proxy; restrict container egress to the RPC hosts (iptables/`docker network` allowlist) so a compromised dependency cannot exfiltrate the key. Effort S-M. P3.

## 3. Static-site hosting security

### H1. Primary host with header control; prefer Cloudflare Pages `_headers` but know the limits
- Facts [P: cloudflare-docs `headers.mdx`]: `_headers` file supported; max 100 rules; each line max 2,000 characters; headers are NOT applied to responses generated by Pages Functions (so do not add Functions to this site); multiple matching rules merge, duplicate header values are comma-joined (a CSP set both in a wildcard rule and a specific rule would be concatenated, which is a combined-intersection policy, so avoid defining CSP twice). Current CSP line is about 330 characters, within the limit.
- Change: keep `apps/web/public/_headers` as is; add a CI test (`apps/web/scripts`) that asserts the built `dist/_headers` has exactly one `Content-Security-Policy` line under `/*` and that `index.html` meta-CSP is a superset-compatible duplicate. Effort S. P3.

### H2. CSP: remaining weaknesses
- `connect-src 'self' https: wss:` allows exfiltration to any HTTPS host if an XSS or injected module runs (the CSP then gives no containment of keys). Reason is user-chosen RPC/relayer. Options: (a) ship an allowlist of RPC/relayer origins in a build-time manifest and have settings page require explicit "add custom endpoint" which reloads under a user-extended policy: not possible with static headers; (b) keep broad but add `Trusted Types` (`require-trusted-types-for 'script'; trusted-types 'none'`) to block DOM-XSS sinks [K, MDN/W3C; web.dev unreachable]. Lint already forbids `innerHTML`, so Trusted Types is cheap defence in depth. Effort S (header plus Playwright check). P2.
- `style-src 'self'` without `'unsafe-inline'` is good; keep.
- Add `Cross-Origin-Embedder-Policy: require-corp` only if workers need isolation; skip.
- Add `Strict-Transport-Security: max-age=63072000; includeSubDomains` (+ preload only after owner commits to the domain) [K]; Cloudflare may add its own, check. Effort S. P2. Owner decision: domain (not chosen).
- Meta-CSP limits on GitHub Pages (no `frame-ancestors`, no headers) already documented in `mirror-hosting.md`.

### H3. SRI
- All scripts/styles are same-origin and bundled; SRI protects against a different origin or CDN tamper and does nothing if the same origin serves a tampered `index.html`, which carries the integrity hashes. Real value: (1) the embed SDK `ghostpay-embed-v1.js` that merchants load cross-origin: publish its SHA-384 and tell integrators to use `<script integrity=... crossorigin>`, and never overwrite the file at the same URL (version in filename; current `max-age=3600` mutable path is the Ledger Connect Kit failure shape [S: Lopp's critique "blindly loading code without pinning version and checksum", via CoolWallet quote in search results]). (2) Vite `build.rollupOptions` plugin to add `integrity` attributes to `index.html` `<script type=module>` and modulepreload links so a partial CDN/edge corruption of `/assets/*` fails closed. Effort S. P3 for (2), P2 for (1) if the embed is published.

### H4. Reproducible builds and independent verification
- Present: `scripts/repro-check.sh`, nightly reproducibility diff. Gaps: only same Node/npm major + Linux claimed; Docker/Nix builder would widen it. Change: add a `Dockerfile.build` pinned by digest producing the tarball so third parties rebuild bit-identically on macOS/Windows hosts; record base-image digest in `release-manifest.json`. Effort M. Residual: base image trust. P3.
- Add a second independent rebuild in CI on a different runner OS image/version and compare hashes before attesting (nightly job exists; make it a release gate). Effort S. P2.

### H5. Host account takeover (the real Bybit/Safe lesson)
- Incident [S, unverified primary]: Safe{Wallet} frontend JS in an AWS S3 bucket was replaced after a developer machine/session was compromised; reporting differs on exact entry (Elastic: PyYAML RCE on a dev machine then stolen 12-hour AWS session credentials; Sygnia/Verichains: tampered JS two days before the theft, clean files re-uploaded minutes after). Lesson independent of details: whoever can write to the host can steal user funds, regardless of CSP/SRI.
- Changes (docs plus settings, no code): (a) Cloudflare account: hardware-key MFA, 2 admins, API tokens scoped to single Pages project, no long-lived tokens in CI (use deploy from a protected `release` environment only); (b) deploy from the verified release tarball only, via `wrangler pages deploy` with a token held only in the `release` Environment; (c) post-deploy verifier (cron, off-host) fetching each served file and comparing to `SHA256SUMS`, alerting on mismatch (M2); (d) in-app: since the in-app hash widget cannot detect tampering (S3-04), offer a documented offline verification and an optional "pinned release" desktop/IPFS path. Effort M. P1 before any hosting. Needs owner: Cloudflare account, domain, who holds admin.

### H6. IPFS/ENS/Tor mirrors
- Keep per ADR-0015: mirrors only with documented limits. Content-addressed hosting turns H5 into a smaller problem (CID pin changes are visible) but moves trust to ENS/DNSLink controller keys; use a multisig for the ENS name (owner decision). [K, unverified].

## 4. CI / supply chain

### C1. Branch and tag protection via rulesets
- Facts [P: GitHub docs `available-rules-for-rulesets.md`]: rulesets can restrict deletions (on by default), block force pushes, restrict creations/updates, require merge queue, with explicit bypass actors. Immutable releases [P: GitHub docs `immutable-releases.md`]: tag cannot be moved/deleted and assets cannot be changed or deleted after publish; a release attestation is auto-generated; recommended flow is create draft, attach assets, publish, which matches `release.yml`'s draft-only design; tag names of deleted immutable releases cannot be reused.
- Changes: (1) Enable repository setting "Immutable releases" before the first published release. (2) Ruleset on `main`: require PR, 1+ approving review from CODEOWNERS (needs two humans; with a single maintainer the review requirement is ceremony, state that), required status checks (CI jobs by name), block force push and deletion, require signed commits (optional), no bypass actors except break-glass owner. (3) Ruleset on `v*` tags: restrict creation/update/deletion to maintainers (release-and-verify s2 already asks for this; make it a checked item). (4) Add `.github/CODEOWNERS` covering `.github/**`, `scripts/**`, `packages/contracts/**`, `apps/web/public/_headers`, `deployments/**`, `package-lock.json`. Effort S. Residual: single-maintainer collusion with self. P1. Needs owner: decide maintainers, enable settings.

### C2. GitHub Actions hardening
- Facts [P: GitHub docs `secure-use.md`]: pin actions to full-length commit SHA (already done); grant least `GITHUB_TOKEN` permissions; use intermediate env vars for untrusted expression input; avoid `pull_request_target`/`workflow_run` with untrusted code; secrets in Environments with required reviewers; prefer OIDC over stored cloud secrets; self-hosted runners almost never on public repos; Dependabot alerts do not cover SHA-pinned actions (so Dependabot PRs are the update path); Scorecard action recommended.
- Incident [S]: tj-actions/changed-files (CVE-2025-30066, March 2025): mutable tags rewritten to a malicious commit; runner memory scraped, secrets printed to logs; reporting says upstream cause was a stolen bot PAT, possibly via reviewdog/action-setup; CISA listed AWS keys, PATs, npm tokens, private RSA keys as exposed. SHA pinning (already done here) is exactly the control that would have helped; rotate any secret that touched an affected run.
- Changes: (a) add `zizmor` run in CI (`zizmor` audits include `unpinned-uses`, `template-injection`, `excessive-permissions`, `artipacked`, `cache-poisoning`, `dangerous-triggers`, `secrets-outside-env`, `dependabot-cooldown`, `impostor-commit`, `self-hosted-runner` [P: zizmor audits.md headings]). Pin zizmor by SHA, run `--pedantic`-free first, fix findings. Effort S. (b) `step-security/harden-runner` with `egress-policy: audit` then `block` and an allowlist (registry.npmjs.org, github.com, objects.githubusercontent.com, foundry/solc hosts) [P: harden-runner README: audit/block egress, free community tier for public repos]; it is a third-party SaaS-backed action: treat as a trust decision, pin by SHA, record in `THIRD_PARTY.md`. Effort S-M. (c) OSSF Scorecard workflow (checks include Branch-Protection, Code-Review, Dangerous-Workflow (critical), Pinned-Dependencies, Signed-Releases, Token-Permissions, Dependency-Update-Tool, SAST, Security-Policy [P: scorecard checks.md]) publishing SARIF; use as a regression gate not a score target. Effort S. (d) CodeQL for the TS code [K]. (e) Cache poisoning: the release job should not restore caches written by PR runs; current `setup-node cache: npm` in `release.yml` verify job: remove cache in release workflows. Effort S.
- Residual: runner-level compromise by a pinned-but-malicious action version. P1 for (a),(e); P2 for (b),(c),(d).

### C3. Dependencies, lockfile policy, npm
- Present: exact pins, lockfile, `--ignore-scripts`, `npm audit --omit=dev --audit-level=high` in release verify, `THIRD_PARTY.md`.
- Incidents [S, unverified primaries]: Shai-Hulud npm worm (Sept 2025 and "2.0"): install-time script stole npm/GitHub/cloud tokens and republished victims' packages; one report states npm mass-revoked classic tokens on 2025-12-09 (single source, verify against npm changelog). Lesson matching this repo: `--ignore-scripts` plus pinned lockfile plus no maintainer publish tokens on dev machines.
- Changes: (a) Dependabot `cooldown` (default-days; applies to version updates not security updates [P: dependabot options reference]) of 7 days for npm and 3 for actions, so brand-new malicious releases are not proposed immediately; zizmor flags absence (`dependabot-cooldown`). Edit `.github/dependabot.yml`. Effort S. (b) Add `.npmrc` with `ignore-scripts=true`, `save-exact=true`, `audit-level=high` [K; verify option names against npm config docs, which were unreachable]. (c) Lockfile policy in CI: fail if `package-lock.json` changes without a matching `package.json` change or a label, and fail if any `resolved` URL host is not `registry.npmjs.org` or `integrity` missing (small script `scripts/check-lockfile.mjs`). Effort S. (d) Dependency review action on PRs (blocks new deps with known vulns or disallowed licences) [K; GitHub docs path unreachable]; note the repo-specific rule "no new runtime dependency without THIRD_PARTY.md entry" can be enforced by the same script. Effort S. (e) Resolve S3-24 duplicated `@noble/*` versions via npm `overrides` or accept and document. (f) `npm audit signatures` in CI to check registry signatures and provenance attestations of installed packages [K, unverified]. Effort S.
- npm provenance for GhostPay's own packages: all packages are `"private": true` and unpublished, so provenance (npm `--provenance` / trusted publishing) is not needed now. If `@ghostpay/*` libs or the embed SDK are ever published, use OIDC trusted publishing from a protected environment, no long-lived npm token [K; npm docs unreachable]. P4 / defer.
- P1 for (a)(c); P2 for others.

### C4. Secret scanning
- Present: `scripts/scan-secrets.sh` in CI and release verify. Gaps: only scans tree at that commit [K: check script], not history; no push protection.
- Change: enable GitHub secret scanning plus push protection in repo settings (free on public repos [K]); add `gitleaks` full-history scan once in CI nightly (pin by SHA); add pre-commit hook doc. The `mcp__github__run_secret_scanning` capability exists in the agent environment but was not used. Effort S. P2. Needs owner to flip settings.

### C5. Release signing: tag signature, cosign/sigstore, attestations
- Present: signed tag (presence only), GitHub build-provenance attestation, SHA256SUMS. Facts: artifact attestations use Sigstore; public repos use Sigstore Public Good Instance with a transparency log; attestations are not a guarantee the artifact is secure, they bind artifact to source and build [P: GitHub docs `artifact-attestations.md`]. `cosign verify-blob` preferred form: `--bundle artifact.sigstore.json --certificate-identity <id> --certificate-oidc-issuer <issuer>`, or `--key awskms://...`/`gcpkms://...` [P: cosign verify-blob doc].
- Changes: (1) In `release.yml` build job add `cosign sign-blob --bundle SHA256SUMS.sigstore.json SHA256SUMS` keyless (OIDC identity = the workflow ref on tag); publish the bundle as a release asset; `verify-release.sh` runs `cosign verify-blob` with `--certificate-identity-regexp '^https://github.com/<owner>/<repo>/\.github/workflows/release\.yml@refs/tags/v'` and issuer `https://token.actions.githubusercontent.com`. This adds an offline-verifiable bundle (no `gh` dependency, transparency-log inclusion). Effort S-M. (2) Keep a maintainer-held key signature as the human root: sign `SHA256SUMS` with a hardware-backed key (SSH-sk/GPG on YubiKey, or cosign `--key` with KMS) and publish the fingerprint out of band (ADR-0015 already requires). Two independent signatures: builder identity (sigstore) and human (hardware key). (3) In CI actually verify the tag signature: import allowed-signers file stored in repo at a CODEOWNERS-protected path and run `git verify-tag` (current step only greps for a signature block). Effort S. Caveat: trust root for the allowed-signers file is the repo itself; the out-of-band fingerprint is the real anchor.
- Residual: all CI-based signing trusts GitHub and the workflow; reproducible rebuild (H4) is the independent check. P2 for (1)(3); P1 for (2) (needs the owner's key, blocks hosting step 3). Needs owner: key custody, YubiKey purchase.

### C6. SBOM
- Present: CycloneDX from `npm sbom --omit dev` (normalised). Gaps: SBOM covers npm only, not Foundry deps (`packages/contracts/lib` git submodules), solc version, Docker base image for the relayer.
- Change: add a second SBOM or a `release-manifest.json` section listing submodule commits, solc and forge versions, relayer base-image digest; attach SBOM attestation (`actions/attest-sbom`) [K, unverified name/version]. Run `grype`/`osv-scanner` on the SBOM nightly for new advisories (OSV is a primary DB, [K], unreachable). Effort S. P3.

### C7. Relayer container
- `apps/relayer/Dockerfile`: pin base image by digest, build with `--provenance`/cosign-sign the image and verify the signature at deploy (`cosign verify` with the identity regexp above), run read-only rootfs, drop all caps. Effort S-M. P2 once a relayer is operated.

## 5. Monitoring, alerting, incident response

### M1. Relayer telemetry
- Finish `/metrics` + alert webhook already planned (runbook s7). Concrete alerts: breaker not closed > 5 min; balance < 2x `minBalanceWei`; daily budget > 80% before 18:00 UTC; `sweep_reverted` rate; `rate_limited_*` surge; process restart count (state is in memory); sudden hot-key outflow not matching relayer txs (see M3). Use any Alertmanager/Grafana Cloud/Healthchecks.io-style dead-man's switch so silence pages. Effort M. P2.

### M2. External synthetic monitor for the frontend (tamper detection)
- Off-host job (GitHub Actions cron in a different account, or a small VPS) every 5 min: fetch `/`, parse script URLs, hash every served file, compare to the released `SHA256SUMS`; also assert `_headers` effective (curl -sI vs file), `deployments/*.json` match the signed manifest, and DNS/ENS records unchanged. Alert to a channel not on the same provider. Directly mitigates H5. Effort M. P1 at hosting time. Needs owner: alert destination.

### M3. Chain watch
- Per `modules-needed.md` rank 6 (`specs/ops-monitor.md`, absent): watch (a) token blacklist/pause events for `FEE_RECIPIENT` and relayer address (USDC `Blacklisted`, USDT `AddedBlackList` [K, unverified event names]), (b) hot-key transactions not initiated by the relayer (compare nonce counter to expected), (c) router/sweep contract bytecode hash (`eth_getCode`) vs manifest, (d) fee recipient balance anomaly. Run as cron script using the same RPC quorum code (R3). Effort M. P2.

### M4. Incident response plan
- `docs/remote/security-specs/incident-response.md` exists as a draft with owner `[OWNER]`. Concrete additions: (1) named on-call/escalation and a second contact; (2) pre-written user notices (website banner, repo README banner, `SECURITY.md` advisory) for four scenarios: compromised host, malicious release, relayer key loss, contract defect; (3) a "kill switch" that does exist off-chain: the web app should fetch a small signed `status.json` (signature verified in-app with a pinned public key) that can disable payment/sweep UI and show a banner; this is a new feature in `apps/web` and creates its own risk (a key that can censor); keep it fail-open for sweep of own funds. Effort M. Owner decision. (4) Tabletop exercise before mainnet (S). (5) Credential rotation checklist per system (GitHub PAT/SSH, Cloudflare tokens, RPC keys, npm if any, KMS grants): the tj-actions guidance is rotate anything exposed, not just update [S]. P2.
- Retain minimal logs (runbook s10); IR needs an evidence plan that fits that: define what to snapshot (proxy logs, CloudTrail, GitHub audit log, Cloudflare audit log) at incident start.

## 6. Disclosure and bug bounty

- Facts: `SECURITY.md` points to GitHub private vulnerability reporting, unconfirmed; ack timeline placeholder; no safe harbour. `security.txt` format exists as a standard (RFC 9116) [K; rfc-editor/datatracker unreachable; the `securitytxt` repo README was fetched [P: github.com/securitytxt/security-txt] and documents the file and `/.well-known/security.txt` location].
- Changes: (1) Enable private vulnerability reporting (settings) and test with a dummy report. (2) Publish `apps/web/public/.well-known/security.txt` (Contact, Expires, Policy, Preferred-Languages, optional Encryption) once a domain exists; add a build check for `Expires` not in the past. Effort S. (3) Safe-harbour language and response SLAs (ack 3 business days, triage 7, fix target by severity). (4) Bounty: do not launch a funded bounty pre-audit and pre-deployment; scope would pay for known findings (audits 02/03 open). Sequence: independent audit, fix, deploy testnet, then a bounty on an established platform (Immunefi, Code4rena-style contests, Cantina; platform terms and fees unverified here, sites unreachable) with funding at least into the range of the largest realistic loss per vuln class, scoped to: contracts on mainnet, `apps/web` served from the official domain, relayer. Out of scope: user devices, social engineering, third-party RPC. Rewards sized in stable assets, escrowed up front (a bounty that cannot pay is worse than none). Effort M plus recurring cost. P3 (pre-mainnet), needs owner funding and legal review.

## 7. Disaster recovery

Because contracts are immutable and the app is static and the relayer is stateless, DR is mostly "re-establish trusted pointers" and "rotate keys".

| Scenario | Recovery | Gap / action |
|---|---|---|
| Relayer host lost | Redeploy container from signed image; new hot key; fund; update `/v1/info` consumers | Write a one-page rebuild checklist; keep config + manifests in a private encrypted backup; rotation of hot key proven annually. S. |
| Hot key / KMS access compromised | Revoke IAM, sweep float, new key | Pre-created standby key and funded standby address (R1). S. |
| Frontend host takeover | Re-deploy verified tarball from different account; DNS cut-over; user notice (M4) | Keep a second host (GitHub Pages mirror as degraded) and a pre-written runbook; low DNS TTL (300s) on the app hostname; registrar lock + 2-person control. S. |
| Release signing key lost/compromised | Publish revocation via independent channels; new key; re-sign latest release; users re-pin fingerprint | Need 2 maintainer keys from the start, with a documented rotation statement; keep revocation certificate offline. S. Owner. |
| Repository takeover/deletion | Immutable releases prevent tag reuse after resurrection [P: immutable-releases doc]; keep mirrored clone in a second forge and offline bundle (`git bundle`) per release with SHA | S. |
| Fee recipient blacklisted | New router deployment (no admin) + new manifest + app release | Already in deployment runbook; rehearse on testnet. M. |
| Bad manifest published | Signed manifest with `revokedAt`/sequence number checked by app (depends on S3-01 work); status.json (M4) | Depends on manifest authentication work. |
| Cloud account lost | Terraform/IaC or documented manual steps for Pages project, DNS, KMS | Keep infra definition in repo (`ops/`); S-M. |

Backups contain no user secrets by design (relayer persists nothing; keys are client-side). Back up: relayer config + manifests, signing public keys, DNS zone export, SECURITY contact list, runbooks, infra definitions. Test restore twice a year.

## 8. Ranked roadmap

Priority: P1 = before any public hosting or testnet relayer exposure; P2 = before mainnet; P3 = hardening; P4 = defer. Effort S <= 1 day, M = 1-5 days, L > 1 week.

| # | Item | Threat addressed | Effort | Priority | Owner decision / cost / service? |
|---|---|---|---|---|---|
| 1 | C1 rulesets (main, `v*` tags), CODEOWNERS, immutable releases | Malicious/accidental push, tag rewrite, release tamper | S | P1 | Owner: settings, maintainers (free) |
| 2 | C2a/e zizmor in CI, remove caches from release workflows | Workflow injection, cache poisoning | S | P1 | No |
| 3 | C3a/c Dependabot cooldown, lockfile host/integrity check | New-malicious-version intake, lockfile tampering | S | P1 | No |
| 4 | C5(2) hardware-key human signature and out-of-band fingerprint; C5(3) real `git verify-tag` in CI | Release impersonation | S-M | P1 | Owner: key, YubiKeys (about 2 devices), fingerprint channel |
| 5 | H5 host account security (hardware MFA, scoped tokens, deploy only from `release` env) | Host takeover (Bybit/Safe class) | M | P1 (at hosting) | Owner: Cloudflare account, domain; low cost |
| 6 | M2 external synthetic tamper monitor | Undetected frontend swap | M | P1 (at hosting) | Owner: alert channel; small cost |
| 7 | R2 required cold `feeTo` on mainnet chains | Fee theft via hot-key theft | S | P1 | Owner: fee-recipient address (already open) |
| 8 | C4 secret scanning + push protection, gitleaks history scan | Leaked credentials | S | P2 | Owner: settings |
| 9 | C5(1) cosign keyless `SHA256SUMS` bundle + verify script | Offline verification, transparency | S-M | P2 | No cost; public Sigstore |
| 10 | H2 Trusted Types, HSTS; H3(1) embed SDK versioned and SRI-published | XSS sinks, embed swap | S | P2 | HSTS needs domain |
| 11 | H4 second independent rebuild as release gate; digest-pinned builder | Compromised runner | S-M | P2 | No |
| 12 | M1 relayer metrics/alerts, dead-man switch | Silent relayer failure, drain | M | P2 | Service: monitoring provider |
| 13 | R4 wire relayer-guard + edge rate limit | Floods, griefing | S | P2 | Edge service optional |
| 14 | R1 KMS-backed signer behind `Signer` interface | Key exfiltration | M | P2 | Owner: cloud vendor, per-request cost |
| 15 | C7 signed, digest-pinned relayer image, hardened runtime | Image/supply-chain at deploy | S-M | P2 | No |
| 16 | M3 chain watch (blacklist, hot-key anomaly, bytecode) | Fee-recipient freeze, key misuse | M | P2 | RPC cost |
| 17 | M4 IR plan completion, notices, tabletop; signed `status.json` kill-switch (decide) | Slow response | M | P2 | Owner: contacts, kill-switch trust decision |
| 18 | DR checklist and drills (section 7) | Prolonged outage | S-M | P2 | Owner: second maintainer |
| 19 | Disclosure: enable PVR, `security.txt`, safe harbour | Unreported vulns | S | P2 | Owner: contact, legal wording |
| 20 | C2b harden-runner, C2c Scorecard, C2d CodeQL, C3f `npm audit signatures`, C6 extended SBOM | Residual CI/dep risk | S-M | P3 | Third-party action trust |
| 21 | R3 RPC agreement quorum | Lying RPC | M | P3 | Second provider cost |
| 22 | R5 systemd credentials, quote-secret overlap; R6 egress allowlist | Secret leak, exfiltration | S-M | P3 | No |
| 23 | Funded bug bounty | Late-found vulns | M + funding | P3 (after audit and deployment) | Owner: budget, platform, legal |
| 24 | MPC/threshold signer; npm trusted publishing | Over-engineering now | L | P4 | Defer |

## 9. Sources (retrieved 2026-10-21)

[P] fetched via raw.githubusercontent.com:
- GitHub Actions secure use: https://raw.githubusercontent.com/github/docs/main/content/actions/reference/security/secure-use.md
- GitHub artifact attestations: https://raw.githubusercontent.com/github/docs/main/content/actions/concepts/security/artifact-attestations.md
- GitHub immutable releases: https://raw.githubusercontent.com/github/docs/main/content/code-security/concepts/supply-chain-security/immutable-releases.md
- GitHub ruleset rules: https://raw.githubusercontent.com/github/docs/main/content/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets.md
- GitHub OIDC in cloud providers: https://raw.githubusercontent.com/github/docs/main/content/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-cloud-providers.md
- Dependabot options reference (cooldown): https://raw.githubusercontent.com/github/docs/main/content/code-security/reference/supply-chain-security/dependabot-options-reference.md
- Cloudflare Pages headers: https://raw.githubusercontent.com/cloudflare/cloudflare-docs/production/src/content/docs/pages/configuration/headers.mdx
- Cosign verify-blob: https://raw.githubusercontent.com/sigstore/cosign/main/doc/cosign_verify-blob.md
- OpenSSF Scorecard checks: https://raw.githubusercontent.com/ossf/scorecard/main/docs/checks.md
- zizmor audits: https://raw.githubusercontent.com/zizmorcore/zizmor/main/docs/audits.md
- StepSecurity harden-runner README: https://raw.githubusercontent.com/step-security/harden-runner/main/README.md
- security.txt project README: https://raw.githubusercontent.com/securitytxt/security-txt/master/README.md

[S] web-search summaries only, primaries unreachable (unverified):
- Bybit/Safe{Wallet}: BleepingComputer, Elastic Security Labs "Bit ByBit", BlockSec, SlowMist articles (titles as returned by search).
- tj-actions/changed-files CVE-2025-30066: Wiz, Orca, Aqua, CISA via The Hacker News.
- Shai-Hulud npm worm: Black Duck, CSA research note, others; the 2025-12-09 classic-token revocation is a single-source claim.
- Ledger Connect Kit (2023-12-14): Revoke.cash retrospective, SlowMist, Security Affairs; npm-vs-CDN root cause disputed.
- AWS KMS `ECC_SECG_P256K1`: AWS CDK KeySpec reference pages; AWS KMS developer guide unreachable; Ethereum-specific low-S/recovery-id behaviour unconfirmed.

[K] author knowledge, unverified: Google Cloud KMS secp256k1, Trusted Types, HSTS, npm config options, `npm audit signatures`, `actions/attest-sbom`, dependency-review action, systemd credentials, USDC/USDT blacklist event names, Immunefi/Cantina terms, RFC 9116 details.

Unreachable hosts: docs.github.com, docs.npmjs.com, docs.sigstore.dev, developers.cloudflare.com, docs.aws.amazon.com, docs.cloud.google.com, slsa.dev, openssf.org, cyclonedx.org, spec.openssf.org, rfc-editor.org, datatracker.ietf.org, web.dev.
