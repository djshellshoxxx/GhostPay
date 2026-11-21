# GhostPay implementation sequence — next phase (2026-11-18)

Audited product source `7a620ff19ecf4e43ec568896c34188f5b2dcd3fc`. PR #203 head `71abc7e5` = 7a620ff1 + 4 docs files (VERIFIED `git diff --name-only 7a620ff1 71abc7e5`: GHOSTPAY_MASTER_COMPLETION_LEDGER.md, PROMOTION_PACKET.md, REVIEW_FINDINGS.md, VALIDATION_MATRIX.md). `main` `cfaebeea` does NOT contain 7a620ff1 (VERIFIED `merge-base --is-ancestor`).

Inputs reused, not redone: lost-team per-feature registry (64 unfinished beta-core/beta-supporting/full-profile rows: chosen strategy, 6-way comparison, estimates, IC), `final/BLOCKERS_AND_DECISIONS.md` (OD/OA/EX/TB), `final/security_findings.json` (SEC-01..49), `final/BRANCH_RECOVERY_MATRIX.md` §6, `NEXT_PHASE_QUEUE.md` (K/B/D), `out/F/TESTING_AND_RELEASE.md`. Registry: `ws_registry.json` (27 WS). Execution: `PARALLEL_AGENT_EXECUTION_PLAN.md`. Per-feature acceptance: `FEATURE_ACCEPTANCE_CRITERIA.md` (G-A), section = feature ID.

**Every duration is an ESTIMATE** in engineer-days `[lo–hi]` (rows: lost team; new items: G-B). Elapsed times come from a list-scheduling simulation (≤6 workers + 1 coordinator lane, +10–15 % independent-review overhead per worker item, rolling merges, owner/external latency = 0) — INFERRED, not measured. Script: the audit's scratch `model.py` (`simulate`, `trace`, `check_ownership`), not packaged; reproduce from `ws_registry.json` estimates.

## 0. Rules

- **Wave** = priority class (what goes first). **CP** = integration checkpoint (when it lands). An item may start ahead of its wave when deps are met and its owned paths are free (ready queue); a lower-priority item never takes a worker a higher one is waiting for. Critical-path items (K01, K02, K03, K04, strict verifier, passphrase tier) are scheduled with wave-1 priority.
- **Fail-closed defaults** (BLOCKERS rule): implement every decision-independent part, ship the default named for the pending OD, never treat silence as approval. Defaults used here: §6.
- **Rolling merge**: an item merges into `ws/WS-00-integration` once reviewed + targeted tests green; a CP is a full-gate run on one recorded SHA.
- **Frozen** (no WS owns them): `packages/contracts/src/**` (unchanged since `beb525dd`; Sepolia deploys exact reviewed source), `packages/core-crypto/src/**`, `test-vectors/scheme1.json` (F-KEY-07 REG). Change = owner approval + re-review.
- **IDs**: canonical only (OD-01..23, OA-01..07, EX-01..07, TB-01..10, SEC-01..49). Lost-team OD numbers remapped per coordinator (04→OD-07, 05→OD-08, 07→OA-01, 08→OA-05, 09→OA-04, 10→OA-06, 11→OD-09, 12→TB-02, 13/15→OD-21, 14→OD-20, 16→TB-07, 17→OD-22). Exception, flagged: lost-team OD-16 on F-KEY-05, F-WEB-06, F-WEB-26, F-WEB-04, F-CLI-06 meant "owner acknowledges an accepted limitation", not the payer buffer; recorded as *owner-ack (no canonical ID)*, not TB-07. Locale rows also carry OD-16 (locale sub-decision of OD-20).
- **Lost-team checkpoint names** in row text map: their CP-2 (format freeze) = CP-2 here; their CP-3 (step-up) = CP-2 here (WS-07.2 merges with the freeze); their CP-5 (literal allowlist 0) = CP-5; C-03 (CI wiring) = WS-20.2; C-06 (Firefox/WebKit runs) = coordinator task at CP-5; C-08 (Pages origin assertion) = WS-04.1 → pages.yml via WS-20.1; attestation WS-20.5; B-RQ-1 (exact-SHA CI) = CP-7 gate; RV-* reviewer roles = PARALLEL_AGENT_EXECUTION_PLAN §7.
- Columns: **Par** = can run concurrently with other WS (items inside one WS are sequential, one agent per WS); **Gate** = `start` needed for Sepolia static beta start, `exit` needed for beta exit, `none` otherwise; **Status** = UB unblocked / BLK blocked, then owner/external IDs.

## 1. Waves

### Wave 0 — Start / rebaseline  (Σ 0.7–1.5 d, 4 items)

| Item | WS | Refs | Strategy | Est d | Deps | CP | Par | Gate | Status |
|---|---|---|---|---|---|---|---|---|---|
| WS-00.1 | WS-00 | start-commit rule | implement | 0.1–0.25 | CP-0 | CP-0 | coord | none | UB |
| WS-00.2 | WS-00 | toolchain | implement | 0.25–0.5 | CP-0 | CP-0 | coord | none | UB |
| WS-00.3 | WS-00 | baseline gates | implement | 0.25–0.5 | CP-0 | CP-0 | coord | none | UB |
| WS-00.4 | WS-00 | census | implement | 0.1–0.25 | CP-0 | CP-0 | coord | none | UB |

- `WS-00.1` Apply start-commit rule (PLAN §2); `git checkout -B <designated branch> $START` in the main checkout (prompt section 5 step 3); record SHA + tree in BASELINE.md
- `WS-00.2` Foundry v1.8.5 from GitHub release tarball (sha256 recorded; foundry.paradigm.xyz blocked), solc 0.8.28 solc-static-linux via FOUNDRY_SOLC (binaries.soliditylang.org blocked), Chromium path, `npm ci --ignore-scripts`, `npm run build:libs`
- `WS-00.3` Run G-FULL on start commit; compare with CI 44242366118 (web 2,749 passed/1 skipped; e2e full 78/1, lean 66/3; forge 490 passed); record in BASELINE.md
- `WS-00.4` Fresh read-only branch census (refs at time T) before any retirement talk (OD-19 stays pending)

### Wave 1 — Critical security + correctness defects  (Σ 8.75–17.55 d, 13 items)

| Item | WS | Refs | Strategy | Est d | Deps | CP | Par | Gate | Status |
|---|---|---|---|---|---|---|---|---|---|
| WS-00.5 | WS-00 | SEC-39, TB-10 | repair | 0.05–0.1 | CP-0 | CP-0 | coord | none | UB |
| WS-01.1 | WS-01 | SEC-10, SEC-19, TB-02 | repair | 1–2 | CP-0 | CP-1 | Y | start | UB |
| WS-01.2 | WS-01 | F-NET-01, SEC-20, SEC-27, SEC-45, SEC-10, SEC-19, TB-02 | repair | 1.6–3 | CP-0 | CP-1 | Y | start | UB |
| WS-02.1 | WS-02 | F-WEB-23, SEC-28, SEC-21 | repair | 0.75–1.1 | CP-0 | CP-1 | Y | start | UB |
| WS-02.2 | WS-02 | F-DOC-01, SEC-21, SEC-28 | defer | 0.25–0.85 | CP-0 | CP-1 | Y | start | UB: copy fixes now; translation later; OD-20,OD-16 |
| WS-02.3 | WS-02 | TB-10, SEC-17 | repair | 0.25–0.75 | CP-0 | CP-1 | Y | none | UB |
| WS-04.1 | WS-04 | SEC-09, TB-03 | repair | 0.5–1 | CP-0 | CP-1 | Y | start | UB |
| WS-04.2 | WS-04 | SEC-24 | repair | 0.5–1 | CP-0 | CP-1 | Y | start | UB |
| WS-04.3 | WS-04 | SEC-40 | repair | 0.1–0.25 | CP-0 | CP-1 | Y | none | UB |
| WS-07.1 | WS-07 | SEC-03, SEC-40, TB-04 | repair | 1.25–2.5 | CP-0 | CP-1 | Y | start | UB: fail-closed default; model choice OD-01 later; OD-01 |
| WS-18.1 | WS-18 | SEC-05, OD-09 | implement | 1.75–3.5 | CP-0 | CP-1 | Y | exit | UB: stricter floor for new exports is the OD-09 default; existing-flow floor waits for OD-09; OD-09 |
| WS-18.2 | WS-18 | SEC-41 | repair | 0.25–0.5 | WS-18.1 | CP-1 | Y | none | UB |
| WS-20.1 | WS-20 | TB-01 | repair | 0.5–1 | CP-0 | CP-1 | coord | none | UB |

