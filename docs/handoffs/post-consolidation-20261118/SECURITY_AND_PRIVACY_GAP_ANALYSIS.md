# GhostPay security and privacy gap analysis (candidate 7a620ff1)

Team S synthesis. Date 2026-11-18. Target: PR #203 candidate product source `7a620ff19ecf4e43ec568896c34188f5b2dcd3fc` (== head `71abc7e5` minus docs).

## 1. Scope, method, disclaimer

**This is an AI-assisted review. It is not an independent professional audit, gives no security guarantee, and must not be presented as either.** Mainnet use needs an external professional audit of the contracts and the client key management.

Method:

- Merged two independent AI-assisted reviews of the same SHA: Team D (crypto, keys, contracts; 22 findings: 0C/0H/5M/8L/9I) and Team E (browser, privacy, hosting, supply chain; 23 findings: 0C/2H/3M/11L/7I). 45 team findings in.
- Carried the prior campaign register (`docs/handoffs/consolidation-20261118/REVIEW_FINDINGS.md` at PR head `71abc7e5`, R-01..R-18, FR-*) where still open and not re-reported: R-03, R-04, R-06 (unexercised), R-16, R-17. R-07, R-09, R-11, R-15, R-08, R-10 merged into team rows as extra sources. Resolved/closed prior items (R-01, R-02, R-05, R-12, R-13, R-14, R-18, FR-*) are not rows; R-01/R-02 residuals appear via SEC rows for E-13.
- Deduplicated true same-root-cause pairs (D-05+R-11, D-07+R-09, D-01+R-15, D-13+E-11, E-04+R-07, D-16+R-08+R-10). 45 team + 5 prior-only inputs became **49 SEC rows**. No finding was dropped. Severities were never lowered; where D, E or prior disagreed, the higher is kept and noted.
- Mapped each row to feature IDs from `feature_completion_matrix.json` by matching row file paths to `implementation_files`, plus curated extras (spec 18 K01-K06 and similar features have no implementation files yet). Broad prefixes (for example `AppShell.tsx`, `rpc.ts`) can over-include; the JSON list is the starting point for review, not an exact blast radius.
- Spot re-verification by Team S at 7a620ff1 (read code at the cited path:line): D-01, D-03, D-04, D-05, D-07, D-12, D-15, E-03, E-04 (comment only), E-05, E-06, E-07, E-10, E-11/D-13, E-12, E-16, E-21 = 17 findings. All substantive claims reproduced. Drift found: E-16 claim is at `PRIVACY_THREAT_MODEL.md:17` (not :16); E-04's "no branch protection" source comment is dated 2026-11-04 (stale); D-12 refined (run-mythril.sh does list Router and PolicyRouter). Row notes record each. Not re-run: any tool output (forge, echidna, slither, mythril not installed), live Pages, live repo settings.

Status vocabulary: CONFIRMED | SUSPECTED | FALSE-POSITIVE | INTENDED | MISSING-COVERAGE | UNVERIFIED. Team E's "INFERRED" status (E-22) is mapped to SUSPECTED.

Machine-readable twin: `security_findings.json` (same directory). Inputs: `evidence/teams/D/{SECURITY_CRYPTO.md,findings.json}`, `evidence/teams/E/{SECURITY_PRIVACY_BROWSER.md,findings.json}`.

## 2. Threat model summary

Drawn from Teams D/E and `docs/threat-model/{THREAT_MODEL,PRIVACY_THREAT_MODEL}.md`.

**Assets.** Seller spend, view and invoice-signing keys; viewing key (privacy asset); the payer-to-payee link; payee cluster (one-time addresses, sweep destinations, gas funders); amounts/token/timing; network identity (IP, UA); local history (tags, reconciliation, checkpoints, RPC URLs which may hold API keys); release integrity (what bytes users run).

**Trust boundaries.** (1) Browser origin and its storage vs the static host (GitHub Pages, shared `github.io` origin). (2) Page vs user-chosen RPC/indexer/relayer endpoints (no default RPC). (3) Page vs wallet extension. (4) Build/CI/release pipeline vs served artifact (trust roots currently empty, fail-closed). (5) Contract layer: none of the protocol contracts has an owner, admin, upgrade, pause, delegatecall or rescue; scheme-2 policy accounts hold funds with owner-key authority.

**Adversaries.**

| Adversary | Can | Cannot / not modelled |
|---|---|---|
| RPC provider (and second RPC) | See every request, IP, timing, scan windows, tx content; lie about chain data | Steal keys; integrity is checked by manifest read-back and block-hash checks only partly |
| Relayer operator | Observe owner/destination/token/amount/fee/IP; censor or delay (<=20 min order life) | Redirect or steal (EIP-712 binds all fields, chainId, verifyingContract) |
| Co-hosted Pages origin (35 sibling sites) | Read all localStorage/IndexedDB, script a same-origin window, rewrite settings (RPC URL, pinned signers) | Decrypt the vault without the passphrase (but offline attack on ciphertext; see SEC-05) |
| Malicious invoice or merchant | Craft links/profiles, spam announcements, mislead UI | Move funds without a wallet signature; fragment is client-only |
| Network observer (ISP/Wi-Fi) | DNS/SNI of github.io and RPC hosts, timing, volume | TLS content |
| Compromised build/CI or maintainer account | Ship modified JS to every Pages visitor (unsigned artifact, unevidenced branch protection) | Bypass release signed-tag + attestation for the release tarball (not Pages) |
| Device thief / later local user | Read plaintext settings, checkpoints, history links, tab journals, ciphertext; use a still-unlocked vault-less session | Decrypt a strong-passphrase vault quickly |
| Chain analyst | Everything public, forever; graph/timing/amount correlation | n/a |
| Compromised L2 sequencer (scheme 2) | Defeat a 1 h cancel window by censorship/forced-inclusion timing | n/a |

**Assumptions.** Browser and OS honest; JS strings cannot be zeroized (SEC-37); user-chosen RPC is hostile by default; Tor Browser, if used, provides the network anonymity (page cannot verify it); testnet only until mainnet gates close.

**Failure modes designed fail-closed (VERIFIED by D/E).** Empty release keys disable payments; unsigned manifests rejected; local-proxy and wss scan paths fail closed rather than leaking (but are unusable: SEC-10, SEC-19); non-accepting fee recipient blocks native payments without fund loss.

**Failure modes that are not fail-closed.** Vault-less session sweeps/export without re-auth (SEC-03); shared origin (SEC-01); unsigned Pages artifact (SEC-02); fee-token freeze on scheme-2 factory (SEC-07).

## 3. Summary counts and gates

Total **49 rows**. Severity x status:

| Severity | CONFIRMED | SUSPECTED | FALSE-POSITIVE | INTENDED | MISSING-COVERAGE | UNVERIFIED | Total |
|---|---|---|---|---|---|---|---|
| High | 1 | 0 | 0 | 0 | 0 | 1 | 2 |
| Medium | 7 | 1 | 0 | 0 | 0 | 0 | 8 |
| Low | 16 | 0 | 0 | 2 | 1 | 1 | 20 |
| Info | 12 | 1 | 0 | 2 | 1 | 3 | 19 |
| Critical | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| **Total** | 36 | 2 | 0 | 4 | 2 | 5 | 49 |

Severity totals: Critical 0, High 2, Medium 8, Low 20, Info 19. Source mix: 39 team-only, 5 team+prior, 5 prior-only.

Gate headline (details in section 9):

- **No gate is currently satisfied.** Release trust roots are empty and the Mythril gate is red by design, so no release tag is possible.
- Public Pages deploy (demo, testnet, banner): needs the shared-origin decision and live-site cleanup (SEC-01, SEC-08, SEC-09, SEC-02).
- Sepolia beta: adds release key ceremony and signed manifest (SEC-32), local-proxy honesty (SEC-10), egress smoke (SEC-46), Tor/Firefox QA (SEC-41).
- Beta exit (spec 18): needs SEC-04 and SEC-03.
- Scheme-2 deployment: blocked by SEC-06, SEC-07, SEC-11, SEC-12, SEC-31, SEC-35.
- Mainnet/release tag: all of the above plus professional audit, SEC-05, SEC-17, SEC-33, SEC-02, SEC-48.

## 4. Unified findings table

Columns: ID | sources | area | severity | status | evidence (first item; all in JSON) | affected features | remediation | verification needed | blocks. "S-verified" marks rows whose evidence Team S re-read at 7a620ff1. Gate tokens: `pages-deploy`, `sepolia-beta`, `beta-exit`, `scheme2-deploy`, `mainnet`, `release-tag`.

