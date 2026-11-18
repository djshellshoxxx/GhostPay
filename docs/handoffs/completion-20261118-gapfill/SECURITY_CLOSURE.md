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
- False positive / intended: 4
- Fixed: 12
- No note (clean run): 2
- Open (partly fixed): 1
- Owner-gated: 20
- owned by #206: 2
- owned by #209: 29

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
| SEC-11 | Low | Scheme-2 payers cannot tell which assets the seller policy can withdraw: meta-address carries only policyHash, | gap-fill G1 | **Fixed** | RED-first: policy-scheme client.test.ts 'policy token coverage (SEC-11)' (4 RED 'policyCoversToken is not a function'; hand-built-tree case RED 'expected true to be false'), web policy tests (6 RED). Commits 46ab81d2, 00f9134b, 1f5c2d73. Seller record lists withdrawable assets; payer with the record refused at review and in the send guard before any wallet request; without the record, a permanent-lock warning. @62d2ff29: policy-scheme 93 passed/7 skipped (anvil), web src/features/policy + src/i18n 326 passed/4 skipped, tsc 0, eslint 0. Independent review: nothing blocking. |
| SEC-12 | Low | Factory MIN_DELAY = 1 h is below L2 censorship/forced-inclusion bounds; a colluding or stalled sequencer can d | owner (OD-11); default by gap-fill G1 | **Owner-gated** | Default kept: factory MIN_DELAY (1 h) stays the floor; UI hint + doc pitfall (b542c839, 0f0063ed; RED 1 test). No per-chain numbers: docs.optimism.io and docs.arbitrum.io did not resolve from this session (network policy), so none could be verified. Owner: choose per-chain floors from the OP Stack / Arbitrum forced-inclusion bounds (OD-11). |
| SEC-13 | Low | BTC/Solana/TRON views reveal raw master seeds/keys and allow (warned, two-click) clipboard copy without re-aut | gap-fill G2 (OD-02 default) / owner OD-01 (re-auth) | **Owner-gated** | OD-02 fail-closed default shipped and tested: no clipboard path for BTC/SOL/TRON seeds or keys (ea62d473, 95f632b9, 8dd4f482 and the G2 doc fix, merged 44714f41). RED 5 tests (copy control present). Tests assert navigator.clipboard.writeText is never called across reveal/hide/timer/tab-hide/lock/unmount. @44714f41: 39 files / 395 tests passed, i18n 0 errors, tsc 0, eslint 0. Independent review: nothing blocking. Re-auth before reveal = OD-01. TRON plaintext hex is shown only on explicit reveal (no download/clipboard). |
| SEC-14 | Low | Legacy text-manifest scheme (sha256/ed25519, domain GhostPay-deployment-manifest-v1) with runtime fetch and un | #209 B1 | **owned by #209** |  |
| SEC-15 | Low | Keystore v1 format documentation drifts from code (bounds, passphrase rule, writer location), weakening spec 1 | #209 B3 | **owned by #209** |  |
| SEC-16 | Low | pool-sdk seed backup is weaker than the keystore policy: passphrase >=8 chars, no estimator, no NFKC, scrypt N | #209 B3 | **owned by #209** |  |
| SEC-17 | Low | Analyzer scope gaps: Slither CI excludes Low/Informational (doc claims "no detector exclusions"); payer-hiding | #209 B4 | **owned by #209** |  |
| SEC-18 | Low | No anti-framing protection on GitHub Pages: frame-ancestors only in _headers (ignored by Pages; meta CSP canno | #209 B1 | **owned by #209** |  |
| SEC-19 | Low | wss:// RPC URLs are accepted and allowed by CSP but no transport supports them (always fail closed) | #209 B2 | **owned by #209** |  |
| SEC-20 | Low | Default chain-adapters fetchTransport omits credentials:'omit', cache:'no-store', referrerPolicy:'no-referrer' | #209 B2 | **owned by #209** |  |
| SEC-21 | Low | Invoice bearer fragment persists in browser history/session/UKM DBs after address-bar clearing; docs omit hist | #209 B3 | **owned by #209** |  |
| SEC-22 | Low | Plaintext linkable identifiers: checkpoint slots keyed by sha256(spend\|view pub), vault meta-address/signer, r | gap-fill G3/G3b (scan cursor slots); rest open | **Open (partly fixed)** | Fixed part: scan-cursor slot names = HKDF-SHA256(viewing key, 'GhostPay/scan-checkpoint/v3/slot\|chain\|keyId'); legacy v2 never read, deleted after a v3 save (5ba26cec; RED 3 tests; @b290426e web scan 232 passed). Hardening G3b merged 6ff3dd85: every legacy v1/v2 cursor slot swept on store creation (RED 2 tests), slot name cached per key set so the viewing key is lent once (RED 'called 1 times, but got 21'), wipe on throw tested; web scan 238 passed. Still open, unclaimed by #209 or this run (engineering-closable): ux-vault keystore-portable.ts:16,85 vault meta.metaAddress/signer plaintext; reconciliation-portable.ts:407-432 storage key + plaintext sellerKeyId; apps/web/src/lib/tags.ts:8-20 plaintext chainId/createdAt/updatedAt; sweepAttemptJournal.ts:5-14 and duplicateAttemptJournal.ts:4-23 one-time owner/account in sessionStorage. Recorded also by #209. |
| SEC-23 | Low | No in-app 'erase all GhostPay data'; clearing site data on github.io wipes all 36 sites | #209 B2 | **owned by #209** |  |
| SEC-24 | Low | scan-bundle checks inline scripts/CSP only in index.html; lean exclusion lists differ between guard and Pages  | #209 B1 | **owned by #209** |  |
| SEC-25 | Low | npm audit: 30 dev-tree advisories (14 high picomatch<=4.0.7 ReDoS via vite/vitest/typescript-eslint/hardhat; 1 | #209 B4 | **owned by #209** | npm audit --omit=dev at 5467c158: 0 vulnerabilities (this run). Dev-tree advisories = #209 B4. |
| SEC-26 | Low | Self-host images pinned by tag only; dependabot lacks docker ecosystem; nginx sends no HSTS (relies on termina | #209 B4 | **owned by #209** |  |
| SEC-27 | Low | PRIVACY_THREAT_MODEL says net-transport/scan-source are not imported by apps/web; they ship in the lean bundle | #209 B3 | **owned by #209** |  |
| SEC-28 | Low | Overclaims/imprecise copy: unqualified 'hides which seller owns the one-time address', 'stay unlinkable', fals | gap-fill G1 (policy-scheme.md) / #209 B2+B3 (rest) | **owned by #209** | This run's part Fixed: docs/developer/api/policy-scheme.md unlinkability claim qualified (0f0063ed) and the stale salt-only router ABI text corrected (a08f47bb, 1f5c2d73: selector 0x0730d511 from ghostPayPolicyRouterAbi). Locales, README and pages docs are #209 B2/B3. |
| SEC-29 | Low | ContextHelp hover-leave still collapses an open explanation, shifting layout (residual of R-02/FR-M1) | owner (UX-01 decision, new) | **Owner-gated** | No lost click reproduced (prior 26/26; this run contextual-help.spec.ts + focus-scope.spec.ts 7/7 in full and lean @407868a1). An overlay fix (lane commit 7e7e50df) was REJECTED in review and not integrated: it broke contextual-help.spec.ts:108 and its overlay intercepted clicks on the control below. Shipped behaviour = current (R-02 fix keeps the click landing). Owner: choose hover preview vs click/focus-only help (UX-01 in HANDOFF). |
| SEC-30 | Low | #201 focus scope also focuses main after in-view paste/QR/Forget/cancel; comment names only deep links | gap-fill G4 | **False positive / intended** | Intended per R-04; now pinned by apps/web/e2e/focus-scope.spec.ts (407868a1, cherry-picked from 58d4eba1): rejected paste keeps Read focused; valid Read shows Review payment and focuses main#main. Passes desktop project in full and lean. Second reviewer (G4 review) agreed the behaviour is pinned and the test fails if the effect's dependencies regress. |
| SEC-31 | Info | Policy-account owner-key compromise yields an indefinite freeze race (thief can cancel every withdrawal and ke | owner (OD-12) | **Owner-gated** | Default: no guardian recovery code paths (ADR-0028 unaccepted). |
| SEC-32 | Info | Release trust roots are empty: RELEASE_KEY undefined, RELEASE_PUBLIC_KEYS [], allowed_signers has 0 keys; paym | owner (OA-03, OD-07) | **Owner-gated** | Empty trust roots keep payments and releases disabled (fail-closed default already shipped). |
| SEC-33 | Info | Mythril gate is red by design (11 dispositioned records; R8 timeout-dependent); no finding-specific suppressio | owner (OD-03) | **Owner-gated** | Mythril gate red by design until a keyed disposition mechanism is approved. |
| SEC-34 | Info | Relayer cannot steal or redirect (EIP-712 binds token/owner/destination/feeTo/amount/fee/deadline/nonce + chai | audit (positive verification) | **False positive / intended** | Info row recording a verified safety property (EIP-712 binds token/owner/destination/feeTo/amount/fee/deadline). Not a defect; second confirmation pending in #209 lane E (e-keys-signing). |
| SEC-35 | Info | EIP-7702 payer delegation persists after use (public fingerprint, exposure to future delegate bugs); 4337 paym | owner (OD-13) | **Owner-gated** | Default: AA/7702 paths stay experimental, no default delegate authority. |
| SEC-36 | Info | Native payments forward the fee to immutable FEE_RECIPIENT with all gas; a non-accepting recipient blocks ever | owner (OD-14) | **Owner-gated** | Deployment checklist must record an accepting FEE_RECIPIENT; no deployment in this run. |
| SEC-37 | Info | Zeroization is best-effort: secrets transit immutable JS strings (keystore plaintext JSON hex, typed key hex a | #209 B3 follow-up (docs/threat-model) + C1 | **owned by #209** | Accepted by #209 coordinator 07:44 UTC. |
| SEC-38 | Info | Scheme-1 derivation verified independently (6/6 vectors with elliptic+js-sha3); hash convention keccak256(comp | audit (positive verification) | **False positive / intended** | Info row: scheme-1 derivation independently verified 6/6 vectors. Not a defect. |
| SEC-39 | Info | Promotion packet says commits after d91ae16a are docs-only, but 7a620ff1 also edits apps/web/src/views/SellerK | #209 coordinator (LEDGER evidence correction) | **owned by #209** | Accepted by #209 coordinator 07:44 UTC; merged packet left unedited. |
| SEC-40 | Info | Pages banner link navigates the same tab; no beforeunload guard while unsaved keys are loaded | #209 B1 | **owned by #209** |  |
| SEC-41 | Info | No WASM/WebGL/SAB/SW needed; Safest mode unusable (JS off); JIT-less scrypt ~28 s; canvas QR likely blocked; T | #209 C2 (KDF progress text) / owner (manual Tor Browser QA) | **owned by #209** | Engineering part accepted by #209 07:44 UTC; manual TB QA stays owner. |
| SEC-42 | Info | createRoot without onCaughtError/onUncaughtError: React logs caught render errors (may contain input snippets) | #209 B1 | **owned by #209** |  |
| SEC-43 | Info | No SRI; embed SDK SRI tooling unwired (full only); Pages SHA256SUMS only in run summary/14-day artifact, unsig | #209 B1 follow-up (pages.yml attestation) / owner OD-07 (signed checksums) | **owned by #209** | Accepted by #209 coordinator 07:44 UTC. |
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
| R-07 | owner (OA-01) | **Owner-gated** | = SEC-02. |
| R-11 | owner (OD-04) | **Owner-gated** | = SEC-07. |
| R-15 | #209 C1 (OD-10) | **owned by #209** |  |
| R-16 | owner (OA-07) | **Access-blocked** | = SEC-48. |
| R-17 | PR #206 session | **owned by #206** | = SEC-49. |
| R-03 / FR-M1 residual | owner (UX-01) | **Owner-gated** | = SEC-29. |
| R-04 | gap-fill G4 | **False positive / intended** | = SEC-30. |
| R-09 | owner (OD-11) | **Owner-gated** | = SEC-12. |
| TB-08 (CLI vs web Solana/TRON meta-address formats) | gap-fill G5 | **Fixed** | RED: chain-solana interop 8 failed/3 passed, chain-tron 3/3 failed both directions. Commits e2427c20 (vectors test-vectors/meta-address-sol-tron-v1.json, generated from the web packages only), 179a5b43, 28ce8a0b, c3d7d702. Also fixed a derivation drift: chain-solana computed a different stealth address than solana-stealth for the same keys. @b290426e: chain-solana 111, chain-tron 54, solana-stealth 109, tron-adapter 74, CLI 571/571 passed; tsc 0, eslint 0. Independent crypto review: equivalence VERIFIED (300/300 cross-detect/spend both ways, 0 differences in 42,350 fuzz cases, 6 injected regressions caught). |
| N-01 (this run, G1 review): policyCoversToken trusted a hand-built leaf list | gap-fill G1 | **Fixed** | RED 'expected true to be false'; fix 1f5c2d73 rebuilds the tree and proves the leaf; policy-scheme 93 passed. |
| N-02 (this run, G5 review): chain-tron adapter build() returns the GPT1 memo outside the TRC-20 request (ADR-0019:15) | gap-fill G5b | **Fixed** | Fail closed: build() throws TronAdapterError MEMO_NOT_BOUND before deriving anything (b9af22a9); quote still validates amount/fee limit. RED: build() returned a request. @1b28f355 chain-tron 54 passed (100% coverage), CLI 577/577. |
| N-03 (this run, G5 review): CLI recipient inspect accepts any Solana cluster incl. mainnet, reports network null | gap-fill G5b | **Fixed** | 67a3c3c0: network reports devnet/testnet/localnet; mainnet refused CliError unsupported/CHAIN_DISABLED exit 5. RED: network null, mainnet exit 0. CLI 577/577. |
| N-04 (this run, G5 review): CLI maps LEGACY_META_ADDRESS to generic INVALID_INPUT | gap-fill G5b | **Fixed** | b79bb24a: chainBoundary passes LEGACY_META_ADDRESS through (fixed library message). RED: got INVALID_INPUT. CLI 577/577. |
| N-05/N-06 (this run, G3 review): legacy v2 cursor slots of other chains persist; viewing key lent on every render | gap-fill G3b | **Fixed** | 9c693248, 84203f3c, e516fa65 (merged 6ff3dd85); see SEC-22. |
| N-07 (this run, G2 review): user docs described the removed Copy seed/keys feature | gap-fill G2 | **Fixed** | docs/user/{bitcoin-silent-payments,solana-payments,tron-payments}.md and docs/chains/bitcoin.md corrected in lane G2 (merged 44714f41). |
| N-08 (this run): AppShell.tsx:147 comment still describes clipboard clearing | #209 B1 (routed) | **owned by #209** | Comment only; routed by message; fixed here after #209 lands if still present. |
| Audit 24 F3 (documentation part): policy-scheme API doc described the salt-only router | gap-fill coordinator | **Fixed** | a08f47bb + 1f5c2d73; doc matches router.ts:144-187 and GhostPayPolicyRouter.sol. The ABI decision itself is OD-05. |
| N-09 (PR #218 session's dropped-fix triage): five b85e0b59 policy-scheme hardening items lost in merge 84c2c185 (decoder encoding/R/metadata checks; signing shape guard; withdraw leaf recompute; getLimitProof leaf recompute; viewing-secret copy before validation) | gap-fill G1c | **Fixed** | RED: #218 repros 11 failed/2 passed at head; per-item tests in router.test.ts/negative.test.ts. Commits 0c0bbaa2, 6e27f497, 86fa1fef, ba877c31, 16133082, README trust notes 818aa34f, web fixture 0dab0db4. Independent review: nothing blocking. |
| N-10 (this run, G1c review): signPolicyTypedData shape check bypassable by getters (check vs digest read) and inherited/non-enumerable salt | gap-fill G1d | **Fixed** | ca2c6b75: input read once, domain rebuilt with policyDomain, types from POLICY_TYPES, digest recomputed and only it signed. RED: getter swap, inherited salt, non-enumerable salt were signed. |
| N-11 (this run, G1c review, pre-existing): send gate did not bind the ephemeral key R or metadata to the derived payment (a swapped valid R pays an address the seller cannot find) | gap-fill G1d | **Fixed** | 60f44acd: paysDerivedPayment checks method, stealth, owner, policyHash, R, metadata and view-tag prefix in send.ts and the pay.ts self-check. RED: payERC20 R/view tag/both and payNative R/view tag swaps reached the wallet. @f2f35909 policy-scheme 111 passed/7 skipped, web policy+i18n 332 passed/4 skipped, tsc 0, eslint 0. |