- `WS-00.5` Verify packet at start commit: at 71abc7e5 PROMOTION_PACKET.md:15-16 already names 7a620ff1 + the R-18 SellerKeys.test.tsx delta (VERIFIED) -> SEC-39 closed by the #203 head; record in BASELINE.md, add erratum only if the start commit differs
- `WS-01.1` Lean: remove local-proxy mode from UI + docs; full/self-host: remove the mode by default, or keep it with connect-src loopback entries http://127.0.0.1:*, http://localhost:*, http://[::1]:* (a static meta CSP cannot be narrowed to the chosen port; BLOCKERS TB-02) under RV-SEC review; lean CSP never widened; reject wss:// in checkRpcUrl and drop `wss:` from connect-src (index.html, _headers, nginx, infra proxies, csp.mjs); Playwright test under the real meta CSP; fix docs/specs/10 mode b (docs/pages/README.md:49 via WS-04.4)
- `WS-01.2` F-NET-01 rows IC (OHTTP vectors; credentials omit/no-store/no-referrer in chain-adapters rpc.ts + net-transport; Tor copy); PRIVACY_THREAT_MODEL 1.1/5 refreshed (SEC-27); random JSON-RPC ids or documented (SEC-45); embedHost.ts:8 comment fix; privacyInvariants extended to chain-adapters + net-transport
- `WS-02.1` E-17 strings (en.json via coord-request; policy-scheme.md:233; README.md:5; docs/pages via WS-04.4) + scripts/tests/privacy-claims.test.mjs banned-phrase test
- `WS-02.2` docs/user: browser/cloud history sync of invoice fragments (E-08); translated docs stay OD-16/EX-04 gated
- `WS-02.3` TB-10 remainder: stale chain-adapters README text; Slither "no detector exclusions" claim (docs/developer/security-model.md, docs/audits/00-slither-triage.md) corrected to the CI reality (Low/Info excluded)
- `WS-04.1` smoke.mjs/smoke-url.mjs/build-pages.sh: assert new URL(page_url).origin === GHOSTPAY_PAGES_ORIGIN; any origin serving other project sites = shared; pages.yml assertion + cname/https_enforced check via coord-request (WS-20)
- `WS-04.2` scan-bundle.mjs checks every emitted *.html (inline script/CSP); single exported lean exclusion list used by localBuildProfile.mjs and scripts/pages/verify-pages-site.mjs
- `WS-04.3` Pages banner link (build-pages.sh) target=_blank rel="noopener noreferrer"
- `WS-07.1` keep `authorizeKeyExport` returning undefined for the keystore v1 backup in vault-less sessions (keyVault.ts:257-266; it is the only encrypted backup of in-memory keys, BLOCKERS OD-01) and add a disclosure + typed confirmation before that download; keyVault.test.ts:241 pin kept and extended (vault-less v1 backup allowed after confirmation; keys tied to a vault need its passphrase); new spec-18 exports refuse without a vault through WS-07.2 `requireStepUp`; vault-less sweep warning + beta disclosure copy (coord en.json); beforeunload guard while backup unverified (SEC-40 part 2)
- `WS-18.1` Extract estimator (keystore-portable.ts:182-216) to passphrase-policy.ts; add `high` tier; generated passphrase offered as default in keystore/vault creation with explicit override; no network, bundled wordlist, lean size checked
- `WS-18.2` KDF progress text for slow (JIT-less ~28 s) scrypt in keystore/vault flows
- `WS-20.1` release.yml verify: per-workspace anvil policy identical to ci.yml (no global REQUIRE_ANVIL for payer-sponsor, external-pools-railgun/privacypools); local reproduction of the exact verify command list. Also applies the WS-04.1 coord-request: pages.yml deployed-origin assertion + cname/https_enforced check (C-08) at CP-1

### Wave 2 — Consolidation regressions + doc/code drift  (Σ 5.2–10.2 d, 7 items)

| Item | WS | Refs | Strategy | Est d | Deps | CP | Par | Gate | Status |
|---|---|---|---|---|---|---|---|---|---|
| WS-02.4 | WS-02 | F-WEB-09, TB-06 | repair | 0.75–1.1 | CP-0 | CP-1 | Y | none | UB |
| WS-02.5 | WS-02 | F-DEP-05 | repair | 0.6–1.35 | CP-0 | CP-1 | Y | none | UB; OA-04 |
| WS-04.4 | WS-04 | TB-07, SEC-10, SEC-28 | repair | 0.25–0.5 | CP-0 | CP-1 | Y | none | UB |
| WS-05.1 | WS-05 | F-DEP-01, SEC-44, SEC-32, TB-06 | repair | 1.25–2.5 | CP-0 | CP-1 | Y | start | UB: repair now; owner signing later; OD-07 |
| WS-12.1 | WS-12 | SEC-29, SEC-30, #201/#202 recheck | repair | 0.75–1.5 | CP-0 | CP-1 | Y | none | UB |
| WS-20.2 | WS-20 | TB-09, TB-06, F-AA-05, SEC-26 | implement | 1.1–2.25 | WS-02.4 | CP-2 | coord | none | UB |
| WS-24.1 | WS-24 | SEC-14 | repair | 0.5–1 | CP-0 | CP-2 | Y | none | UB |

- `WS-02.4` apps/web/scripts/test-reconciliation-idb.mjs:71 -> invalidateFrom(block, observed, canonicalHash); CI wiring by WS-20.2
- `WS-02.5` chain-adapters README/TODO-VERIFY consistent with quote.ts FEEDS (4 testnet feeds)
- `WS-04.4` docs/pages: TB-07 default (lean keeps v1 payer buffer) in README/RELEASE_MATRIX; E-17 lines 48-49; local-proxy claim :49
- `WS-05.1` README:37 drift; scripts/testnet/sign-manifest.mjs offline helper (stdin/encrypted keystore, no argv secret, no network); validate-deployments refuses the public Playwright key 0x0707..07
- `WS-12.1` Playwright re-run of #201/#202 lost-click/focus paths (POST_CONSOLIDATION_AUDIT §7); ContextHelp hover-leave collapse (SEC-29, UNVERIFIED) reproduce-then-fix; paste-submit focus test (SEC-30)
- `WS-20.2` Nightly/path-filtered job: 56 examples/ tests, anvil/circuit suites (payer-sponsor, railgun, privacypools, pool-relayer, pool-circuits), policy-recovery model tests (F-AA-05 Info), test-reconciliation-idb + seller-vault harness, `npm run test:compiled -w @ghostpay/cli`, independent-recovery vectors (WS-19); dependabot docker ecosystem entries (SEC-26)
- `WS-24.1` Move loadManifest (manifest.ts:52-101) + verifyTextManifestSignature to test utilities; unit test that no production module exports them; bundle-scan rule line in scan-bundle.mjs via coord-request (no WS owns it in window 2)

### Wave 3 — Shared foundations (spec 18 formats, step-up API, independent tool, CI)  (Σ 15.7–26.5 d, 6 items)

| Item | WS | Refs | Strategy | Est d | Deps | CP | Par | Gate | Status |
|---|---|---|---|---|---|---|---|---|---|
| WS-03.1 | WS-03 | F-KEY-07, SEC-38, OD-10, SEC-04 | implement | 4.25–6 | CP-0 | CP-2 | Y (seq in WS) | exit | UB; OD-10 |
| WS-03.2 | WS-03 | F-KEY-08, SEC-15, SEC-37, SEC-05 | implement | 4.25–6.5 | WS-03.1, WS-18.2 | CP-2 | Y (seq in WS) | exit | UB: floor for new formats per OD-09 default (WS-18 `high` tier: generated diceware default or ≈80-bit estimate; never score>=3 alone); OD-09 |
| WS-07.2 | WS-07 | F-KEY-05, TB-04, SEC-03 | repair | 1.7–3.5 | WS-07.1 | CP-2 | Y | none | UB: implements OD-01 choice if recorded, else default (a); OD-01 |
| WS-19.1 | WS-19 | SEC-04, SEC-15, SEC-38, TB-05 | implement | 3–5 | CP-0 | CP-2 | Y | exit | UB |
| WS-19.2 | WS-19 | F-KEY-07, F-KEY-08 | implement | 0.5–1.5 | WS-19.1, WS-03.2 | CP-2 | Y | exit | UB |
| WS-20.3 | WS-20 | CI speed (F §6) | refactor | 2–4 | WS-20.2 | CP-2 | coord | none | UB |

