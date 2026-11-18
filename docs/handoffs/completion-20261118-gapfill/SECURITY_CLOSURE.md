# Security closure — completion run 2026-11-18 (gap-fill coordinator)

AI-assisted engineering review, not a professional security audit. Source rows: SEC-01..49 from the
post-consolidation audit package (PR #205, `nodata/zealous-hopper-lr0nxe` @ `15ad0219`, recorded at `7a620ff1`),
consolidation review rows R-*/FR-* (`docs/handoffs/consolidation-20261118/REVIEW_FINDINGS.md`), and scanners.

Ownership. PR #209 (`claude/ghostpay-completion-audit-ot5jjm`) claimed first and owns the rows marked `#209 <lane>`;
its own `docs/handoffs/completion-20261118/SECURITY_CLOSURE.md` is authoritative for them, and this file does not
restate their state. This run owns the rows marked `gap-fill G<n>`. A row is **Fixed** only with a RED-first
regression test, the fix commit and passing affected suites at the integration head; a green scanner job is never
closure. Severities are copied unchanged.

States at the current integration head:
- Access-blocked: 7
- False positive / intended: 2
- In progress: 11
- No note (clean run): 2
- Owner-gated: 16
- owned by #206: 2
- owned by #209: 26

"No note (clean run)" is not a closure state: it records a scanner run that produced nothing to close.


| ID | Sev | Title (abridged) | Owner | State | Evidence / owner action |
|---|---|---|---|---|---|
| SEC-01 | High | Shared djshellshoxxx.github.io origin: 35 sibling Pages sites can read/rewrite all GhostPay storage and script | owner (OD-06, OA-06) | **Owner-gated** | Fail-closed default shipped before this run: manifests/payments refused on the shared origin unless GHOSTPAY_PAGES_ALLOW_SHARED_ORIGIN=testnet (scripts/pages/build-pages.sh:60-69,93-101@7a620ff1). Owner: choose a dedicated origin (OD-06). |
| SEC-02 | High | Deploy trust boundary not demonstrated: main reportedly unprotected; Pages artifact unsigned/unattested and no | owner (OA-01, OD-07) | **Owner-gated** | Owner: rulesets on main, github-pages env reviewers, attestation policy. Not changeable from a session. |
| SEC-03 | Medium | Vault-less seller sessions have no re-authentication for sweeping or for master-key keystore export; idle lock | #209 C2 (default) / owner OD-01 | **Owner-gated** | Vault-less export refusal default is #209 lane C2 (apps/web/src/lib/keyVault.ts). Re-auth model = OD-01. |
| SEC-04 | Medium | No GhostPay-independent recovery path is shipped: spec 18 formats (K01-K06) are unimplemented and the CLI can  | #209 C1 | **owned by #209** | Spec 18 K01-K06 + offline recovery reference = #209 lane C1. |
| SEC-05 | Medium | Master-key keystore/vault passphrase policy accepts name+year style passphrases (score>=2 heuristic, 14 chars) | #209 C1 (new exports) / owner OD-09 | **Owner-gated** | Stricter floor for new spec 18 exports = #209 C1 (OD-09 default). Master keystore floor change = OD-09 owner decision. |
| SEC-06 | Medium | AUD24-01 re-verified: GhostPayPolicyRouter takes PolicyRef{owner, policyHash}, so every scheme-2 payment expos | owner (OD-05) | **Owner-gated** | ABI change decision. Default: scheme 2 undeployed. No contract change in this run. |
| SEC-07 | Medium | N1 re-verified: failing fee-token views or an unexpected fee delta revert every fee-charging deploy of the imm | owner (OD-04) | **Owner-gated** | Factory fee-token policy decision. Default: scheme 2 undeployed. |
| SEC-08 | Medium | Stale prototype (gh-pages cc8d0794, 2026-10-21) probably live on /GhostPay/: runtime unsigned manifest loading | owner (OA-05) | **Owner-gated** | Settings > Pages > Source = GitHub Actions; retire gh-pages cc8d0794 (never deleted by a session). |
| SEC-09 | Medium | Shared-origin gate trusts the declared GHOSTPAY_PAGES_ORIGIN (*.github.io suffix only); deployed page_url orig | #209 B1 | **owned by #209** | TB-03. |
| SEC-10 | Medium | 'Local proxy' scan transport is unusable: Settings accepts http loopback endpoints but CSP connect-src blocks  | #209 B2 | **owned by #209** | TB-02. |
| SEC-11 | Low | Scheme-2 payers cannot tell which assets the seller policy can withdraw: meta-address carries only policyHash, | gap-fill G1 | **In progress** |  |
| SEC-12 | Low | Factory MIN_DELAY = 1 h is below L2 censorship/forced-inclusion bounds; a colluding or stalled sequencer can d | gap-fill G1 / owner OD-11 | **In progress** |  |
| SEC-13 | Low | BTC/Solana/TRON views reveal raw master seeds/keys and allow (warned, two-click) clipboard copy without re-aut | gap-fill G2 / owner OD-01 | **In progress** |  |
| SEC-14 | Low | Legacy text-manifest scheme (sha256/ed25519, domain GhostPay-deployment-manifest-v1) with runtime fetch and un | #209 B1 | **owned by #209** |  |
| SEC-15 | Low | Keystore v1 format documentation drifts from code (bounds, passphrase rule, writer location), weakening spec 1 | #209 B3 | **owned by #209** |  |
| SEC-16 | Low | pool-sdk seed backup is weaker than the keystore policy: passphrase >=8 chars, no estimator, no NFKC, scrypt N | #209 B3 | **owned by #209** |  |
| SEC-17 | Low | Analyzer scope gaps: Slither CI excludes Low/Informational (doc claims "no detector exclusions"); payer-hiding | #209 B4 | **owned by #209** |  |
| SEC-18 | Low | No anti-framing protection on GitHub Pages: frame-ancestors only in _headers (ignored by Pages; meta CSP canno | #209 B1 | **owned by #209** |  |
| SEC-19 | Low | wss:// RPC URLs are accepted and allowed by CSP but no transport supports them (always fail closed) | #209 B2 | **owned by #209** |  |
| SEC-20 | Low | Default chain-adapters fetchTransport omits credentials:'omit', cache:'no-store', referrerPolicy:'no-referrer' | #209 B2 | **owned by #209** |  |
| SEC-21 | Low | Invoice bearer fragment persists in browser history/session/UKM DBs after address-bar clearing; docs omit hist | #209 B3 | **owned by #209** |  |
| SEC-22 | Low | Plaintext linkable identifiers: checkpoint slots keyed by sha256(spend\|view pub), vault meta-address/signer, r | gap-fill G3 (scan cursor slots) | **In progress** |  |
| SEC-23 | Low | No in-app 'erase all GhostPay data'; clearing site data on github.io wipes all 36 sites | #209 B2 | **owned by #209** |  |
| SEC-24 | Low | scan-bundle checks inline scripts/CSP only in index.html; lean exclusion lists differ between guard and Pages  | #209 B1 | **owned by #209** |  |
| SEC-25 | Low | npm audit: 30 dev-tree advisories (14 high picomatch<=4.0.7 ReDoS via vite/vitest/typescript-eslint/hardhat; 1 | #209 B4 | **owned by #209** | npm audit --omit=dev at 5467c158: 0 vulnerabilities (this run). Dev-tree advisories = #209 B4. |
| SEC-26 | Low | Self-host images pinned by tag only; dependabot lacks docker ecosystem; nginx sends no HSTS (relies on termina | #209 B4 | **owned by #209** |  |
| SEC-27 | Low | PRIVACY_THREAT_MODEL says net-transport/scan-source are not imported by apps/web; they ship in the lean bundle | #209 B3 | **owned by #209** |  |
| SEC-28 | Low | Overclaims/imprecise copy: unqualified 'hides which seller owns the one-time address', 'stay unlinkable', fals | gap-fill G1 (policy-scheme.md) / #209 (locales, README, pages docs: TB-10, B2) | **In progress** |  |
| SEC-29 | Low | ContextHelp hover-leave still collapses an open explanation, shifting layout (residual of R-02/FR-M1) | gap-fill G4 | **In progress** |  |
| SEC-30 | Low | #201 focus scope also focuses main after in-view paste/QR/Forget/cancel; comment names only deep links | gap-fill G4 | **In progress** |  |
| SEC-31 | Info | Policy-account owner-key compromise yields an indefinite freeze race (thief can cancel every withdrawal and ke | owner (OD-12) | **Owner-gated** | Default: no guardian recovery code paths (ADR-0028 unaccepted). |
| SEC-32 | Info | Release trust roots are empty: RELEASE_KEY undefined, RELEASE_PUBLIC_KEYS [], allowed_signers has 0 keys; paym | owner (OA-03, OD-07) | **Owner-gated** | Empty trust roots keep payments and releases disabled (fail-closed default already shipped). |
| SEC-33 | Info | Mythril gate is red by design (11 dispositioned records; R8 timeout-dependent); no finding-specific suppressio | owner (OD-03) | **Owner-gated** | Mythril gate red by design until a keyed disposition mechanism is approved. |
| SEC-34 | Info | Relayer cannot steal or redirect (EIP-712 binds token/owner/destination/feeTo/amount/fee/deadline/nonce + chai | audit (positive verification) | **False positive / intended** | Info row recording a verified safety property (EIP-712 binds token/owner/destination/feeTo/amount/fee/deadline). Not a defect; second confirmation pending in #209 lane E (e-keys-signing). |
| SEC-35 | Info | EIP-7702 payer delegation persists after use (public fingerprint, exposure to future delegate bugs); 4337 paym | owner (OD-13) | **Owner-gated** | Default: AA/7702 paths stay experimental, no default delegate authority. |
| SEC-36 | Info | Native payments forward the fee to immutable FEE_RECIPIENT with all gas; a non-accepting recipient blocks ever | owner (OD-14) | **Owner-gated** | Deployment checklist must record an accepting FEE_RECIPIENT; no deployment in this run. |
| SEC-37 | Info | Zeroization is best-effort: secrets transit immutable JS strings (keystore plaintext JSON hex, typed key hex a | #209 C1 (spec 18 bytes) / docs residual routed to #209 B3 | **owned by #209** | Residual documentation belongs in docs/threat-model/** (#209 B3 path); routed by message. |
| SEC-38 | Info | Scheme-1 derivation verified independently (6/6 vectors with elliptic+js-sha3); hash convention keccak256(comp | audit (positive verification) | **False positive / intended** | Info row: scheme-1 derivation independently verified 6/6 vectors. Not a defect. |
| SEC-39 | Info | Promotion packet says commits after d91ae16a are docs-only, but 7a620ff1 also edits apps/web/src/views/SellerK | #209 B3 (TB-10) | **owned by #209** | TB-10 includes the promotion packet docs-only claim. |
| SEC-40 | Info | Pages banner link navigates the same tab; no beforeunload guard while unsaved keys are loaded | #209 B1 | **owned by #209** |  |
| SEC-41 | Info | No WASM/WebGL/SAB/SW needed; Safest mode unusable (JS off); JIT-less scrypt ~28 s; canvas QR likely blocked; T | owner (manual Tor Browser QA) / KDF progress text routed to #209 C2 | **Owner-gated** | Manual TB Standard/Safer QA needs a human; KDF progress copy lives in SellerKeys (#209 C2 path), routed. |
| SEC-42 | Info | createRoot without onCaughtError/onUncaughtError: React logs caught render errors (may contain input snippets) | #209 B1 | **owned by #209** |  |
| SEC-43 | Info | No SRI; embed SDK SRI tooling unwired (full only); Pages SHA256SUMS only in run summary/14-day artifact, unsig | #209 B1 (pages.yml) / owner | **owned by #209** | Attestation + signed checksums touch .github/workflows/pages.yml (#209 B1 path); routed. |
| SEC-44 | Info | No denylist for the public Playwright manifest-signing key in GHOSTPAY_RELEASE_PUBKEYS parsing | #209 B1 | **owned by #209** |  |
| SEC-45 | Info | RPC can fingerprint GhostPay users: Origin header, UA, Accept-Language, sequential JSON-RPC ids, 60 s eth_chai | #209 B2 | **owned by #209** |  |
| SEC-46 | Info | Post-deploy smoke only idles on the home view for 3 s | #209 B1 | **owned by #209** |  |
| SEC-47 | Info | release.yml contract-analysis gate (R-06) resolved in source but unexercised on a real tag | owner (OA-03) | **Owner-gated** | Exercising release.yml end to end needs a signed tag from an owner key. |
| SEC-48 | Info | CodeQL, Dependabot and secret-scanning alert inventories not obtainable (403/proxy); passing scanner jobs are  | owner (OA-07) | **Access-blocked** | See CodeQL / Dependabot / secret-scanning rows below. |
| SEC-49 | Info | PR #204 (agent tooling) conflicts with #203 in ci.yml and CLAUDE.md | PR #206 session | **owned by #206** | #204 re-applied on consolidated main by claude/ghostpay-consolidation-9xhtxg. |

## Other sources

| Source | Owner | State | Evidence / owner action |
|---|---|---|---|
| CodeQL open alerts | owner (OA-07) | **Access-blocked** | This session has no code-scanning API tool (GitHub MCP exposes none; session policy limits gh to search). Prior sessions: API 403 (R-16). Owner: export open alerts or grant access. |
| Dependabot alerts | owner (OA-07) | **Access-blocked** | Same as CodeQL. Open Dependabot PRs #207 (actions) and #210 (npm minor/patch) are automated writers, read-only here; owner merges. |
| GitHub secret scanning | owner (OA-07) | **Access-blocked** | Alert API not reachable. Repo scanner `npm run ci:scan-secrets` at 5467c158: OK (no committed env files or key material). |
| npm audit --omit=dev | gap-fill coordinator | **No note (clean run)** | 0 vulnerabilities at 5467c158 (`npm audit --omit=dev --json`, 2026-11-18). Full dev-tree audit = SEC-25 (#209 B4). |
| ci:check-actions, ci:check-tx-origin | gap-fill coordinator | **No note (clean run)** | both OK at 5467c158 (111 uses: pinned to SHAs; no tx.origin in 39 .sol files). |
| Slither / Mythril / Echidna | #209 B4 (SEC-17), owner (OD-03, SEC-33) | **owned by #209** | Echidna success and Mythril failure-by-design recorded in SEC-33. |
| SonarCloud | owner | **Access-blocked** | `curl https://sonarcloud.io/api/issues/search?...` -> `curl: (56) CONNECT tunnel failed, response 403` (environment network policy). Owner: add sonarcloud.io to the cloud environment's allowed domains, or export the open issue list for 'Security Rating on New Code'. |
| Snyk | owner | **Access-blocked** | No Snyk configuration or token in the repository or session; owner must provide results if Snyk is in use. |
| R-03 / FR-M1 residual | gap-fill G4 | **In progress** | = SEC-29. |
| R-04 | gap-fill G4 | **In progress** | = SEC-30. |
| R-07 | owner (OA-01) | **Owner-gated** | = SEC-02. |
| R-09 | gap-fill G1 / owner OD-11 | **In progress** | = SEC-12. |
| R-11 | owner (OD-04) | **Owner-gated** | = SEC-07. |
| R-15 | #209 C1 (OD-10) | **owned by #209** |  |
| R-16 | owner (OA-07) | **Access-blocked** | = SEC-48. |
| R-17 | PR #206 session | **owned by #206** | = SEC-49. |
| TB-08 (CLI vs web Solana/TRON meta-address formats) | gap-fill G5 | **In progress** |  |
