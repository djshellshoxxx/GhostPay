# Blockers and owner decisions (post-consolidation audit, 2026-11-18)

Audited source: product source `7a620ff19ecf4e43ec568896c34188f5b2dcd3fc` (consolidated candidate, PR
[djshellshoxxx/GhostPay#203](https://github.com/djshellshoxxx/GhostPay/pull/203); PR head `71abc7e5` = + docs).
`main` = `cfaebeeae22f292cb0bb3074619b2603cb738367`. Finding IDs refer to
[SECURITY_AND_PRIVACY_GAP_ANALYSIS.md](SECURITY_AND_PRIVACY_GAP_ANALYSIS.md) source IDs (D-xx crypto/contracts,
E-xx browser/privacy, R-xx prior campaign), feature IDs to [FEATURE_COMPLETION_MATRIX.md](FEATURE_COMPLETION_MATRIX.md).

Types: **OD** owner decision (a policy/design choice only the owner can make) · **OA** owner action (an operation
needing owner rights or keys) · **EX** external dependency (people, devices, networks or audits outside this
repository) · **AC** access gap (information this environment could not read) · **TB** technical blocker that the
next engineering session can remove itself.

**Rule while anything here is pending:** the next session implements every decision-independent part, ships the
fail-closed default named in each row, and never treats silence as approval.

## 1. Owner decisions (OD)

| ID | Decision | Options | Recommendation | Fail-closed default until decided | Evidence | Blocks |
|---|---|---|---|---|---|---|
| OD-01 | How mandatory re-authentication works for a seller session with **no encrypted vault** (today `authorizeKeyExport` returns `undefined`, so sweep and master-keystore export have no step-up) | (a) require creating an encrypted vault before any secret export or sweep; (b) typed confirmation + shortened idle lock; (c) WebAuthn user-verification step-up (origin-bound; weak on the shared github.io origin) | (a) for every secret export (K03–K06, raw key); (a) or explicit vault prompt for sweep | Secret export refuses in vault-less sessions; sweep behaviour unchanged but warned | D-01, R-15, `apps/web/src/lib/keyVault.ts:257-266,328-333` | F-KEY-09, F-KEY-10, F-KEY-12; mainnet |
| OD-02 | Whether a raw private key may ever be copied to the clipboard; whether BTC/SOL/TRON seed reveal must match | (a) never: file download + held-reveal only; (b) manual copy after re-auth + second confirmation, auto-clear | (a) for raw keys; align BTC/SOL/TRON reveal to re-auth + no clipboard | No clipboard path for any new secret export | spec 18 wording item 1 (NEXT_PHASE_QUEUE), D-08, `SecretBackup.tsx` precedent | F-KEY-10; promotion of BTC/SOL/TRON beyond experimental |
| OD-03 | Release gate policy for the 11 Mythril records (Mythril 0.24.8 cannot suppress individual findings) | (a) approve a finding-specific, source-matched disposition file verified in `release.yml` (keyed to contract, function, SWC, PC/source map, compiler + bytecode hash; any new/changed record fails); (b) keep every release blocked until contracts change | (a), reviewed by a human, plus an external audit before mainnet | Release tags stay blocked (current gate) | D-16, R-08, R-10, `docs/audits/mythril-14290880802-*-dispositions.md` | F-CTR-07; any release tag |
| OD-04 | N1 fee-token freeze residual (scheme 2) | (a) zero-fee factory for upgradeable / fee-switch tokens; (b) specified fail-open `_collectFee` (spec change); (c) token allowlist of non-upgradeable tokens | (a) or (c); (b) only with a spec + audit | Scheme 2 stays undeployed | D-05, R-11, `PolicyAccountFactory.sol:128-166` | any production scheme-2 factory |
| OD-05 | AUD24-01 policy-hash linkability (every scheme-2 payment exposes the seller's fixed `policyHash`) | (a) salt-only ABI change before any deployment; (b) accept and document | (a) — privacy-first constraint | Scheme 2 stays undeployed | D-04, `IGhostPayPolicyRouter.sol:18` | scheme-2 deployment; D03 queue item |
| OD-06 | Hosting origin for the static beta (shared `djshellshoxxx.github.io` origin is shared with 35 other Pages sites, which can read/rewrite GhostPay storage and script the app) | (a) dedicated origin (repo custom domain or dedicated account/org); (b) written acceptance of the shared origin for testnet-only assets + persistent warning | (a) before any public beta; (b) only for a time-boxed internal test | Build keeps refusing manifests on a shared origin (current) and the origin gate is hardened (E-03) | E-01, E-03, GP-PAGES-01, ADR-0029 | F-WEB-21, F-WEB-17, Sepolia beta |
| OD-07 | Release trust roots (Git tag signing key in `allowed_signers`; secp256k1 deployment-manifest signing key; rotation) | One combined key vs separate keys; hardware-backed vs file | Separate keys: SSH tag-signing key (hardware-backed) + offline manifest key; document rotation in an ADR | Payments disabled in default build; release fails closed (current) | D-15, F release gate 1, `.github/release-signers/allowed_signers` (0 keys) | F-DEP-01, F-WEB-17, B03–B06, any release |
| OD-08 | Accept ADR-0029 (GitHub Pages static beta) | Accept / amend / reject | Accept after OD-06 and OD-07 are recorded | Pages deploy stays dispatch-only, unexercised | `docs/adr/ADR-0029-github-pages-static-beta.md:3` ("Proposed") | B01, F-WEB-21 |
| OD-09 | Passphrase floor for master keys and raw exports | (a) entropy floor (≈80 bits) with an offline estimator, generated diceware passphrase as default; (b) keep current heuristic (score ≥ 2, 14 chars) | (a) for master/raw exports; keep current floor for low-value settings | New spec 18 exports use the stricter floor | D-03 | F-KEY-12, mainnet |
| OD-10 | Spec 18 open wording (deep-scan `tagMatches=false` eligibility and which viewTag the public record carries; telemetry wording; flow-1 RPC = user-selected, no fallback; lean-bundle import boundary) | Decide each | Adopt the product rules: user-selected RPC with no fallback, no telemetry at all, lean boundary enforced; deep-scan matches exportable only after full derivation check, public record carries the announced viewTag | Engineering applies the recommendation and records it in spec 18 for owner sign-off | NEXT_PHASE_QUEUE "Spec 18 wording", R-15 | F-KEY-07..F-KEY-12 |
| OD-11 | Per-chain L2 minimum delays for scheme 2 (`MIN_DELAY` = 1 h is below L2 forced-inclusion bounds) | Per-chain constants vs global | Per-chain floor ≥ documented forced-inclusion window + margin (numbers to be source-verified) | Scheme 2 stays undeployed | D-07, R-09 | scheme 2 on L2 |
| OD-12 | ADR-0028 guardian recovery | Accept (non-custodial only) / reject | Reject for beta; revisit with a formal model | No guardian recovery code paths | D-14, `docs/adr/ADR-0028-policy-recovery-authority-model.md` | D04 queue item |
| OD-13 | EIP-7702 delegate-clearing policy and 4337 paymaster stance | Clear after use / persist | Clear after use where supported; experimental only | AA paths stay experimental | D-18, spec 15 | F-AA rows |
| OD-14 | `FEE_RECIPIENT` account type (a non-accepting recipient blocks native payments) | EOA only / contract allowed | EOA (or audited receiver) recorded in the deployment manifest | Deployment checklist requires the choice | D-19 | F-DEP-04 |
| OD-15 | Scope of PR [#204](https://github.com/djshellshoxxx/GhostPay/pull/204) (agent guide, package map, skills) and merge order vs #203 | Merge #204 after #203 (resolve `ci.yml` one line + `CLAUDE.md` add/add) / fold into the next integration branch / close | Merge #203 first; then re-apply #204 with a regenerated `PACKAGE_MAP.md` | Next session may port #204 content into its integration branch only as a separate, reviewable commit | C class A, A §5 | developer tooling only |
| OD-16 | Locale policy: 24 locales listed, 4 shipped (en/es/ar/ja), all machine-drafted, none natively reviewed | Ship only reviewed locales / ship drafts labelled "machine translation" / hide drafts | Ship en; label es/ar/ja as drafts until native review; trim the selector to shipped locales | Selector lists only shipped locales | F-I18N-02, B2 finding 2 | F-I18N-02 |
| OD-17 | Shopify integration (stub: docs + 41-line Liquid snippet) and other merchant plugins | Build / keep as documented stub / remove | Keep as stub, labelled; WooCommerce/PrestaShop stay shim-tested only | No marketing as supported | F-INT rows | F-INT-03 |
| OD-18 | Major dependency upgrades (`@scure/*` 2.x crypto, TypeScript 7, hardhat 3) | Upgrade individually / defer | Defer crypto major until vectors + independent re-verification; group minors via a fresh Dependabot run | Minor/patch refresh only | C class B (#85, #87, #176) | none |
| OD-19 | Branch retirement and PR closure plan (RETIREMENT_PLAN.md + this audit's class C/D/E lists) | Approve / amend | Approve only after #203 merges and a fresh census; preserve every non-ancestor head as a tag/bundle first | Nothing deleted or closed | C §5–6, RETIREMENT_PLAN | none (hygiene) |

## 2. Owner actions (OA)

| ID | Action | Why | Evidence | Unblocks |
|---|---|---|---|---|
| OA-01 | Enable branch protection or rulesets on `main` requiring the CI, Pages, Beta, Integration, Hosting, CLI-operator and CodeQL checks; add a `v*` tag ruleset; confirm `release` and `github-pages` environment reviewers | `main` reported unprotected; environment settings unreadable here | R-07, E-04 (UNVERIFIED here: API 403) | Safe promotion of #203; deploy trust boundary |
| OA-02 | Mark PR #203 ready and merge it with a merge commit or fast-forward (never squash) after OA-01 | `release.yml` reads `scripts/verify-tag.sh` and `.github/release-signers/` from `main`, which lack them | F release gate 2; PROMOTION_PACKET | Release pipeline; Pages workflow on main |
| OA-03 | Add the release signing key(s) per OD-07 | 0 keys in `allowed_signers`, `RELEASE_PUBLIC_KEYS` empty | D-15 | Signed manifests, releases |
| OA-04 | Broadcast the authentic Sepolia (11155111) deployment, verify sources, sign the manifest (B02–B03) | Engineering can prepare but not broadcast with owner keys | F-DEP-04, NEXT_PHASE_QUEUE B02/B03 | F-DEP-01..04, F-WEB-17, Sepolia beta |
| OA-05 | Confirm GitHub Pages source = GitHub Actions and retire/unpublish the stale `gh-pages` prototype (`cc8d0794`, 2026-10-21) | Prototype probably live, loads unsigned manifests at runtime | E-02 (SUSPECTED), C class F | Sepolia beta |
| OA-06 | Dispatch the Pages deploy (main-only, `deploy=true`) after OD-06/OD-07/OD-08 and run live smoke | Deploy is owner-gated by design | F release gate 7 | Public static beta |
| OA-07 | Grant access to or export CodeQL, Dependabot and secret-scanning alert inventories | APIs returned 403 / proxy-blocked to both campaigns | R-16 | Security inventory closure |

## 3. External dependencies (EX)

| ID | Dependency | Blocks only |
|---|---|---|
| EX-01 | Real wallet acceptance (injected EIP-6963 wallets, hardware wallets) on Sepolia | external_acceptance of pay/sweep rows |
| EX-02 | Firefox, WebKit/Safari, Tor Browser (Standard/Safer; JIT-less scrypt ≈ 28 s INFERRED), real mobile devices | browser-compatibility gates (E-18) |
| EX-03 | Screen-reader / assistive-technology qualification | F-A11Y-03 |
| EX-04 | Native-language review for es/ar/ja | F-I18N-02 |
| EX-05 | Independent professional security audit (contracts + client key handling) | mainnet; OD-03 option (a) |
| EX-06 | Provider/primary-source evidence for 73 chain-matrix cells (42 chain, 27 token, 4 feed) | F-DEP-03 release mode |
| EX-07 | Live nodes/services for full-profile acceptance (bitcoind, BlindBit, relayer deployment, SOCKS/Tor proxy) | full-profile external rows |

## 4. Access gaps in this audit (AC)

| ID | Not verifiable here | Effect |
|---|---|---|
| AC-01 | Branch protection, rulesets, environments, Pages source settings (API 403 / MCP connection failure) | E-04 stays UNVERIFIED |
| AC-02 | Live github.io site content (proxy 403) | E-02 stays SUSPECTED |
| AC-03 | Mythril/Echidna per-record artifact contents (blob 403); only job conclusions and logs | analyzer re-triage relies on the prior disposition records + code reading |
| AC-04 | Historical consolidation package ZIP (`GhostPay_Consolidation_Execution_Package.zip`) not supplied | prior plan reconstructed from in-tree successors (POST_CONSOLIDATION_AUDIT §2) |

## 5. Technical blockers the next session removes itself (TB)

| ID | Blocker | Evidence | Fix direction |
|---|---|---|---|
| TB-01 | `release.yml` `verify` runs monolithic `npm test` with `REQUIRE_ANVIL=1`; payer-sponsor and external-pools packages fail without circuits/artifacts (reproduced locally; INFERRED on GitHub) | F release gate 5 | Mirror CI's per-workspace anvil policy in release verify; dry-run via a dispatchable copy |
| TB-02 | Local-proxy scan mode blocked by the app's own CSP; docs claim it works; `wss://` accepted but unsupported | E-05, E-06 | Make it work under a CSP that allows only the selected loopback origin in the full/self-host profile, or remove it from lean UI and docs; drop `wss` |
| TB-03 | Shared-origin gate trusts the declared `GHOSTPAY_PAGES_ORIGIN`; deployed `page_url` never checked | E-03 | Assert the deployed origin in the Pages workflow and at runtime |
| TB-04 | No step-up path for vault-less sessions (implementation part of OD-01) | D-01 | Implement the chosen re-auth model; default refuse |
| TB-05 | No GhostPay-independent recovery tool; CLI scans but cannot derive keys or sweep | D-02 | Spec 18 K01–K06 + offline recovery reference tool and vectors |
| TB-06 | `scripts/test-reconciliation-idb.mjs:71` uses the old `invalidateFrom` signature (exits 1, not in CI); `apps/web/deployments/README.md:37` names missing `validate:deployments` script | B1b D2/D3, B1a | Fix and add to CI |
| TB-07 | Lean build offers the payer gas buffer on v1 ERC-20 invoices contrary to Pages docs; no lean/real-chain test | B1b D1 | Decide (doc or code) and add a lean test |
| TB-08 | CLI `chain-solana`/`chain-tron` meta-address formats incompatible with the web `solana-stealth`/`tron-adapter` formats | B3 (confirmed) | Consolidate on one format with vectors |
| TB-09 | 56 of 60 `examples/` tests and the anvil/circuit suites (payer-sponsor, railgun, privacypools, pool-relayer, pool-circuits) do not run in PR CI | F gaps 1–2 | Add to nightly or a path-filtered job |
| TB-10 | Documentation drift: promotion packet "docs-only" claim (R-18 test change), PRIVACY_THREAT_MODEL stale import claim, overclaim copy (E-17 list), stale chain-adapters README/ADR-0018 text | A §6, E-16, E-17, B1a | Correct text; no product change |

## 6. Decisions made by this audit (assumptions, reversible)

1. The audit target is product source `7a620ff1`, the previous campaign's CI-qualified head, not `main`; `main` is an ancestor and receives everything only through the owner's merge of #203.
2. The repository clone was shallow when the first census ran; all branch numbers in this package come from the full-history re-run (`branch_census_current.json`; the shallow file is kept only as a superseded record).
3. Feature percentages are recomputed from weighted requirements by a script; team headline numbers are not used where they disagree. Spec 18 is counted once (F-KEY-07..12).
4. No branch deletion, PR closure, merge, deployment, signing or publication was performed or is recommended without owner approval.