- `WS-03.1` K01 per rows IC; OD-10 recommendation applied + recorded in spec 18 for owner sign-off; D-21 hash convention recorded
- `WS-03.2` K02 per rows IC; golden keystore v1 vector first (test-vectors/keystore-v1-golden.json, injected salt/IV, test-only); docs/developer/byte-layouts.md:195-198 drift fixed (SEC-15); passphrase tier `high` from WS-18 (OD-09 default)
- `WS-07.2` requireStepUp(kind) API (vault passphrase re-entry; pluggable for OD-01 (c) WebAuthn UV); tag-archive export uses it
- `WS-19.1` v1 keystore + CLI backup decode; scheme-1 derivation recomputes 100% of test-vectors/scheme1.json (second 5564 implementation, SEC-38); CI job via coord-request
- `WS-19.2` Decode K01/K02 vectors (stealth-export-v1.json, fixed-salt/IV K02 vectors) at format freeze
- `WS-20.3` Step-timing summary; single coverage pass; build web once per profile, share dist with e2e + lean-candidate; affected-only lint/typecheck only as an extra fast pre-check (the full lint/typecheck still runs on every PR); cost-balanced shards; Mythril and Echidna stay on every PR that touches their paths (contract-analysis.yml:3-12) and on nightly/tag; lean+full e2e share one install. No job, analyzer, test file or required check may stop running on PRs (prompt section 3)

### Wave 4 — Nearly-complete features  (Σ 12.6–23.6 d, 14 items)

| Item | WS | Refs | Strategy | Est d | Deps | CP | Par | Gate | Status |
|---|---|---|---|---|---|---|---|---|---|
| WS-02.6 | WS-02 | F-WEB-06 | defer | 0–0.45 | CP-0 | CP-3 | Y | none | UB |
| WS-10.1 | WS-10 | F-WEB-05, TB-07 | repair | 0.45–1.1 | WS-04.4 | CP-3 | Y | start | UB |
| WS-10.2 | WS-10 | F-PROTO-05 | implement | 0.75–1.35 | WS-10.1 | CP-3 | Y | exit | UB |
| WS-10.3 | WS-10 | F-WEB-26 | repair | 0.7–1.5 | WS-10.2 | CP-3 | Y | none | UB |
| WS-10.4 | WS-10 | F-WEB-02 | repair | 1.5–2.5 | WS-10.3 | CP-3 | Y | none | UB |
| WS-10.5 | WS-10 | F-CTR-06 | implement | 1.5–2 | WS-10.4 | CP-3 | Y | none | UB |
| WS-11.1 | WS-11 | F-PROTO-03 | repair | 0.7–1.5 | CP-0 | CP-3 | Y | none | UB |
| WS-11.2 | WS-11 | F-RLY-01, SEC-34 | repair | 0.25–0.35 | WS-11.1 | CP-3 | Y | none | UB |
| WS-11.3 | WS-11 | F-CLI-01 | repair | 0.25–0.35 | WS-11.2 | CP-3 | Y | none | UB |
| WS-11.4 | WS-11 | F-CLI-03, SEC-04 | implement | 1–2.25 | WS-11.3, WS-19.1 | CP-3 | Y | exit | UB: after WS-19.1 (independent tool) rolling-merges |
| WS-12.2 | WS-12 | F-A11Y-01 | repair | 1.25–2.5 | WS-12.1 | CP-3 | Y | exit | UB |
| WS-12.3 | WS-12 | F-I18N-02 | repair | 0.75–1 | WS-12.2 | CP-3 | Y | exit | UB: OD-16 default = keep today's labelled selector (no trim); OD-20,OD-16 |
| WS-12.4 | WS-12 | F-I18N-01 | repair | 2–4.25 | WS-12.3 | CP-3 | Y | exit | UB |
| WS-12.5 | WS-12 | F-A11Y-03 | implement | 1.5–2.5 | WS-12.4 | CP-3 | Y | exit | UB: protocol now; run is human; EX-03 |

- `WS-02.6` docs/specs/02-* disposition note for rule 2 citing negative.test.ts:200,314; owner acknowledgement requested as OD-23 (engineering never records it)
- `WS-10.1` Lean + full payer-buffer unit tests (keep v1 buffer in lean; docs fixed in WS-04.4)
- `WS-10.2` Spec 05 2C hint on Pay; no network call
- `WS-10.3` payeeTrust decision (ADR note; export internal or wired with tests); owner acknowledgement requested as OD-23 (engineering never records it)
- `WS-10.4` OP-stack sequencer-uptime + grace guard; deviation/USD-peg checks when configured (full profile)
- `WS-10.5` Anvil journey: v2 bufferPolicy -> payment with buffer -> direct sweep paid only from buffer; net asserted
- `WS-11.1` Records only (~0.1 d): F-PROTO-03 is VERIFIED_COMPLETE; the per-log canonical blockHash check exists (`packages/chain-adapters/src/logs.ts:438-460`, tests `logs.test.ts:132-148`, `scanHardening.test.ts:82`); cite it, add no code
- `WS-11.2` REQUIRE_ANVIL=1 relayer suite evidence; relayer metadata/fallback privacy note (SEC-34)
- `WS-11.3` CLI compiled tests evidence
- `WS-11.4` `ghostpay backup create` output decrypted by tools/independent-recovery (no GhostPay code); keys match
- `WS-12.4` literals.test.ts in report mode; allowlist shrinks per CP; 0 by CP-5
- `WS-12.5` Screen-reader protocol doc + log template; AT runs are EX-03

### Wave 5 — Recoverable historical work (#204, 57dcf7e8 harness, qr-colors hunk, dependency refresh)  (Σ 3.05–6.7 d, 4 items)

| Item | WS | Refs | Strategy | Est d | Deps | CP | Par | Gate | Status |
|---|---|---|---|---|---|---|---|---|---|
| WS-02.7 | WS-02 | F-KEY-03, SEC-15 | recover | 0.85–1.75 | WS-02.6 | CP-3 | Y | exit | UB |
| WS-02.8 | WS-02 | F-DOC-02 | repair | 0.7–1.45 | WS-02.7 | CP-3 | Y | none | UB |
| WS-22.1 | WS-22 | #204, OD-15, SEC-49 | recover | 0.5–1.5 | CP-0 | CP-1 | coord | none | UB: OD-15 default: port as separate reviewable commit; OD-15 |
| WS-22.2 | WS-22 | dependency refresh, SEC-25, OD-18 | recover | 1–2 | WS-22.1 | CP-1 | coord | none | UB: OD-18 default: minor/patch only; OD-18 |