| ID | Sources | Area | Sev | Status | Evidence | Affected features | Remediation | Verification needed | Blocks |
|---|---|---|---|---|---|---|---|---|---|
| **SEC-01** Shared djshellshoxxx.github.io origin: 35 sibling Pages sites can read/rewrite all GhostPay storage and script the app (High once payments are enabled; Medium for a demo) | E-01 | hosting / shared origin (GP-PAGES-01) | High | CONFIRMED | scripts/pages/build-pages.sh:60-69,93-101@7a620ff1 (shared detection; manifests refused on shared origin unless GHOSTPAY_PAGES_AL… (+5) | F-KEY-02, F-KEY-03, F-PROTO-13, F-WEB-08, F-WEB-20 (+1: see JSON) | Serve from a repo-level custom domain (CNAME on the GhostPay repo, not an account-wide user-site domain) or a dedicated account/org; keep payments refused on shared orig… | Live: page origin == dedicated origin (see E-03); probe from a sibling path cannot read storage. | pages-deploy, sepolia-beta, mainnet |
| **SEC-02** Deploy trust boundary not demonstrated: main reportedly unprotected; Pages artifact unsigned/unattested and not bound to the release trust root | E-04, R-07 | deployment integrity / CI | High | UNVERIFIED | Prior session 2026-11-18 (PROMOTION_PACKET blocker 1 / R-07 @71abc7e5): API 404 'Branch not protected' with admin visibility, no rulesets, no v* tag ruleset, environment reviewers unreadable (403); .github/workflows/ghostpay-codex-cloud.yml:57@7a620ff1 ('main has NO branch protection or rulesets (checked 2026-11-04 ...)') (+5) **S-verified**: comment text present at ghostpay-codex-cloud.yml:57 (dated 2026-11-04, stale) | F-CTR-07, F-FUT-11, F-HOST-03, F-WEB-21 | Rulesets on main (required reviews + checks, no force push); github-pages env main-only + required reviewers; actions/attest-build-provenance on Pages SHA256SUMS; publis… | Owner provides rulesets/env API output; gh attestation verify on served files. | pages-deploy, sepolia-beta, release-tag, mainnet |
| **SEC-03** Vault-less seller sessions have no re-authentication for sweeping or for master-key keystore export; idle lock deliberately keeps un-backed-up keys loaded | D-01, R-15 | key-management / step-up | Medium | CONFIRMED | apps/web/src/lib/keyVault.ts:257-266@7a620ff1 (authorizeKeyExport returns undefined when no vault record) (+5) **S-verified**: keyVault.ts:257-266,328-333 and keyVault.test.ts:241 re-read, match | F-KEY-01, F-KEY-02, F-KEY-03, F-KEY-04, F-KEY-09 (+8: see JSON) | Owner decision (R-15/K03): e.g. require an encrypted vault or verified backup + its passphrase before any sweep or spec-18 secret export on mainnet (never block the keystore v1 backup); or a session unlock secret set at key … | Unit + Playwright tests: vault-less session -> export/sweep/raw-export refused or re-auth enforced; lock/key change during KDF ne… | beta-exit, mainnet |
| **SEC-04** No GhostPay-independent recovery path is shipped: spec 18 formats (K01-K06) are unimplemented and the CLI can scan but cannot derive one-time keys or sweep | D-02 | recovery / portability | Medium | CONFIRMED | grep "ghostpay-stealth-" apps packages scripts@7a620ff1: no matches (+2) | F-CLI-03, F-CLI-05, F-FUT-17, F-FUT-33, F-FUT-40 (+9: see JSON) | Implement K01-K06 per spec 18; ship a documented offline reference recovery script + keystore/keypair/master test vectors; add CI job decrypting vectors with a non-Ghost… | KC checkpoint on one SHA: fresh-install restore, offline recovery of a historic announcement, independent wallet tool signs anvil… | beta-exit, mainnet |
| **SEC-05** Master-key keystore/vault passphrase policy accepts name+year style passphrases (score>=2 heuristic, 14 chars) protecting all spend/view/signing keys | D-03 | key-management / KDF policy | Medium | CONFIRMED | packages/ux-vault/src/keystore-portable.ts:186-216@7a620ff1 (pool-based estimator; reject only score<2) (+2) **S-verified**: keystore-portable.ts:62,186-216 re-read; MIN_PASSPHRASE=14, score<2 rejected, bits<60 => fair accepted | F-CLI-03, F-KEY-02, F-KEY-03, F-KEY-05, F-KEY-14 (+2: see JSON) | Before mainnet: default to the generated 6-word passphrase (60 bits) with explicit override; raise the floor (score>=3) or adopt a dictionary/pattern estimator (zxcvbn-c… | Estimator regression corpus (names+dates, leaked-list samples) rejected; KDF timing on low-end mobile recorded. | mainnet |
| **SEC-06** AUD24-01 re-verified: GhostPayPolicyRouter takes PolicyRef{owner, policyHash}, so every scheme-2 payment exposes the seller-constant policyHash in calldata | D-04 | contracts / privacy (scheme 2) | Medium | CONFIRMED | packages/contracts/src/GhostPayPolicyRouter.sol:93-106,236-242@7a620ff1 (+2) **S-verified**: GhostPayPolicyRouter.sol:93-106 payERC20 takes PolicyRef calldata policy (owner, policyHash); confirmed | F-AA-01, F-AA-02, F-POOL-08, F-WEB-15 | Owner ABI decision: restore salt-only router ABI (50881e4) in lockstep with policy-scheme and RouterCall.sol; even then deploy calldata and withdrawals reveal the policy… | test_policy_calldataDoesNotLinkPaymentsToSeller restored; anvil e2e on new ABI. | scheme2-deploy |
| **SEC-07** N1 re-verified: failing fee-token views or an unexpected fee delta revert every fee-charging deploy of the immutable factory, freezing counterfactual policy funds | D-05, R-11 | contracts / token quirks (scheme 2) | Medium | CONFIRMED | packages/contracts/src/PolicyAccountFactory.sol:113-114,128-164@7a620ff1 (+1) **S-verified**: PolicyAccountFactory.sol:128-140 _collectFee reads balanceOf/allowance before transfer with no try/catch; con… | F-AA-01, F-AA-03 | Owner: zero-fee factory for upgradeable/fee-switch tokens, or specified fail-open _collectFee (spec change), before any production scheme-2 deployment. | test_probe_feeSwitchFreezesCounterfactualFunds inverted to pass under chosen design; Mythril/Echidna rerun. | scheme2-deploy |
| **SEC-08** Stale prototype (gh-pages cc8d0794, 2026-10-21) probably live on /GhostPay/: runtime unsigned manifest loading, no mirror banner, predates later fixes | E-02 | deployment / live site | Medium | SUSPECTED | git: refs/remotes/origin/gh-pages = cc8d0794 'Publish GhostPay build with help, why, privacy options and how-it-works pages' (202… (+4) | F-WEB-21 | Owner: Settings > Pages > Source = GitHub Actions (or unpublish); delete/archive gh-pages; then run scripts/pages/smoke.mjs against the live URL with --commit. | Live smoke: build-info.json names the dispatched commit; mirror banner present; no /deployments/ fetch. | pages-deploy, sepolia-beta |
| **SEC-09** Shared-origin gate trusts the declared GHOSTPAY_PAGES_ORIGIN (*.github.io suffix only); deployed page_url origin never asserted; account-wide custom domains pass as dedi… | E-03 | deployment / origin gate | Medium | CONFIRMED | scripts/pages/build-pages.sh:60-69@7a620ff1 (+2) **S-verified**: build-pages.sh:60-69 re-read; only *.github.io suffix => shared, else shared=0 (declared value trusted) | F-WEB-21 | Assert new URL(page_url).origin === vars.GHOSTPAY_PAGES_ORIGIN in deploy/smoke; require repo-level cname + https_enforced from the Pages API; treat any origin that serve… | Workflow test: mismatched origin fails the run. | pages-deploy, sepolia-beta |
| **SEC-10** 'Local proxy' scan transport over http loopback is unusable: Settings accepts http loopback endpoints but CSP connect-src blocks them in every shipped profile (fails closed; only an https loopback proxy would pass) | E-05 | scan privacy (spec 10 stage 1) | Medium | CONFIRMED | apps/web/src/lib/scanPrivacy.ts:72-98@7a620ff1 (http loopback accepted) (+4) **S-verified**: scanPrivacy.ts:72-98 accepts http loopback; index.html:13 connect-src "self" https: wss: has no http:; confir… | F-FUT-04, F-FUT-26, F-FUT-34, F-NET-01, F-WEB-07 (+2: see JSON) | Add http://127.0.0.1:* http://localhost:* http://[::1]:* to connect-src (meta, _headers, nginx) or require https loopback (mkcert) and say so; add Playwright test under … | e2e: scan through a local JSON-RPC forwarder succeeds and no direct RPC is contacted. | sepolia-beta |
| **SEC-11** Scheme-2 payers cannot tell which assets the seller policy can withdraw: meta-address carries only policyHash, PolicyRouter accepts any token/native, and an asset withou… | D-06 | contracts / funds lock-in (scheme 2) | Low | CONFIRMED | packages/contracts/src/PolicyAccount.sol:172-186@7a620ff1 (leaf required when limitsRoot!=0) (+3) | F-AA-01, F-AA-02, F-WEB-15 | Client gate: seller-side invoice issuance must refuse assets without an (unlimited) leaf; payer warning; consider committing accepted assets in the meta-address or treat… | Unit test: scheme-2 invoice for unlisted asset refused; anvil test for native without leaf. Client-side mitigation existence UNVE… | scheme2-deploy |
| **SEC-12** Factory MIN_DELAY = 1 h is below L2 censorship/forced-inclusion bounds; a colluding or stalled sequencer can defeat the owner cancel window (R-09 refinement) | D-07, R-09 | contracts / L2 timing (scheme 2) | Low | CONFIRMED | packages/contracts/src/PolicyAccountFactory.sol:36@7a620ff1 (+2) **S-verified**: PolicyAccountFactory.sol:36 MIN_DELAY = 1 hours confirmed | F-AA-01, F-AA-03 | Per-chain minimum delay > forced-inclusion bound + margin (UI-enforced and/or per-chain factory constant); document numbers per chain in spec 15/16. | Foundry test with timestamp jump/censorship model per chain; chain matrix entry for min delay. | scheme2-deploy |
| **SEC-13** BTC/Solana/TRON views reveal raw master seeds/keys and allow (warned, two-click) clipboard copy without re-authentication; TRON backup is plaintext spend+view hex | D-08 | key-management / raw export (full profi… | Low | CONFIRMED | apps/web/src/components/SecretBackup.tsx:193,233@7a620ff1 (clipboard.writeText after confirm click) (+2) | F-BTC-01, F-KEY-04, F-SOL-01, F-TRX-01 | Owner decision with spec 18 clipboard wording; align with K04 controls (re-auth + second confirmation, no clipboard by default) or keep explicitly experimental/full-only. | Component tests for re-auth gate; lean bundle scan proves absence. | promotion:BTC/SOL/TRON beyond experimental |
| **SEC-14** Legacy text-manifest scheme (sha256/ed25519, domain GhostPay-deployment-manifest-v1) with runtime fetch and unsigned-testnet acceptance still exported beside the strict … | D-09 | signing / manifest trust | Low | CONFIRMED | apps/web/src/lib/manifest.ts:52-101@7a620ff1 (loadManifest: fetch ./deployments, unsigned-dev on testnets, console.warn) (+2) | F-DEP-01, F-WEB-17 | Delete or move loadManifest/verifyTextManifestSignature to test utilities; add bundle-scan rule that the lean/full build contains no unsigned-dev acceptance path. | scan-bundle rule + unit test; lean build module list check. | - |
| **SEC-15** Keystore v1 format documentation drifts from code (bounds, passphrase rule, writer location), weakening spec 18 flow 4 "documented, stable format" | D-10 | recovery / documentation | Low | CONFIRMED | docs/developer/byte-layouts.md:195-198 (N in [2^14,2^20], passphrase >=10, writer apps/web/src/lib/keystore.ts) (+1) | F-DOC-02, F-KEY-02, F-KEY-03, F-KEY-08, F-PROTO-13 | Correct doc; publish normative keystore v1 spec + fixed test vector; CI test that decodes vector with node:crypto (pattern of indep-keystore-recovery.mjs). | Doc/code parity test. | K06 docs |
| **SEC-16** pool-sdk seed backup is weaker than the keystore policy: passphrase >=8 chars, no estimator, no NFKC, scrypt N=2^15 default, import accepts logN up to 20 (~1 GiB) | D-11 | key-management (experimental pool) | Low | CONFIRMED | packages/pool-sdk/src/store.ts:118-150@7a620ff1 | F-POOL-03 | Reuse the ux-vault KDF/estimator/bounds (N 2^17, max 2^18) and NFKC; bind version/params in AAD. | Unit tests for bounds and weak passphrase refusal. | promotion:pool features beyond experimental |
| **SEC-17** Analyzer scope gaps: Slither CI excludes Low/Informational (doc claims "no detector exclusions"); payer-hiding/pool/confidential contracts get no Slither/Mythril/Echidna… | D-12 | analyzers | Low | MISSING-COVERAGE | .github/workflows/ci.yml:459 and nightly.yml:65 (--exclude-informational --exclude-low; working-directory packages/contracts) (+3) **S-verified**: ci.yml:459 and nightly.yml:65 slither flags and 00-slither-triage.md:10 "no detector exclusions" wording cont… | F-AA-01, F-AA-03, F-CTR-01, F-CTR-02, F-CTR-03 (+7: see JSON) | One-time full-severity Slither triage before mainnet; extend analyzers to any contract that may deploy; add Echidna actions for permit paths, forged signers, factory dep… | CI artifacts with per-detector triage; canaries for new actions. | mainnet |
| **SEC-18** No anti-framing protection on GitHub Pages: frame-ancestors only in _headers (ignored by Pages; meta CSP cannot carry it) and no JS refusal to render seller/sweep views … | D-13, E-11 | web hosting / UI redress | Low | CONFIRMED | apps/web/scripts/scan-bundle.mjs:189 (_headers requires frame-ancestors) (+5) **S-verified**: embedHost.ts:7-9 comment confirmed; index.html meta CSP carries no frame-ancestors | F-KEY-02, F-WEB-18, F-WEB-21, F-WEB-22, F-WEB-23 | Refuse to render key/sweep/export views when window.top !== window.self unless embed protocol active; prefer header-capable host for mainnet (ADR-0029). \| Lean-only fra… | Playwright test framing the built site. \| e2e: framed load shows 'open in its own tab'. | - |
| **SEC-19** wss:// RPC URLs are accepted and allowed by CSP but no transport supports them (always fail closed) | E-06 | RPC configuration | Low | CONFIRMED | packages/chain-adapters/src/rpc.ts:87,97@7a620ff1 (+2) **S-verified**: rpc.ts:87 accepts wss; net-transport fetchTransport rejects non-http (:32,:39); confirmed | F-NET-01, F-PROTO-03, F-WEB-08 | Reject wss in checkRpcUrl or implement a WebSocket transport; drop wss: from connect-src if unused; fix copy. | Unit test + copy review. | - |
| **SEC-20** Default chain-adapters fetchTransport omits credentials:'omit', cache:'no-store', referrerPolicy:'no-referrer' (other transports set them) | E-07 | RPC transport hygiene | Low | CONFIRMED | packages/chain-adapters/src/rpc.ts:103-109@7a620ff1 (+3) **S-verified**: rpc.ts:103-112 fetch() has only method/headers/body/signal/redirect; no credentials/cache/referrerPolicy; con… | F-PROTO-03, F-WEB-08, F-WEB-12, F-WEB-22 | Set the three options in fetchTransport; extend privacy invariants to packages/chain-adapters and net-transport. | Unit assertion on fetch init. | - |
| **SEC-21** Invoice bearer fragment persists in browser history/session/UKM DBs after address-bar clearing; docs omit history sync | E-08 | URL / history | Low | INTENDED | apps/web/src/lib/fragment.ts:20-26@7a620ff1; apps/web/src/AppShell.tsx:97-115@7a620ff1 (+2) | F-KEY-04, F-WEB-01, F-WEB-08, F-WEB-16, F-WEB-21 | Mention cloud history sync; keep promoting paste/passphrase links. | Copy review. | - |
| **SEC-22** Plaintext linkable identifiers: checkpoint slots keyed by sha256(spend\|view pub), vault meta-address/signer, reconciliation sellerKeyId, tag timestamps, tab journals wi… | E-09 | storage linkability | Low | CONFIRMED | apps/web/src/lib/scanClient.ts:661-700@7a620ff1; packages/ux-vault/src/seller-scope.ts:8-10@7a620ff1 (+4) | F-KEY-02, F-KEY-05, F-KEY-06, F-PROTO-05, F-WEB-06 (+1: see JSON) | Pseudonymize slot names with a viewing-key-derived key; minimize plaintext in vault record. | Storage-dump test asserts no meta-derived identifiers. | - |
| **SEC-23** No in-app 'erase all GhostPay data'; clearing site data on github.io wipes all 36 sites | E-10 | storage retention | Low | CONFIRMED | apps/web/locales/en.json:273 (+2) **S-verified**: grep non-test sources for deleteDatabase/localStorage.clear: none | F-KEY-02, F-MER-05, F-WEB-08, F-WEB-09, F-WEB-20 | Confirmed wipe of ghostpay.* local/session keys and the three IndexedDB databases with backup warning. | e2e: storage empty after wipe. | - |
| **SEC-24** scan-bundle checks inline scripts/CSP only in index.html; lean exclusion lists differ between guard and Pages verifier (R-01 fix itself verified) | E-13 | build guards | Low | CONFIRMED | apps/web/scripts/scan-bundle.mjs:153-183@7a620ff1 (+3) | F-DEP-01, F-HOST-03, F-WEB-17, F-WEB-18, F-WEB-21 (+1: see JSON) | Scan every *.html; single shared exclusion list. | Unit tests. | - |
| **SEC-25** npm audit: 30 dev-tree advisories (14 high picomatch<=4.0.7 ReDoS via vite/vitest/typescript-eslint/hardhat; 16 low elliptic/cookie/@sentry via hardhat); production 0 | E-14 | supply chain (dev tree) | Low | CONFIRMED | npm audit --json (all): exit 1; high 14, low 16, critical 0 ($SP/out/E/logs/npm_audit_all.json) (+3) | F-FUT-11 | Track; add overrides when picomatch fix ships; non-blocking full-tree audit report. | npm audit. | - |
| **SEC-26** Self-host images pinned by tag only; dependabot lacks docker ecosystem; nginx sends no HSTS (relies on terminator) | E-15 | self-host supply chain | Low | CONFIRMED | deploy/docker-compose.yml:53@7a620ff1 (+5) | F-HOST-01, F-HOST-02, F-HOST-04, F-WEB-18 | Digest pins + dependabot docker entries; HSTS at TLS terminator documented/tested. | Config review. | - |
| **SEC-27** PRIVACY_THREAT_MODEL says net-transport/scan-source are not imported by apps/web; they ship in the lean bundle | E-16 | docs accuracy | Low | CONFIRMED | docs/threat-model/PRIVACY_THREAT_MODEL.md:16@7a620ff1 (+2) **S-verified**: re-read; statement present at line 17; apps/web/package.json depends on net-transport and scan-source | F-DOC-04, F-WEB-22 | Refresh sections 1.1/5 and note E-05. | Doc review. | - |
| **SEC-28** Overclaims/imprecise copy: unqualified 'hides which seller owns the one-time address', 'stay unlinkable', false local-proxy/wss statements | E-17 | privacy claims | Low | CONFIRMED | apps/web/locales/en.json:1100 (+4) | F-CTR-05, F-DOC-01, F-DOC-04, F-I18N-02 | Qualify per SECURITY_PRIVACY_BROWSER.md section 8. | Copy review. | - |
| **SEC-29** ContextHelp hover-leave still collapses an open explanation, shifting layout (residual of R-02/FR-M1) | R-03 | UX / lost click (ContextHelp) | Low | UNVERIFIED | REVIEW_FINDINGS.md R-03 @71abc7e5 (prior, not re-verified by S) | F-DOC-04, F-WEB-23 | Non-shifting help presentation (next-phase UX). | Browser test of hover-leave vs click timing (prior measured 26/26 runs click wins). | - |
| **SEC-30** #201 focus scope also focuses main after in-view paste/QR/Forget/cancel; comment names only deep links | R-04 | UX / focus scope | Low | INTENDED | REVIEW_FINDINGS.md R-04 @71abc7e5 (prior, not re-verified by S) | F-KEY-04, F-WEB-08, F-WEB-16, F-WEB-21, F-WEB-23 | Pin paste-submit focus with a test (backlog). | Unit test pinning focus after in-view actions. | - |
| **SEC-31** Policy-account owner-key compromise yields an indefinite freeze race (thief can cancel every withdrawal and keep proposing destinations); no rotation; recovery ADR-0028 … | D-14 | contracts / recovery (scheme 2) | Info | INTENDED | packages/contracts/src/PolicyAccount.sol:245-252,255-280@7a620ff1 (+1) | F-AA-01, F-AA-05 | Owner decision on ADR-0028 (no custodial guardians); document liveness-only guarantee in user docs. | Model tests in scripts/experimental/policy-recovery. | scheme2-deploy |
| **SEC-32** Release trust roots are empty: RELEASE_KEY undefined, RELEASE_PUBLIC_KEYS [], allowed_signers has 0 keys; payments and releases stay disabled; keys ship inside the same … | D-15 | release trust roots (fail-closed gate) | Info | CONFIRMED | packages/chain-adapters/src/deploymentsSignature.ts:19@7a620ff1 (+3) **S-verified**: deploymentsSignature.ts:19 RELEASE_KEY undefined; releaseKeys.ts:9 RELEASE_PUBLIC_KEYS defaults [] | F-CTR-07, F-DEP-01, F-DEP-02, F-DEP-04, F-WEB-03 (+3: see JSON) | Owner offline key ceremony (secp256k1 manifest key; SSH/PGP tag keys); document separation of trust roots; reproducible-build/out-of-band digest publication. | Signed Sepolia manifest validates at build and runtime; tag verify passes; unsigned still fails. | sepolia-beta, release-tag, mainnet |
| **SEC-33** Mythril gate is red by design (11 dispositioned records; R8 timeout-dependent); no finding-specific suppression mechanism exists, so every release is blocked | D-16, R-08, R-10 | analyzers / release gate | Info | CONFIRMED | gh api runs/44231986631 (d91ae16a) and runs/44242366379 (7a620ff1): echidna success, mythril failure (VERIFIED job conclusions) (+1) | F-CTR-07, F-DEP-04 | Owner: approve keyed disposition mechanism (contract, function, SWC, PC, compiler+source hash, auto-fail on change) or keep releases blocked. | Gate mutation tests for the mechanism. | release-tag |
| **SEC-34** Relayer cannot steal or redirect (EIP-712 binds token/owner/destination/feeTo/amount/fee/deadline/nonce + chainId + verifyingContract) but can censor/delay (<=20 min ord… | D-17 | relayer trust | Info | CONFIRMED | packages/contracts/src/GhostPaySweepRelayer.sol:46-60,80-115@7a620ff1 (+3) | F-CTR-02, F-CTR-03, F-DEP-02, F-HOST-01, F-PROTO-13 (+6: see JSON) | Keep relayer optional/user-selected; document metadata exposure and fallback privacy cost; prefer buffer payments for gas. | Existing Sweep.audit tamper/replay suites (forge, not run here). | - |
| **SEC-35** EIP-7702 payer delegation persists after use (public fingerprint, exposure to future delegate bugs); 4337 paymaster admin powers limited to sponsor deposit/stake; verify… | D-18 | EIP-7702 / ERC-4337 (experimental) | Info | CONFIRMED | packages/payer-hiding-contracts/src/GhostPayPayerDelegate.sol:36-39,98-147@7a620ff1 (+2) | F-AA-04, F-POOL-08, F-RLY-05 | Before any non-testnet use: mandatory clear-delegation step, independent audit, analyzer coverage (D-12); no default delegate authority (D03). | anvil e2e of delegate->clear flow. | scheme2-deploy |
| **SEC-36** Native payments forward the fee to immutable FEE_RECIPIENT with all gas; a non-accepting recipient blocks every native payment >= 400 wei (no fund loss) | D-19 | contracts / availability | Info | INTENDED | packages/contracts/src/GhostPayRouter.sol:121-127,241-249@7a620ff1 (+1) | F-AA-01, F-CTR-01, F-CTR-02, F-CTR-05, F-CTR-06 | Deploy with an EOA/known-good multisig that accepts ETH; smoke-test in deployment readback. | SmokeSepolia native payment. | - |
| **SEC-37** Zeroization is best-effort: secrets transit immutable JS strings (keystore plaintext JSON hex, typed key hex and passphrases in React state), noble toHex path is allowed… | D-20 | crypto / memory hygiene | Info | CONFIRMED | packages/core-crypto/src/secret.ts:16-20,61-75,132-134@7a620ff1 (+3) | F-KEY-01, F-KEY-02, F-KEY-03, F-KEY-13, F-PROTO-01 (+1: see JSON) | Keep lifetimes short; for spec 18 build plaintext as bytes (no JSON hex string) where feasible; document residual. | n/a (documented limitation). | - |
| **SEC-38** Scheme-1 derivation verified independently (6/6 vectors with elliptic+js-sha3); hash convention keccak256(compressed S) pinned by ADR-0001 = ScopeLift SDK; EIP-5564 publ… | D-21 | crypto / EIP-5564 interop | Info | CONFIRMED | packages/core-crypto/src/stealth.ts:78-100,120-136,157-190,212-232@7a620ff1 (+2) | F-KEY-01, F-PROTO-01, F-PROTO-02 | Record the convention in K01 public format; optionally cross-check against a second independent 5564 wallet implementation. | n/a | - |
| **SEC-39** Promotion packet says commits after d91ae16a are docs-only, but 7a620ff1 also edits apps/web/src/views/SellerKeys.test.tsx (test-only); CI re-ran on 7a620ff1 and is gree… | D-22 | process / evidence accuracy | Info | CONFIRMED | git diff --name-only d91ae16a 7a620ff1 (4 docs + 1 test file) (+1) | - | Update packet: qualified head = 7a620ff1 (or note test-only delta). | n/a | - |
| **SEC-40** Pages banner link navigates the same tab; no beforeunload guard while unsaved keys are loaded | E-12 | UX safety | Info | CONFIRMED | scripts/pages/build-pages.sh:148@7a620ff1 (+1) **S-verified**: grep beforeunload/pagehide in apps/web/src: none | F-KEY-01, F-KEY-04, F-WEB-08, F-WEB-16, F-WEB-21 | target=_blank rel='noopener noreferrer' or beforeunload prompt while backup unverified. | e2e. | - |
| **SEC-41** No WASM/WebGL/SAB/SW needed; Safest mode unusable (JS off); JIT-less scrypt ~28 s; canvas QR likely blocked; TB private mode drops vault/checkpoints; onion RPC unsupport… | E-18 | Tor Browser compatibility | Info | UNVERIFIED | bundle token counts WebAssembly/webgl/SharedArrayBuffer/serviceWorker = 0 (+5) | F-FUT-34, F-HOST-02, F-KEY-02, F-KEY-03, F-NET-01 (+5: see JSON) | Manual TB Standard/Safer QA; KDF progress text; document TB persistence; consider https onion RPC guidance. | QA record. | sepolia-beta |
| **SEC-42** createRoot without onCaughtError/onUncaughtError: React logs caught render errors (may contain input snippets) to console | E-19 | logging | Info | CONFIRMED | apps/web/src/main.tsx:11@7a620ff1 (+2) | F-WEB-22 | Pass sanitized root error handlers. | Unit. | - |
| **SEC-43** No SRI; embed SDK SRI tooling unwired (full only); Pages SHA256SUMS only in run summary/14-day artifact, unsigned | E-20 | integrity / SRI | Info | CONFIRMED | apps/web/README.md:57@7a620ff1 (+2) | F-FUT-11, F-WEB-18, F-WEB-21 | See E-04 (attest + signed checksums). | — | - |
| **SEC-44** No denylist for the public Playwright manifest-signing key in GHOSTPAY_RELEASE_PUBKEYS parsing | E-21 | release keys | Info | CONFIRMED | apps/web/scripts/validate-deployments.mjs:38-43@7a620ff1 (+1) **S-verified**: validate-deployments.mjs:38-43 key parser has no denylist; prepare-manifest.mjs testKey = Uint8Array(32).fill… | F-DEP-01, F-DEP-03, F-WEB-17 | Denylist known public test keys. | Unit. | - |
| **SEC-45** RPC can fingerprint GhostPay users: Origin header, UA, Accept-Language, sequential JSON-RPC ids, 60 s eth_chainId recheck, optional 60-90 s auto-scan | E-22 | network metadata | Info | SUSPECTED | packages/chain-adapters/src/rpc.ts:227-237@7a620ff1 (+1) | F-NET-01, F-PROTO-03, F-WEB-08, F-WEB-22 | Document; consider random request ids. | Doc. | - |
| **SEC-46** Post-deploy smoke only idles on the home view for 3 s | E-23 | deploy smoke coverage | Info | CONFIRMED | scripts/pages/smoke.mjs:100-112@7a620ff1 (+1) | F-WEB-21, F-WEB-22 | Extend smoke to click every lean view and open a fixture invoice, then assert no request outside the site. | Smoke run log. | sepolia-beta |
| **SEC-47** release.yml contract-analysis gate (R-06) resolved in source but unexercised on a real tag | R-06 | release gating | Info | UNVERIFIED | REVIEW_FINDINGS.md R-06 @71abc7e5: "Resolved (unexercised on a real tag)" | F-CTR-07, F-FUT-11 | Dry-run a signed pre-release tag in a sandbox repo/branch to exercise the gate end to end. | A real or rehearsal tag run showing the gate fails on red analyzers and passes on dispositioned set. | release-tag |
| **SEC-48** CodeQL, Dependabot and secret-scanning alert inventories not obtainable (403/proxy); passing scanner jobs are not issue closure | R-16 | security inventories (access) | Info | MISSING-COVERAGE | REVIEW_FINDINGS.md R-16 @71abc7e5 (+1) | - | Owner exports/reviews the alert inventories or grants read access to the integration. | Inventory reviewed with zero open High/Critical or each dispositioned. | mainnet |
| **SEC-49** PR #204 (agent tooling) conflicts with #203 in ci.yml and CLAUDE.md | R-17 | process / concurrent PR | Info | UNVERIFIED | REVIEW_FINDINGS.md R-17 @71abc7e5 | F-CTR-07 | Define merge order; re-run CI after the second merge. After the snapshot #203 merged and #204 was re-integrated as open PR #206. | CI green after both merged. | - |

Row notes (merge rationale, severity disagreements, drift):

- **SEC-01** (E-01): Severity High taken from E (E: High once payments enabled, Medium for demo); prior GP-PAGES-01 rated it Confirmed-medium (RELEASE_MATRIX:53). Higher kept. Compounds with D-03 (weak passphrase policy) and E-09 (plaintext meta in vault record): a sibling-origin script can read the vault ciphertext for offline attack.
- **SEC-02** (E-04, R-07): E-04 (High, UNVERIFIED) and prior R-07 (High, owner action) are the same root cause (no evidenced branch protection / tag ruleset / environment reviewers; Pages artifact unsigned). Evidence of "no protection" in the codex workflow comment is dated 2026-11-04 (stale). Status kept UNVERIFIED because live settings are not readable (R-16 style access gap).
- **SEC-03** (D-01, R-15): D-01 (Medium CONFIRMED) merged with prior R-15 (Info, spec wording). Higher severity kept. Beta posture: disclose, or require a vault for beta sweeps (owner decision).
- **SEC-04** (D-02): Violates mandatory constraint 4 until spec 18 K01-K06 ships.
- **SEC-05** (D-03): Estimator is a heuristic on character pools; floor 14 chars, reject only score<2 (<45 bits => weak; 45-60 accepted).
- **SEC-06** (D-04): Prior AUD24-01 (docs/audits/26:45) still open; contracts unchanged since beb525dd.
- **SEC-07** (D-05, R-11): D-05 and prior R-11 (N1) same root cause. Owner choice: zero-fee factory or specified fail-open _collectFee.
- **SEC-08** (E-02): SUSPECTED: live site could not be read (github.io blocked by sandbox proxy).
- **SEC-10** (E-05): Fails closed (no leak); privacy-claim and spec-10 acceptance blocker.
- **SEC-12** (D-07, R-09): D-07 refines prior R-09 (docs-only mitigation landed 3f10fcaf). L2 protocol parameters INFERRED.
- **SEC-17** (D-12): Refined by S: run-mythril.sh:20 DOES list GhostPayRouter and GhostPayPolicyRouter, so the gap is the absence of any retrievable/dispositioned per-record result for them (CI report artifact 403; local runs killed), not an unrun target. payer-hiding/pool/confidential remain unanalysed.
- **SEC-18** (D-13, E-11): D-13 and E-11 same root cause (Pages cannot send frame-ancestors/XFO/COOP; no JS frame guard). Both Low.
- **SEC-21** (E-08): Documented residual (audit S3-03); INTENDED.
- **SEC-24** (E-13): R-01 fix itself verified by E.
- **SEC-25** (E-14): Dev tree only; production 0 advisories; no upstream picomatch fix.
- **SEC-27** (E-16): Line drift: claim is at PRIVACY_THREAT_MODEL.md:17 (not :16).
- **SEC-28** (E-17): Privacy-claim honesty (constraint 3).
- **SEC-29** (R-03): Carried from prior; UX, not security. Not re-verified by S.
- **SEC-30** (R-04): Carried from prior; accepted as merged. Not re-verified by S.
- **SEC-31** (D-14): INTENDED per D; ADR-0028 unaccepted.
- **SEC-32** (D-15): Fail-closed by design (payments disabled); Info severity reflects safe-by-default, but it is a hard gate.
- **SEC-33** (D-16, R-08, R-10): D-16 plus prior R-08 (SWC-116 x3, intended) and R-10 (factory x8, FP/intended) dispositions: gate red by design.
- **SEC-36** (D-19): Operational: FEE_RECIPIENT must accept ETH (beta deployment checklist).
- **SEC-38** (D-21): Positive control (verified sound).
- **SEC-39** (D-22): Process/evidence accuracy.
- **SEC-41** (E-18): Blocks Tor-compat claims only.
- **SEC-43** (E-20): Related to E-04 (artifact authenticity) but a distinct control (SRI/checksums).
- **SEC-45** (E-22): Team E status was INFERRED (evidence level); mapped to SUSPECTED in the S status vocabulary.
- **SEC-46** (E-23): Live egress evidence for beta.
- **SEC-47** (R-06): Prior R-06 (High, process) resolved in source (15c302cd, 12 gate mutations); carried because the gate is unexercised on a real tag.
- **SEC-48** (R-16): Prior gate item (access): CodeQL/Dependabot alert APIs 403, secret-scanning blocked, no Sonar config. Not rated by prior; Info assigned, gate-type. Owner must review inventories.
- **SEC-49** (R-17): Coordination: PR #204 conflicts with #203 in ci.yml and CLAUDE.md.

## 5. Analyzer re-triage

Source: Team D section 3 (Mythril artifact 14290880802 at beb525dd; contract sources byte-identical at 7a620ff1) plus Team S spot checks. Tools (forge, echidna, slither, mythril) are not installed here and the CI report artifacts returned 403, so per-record results are UNVERIFIED; only CI job conclusions are VERIFIED (CI 44242366118 success; Contract analysis 44242366379 Echidna success, Mythril failure with exactly the 11 dispositioned records). Gate and open points: SEC-33, SEC-17.

**Mythril 0.24.8 (R1-R11).**

| Rec | Location | SWC | Status | Basis |
|---|---|---|---|---|
| R1 | SweepRelayer:sweep:83 | 116 | INTENDED | Inclusive signed deadline gates acceptance only (prior R-08) |
| R2 | PolicyAccount:requestWithdraw:161 | 116 | INTENDED | Deadline bounds submission, not execution (prior R-08) |
| R3 | PolicyAccount:proposeDestination:262 | 116 | INTENDED | same (prior R-08) |
| R4 | Factory clone fallback PC 30 | 110 | FALSE-POSITIVE | Constructor rejects implementation=address(1); standard EIP-1167; PC mapping UNVERIFIED |
| R5 | Factory:deploy:117 initialize | 107 | INTENDED | nonReentrant; initialize makes no external call |
| R6 | Factory:deploy ReentrancyGuard:99 | 107 | FALSE-POSITIVE | Guard release itself; bytecode-level UNVERIFIED |
| R7 | Factory:deploy:131 balanceOf(recipient) | 113 | INTENDED, residual CONFIRMED | Fail-closed but freezes funds: SEC-07 (S re-read `_collectFee` lines 128-140) |
| R8 | Factory:deploy:132 allowance | 113 | INTENDED, residual CONFIRMED | Timeout-dependent (appears/disappears); any suppression must tolerate this (SEC-07, SEC-33) |
| R9 | Factory:deploy Clones:104 create2 | 107 | INTENDED | Salt binds owner+policy; front-run deploys the victim's own policy |
| R10 | Factory:deploy SafeERC20:227 | 107 | FALSE-POSITIVE | Target is immutable FEE_TOKEN |
| R11 | Factory:deploy SafeERC20:227 | 104 | FALSE-POSITIVE, residual INTENDED | Return value branched at :135; waiver can be triggered by hook tokens (AUD24-02); fee revenue only |
| gap | GhostPayRouter, GhostPayPolicyRouter | - | MISSING-COVERAGE | `run-mythril.sh:20` (S-verified) does list both, and the same `timestamp > deadline` pattern exists (`GhostPayRouter.sol:99`), but no records exist, local runs were killed and the CI report is unreadable. Absence of records is not evidence of absence. payer-hiding, pool and confidential contracts are not analysed at all (SEC-17) |

Mythril gate is red by design: no per-finding suppression mechanism exists, so every release tag is blocked until the owner picks a disposition mechanism (SEC-33).

**Echidna 2.2.7 (13 properties, 11 canaries).** CI job success on both d91ae16a and 7a620ff1 (VERIFIED). Script fails the job on any property failure or unreached canary (`run-echidna.sh:31-76`), so green implies 13/13 hold and 11/11 reached (INFERRED; per-property output UNVERIFIED). R-12 (native canary) resolved.

| Harness | Properties | Status | Missing |
|---|---|---|---|
| Router (4) | never_holds_tokens, fee_plus_net_eq_gross, native_fee_plus_net_eq_gross, fee_recipient_only_gets_bps | CONFIRMED hold (CI) | permit entry point, reentrant/hook tokens |
| Sweep (4) | nonce_single_use, used_nonces_marked, relayer_never_holds_tokens, token_conservation | CONFIRMED hold (CI) | sweepWithPermit, forged non-owner signature, hostile tokens |
| Policy (5) | funds_only_to_destination, destination_only_changes_via_timelock, timelocks_never_shortened, policy_immutable, rolling_window_cap | CONFIRMED hold (CI) | destinations with code, unlimited-leaf path, L2 timestamp model, leaf/proof substitution |
| Canaries (11: Router 4, Sweep 2, Policy 5) | reachability | CONFIRMED reached (CI) | - |
| Not harnessed | PolicyAccountFactory, GhostPayPolicyRouter, payer-hiding, pool | MISSING-COVERAGE | Foundry invariant tests exist for PolicyRouter (not run here) |

**Slither 0.11.6.** Job green on d91ae16a (VERIFIED). CI and nightly use `--fail-medium --exclude-informational --exclude-low` (S re-read `ci.yml:459`, `nightly.yml:65`), contradicting `docs/audits/00-slither-triage.md:10` ("no detector exclusions"). Findings: `arbitrary-send-erc20` x2 (SweepRelayer `_execute`) INTENDED (from = ecrecover'd owner, nonce consumed first); `incorrect-equality` (PolicyAccount `_consume`) FALSE-POSITIVE (integer buckets); inline disables for `timestamp`, `naming-convention`, `assembly` INTENDED. Low/Info detectors MISSING-COVERAGE. Older local evidence (team-j at 365a1c38: 34 contracts, 64 detectors, 0 results) is UNVERIFIED for this SHA.

**CodeQL.** Job success on 7a620ff1 (brief). It found R-01 earlier (resolved). Alert inventory not readable (R-16, SEC-48); a passing job is not issue closure. Status: UNVERIFIED for open alerts.

## 6. Network egress and metadata leakage

Verified by Team E's Chromium walk of built lean (9 views) and full (12 views) artifacts: 0 foreign requests until the user presses Test, then only the user's configured RPC. Lean default has no third-party request, telemetry, service worker, cookies, or built-in RPC. Unavoidable public-chain leakage is stated plainly: **GhostPay does not make payments anonymous.** It only stops a stranger reading "who is paid" off an invoice. Payer address, token, amount, time and router use are public forever.

| Observer | Learns | Mitigation in candidate | Residual (unavoidable or open) |
|---|---|---|---|
| Static host (GitHub Pages/Fastly, self-host, onion operator) | IP (not for onion), UA, load time, files fetched (locale chunk reveals language) | No analytics/SW/3rd parties; fragment never sent; no-referrer | Can serve modified code (SEC-02); GitHub logs IPs |
| Sibling Pages sites (shared origin) | Everything in storage; can script the app | Payments refused on shared origin by default; banner | Full compromise if any sibling is compromised (SEC-01) |
| Settings RPC | IP, Origin, UA, Accept-Language, timing. Pay: invoice chain, payer address (gas estimate), token/amount, tx hash. Scan: announcer log windows, block reads, matched-announcement receipt reads. Sweep: one-time address, nonce, gas, raw tx, destination. Registry: looked-up names | User choice, no default; fixed grid windows + CSPRNG order + jitter; filters name only announcer+topic | IP unless Tor Browser (local proxy broken, SEC-10); exact scan position; matched-announcement reveal; sweep links IP to one-time to destination; fingerprinting (SEC-45) |
| Second RPC | Same windows/blocks; contacted directly even in tor-browser mode | Skipped when local proxy required | IP to a second party |
| Indexer (opt-in, testnet) | IP, windows, timing | Block hashes cross-checked against user RPC | Can omit announcements |
| Relayer (opt-in) | IP, owner (one-time address), destination, token, amount, fee, timing; its own RPC sees simulation/broadcast | Opt-in, click-only; omit/no-referrer/no-store | No transport hides content (SEC-34) |
| Wallet extension and its RPC | Payer account, tx, IP | Outside GhostPay | Documented |
| Network observer (ISP/Wi-Fi) | DNS/SNI of github.io, RPC and relayer hosts; timing; volume | Tor Browser if the user runs it | Not hidden by the page |
| Tor exit | Destination host/SNI, timing | - | Page cannot verify Tor |
| Public chain (everyone) | Payer address, amount, token, time, router call, ERC-5564 announcement; gas-buffer transfer payer to one-time address (links them); sweep one-time to destination; gas-payer linkage (direct sweep needs native gas: buffer = payer link, self-fund = seller wallet link); relayed sweep shows relayer+fee; registry registration links wallet to meta-address permanently; scheme-2 policyHash in calldata (SEC-06) | Fresh destination guidance, delay, relayer (none is unlinkability) | Graph analysis, amount/timing correlation; anonymity set is about "GhostPay router users on that chain" |
| Payer / invoice-link holder | Invoice contents; payer knows the one-time address and can watch the sweep | Passphrase links; address-bar clearing | Browser history/sync keep the link (SEC-21) |
| Device thief / later local user | RPC URLs (may include API keys), scan settings, checkpoints, plaintext meta-address in vault record, ciphertext, history links, tab journals | Keys encrypted; passphrase never stored; idle lock | SEC-22, SEC-23, SEC-03 |
| Browser vendor sync/telemetry | Synced history URLs incl. fragment (INFERRED); local UKM DB holds URL (VERIFIED locally; upload UNVERIFIED) | - | SEC-21 |

Egress inventory (lean default): same-origin files; Settings RPC (per chain, no default); second RPC (Scan only); custom scan endpoint; indexer `GET /v1/logs` (testnet, off); relayer `/v1/quote` `/v1/sweep` (URL empty); wallet extension (in-page EIP-1193); camera (local). Anchors only to github.com, eips.ethereum.org, bitcoin.org, paulmillr.com, viem.sh, react.dev on user click. Full profile adds Esplora/oracle (BTC), Solana RPC, TRON HTTP API, merchant profile URL (Load click), embed postMessage (flag off) and embed SDK files (CORS `*`). Privacy-claim fixes: SEC-28.

## 7. Storage inventory

VERIFIED by code; contents after keygen also by walk and e2e `app.spec.ts:168` (no 64-hex value, no meta fragment, no cookies).

| Location | Key / DB | Contents | Protection | Notes |
|---|---|---|---|---|
| localStorage | `ghostpay.settings.v1` | RPC URLs (may contain API keys), relayer URL, delay, lock timeout, theme, autoClearFragment, pinnedSigners | plaintext (stated in UI) | readable by sibling origins (SEC-01) |
| localStorage | `ghostpay.scanPrivacy.v1`, `ghostpay.scanLanes.v1` | transport, endpoints, indexer URLs, window/jitter | plaintext | |
| localStorage | `ghostpay.scan.checkpoint.v2.<chain>.<sha256(spend\|view)>` | nextBlock, last block hash | plaintext, linkable (SEC-22) | per-key clear |
| localStorage | `ghostpay.locale`; `ghostpay.reconciliation.{enabled,records}.v1` (legacy plaintext ledger, read-only); `ghostpay.merchantKey.v1:<origin>` (full); `ghostpay:durable-wallet-attempts:v1` (full, experimental) | language; legacy records; pinned merchant signer; policy withdrawal journal | plaintext | |
| sessionStorage | `ghostpay.wallet-attempts.v1`, `ghostpay.sweep-attempts.v1` | payer account, chain, tx hash; one-time owner, nonce, status (no keys/destination/amount) | plaintext, tab-scoped | duplicate-payment guard does not span tabs |
| IndexedDB | `ghostpay-encrypted-seller-vault` | keystore JSON scrypt N=2^17 r=8 p=1 + AES-256-GCM; **plaintext `meta.metaAddress`, `meta.signer`** | encrypted secrets | passphrase floor SEC-05 |
| IndexedDB | `ghostpay-tags` | AES-GCM records, HMAC lookup keys; plaintext chainId, timestamps | encrypted | "Delete all tags" |
| IndexedDB | `ghostpay-reconciliation-encrypted` | envelope; key = HKDF(viewing key); scope plaintext | encrypted | |
| IndexedDB | `ghostpay-btc-headers` (full) | public BTC headers | public | |
| Memory only | seller spend/view/signing keys, passphrases, BTC/SOL/TRON seeds | never plaintext in storage; idle lock wipes recoverable keys | best-effort zeroization (SEC-37) | un-backed-up keys survive idle lock (SEC-03) |
| Clipboard | invoice links, requests, meta-address; full: raw seed (two-step) | cleared on lock where allowed | | SEC-13 |
| Downloads | encrypted keystore, encrypted backups, receipts, proof JSON (plaintext amount/time), QR SVG | per file | | |
| Browser-managed | history/session restore keep `#gpi=` URL; HTTP cache | | | SEC-21 |
| None | cookies, Cache Storage, service worker | | | VERIFIED 0 |

No in-app "erase all GhostPay data" (SEC-23); clearing site data on `github.io` wipes all co-hosted sites. Multi-tab: single vault record with onblocked; reconciliation CAS + BroadcastChannel; attempt journals tab-scoped.

## 8. Supply chain and deployment integrity

| Item | Result | Evidence |
|---|---|---|
| npm audit (all) | 30 advisories: 14 high (picomatch<=4.0.7 ReDoS via vite/vitest/typescript-eslint/hardhat; no upstream fix), 16 low; 0 critical (SEC-25) | Team E `npm audit --json` exit 1 |
| npm audit --omit=dev | **0** | exit 0 |
| Lockfile | v3; 814 entries; 678 tarballs all registry.npmjs.org, all sha512; install scripts only in dev; CI uses `--ignore-scripts` | Team E node scan |
| GitHub Actions | 111 `uses:` refs all pinned to full SHAs | `check-actions-pinned.sh` exit 0 |
| Secrets scan | regex scan clean (excludes docs/.github/tests) | `scan-secrets.sh` exit 0; GitHub secret-scanning inventory unreadable (SEC-48) |
| Reproducibility | release tarball + SBOM byte-identical across two clean clones (same machine; full profile) | `repro-check.sh --head` exit 0 |
| Pages build | lean-only, clean env, manifests refused on shared origin, independent verifier, assets byte-identical to lean build | `build-pages.sh` exit 0 |
| Pages artifact authenticity | unsigned; SHA256SUMS only in run summary / 14-day artifact; no SRI; not bound to release trust root (SEC-02, SEC-43) | `pages.yml:106-122,213-261` |
| Branch/tag protection | unevidenced; source comment says none as of 2026-11-04 (SEC-02 merged in SEC-02) | UNVERIFIED |
| Release workflow | signed tag vs default-branch `allowed_signers` (empty: fail-closed), analyzer evidence gate, `npm audit --omit=dev`, attestation, draft-only; builds **full** profile whereas Pages ships **lean** (SEC-32, SEC-47) | gate unexercised on a real tag |
| Self-host | images pinned by tag only, no docker dependabot ecosystem, no HSTS in nginx (SEC-26) | |
| Trust roots | RELEASE_KEY undefined; RELEASE_PUBLIC_KEYS []; allowed_signers empty; no denylist for the public Playwright test key (SEC-44) | S re-read |
| Legacy manifest path | text manifest + runtime fetch + unsigned testnet acceptance still exported (SEC-14) | |
| Live site | probable stale prototype at gh-pages cc8d0794 (SEC-08); origin not asserted post-deploy (SEC-09) | UNVERIFIED |
| Evidence accuracy | packet says post-d91ae16a commits docs-only, but SellerKeys.test.tsx also changed (SEC-39) | |

## 9. Security gates

**(a) Before any public Pages deploy** (demo/testnet, banner on):

1. Decide shared-origin posture: dedicated repo-level custom domain or dedicated account; or recorded written owner acceptance with `GHOSTPAY_PAGES_ALLOW_SHARED_ORIGIN=testnet` and a testnet-keys-only warning (SEC-01).
2. Confirm Pages Source = GitHub Actions; unpublish or overwrite the stale `gh-pages` prototype; smoke the real URL against the dispatched commit (SEC-08).
3. Add a deployed-origin assertion to deploy/smoke (SEC-09).
4. Evidence main protection and `github-pages` environment (main-only, reviewers) (SEC-02).
5. Fix false copy about local proxy and wss; qualify "hides" wording (SEC-10, SEC-19, SEC-28).

**(b) Sepolia beta** (testnet funds only), in addition to (a):

1. Release key ceremony; signed Sepolia manifest passes `validate-deployments` and runtime read-back (SEC-32, SEC-44).
2. Deploy from exact reviewed source (contracts unchanged since beb525dd); read back runtime codehashes; canonical announcer; FEE_RECIPIENT that accepts ETH (SEC-36).
3. Exact-SHA CI 24/24, Echidna 13+11, Slither Medium+, Foundry; Mythril shows no record beyond the 11 dispositioned (SEC-33).
4. Attest Pages SHA256SUMS and publish signed checksums out of band (SEC-02, SEC-43).
5. Local-proxy path works under CSP or is removed from UI/docs, with e2e under real CSP (SEC-10).
6. Extended live egress smoke over all lean views plus a fixture invoice (SEC-46); Firefox and Tor Browser (Standard, Safer) manual run, KDF time recorded (SEC-41).
7. Beta disclosure of vault-less sweep/export without re-auth, or require a vault for beta sweeps (SEC-03); keystore v1 independent-decode vector test (SEC-15).
8. Lean build keeps scheme 2, relayer, BTC/SOL/TRON and 7702/4337 out (VERIFIED by D: `CORE_ORDER`, VITE flag).
9. ADR-0029 moved to Accepted by owner.

**(c) Beta exit (spec 18):** K01-K06 implemented and qualified including independent recovery proof on anvil (SEC-04); re-auth model decided and built (SEC-03); single-keypair envelope shares the keystore primitive, new domain, bytes-built plaintext (SEC-37, SEC-05); keystore doc drift fixed (SEC-15); no secret in fetch/URL/log/storage/clipboard browser tests.

**(d) Scheme-2 deployment:** AUD24-01 salt-only ABI change (SEC-06); N1 resolved by zero-fee factory or specified fail-open (SEC-07); asset-leaf guard / refusal of unsupported-asset invoices (SEC-11); per-chain L2 minimum delays (SEC-12); ADR-0028 accepted (no custodial guardians) (SEC-31); 7702 delegate clearing policy (SEC-35); Echidna/Mythril/Slither coverage for factory, PolicyRouter, payer-hiding (SEC-17).

**(e) Mainnet / release tag:** all of the above, plus: external professional audit of contracts **and** client key management; Mythril disposition mechanism or accepted permanent block (SEC-33); full-severity Slither triage and extended Echidna (SEC-17); passphrase floor hardened (SEC-05); re-auth implemented (SEC-03); trust roots populated, signed tag, reproducible build and published digests (SEC-32); branch protection, `v*` tag ruleset, environment reviewers (SEC-02); release gate exercised once on a rehearsal tag (SEC-47); CodeQL/Dependabot/secret-scanning inventories reviewed (SEC-48); all 73 chain-matrix cells verified (packet blocker 5), mainnet chains enabled one at a time; header-capable host or anti-framing (SEC-18); real wallet, device and browser acceptance.

## 10. Security blockers and dependent features

| Blocker | Gates blocked | Dependent features (from JSON mapping) |
|---|---|---|
| SEC-32 Release key + signed manifest | sepolia-beta, release-tag, mainnet | F-CTR-07, F-DEP-01, F-DEP-02, F-DEP-04, F-WEB-03, F-WEB-06, F-WEB-11, F-WEB-17 |
| SEC-01 Shared origin | pages-deploy, sepolia-beta, mainnet | F-KEY-02, F-KEY-03, F-PROTO-13, F-WEB-08, F-WEB-20, F-WEB-21 |
| SEC-02 Deploy trust boundary / branch protection | pages-deploy, sepolia-beta, release-tag, mainnet | F-CTR-07, F-FUT-11, F-HOST-03, F-WEB-21 |
| SEC-08 Stale live prototype | pages-deploy, sepolia-beta | F-WEB-21 |
| SEC-09 Origin gate | pages-deploy, sepolia-beta | F-WEB-21 |
| SEC-10 Broken local-proxy scan path | sepolia-beta | F-FUT-04, F-FUT-26, F-FUT-34, F-NET-01, F-WEB-07, F-WEB-18, F-WEB-22 |
| SEC-03 Vault-less re-auth | beta-exit, mainnet | F-KEY-01, F-KEY-02, F-KEY-03, F-KEY-04, F-KEY-09, F-KEY-10, F-KEY-12, F-WEB-07, F-WEB-08, F-WEB-11, F-WEB-12, F-WEB-16, F-WEB-21 |
| SEC-04 Spec 18 / independent recovery | beta-exit, mainnet | F-CLI-03, F-CLI-05, F-FUT-17, F-FUT-33, F-FUT-40, F-KEY-02, F-KEY-03, F-KEY-07, F-KEY-08, F-KEY-09, F-KEY-10, F-KEY-11, F-KEY-12, F-PROTO-13 |
| SEC-05 Passphrase floor | mainnet | F-CLI-03, F-KEY-02, F-KEY-03, F-KEY-05, F-KEY-14, F-PROTO-13, F-WEB-09 |
| SEC-06 AUD24-01 policyHash | scheme2-deploy | F-AA-01, F-AA-02, F-POOL-08, F-WEB-15 |
| SEC-07 N1 fee-token freeze | scheme2-deploy | F-AA-01, F-AA-03 |
| SEC-11 Scheme-2 asset lock-in | scheme2-deploy | F-AA-01, F-AA-02, F-WEB-15 |
| SEC-12 L2 timelock bound | scheme2-deploy | F-AA-01, F-AA-03 |
| SEC-31 ADR-0028 recovery | scheme2-deploy | F-AA-01, F-AA-05 |
| SEC-35 7702/4337 delegation | scheme2-deploy | F-AA-04, F-POOL-08, F-RLY-05 |
| SEC-17 Analyzer coverage | mainnet | F-AA-01, F-AA-03, F-CTR-01, F-CTR-02, F-CTR-03, F-CTR-05, F-CTR-06, F-CTR-07, F-DEP-04, F-POOL-02, F-POOL-08, F-POOL-09 |
| SEC-33 Mythril gate | release-tag | F-CTR-07, F-DEP-04 |
| SEC-41 Tor/Firefox unqualified | sepolia-beta | F-FUT-34, F-HOST-02, F-KEY-02, F-KEY-03, F-NET-01, F-PROTO-10, F-PROTO-13, F-WEB-13, F-WEB-20, F-WEB-24 |
| SEC-46 Live egress smoke | sepolia-beta | F-WEB-21, F-WEB-22 |

Spec 18 chain: SEC-04 and SEC-03 jointly gate F-KEY-07..F-KEY-12 (K01-K06) and F-PROTO-13; F-KEY-09/10/12 need the re-auth decision before UI work. Scheme-2 chain: F-AA-01, F-AA-02, F-AA-03, F-AA-05, F-WEB-15 stay experimental and out of the lean build until (d) closes. Pages chain: F-WEB-21 plus every lean beta-core feature served from Pages depends on (a).

## 11. Missing test and analyzer coverage

1. Independent (non-GhostPay) decode of a fixed keystore v1 vector in CI (template: D's `indep-keystore-recovery.mjs`) (SEC-15, SEC-04).
2. Vault-less seller sweep/export/raw-export end to end; `keyVault.test.ts:241` currently pins "no step-up" (SEC-03).
3. Echidna: permit entry points, forged signers, hostile/reentrant tokens and destinations, policy unlimited leaf, factory, PolicyRouter, L2 timestamp model (SEC-17).
4. Complete Mythril runs for Router and PolicyRouter; any analysis of payer-hiding, pool and confidential contracts; Slither Low/Info triage (SEC-17).
5. Scheme-2 L2 timing tests; refusal of assets without a limits leaf (SEC-11, SEC-12).
6. K04/K06 recovery proofs (anvil plus independent tool; offline master recovery) (SEC-04).
7. Browser no-secret-egress tests for export flows; extended post-deploy smoke across all views (SEC-46).
8. A second independent EIP-5564 implementation cross-check (vectors come from ScopeLift only) (SEC-38).
9. pool-sdk backup bounds/strength (SEC-16); Pages framing test (SEC-18); bundle-scan rule proving legacy unsigned manifest path absent (SEC-14).
10. E2E under the real CSP for scan transports (SEC-10); release gate rehearsal on a real tag (SEC-47); multi-tab duplicate-payment protection (journals are tab-scoped).
11. Firefox/Tor Browser/WebKit runs (SEC-41); `deploy/tor` and nginx never built or run.

## 12. Owner decisions required

1. Hosting origin: dedicated domain/account, or written acceptance of the shared origin for testnet only (SEC-01, SEC-09); ADR-0029 Accept/Reject.
2. Repo protection: branch protection, `v*` tag ruleset, environment reviewers; retire `gh-pages` prototype (SEC-02, SEC-08).
3. Release trust roots: manifest key ceremony, `allowed_signers`, out-of-band digest channel (SEC-32).
4. Re-auth model for vault-less sellers: require vault/verified backup, session unlock secret, or WebAuthn UV step-up; clipboard rule for raw keys; BTC/SOL/TRON seed reveal parity (SEC-03, SEC-13).
5. Mainnet passphrase floor and generated-passphrase default (SEC-05).
6. Mythril disposition mechanism, or accept permanent release block (SEC-33).
7. N1: zero-fee factory vs fail-open `_collectFee` (SEC-07); AUD24-01 salt-only ABI change (SEC-06); per-chain L2 minimum delays (SEC-12); accept/reject ADR-0028, no custodial guardians (SEC-31); 7702 clearing policy (SEC-35).
8. FEE_RECIPIENT account type (SEC-36).
9. Local-proxy: fix the CSP (allow loopback) or remove the option and wss (SEC-10, SEC-19).
10. Grant access to (or export) CodeQL/Dependabot/secret-scanning inventories (SEC-48); merge order with PR #204 (SEC-49).

## 13. Unverified items and why

- Foundry, Echidna, Mythril, Slither outputs: tools not installed; CI artifact downloads 403. Only job conclusions are VERIFIED. Mythril on the previous qualified head `d91ae16a` ("10 identical records, R8 absent") and on `7a620ff1` (failure with exactly the 11 dispositioned records, run 44242366379) rests on the promotion packet.
- Live Pages state, Pages Source setting, environment rules, branch protection/rulesets: github.io blocked by sandbox proxy; repo settings reads not permitted (SEC-08, SEC-02); the "no protection" statement is a dated (2026-11-04) source comment.
- CodeQL, Dependabot, secret-scanning inventories (R-16, SEC-48).
- L2 protocol windows (OP Stack, Arbitrum) in SEC-12: INFERRED from public design.
- Tor Browser, Firefox, WebKit behaviour: only Chromium available; KDF slowdown inferred from V8 `--jitless` (scrypt N=2^17 about 28 s vs 0.5 s) (SEC-41).
- Whether Chrome UKM or Sync uploads the fragment URL (SEC-21); real GPU scrypt cost behind SEC-05 is INFERRED.
- Lean bundle contents re legacy manifest path (SEC-14): dist rebuild forbidden in shared worktree.
- Scheme-2 client guard for assets without a leaf (SEC-11): not traced end to end.
- `deploy/tor` and nginx not built or run; no real RPC, wallet or relayer contacted.
- Prior items R-03, R-04, R-06, R-16, R-17 carried from `REVIEW_FINDINGS.md@71abc7e5` without Team S re-verification.
- Feature mapping is path-based plus curated; some matches are broader than the true blast radius.

---
Not an audit. Findings are leads with evidence levels; mainnet requires a professional audit.