- `WS-02.7` Recover 57dcf7e8 apps/web/scripts/test-seller-vault-idb.mjs (R1-R3 + two-tab); independent decode vector moves to WS-19.1
- `WS-02.8` docs/design/qr-colors.md hunk from 400e20f1 (bearer precedence matches qrKinds.test.ts:40-42); #140 wiki text not imported
- `WS-22.1` First coordinator task after CP-0 (agents started earlier use their WS card). Port 2693b08e content: .claude/skills/{ghostpay-affected-checks,ghostpay-package-map,ghostpay-security-invariants}, scripts/agent/{affected,package-map,workspaces}.mjs + workspaces.test.mjs; regenerate PACKAGE_MAP.md on start commit; CLAUDE.md content merge; ci.yml 1-line re-apply
- `WS-22.2` viem 2.57.19, vitest + @vitest/coverage 5.1.0, vite 8.3.8, prettier 3.10.1, @playwright/test 1.65 (browser availability checked), create-pull-request 8 (SHA-pinned); @scure/* 2.x, TypeScript 7, hardhat 3 deferred; picomatch override when the fix ships; full gates + lean bundle diff; rollback to CP-4 slot if triage > 0.5 d

### Wave 6 — Core browser payment workflow prep, short of owner broadcast  (Σ 14.25–24.75 d, 9 items)

| Item | WS | Refs | Strategy | Est d | Deps | CP | Par | Gate | Status |
|---|---|---|---|---|---|---|---|---|---|
| WS-04.5 | WS-04 | SEC-46 | implement | 0.75–1.5 | WS-04.4 | CP-4 | Y | start | UB |
| WS-05.2 | WS-05 | F-DEP-04, SEC-36, OD-14 | implement | 2.25–4 | WS-05.1 | CP-4 | Y | start | UB: broadcast blocked on OA-04; OD-14,OA-04,OD-08 |
| WS-05.3 | WS-05 | F-DEP-03 | implement | 2.25–4 | WS-05.2 | CP-4 | Y | start | UB: cells need B02 evidence; OA-04; EX-06 |
| WS-06.1 | WS-06 | SEC-33, F-CTR-07 | refactor | 2–3.5 | CP-0 | CP-4 | Y | start | UB |
| WS-21.1 | WS-21 | SEC-18 | implement | 0.5–1 | CP-0 | CP-4 | Y | start | UB |
| WS-21.2 | WS-21 | SEC-42 | repair | 0.25–0.5 | WS-21.1 | CP-4 | Y | none | UB |
| WS-24.2 | WS-24 | F-DEP-02, G-NOTE-01 | refactor | 3–5.5 | WS-24.1, WS-05.1 | CP-4 | Y (seq in WS) | start | UB: announcer codehash pin waits for B02/B04 evidence |
| WS-24.3 | WS-24 | F-WEB-17, G-NOTE-01 | repair | 1.75–3 | WS-24.2 | CP-4 | Y (seq in WS) | start | UB: bundling of the real manifest owner-gated; OD-07 |
| WS-24.4 | WS-24 | F-CTR-04, TB-10 | repair | 1.5–1.75 | WS-24.3, WS-05.3 | CP-4 | Y | none | UB: pin values after B04; OA-04 |

- `WS-04.5` smoke.mjs walks every lean view + opens a fixture invoice; asserts zero requests outside the site; run on local Pages artifact (`bash scripts/pages/build-pages.sh` + `node scripts/pages/serve-pages.mjs`)
- `WS-05.2` Deploy driver network list == enabled testnet set; rehearse on anvil network-free; FEE_RECIPIENT accepts ETH (readback smoke); OD-14 default EOA recorded in manifest; hoodi resolved
- `WS-05.3` `node scripts/check-chain-matrix.mjs --revalidate --rpc <user url>` read-only codehash re-read + diff; never edits matrix.json
- `WS-06.1` Disposition file keyed (contract, function, SWC, PC/source map, solc, source keccak) + checker in REPORT-ONLY mode; any unmatched/new/changed record reported; R8 timeout behaviour recorded; release.yml untouched
- `WS-21.1` frameGuard: window.top !== window.self -> refuse sensitive views unless embed protocol active; opener nulled at startup
- `WS-21.2` createRoot onCaughtError/onUncaughtError sanitized (main.tsx:11)
- `WS-24.2` Rows IC: web verifyManifestForFlow + CLI payment-context.ts + relayer runtime.ts call one strict verifier (G-NOTE-01)
- `WS-24.3` When the user has configured a secondary RPC (opt-in; never a built-in default or automatic fallback), readback reconciles both providers and fails closed on disagreement/unreachable; single-provider mode unchanged; banner provider count
- `WS-24.4` ERC-6538 singleton runtime codehash per-chain pin; unknown/mismatch disables registry features; ADR-0018 stale text

### Wave 7 — Key portability / recovery / privacy: K03-K06 + KC + independent recovery proofs  (Σ 24.75–39.5 d, 11 items)

| Item | WS | Refs | Strategy | Est d | Deps | CP | Par | Gate | Status |
|---|---|---|---|---|---|---|---|---|---|
| WS-08.1 | WS-08 | F-KEY-09, SEC-03 | implement | 6–10 | CP-2 | CP-5 | Y (seq in WS) | exit | UB: with OD-01/OD-02 fail-closed defaults (vault required, no clipboard); OD-01,OD-02 |
| WS-08.2 | WS-08 | F-KEY-10, SEC-03, SEC-13 | implement | 4–6 | WS-08.1 | CP-5 | Y (seq in WS) | exit | UB: OD-02 default: no clipboard; file download + held reveal; OD-02,OD-01 |
| WS-08.3 | WS-08 | F-KEY-11 | implement | 0.25–0.5 | WS-08.2, WS-25.2 | CP-5 | Y | exit | UB |
| WS-09.1 | WS-09 | F-KEY-12, SEC-04, SEC-15 | implement | 6.75–9.75 | CP-2 | CP-5 | Y (seq in WS) | exit | UB: after CP-2 (formats + step-up); OD-01 default; OD-09,OD-01 |
| WS-19.3 | WS-19 | F-KEY-11 | implement | 0.25–0.5 | WS-25.1 | CP-5 | Y | exit | UB |
| WS-19.4 | WS-19 | F-KEY-12 | implement | 0.5–1 | WS-09.1 | CP-5 | Y | exit | UB |
| WS-19.5 | WS-19 | F-KEY-10 | implement | 0.75–1.5 | WS-08.2 | CP-5 | Y | exit | UB |
| WS-23.1 | WS-23 | SEC-23 | implement | 1–2 | CP-3 | CP-5 | Y | none | UB |
| WS-23.2 | WS-23 | SEC-22 | refactor | 2–4 | WS-23.1 | CP-5 | Y | none | UB |
| WS-25.1 | WS-25 | F-KEY-11 | implement | 2.25–3 | CP-2 | CP-5 | Y | exit | UB: format after CP-2 |
| WS-25.2 | WS-25 | F-KEY-11 | implement | 1–1.25 | WS-25.1, WS-08.1 | CP-5 | Y | exit | UB: UI after K03 (rolling merge of WS-08.1) |

- `WS-08.1` K03 per rows IC (Payment details > Export from Scan row; ownership label separate from receipt status)
- `WS-08.2` K04 per rows IC; independent proof via pinned Foundry 1.8.5 cast/anvil + WS-19.5
- `WS-08.3` Mount the WS-25 K05 archive panel in Payment details/Scan; e2e covers the mounted flow
- `WS-09.1` K06 per rows IC (format + UI + recovery instructions)
- `WS-19.3` K05 archive decode + per-record address check
- `WS-19.4` K06 master backup recovers an announcement omitted from the K05 archive (offline scan of a fixture log set)
- `WS-19.5` K04 raw key -> EIP-55 address == announced (computed by the tool); the transfer is signed and sent with pinned Foundry 1.8.5 `cast` (the independent EVM implementation NEXT_PHASE_QUEUE K04 names) and accepted by anvil; synthetic keys only; the tool implements no transaction signing
- `WS-23.1` Settings > Erase all GhostPay data: confirmed, backup warning, clears ghostpay.* local/session + 3 IndexedDB DBs; e2e
- `WS-23.2` Pseudonymize slot/journal names with a viewing-key-derived key; minimize plaintext meta in the IndexedDB vault record; one-time migration with tests; keystore v1 bytes unchanged
- `WS-25.1` K05 container format + strict atomic import + fixed vectors for WS-19
- `WS-25.2` StealthArchivePanel component using the K03 export controls (re-auth via requireStepUp, scope display)

### Wave 8 — Optional advanced (full-profile, operator, merchant; never blocks beta)  (Σ 50.95–102.1 d, 26 items)

| Item | WS | Refs | Strategy | Est d | Deps | CP | Par | Gate | Status |
|---|---|---|---|---|---|---|---|---|---|
| WS-03.3 | WS-03 | F-KEY-13, SEC-37 | defer | 1.1–2.25 | CP-5 | CP-6 | Y | none | UB |
| WS-06.2 | WS-06 | F-CTR-07, SEC-17, SEC-33 | refactor | 2.5–5 | WS-06.1 | CP-6 | Y | none | UB: analyzer extensions unblocked; OD-03,OA-01 |
| WS-10.6 | WS-10 | F-WEB-04 | defer | 2–3.75 | CP-5 | CP-6 | Y | none | UB |
| WS-12.6 | WS-12 | F-I18N-03 | consolidate | 0.75–1.5 | CP-5 | CP-6 | Y | none | UB; OD-20,OD-16 |
| WS-12.7 | WS-12 | F-DOC-04 | defer | 0.6–1 | WS-12.6 | CP-6 | Y | none | BLK: waits for locale scope + native reviewers; OD-20,OD-16; EX-04 |
| WS-13.1 | WS-13 | F-HOST-01, SEC-26 | repair | 1.25–2.25 | WS-01.2 | CP-6 | Y | none | UB |
| WS-13.2 | WS-13 | F-HOST-02, SEC-41, SEC-26 | repair | 1.25–2 | WS-13.1 | CP-6 | Y | none | UB |
| WS-13.3 | WS-13 | F-HOST-04, SEC-26 | repair | 0.75–2 | WS-13.2 | CP-6 | Y | none | UB |
| WS-13.4 | WS-13 | F-HOST-03 | defer | 0–0.75 | WS-13.3 | CP-6 | Y | none | BLK: owner gates; OD-07,OD-22,OD-06 |
| WS-14.1 | WS-14 | F-SOL-01, TB-08, SEC-13 | consolidate | 4.5–8.5 | CP-1 | CP-6 | Y | none | UB: TB-08 defect fix unblocked; promotion OD-20; OD-20,OD-02 |
| WS-14.2 | WS-14 | F-TRX-01, TB-08, SEC-13 | consolidate | 4.5–8.5 | WS-14.1 | CP-6 | Y | none | UB: TB-08 defect fix unblocked; promotion OD-20; OD-20,OD-02 |
| WS-14.3 | WS-14 | SEC-13 | repair | 0.5–1 | WS-14.2 | CP-6 | Y | none | UB; OD-02 |
| WS-14.4 | WS-14 | F-BTC-01, SEC-13 | defer | 2–4 | WS-14.3 | CP-6 | Y | none | BLK: scope decision; OD-20,OD-02; EX-07 |
| WS-14.5 | WS-14 | F-BTC-03 | defer | 1.75–3.5 | WS-14.4 | CP-6 | Y | none | BLK: scope; OD-20 |
| WS-15.1 | WS-15 | F-CLI-06 | defer | 0–0.1 | CP-1 | CP-6 | Y | none | UB |
| WS-15.2 | WS-15 | F-MER-02 | consolidate | 2.25–3.75 | CP-5, WS-15.1 | CP-6 | Y | none | UB; OD-20 |
| WS-15.3 | WS-15 | F-INT-01 | defer | 2.75–5.5 | WS-15.2 | CP-6 | Y | none | BLK: scope; OD-20 |
| WS-15.4 | WS-15 | F-INT-02 | defer | 2.25–3.75 | WS-15.3 | CP-6 | Y | none | BLK: scope; OD-20 |
| WS-15.5 | WS-15 | F-MER-01 | defer | 3.75–7.5 | WS-15.4 | CP-6 | Y | none | BLK: scope; OD-20 |
| WS-15.6 | WS-15 | F-MER-04 | defer | 2.5–4.5 | WS-15.5 | CP-6 | Y | none | BLK: scope; OD-20 |
| WS-15.7 | WS-15 | F-PROTO-12 | defer | 1.25–3.5 | WS-15.6 | CP-6 | Y | none | BLK: owner; OD-20 |
| WS-16.1 | WS-16 | SEC-16, F-POOL-03 | repair | 0.5–1 | WS-18.1 | CP-6 | Y | none | UB |
| WS-16.2 | WS-16 | F-RLY-04 | defer | 1.5–2.75 | WS-16.1 | CP-6 | Y | none | UB |
| WS-16.3 | WS-16 | F-OPS-03 | defer | 1.75–3.75 | WS-16.2 | CP-6 | Y | none | UB |
| WS-16.4 | WS-16 | F-PROTO-11, SEC-27 | defer | 4–10 | WS-16.3 | CP-6 | Y | none | BLK: operator backends; OD-21 |
| WS-16.5 | WS-16 | F-POOL-04, SEC-17 | defer | 5–10 | WS-16.4 | CP-6 | Y | none | BLK: experimental; OD-21 |

- `WS-03.3` secret-box wiring revisit after KC (deferred; suites stay green)
- `WS-06.2` D-12: Echidna actions (permit paths, forged signers, hostile tokens, factory deploy/fee, PolicyRouter, L2 timestamp model); one-time full-severity Slither triage report; Mythril complete runs Router/PolicyRouter
- `WS-10.6` Confirm disclosure present (deferred)
- `WS-12.6` Ownership ADR for the two i18n stacks
- `WS-13.3` compose config -q; check-headers.sh; HSTS at terminator
- `WS-14.1` Consolidate chain-solana on solana-stealth format + vectors
- `WS-14.2` Consolidate chain-tron tag on tron-adapter; encrypted backup
- `WS-14.3` BTC/SOL/TRON seed reveal: re-auth + second confirmation, no clipboard (OD-02 default)
- `WS-16.1` pool-sdk seed backup reuses ux-vault KDF/estimator/bounds (N 2^17, max 2^18), NFKC, version/params in AAD

### Wave 9 — Owner-gated release qualification (beta start, beta exit, release tag)  (Σ 6.4–14 d, 12 items)

| Item | WS | Refs | Strategy | Est d | Deps | CP | Par | Gate | Status |
|---|---|---|---|---|---|---|---|---|---|
| WS-01.3 | WS-01 | F-WEB-18, SEC-43 | defer | 0.55–1.25 | CP-4 | CP-9 | Y | none | BLK: release trust root; OD-07 |
| WS-04.6 | WS-04 | F-WEB-21, SEC-01, SEC-02, SEC-08, SEC-09, SEC-46 | defer | 1.5–3 | CP-4, WS-05.4 | CP-7 | Y | start | BLK: prep only; OA-02,OD-08,OD-06,OD-07,OA-01,OA-05,OA-06 |
| WS-05.4 | WS-05 | B02, B03, B04, SEC-32 | implement | 1–2 | CP-4 | CP-7 | Y | start | BLK: owner broadcast + key; OD-07,OA-03,OA-04 |
| WS-06.3 | WS-06 | F-CTR-07, OD-03, SEC-47 | refactor | 0.25–0.5 | WS-06.2 | CP-9 | Y | none | BLK: OD-03; OD-03,OA-01 |
| WS-13.5 | WS-13 | F-DOC-03 | defer | 0–0.75 | WS-05.4 | CP-9 | Y | none | BLK: real infra; OA-04 |
| WS-13.6 | WS-13 | F-OPS-01 | defer | 0.75–1.75 | WS-05.4 | CP-9 | Y | none | BLK: after B02; OA-04 |
| WS-17.1 | WS-17 | F-CLI-05 | defer | 0.5–0.75 | WS-05.4 | CP-7 | Y | none | BLK: after B02; OA-04 |
| WS-17.2 | WS-17 | F-A11Y-02, SEC-41 | defer | 0.5–1.25 | WS-17.1 | CP-8 | Y | exit | BLK: needs physical devices; EX-02 |
| WS-17.3 | WS-17 | B06 | implement | 0.5–1 | CP-5, CP-7 | CP-8 | Y | exit | BLK: owner + external runs; EX-01,EX-02,EX-03 |
| WS-20.4 | WS-20 | SEC-48 | implement | 0.1–0.25 | CP-4 | CP-7 | coord | none | BLK: owner exports or grants read access; OA-07 |
| WS-20.5 | WS-20 | SEC-02, SEC-43 | implement | 0.5–1 | CP-4 | CP-7 | coord | start | BLK: owner key + protection; OD-07,OA-03,OA-01 |
| WS-20.6 | WS-20 | SEC-47 | implement | 0.25–0.5 | WS-20.5 | CP-9 | coord | none | BLK: owner runs the tag rehearsal; OA-01,OA-03 |

- `WS-01.3` Publish embed v2 SHA-384 SRI + hash in signed release notes after OD-07 trust root (owner key)
- `WS-04.6` After OD-06/OD-07/OD-08/OA-01/OA-02/OA-05/OA-06: live `node scripts/pages/smoke.mjs <url> --commit <sha>` incl. origin assertion + extended egress walk; deployment and release recorded as separate states
- `WS-05.4` Ingest owner Sepolia broadcast: tx hashes, blocks, verify-sources, runtime codehash read-back (CLI as 2nd impl), owner-signed manifest bundled, `GHOSTPAY_RELEASE_PUBKEYS=<key> node apps/web/scripts/validate-deployments.mjs`, Sepolia matrix cells pinned
- `WS-06.3` Enable the keyed gate in release.yml/contract-analysis.yml (coord applies) only after OD-03 approval; rehearsal per WS-20.6
- `WS-17.2` Emulation labels; Firefox + Tor Browser Standard/Safer manual run records (KDF time) per EX-02
- `WS-17.3` B06 records: SHA, browser/device/wallet versions, pass/fail per step incl. 3q export + independent recovery
- `WS-20.4` Review CodeQL / Dependabot / secret-scanning alert inventories once OA-07 lands; record counts + dispositions in CP-7.md
- `WS-20.5` pages.yml: actions/attest-build-provenance on Pages SHA256SUMS; signed checksum publication path (owner signs); deployed-origin assertion (C-08) already landed at CP-1 via WS-20.1
- `WS-20.6` Runbook for a signed pre-release tag rehearsal in a sandbox repo; OWNER executes (agents never tag)

WS-90 (no items): experimental 45 + future 43 rows stay separate/deferred, out of the lean build. Confirmed-defect fixes executed elsewhere: TB-08 (F-SOL-02/F-TRX-02 format split) → WS-14.1/14.2; SEC-16 (F-POOL-03) → WS-16.1; F-AA-05 tests not in CI (Info) → WS-20.2. Scheme 2 (F-AA-01..05, F-WEB-15, F-POOL-08) waits for OD-04/OD-05/OD-11/OD-12/OD-13 (SEC-06/07/11/12/31/35); F-POOL-01 insecure dev ceremony is intended + documented (no fix).

## 2. BROWSER-BETA READINESS track (Sepolia static beta) — separate from completion %

Completion % (FEATURE_COMPLETION_MATRIX: beta scope impl 87.2 / verif 83.5) does not say whether the beta can ship. This checklist does. Sources: SECURITY_AND_PRIVACY_GAP_ANALYSIS §9(a)(b)(c), NEXT_PHASE_QUEUE B01–B06, TESTING_AND_RELEASE §5. State @ 7a620ff1: DONE / PARTIAL / OPEN / OWNER (owner-only) / UNVERIFIED.

**Start gate (CP-7)**

| ID | Item | State @7a620ff1 | Closed by |
|---|---|---|---|
| BR-01 | Shared-origin posture decided (SEC-01); payments refused on shared origin | OWNER — build already refuses manifests on a shared origin (build-pages.sh:60-69 VERIFIED by S) | OD-06 (dedicated origin rec.) ; ADR-0029 via OD-08 |
| BR-02 | Pages source = Actions; stale gh-pages `cc8d0794` retired (SEC-08) | OWNER / SUSPECTED live | OA-05 |
| BR-03 | Deployed-origin assertion in build/smoke/pages.yml (SEC-09, TB-03) | OPEN (declared origin trusted) | WS-04.1 + pages.yml via WS-20.1 (C-08) |
| BR-04 | main protection, v* tag ruleset, github-pages env reviewers (SEC-02) | UNVERIFIED (API 403) | OA-01 |
| BR-05 | False copy fixed: local proxy, wss, "hides/unlinkable" (SEC-10/19/28, E-17) | OPEN | WS-01.1, WS-02.1, WS-04.4 |
| BR-06 | Local-proxy path works under real CSP or removed; e2e under real meta CSP (SEC-10, TB-02) | OPEN (CSP blocks loopback; probe VERIFIED by E) | WS-01.1 |
| BR-07 | Vault-less sweep/export: refuse or disclose (SEC-03 beta item) | OPEN (`authorizeKeyExport` returns undefined) | WS-07.1/07.2 (default: new spec-18 secret exports refuse without a vault; keystore v1 backup stays available with disclosure; sweep warned) |
| BR-08 | Keystore v1 independent-decode vector in CI (SEC-15) | OPEN | WS-03.2 vector + WS-19.1 decoder + WS-20.2 job |
| BR-09 | Strict on-chain verifier for Pay/Scan/Sweep, CLI, relayer (G-NOTE-01) + dual-provider readback (F-WEB-17) | OPEN (single provider; no canonical-announcer / 25 bps check in browser path) | WS-24.2, WS-24.3 |
| BR-10 | No unsigned/legacy manifest path in any build (SEC-14) | OPEN (dead in default app, present in bundle) | WS-24.1 |
| BR-11 | Lean keeps scheme 2, relayer, BTC/SOL/TRON, 7702/4337 out | DONE (VERIFIED by D: CORE_ORDER, VITE flag) | keep localBuildProfile.test.mjs + AppLean tests green every CP |
| BR-12 | Lean payer buffer behaviour == docs (TB-07) | OPEN (docs say no buffer; lean offers it) | WS-04.4 docs + WS-10.1 lean test (default keep buffer) |
| BR-13 | Release key ceremony; signed Sepolia manifest passes validate-deployments + runtime read-back (SEC-32, SEC-44) | OWNER (0 keys; RELEASE_PUBLIC_KEYS empty) | OD-07 → OA-03; WS-05.1 helper + denylist; WS-05.4 |
| BR-14 | Authentic Sepolia deployment from exact reviewed source; codehash read-back; canonical announcer; FEE_RECIPIENT accepts ETH (SEC-36) | OPEN (rehearsal tooling exists) | WS-05.2 rehearsal → OA-04 broadcast → WS-05.4 (+ CLI 2nd impl WS-17.1); OD-14 |
| BR-15 | Sepolia matrix cells evidenced; strict all-enabled gate unchanged (B04) | OPEN | WS-05.3 revalidation + WS-05.4 ingestion |
| BR-16 | Exact-SHA CI 24/24, Echidna, Slither, Foundry green; Mythril shows no record beyond the 11 (SEC-33) | PARTIAL: 7a620ff1 CI 44242366118 24/24, Echidna green, Mythril 11 dispositioned (packet) | CP-7 re-run on beta SHA; WS-06.1 report-only keyed comparison |
| BR-17 | Pages SHA256SUMS attested + signed checksums out of band (SEC-02/43) | OPEN | WS-20.5 + OA-03 |
| BR-18 | Extended egress smoke: every lean view + fixture invoice, no off-site request (SEC-46) | OPEN (smoke idles home 3 s) | WS-04.5 local, WS-04.6 live |
| BR-19 | Firefox + Tor Browser Standard/Safer manual run, KDF time recorded (SEC-41) | OPEN / UNVERIFIED | EX-02; WS-18.2 KDF progress text; WS-17.2 records |
| BR-20 | ADR-0029 Accepted | OWNER ("Proposed") | OD-08 (after OD-06, OD-07) |
| BR-21 | #203 merged (merge/ff, never squash) so pages.yml/release.yml on main carry the gates | DONE after the snapshot: merge commit `5467c158` 2026-11-18T06:56:49Z (tree == `71abc7e5`); OA-01 still UNVERIFIED | OA-02 done; OA-01 |
| BR-22 | Pages dispatch (main-only, deploy=true) + live smoke on the real origin (B05) | OWNER | OA-06; WS-04.6 |
| BR-23 | B06 start subset on Sepolia: invoice → pay native + ERC-20 → scan → receipt → sweep → backup/restore | OPEN | WS-17.3 records; EX-01 wallets, EX-02 browsers |

**Exit gate (CP-8) = start gate +**

| ID | Item | State @7a620ff1 | Closed by |
|---|---|---|---|
| BX-01 | Spec 18 K01–K06 implemented + KC on one exact SHA (SEC-04, req 3q) | NOT STARTED (VERIFIED: no K-module in tree) | WS-03, WS-08, WS-25, WS-09 → CP-5 |
| BX-02 | Independent GhostPay-free recovery: decode + anvil spend proof (SEC-04, TB-05) | OPEN (CLI scans, cannot derive/sweep) | WS-19.1–19.5 |
| BX-03 | Re-auth model decided and built for vault-less sellers (SEC-03, TB-04) | OPEN | OD-01; default (a) built in WS-07.1/07.2 |
| BX-04 | Passphrase high tier for new exports; owner floor for existing flows (SEC-05) | OPEN (score ≥ 2, 14 chars) | WS-18.1 default; OD-09 for existing flows |
| BX-05 | Single-keypair envelope shares keystore primitive, new AAD domain, bytes-built plaintext (SEC-37) | OPEN | WS-03.2 |
| BX-06 | Keystore doc drift fixed (SEC-15) | OPEN (byte-layouts.md:195-198) | WS-03.2 |
| BX-07 | Browser tests: no secret in fetch/URL/log/storage/clipboard for every export flow | OPEN | WS-08/WS-25/WS-09 e2e + privacyInvariants (WS-01.2) |
| BX-08 | Firefox/WebKit Playwright where supported (C-06) + mobile download/import recorded | OPEN | coordinator at CP-5 (playwright.config.ts) + EX-02 |
| BX-09 | B06 full: incl. 3q export + independent recovery on Sepolia; screen reader row | OPEN | WS-17.3; EX-01/02/03 |

Count: 23 start + 9 exit items; 24 engineering-open/partial, 5 owner-only, 2 done (BR-11, BR-21), BR-04 UNVERIFIED.

## 3. Critical paths (simulation; d = elapsed engineer-days from session start)

| Milestone | lo | hi | Note |
|---|---|---|---|
| CP-0 | 0.75 | 1.6 | rebaseline |
| CP-1 | 4.24 | 8.35 | wave 1-2 closed |
| CP-2 | 11.6 | 18.7 | spec 18 format freeze + step-up API |
| CP-3 | 12.98 | 27.42 | nearly-complete features |
| CP-4 | 12 | 21.29 | beta engineering-ready |
| CP-7 | 16.13 | 28.36 | Sepolia static beta START — engineering only; + owner latency (OD-06/07/08, OA-01..06) |
| CP-5 | 24.98 | 40.98 | KC spec 18 |
| CP-8 | 26.03 | 43.08 | beta EXIT — + owner/external latency (B06, EX-01..03) |
| CP-9 | 17.95 | 35.58 | release-tag qualification — + OD-03, keys |
| CP-6 | 42.26 | 74.42 | all optional wave 8 merged (if OD-20/21 approve) |

### 3a. To Sepolia static beta (CP-7)

Engineering chain (lo): CP-7@16.13 ← WS-04.6 (13.9→15.63) ← WS-05.4 (12.75→13.9) ← CP-4@12 ← WS-24.4 (9.78→11.5) ← WS-05.3 (7.19→9.78) ← WS-05.2 (4.6→7.19) ← WS-05.1 (2.19→3.62) ← CP-0@0.75 ← WS-00.5 (0.7→0.75) ← WS-00.4 (0.6→0.7) ← WS-00.3 (0.35→0.6) ← WS-00.2 (0.1→0.35) ← WS-00.1 (0→0.1)

Engineering chain (hi): CP-7@28.36 ← WS-04.6 (23.91→27.36) ← WS-05.4 (21.61→23.91) ← CP-4@21.29 ← WS-24.4 (18.27→20.29) ← WS-05.3 (13.67→18.27) ← WS-05.2 (9.07→13.67) ← WS-05.1 (4.47→7.35) ← CP-0@1.6 ← WS-00.5 (1.5→1.6) ← WS-00.4 (1.25→1.5) ← WS-00.3 (0.75→1.25) ← WS-00.2 (0.25→0.75) ← WS-00.1 (0→0.25)

Owner chain (parallel, latency unknown; each step gates the next): OD-06 origin → OD-07 key policy → OA-03 keys → OD-08 ADR-0029 → OA-01 protection → OA-02 merge #203 → OA-05 Pages source → [CP-4 reached] OA-04 Sepolia broadcast (owner key) → WS-05.4 evidence + owner-signed manifest → OA-06 Pages dispatch → WS-04.6 live smoke → CP-7. Beta start = max(engineering ≈ 16.13–28.36 d, owner chain).

Near-critical for start: WS-24 (verifier → dual readback → registry pin, 6.75–11.25 d), WS-05 (signing helper → rehearsal → revalidation, 6.75–12.5 d), WS-01.1 (CSP, CP-1).

### 3b. To beta exit (CP-8)

Engineering chain (lo): CP-8@26.03 ← WS-17.3 (24.98→25.53) ← CP-5@24.98 ← WS-19.5 (23.12→23.98) ← WS-08.2 (18.52→23.12) ← WS-08.1 (11.62→18.52) ← CP-2@11.6 ← WS-19.2 (10.52→11.1) ← WS-03.2 (5.64→10.52) ← WS-03.1 (0.75→5.64) ← CP-0@0.75 ← WS-00.5 (0.7→0.75) ← WS-00.4 (0.6→0.7) ← WS-00.3 (0.35→0.6) ← WS-00.2 (0.1→0.35) ← WS-00.1 (0→0.1)

Engineering chain (hi): CP-8@43.08 ← WS-17.3 (40.98→42.08) ← CP-5@40.98 ← WS-19.5 (37.25→38.98) ← WS-08.2 (30.35→37.25) ← WS-08.1 (18.85→30.35) ← CP-2@18.7 ← WS-19.2 (15.97→17.7) ← WS-03.2 (8.5→15.97) ← WS-03.1 (1.6→8.5) ← CP-0@1.6 ← WS-00.5 (1.5→1.6) ← WS-00.4 (1.25→1.5) ← WS-00.3 (0.75→1.25) ← WS-00.2 (0.25→0.75) ← WS-00.1 (0→0.25)

Slack lanes: WS-09 K06 and WS-25 K05 start at CP-2 in parallel with K03; WS-19 proofs run per format as each lands (K05 → K06 → K04). Acceleration option (not in numbers): a second strongest agent prototypes the K04 interop harness once the K03 export-lifecycle API merges (≈ −2..3 d). Beta exit = max(engineering ≈ 26.03–43.08 d, CP-7, B06 runs).

## 4. Total effort (ESTIMATE)

| Scope | Items | Σ est d (no review) | Σ incl. review | 
|---|---|---|---|
| Beta START path (CP-0, CP-1, CP-4, CP-7 + CP-2 SEC-14) | 39 | 32.9–62.25 | 37.14–70.11 |
| Spec 18 / beta EXIT (CP-2 rest, CP-5, CP-8) | 20 | 42.55–70.5 | 48.42–80.02 |
| Nearly-complete + recovered (CP-3) | 16 | 14.15–26.8 | 15.92–30.12 |
| Release-tag qualification (CP-9) | 5 | 1.8–4.75 | 2.03–5.39 |
| Optional wave 8, unblocked | 15 | 25.1–48.1 | 28.71–55.05 |
| Optional wave 8, scope-gated (OD-20/OD-21/OD-22/EX) | 11 | 25.85–54 | 29.07–60.81 |
| **All** | 106 | 142.35–266.4 | 161.3–301.51 |

- **Without parallelism** (one engineer, sequential, incl. review overhead + CP merges 5–10 d): all = 166.3–311.51 d; excluding scope-gated wave 8 = 137.22–250.7 d; beta start + exit scopes only = 90.56–160.14 d.
- **With parallelism** (≤6 workers + coordinator): beta start engineering-ready (CP-7 minus owner latency) 16.13–28.36 d; KC 24.98–40.98 d; beta exit 26.03–43.08 d; everything incl. scope-gated wave 8 42.26–74.42 d. Worker-days 154.6–287.41; coordinator-lane days 6.7–14.1 (+ CP merges).
- Lost-team per-row totals reused unchanged; G-B new items add 29.3–57.85 d. Matrix headline "beta scope 41–104 d" counted rows only; this sequence adds the SEC/TB engineering items, split lanes and review.
- Not in any number: owner decision latency, external acceptance (EX-01..07), professional audit (EX-05), mainnet.

## 5. Per-wave totals

| Wave | Items | Σ est d |
|---|---|---|
| 0 Start / rebaseline | 4 | 0.7–1.5 |
| 1 Critical security + correctness defects | 13 | 8.75–17.55 |
| 2 Consolidation regressions + doc/code drift | 7 | 5.2–10.2 |
| 3 Shared foundations | 6 | 15.7–26.5 |
| 4 Nearly-complete features | 14 | 12.6–23.6 |
| 5 Recoverable historical work | 4 | 3.05–6.7 |
| 6 Core browser payment workflow prep, short of owner broadcast | 9 | 14.25–24.75 |
| 7 Key portability / recovery / privacy: K03-K06 + KC + independent recovery proofs | 11 | 24.75–39.5 |
| 8 Optional advanced | 26 | 50.95–102.1 |
| 9 Owner-gated release qualification | 12 | 6.4–14 |

## 6. Fail-closed defaults applied while owner decisions are pending

| Decision | Default implemented now | Where |
|---|---|---|
| OD-01 re-auth (vault-less) | New spec-18 secret exports (K03–K06 encrypted and raw keys, archive) refuse without encrypted-vault re-auth; the keystore v1 backup and vault creation stay available with disclosure (BLOCKERS OD-01, constraint 4); sweep unchanged but warned | WS-07.1, WS-07.2, WS-08, WS-09, WS-25 |
| OD-02 clipboard | No clipboard path for any new secret export; file download + held reveal; BTC/SOL/TRON seed reveal aligned or kept experimental | WS-08.2, WS-14.3 |
| OD-03 Mythril gate | Release tags stay blocked; keyed disposition built in REPORT-ONLY mode | WS-06.1; enable WS-06.3 after OD-03 |
| OD-06 origin | Build keeps refusing manifests on a shared origin; origin gate checks the deployed origin | WS-04.1 |
| OD-07 trust roots | Payments disabled in default build; release fails closed; synthetic keys only in tests | WS-05.1, WS-05.4 |
| OD-09 passphrase floor | New spec 18 exports use `high` tier; existing flows keep `standard` + generated default offered | WS-18.1 |
| OD-10 spec 18 wording | Product rules applied (user-selected RPC, no fallback, no telemetry, lean boundary, deep-scan export only after full derivation check, announced viewTag) and recorded for sign-off | WS-03.1 |
| OD-14 FEE_RECIPIENT | Deployment checklist requires the choice; EOA recorded in manifest; readback smoke accepts ETH | WS-05.2 |
| OD-15 #204 | Ported as one separate reviewable commit on the integration branch | WS-22.1 |
| OD-16 locales | Keep today's labelled selector (machine-drafted / no-catalog notes); es/ar/ja labelled drafts; no trim | WS-12.3 |
| OD-18 majors | Minor/patch refresh only; @scure/* 2.x, TypeScript 7, hardhat 3 deferred | WS-22.2 |
| OD-19 retirement | Nothing deleted or closed | all (authorization limits) |
| OD-20/21/22 scope | Full-profile/operator/merchant/distribution work limited to confirmed-defect fixes + verification; never required by lean | WS-13..16, WS-90 |
| TB-02 (was lost OD-12) | Local-proxy removed from lean UI + docs; full/self-host: works under loopback-only CSP or removed; wss rejected | WS-01.1 |
| TB-07 (was lost OD-16) | Keep v1 payer buffer in lean, fix docs, add lean test | WS-04.4, WS-10.1 |
| OD-04/05/11/12/13 scheme 2 | Scheme 2 stays undeployed and experimental; contracts frozen | WS-90 |

## 7. Workstream index

| WS | Name | Mapping | Waves | CPs | Est d | Owner gate |
|---|---|---|---|---|---|---|
| WS-00 | Rebaseline + integration start (coordinator) |  | 0,1 | CP-0 | 0.75–1.6 | - |
| WS-01 | Transport honesty: local-proxy CSP (TB-02), wss rejection, fetch options, net-transport claims, embed SRI | WS-01 (F-NET-01, F-WEB-18) | 1,9 | CP-1,CP-9 | 3.15–6.25 | OD-07 |
| WS-02 | Honest copy + doc drift (TB-10, E-17, E-08) + regression scripts (TB-06) + recovered harness/doc hunk | WS-02 | 1,2,4,5 | CP-1,CP-3 | 4.15–8.8 | OD-20,OD-16,OA-04 |
| WS-03 | Spec 18 core formats: K01 schemas + verified derivation, K02 single-keypair envelope (+F-KEY-13 later) | WS-03 | 3,8 | CP-2,CP-6 | 9.6–14.75 | OD-10,OD-09 |
| WS-04 | Pages origin gate (TB-03) + bundle/egress checks + static-beta deploy prep (F-WEB-21) | WS-04 (F-WEB-21) | 1,2,6,9 | CP-1,CP-4,CP-7 | 3.6–7.25 | OA-02,OD-08,OD-06,OD-07,OA-01,OA-05,OA-06 |
| WS-05 | Deployment of record: manifest signing helper, anvil rehearsal, matrix revalidation, B02-B04 evidence | WS-05 (split: F-DEP-02, F-WEB-17, F-CTR-04 -> WS-24) | 2,6,9 | CP-1,CP-4,CP-7 | 6.75–12.5 | OD-07,OD-14,OA-04,OD-08,OA-03 |
| WS-06 | Mythril keyed disposition mechanism (OD-03 option a prototype) + analyzer extensions (D-12) | WS-06 (F-CTR-07) | 6,8,9 | CP-4,CP-6,CP-9 | 4.75–9 | OD-03,OA-01 |
| WS-07 | Step-up re-auth: OD-01 fail-closed default (SEC-03/TB-04) + archive export step-up (F-KEY-05) | WS-07 (F-KEY-05) | 1,3 | CP-1,CP-2 | 2.95–6 | OD-01 |
| WS-08 | Spec 18 K03-K04: Payment details export UI (public + encrypted keypair), raw single-key export | WS-08 (F-KEY-11/K05 split -> WS-25) | 7 | CP-5 | 10.25–16.5 | OD-01,OD-02 |
| WS-09 | Spec 18 K06: encrypted master spend/view backup; legacy keystore v1 unchanged and distinct | WS-09 | 7 | CP-5 | 6.75–9.75 | OD-09,OD-01 |
| WS-10 | Payer UX + v2 buffer journey + fiat guards (TB-07 lean test) | WS-10 | 4,8 | CP-3,CP-6 | 6.9–12.2 | - |
| WS-11 | Scanner reorg cross-check + CLI/relayer evidence + CLI backup independent decode | WS-11 | 4 | CP-3 | 2.2–4.45 | - |
| WS-12 | Accessibility + i18n enforcement + #201/#202 browser-regression recheck | WS-12 | 2,4,8 | CP-1,CP-3,CP-6 | 7.6–14.25 | OD-20,OD-16 |
| WS-13 | Hosting/ops verification: digest pins, HSTS at terminator, Tor image, compose/header checks | WS-13 | 8,9 | CP-6,CP-9 | 4–9.5 | OD-07,OD-22,OD-06,OA-04 |
| WS-14 | Full-profile chains: TB-08 SOL/TRON meta-address format consolidation, seed-reveal parity, BTC regtest | WS-14 | 8 | CP-6 | 13.25–25.5 | OD-20,OD-02 |
| WS-15 | Merchant/integration/SDK (scope-gated, OD-20/OD-17) | WS-15 | 8 | CP-6 | 14.75–28.6 | OD-20 |
| WS-16 | Optional operator services (OD-21) + pool-sdk backup KDF parity (SEC-16) | WS-16 | 8 | CP-6 | 12.75–27.5 | OD-21 |
| WS-17 | Device/browser evidence records + CLI post-B02 cross-check + B06 run records | WS-17 | 9 | CP-7,CP-8 | 1.5–3 | OA-04 |
| WS-18 | Passphrase/KDF floor: offline estimator, generated-passphrase default, high tier for new exports (SEC-05) | new (G-B) | 1 | CP-1 | 2–4 | OD-09 |
| WS-19 | Independent GhostPay-free recovery tool (spec 18 / req 3q; SEC-04, TB-05) | new (G-B) | 3,7 | CP-2,CP-5 | 5–9.5 | - |
| WS-20 | CI/release pipeline: release verify anvil policy (TB-01), test-gap wiring (TB-09/TB-06), CI speed, attestation | new (G-B) | 1,2,3,9 | CP-1,CP-2,CP-7,CP-9 | 4.45–9 | OA-07,OD-07,OA-03,OA-01 |
| WS-21 | Lean shell hardening: anti-framing guard, opener nulling, sanitized root error handlers | new (G-B) | 6 | CP-4 | 0.75–1.5 | - |
| WS-22 | Repo tooling + dependency refresh: #204 port (OD-15 default), minor/patch refresh (OD-18 default) | new (G-B) | 5 | CP-1 | 1.5–3.5 | OD-15,OD-18 |
| WS-23 | Local data privacy: confirmed erase-all + linkable storage identifiers pseudonymized (SEC-23, SEC-22) | new (G-B) | 7 | CP-5 | 3–6 | - |
| WS-24 | Strict on-chain verifier for web/CLI/relayer + dual-provider readback + registry pin; legacy manifest path removed | split from WS-05 | 2,6 | CP-2,CP-4 | 6.75–11.25 | OD-07,OA-04 |
| WS-25 | Spec 18 K05: encrypted bounded bulk archive of validated one-time keys (format, import, panel) | split from WS-08 | 7 | CP-5 | 3.25–4.25 | - |
| WS-90 | Experimental (45) + future (43): keep separate / defer | new (G-B) | 9 | - | 0–0 | OD-04,OD-05,OD-11,OD-12,OD-13,OD-20,OD-21,OD-22,OD-17 |
