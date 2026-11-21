# GhostPay parallel agent execution plan — next phase (2026-11-18)

> **Coordinator note (package assembly).** `ws/WS-00-integration` in this plan denotes the next session's designated development branch, which is its integration branch and the only branch it pushes. Owner-decision IDs follow BLOCKERS_AND_DECISIONS.md (OD-01..OD-22, OA-01..OA-07, EX-01..EX-07, TB-01..TB-10).


Companion of `IMPLEMENTATION_SEQUENCE.md`; machine-readable registry `ws_registry.json` (27 WS, item lists, owned paths, handovers, tiers, gates). Per-feature acceptance: `FEATURE_ACCEPTANCE_CRITERIA.md` § <feature ID> (G-A). ESTIMATES in engineer-days. Caveman-terse; identifiers exact.

## 1. Coordinator role

- One coordinator agent, strongest tier. Owns `ws/WS-00-integration`, every coordinator-owned path (§3), CP gates, the ready queue, worktree creation, handovers, coord-request merges, the evidence ledger `docs/handoffs/next-phase-20261118/` (BASELINE.md, WS_STATUS.md, CP-n.md).
- Executes only coordinator WS: WS-00 (rebaseline), WS-20 (CI/release pipeline), WS-22 (#204 port, dependency refresh). Never implements product features; never reviews own work (a strongest worker-tier reviewer reviews WS-20/WS-22).
- Spawns ≤ 6 workers at once; one agent per WS at a time; assigns model tier from the registry; gives each worker: WS card (§5), start SHA, owned paths, test commands, handoff template (§3.6).
- Before every merge: `git diff --name-only <base>..<ws-branch>` ⊆ owned_paths ∪ one `coord-request(<WS>)` commit; else bounce.
- Merges with `git merge --no-ff ws/<WS>-<slug>` (never squash, never rebase the integration branch); runs targeted tests + `npm run typecheck` per merge; G-FULL at each CP; records SHA, commands, exit codes, counts.
- Owner liaison: keeps OD/OA packets current (BLOCKERS IDs), never treats silence as approval, applies the fail-closed defaults (IMPLEMENTATION_SEQUENCE §6).
- Stops the line on: security finding ≥ High, frozen-path diff, gate regression vs baseline, ownership violation.

## 2. Start-commit rule (WS-00.1)

```bash
git fetch origin && Q=7a620ff19ecf4e43ec568896c34188f5b2dcd3fc
if git merge-base --is-ancestor $Q origin/main; then START=$(git rev-parse origin/main)   # #203 merged: main containing 7a620ff1
else
  H=$(git rev-parse refs/remotes/origin/nodata/wizardly-allen-qwol6u)                  # PR #203 head (71abc7e5 on 2026-11-18)
  git merge-base --is-ancestor $Q $H || { echo "STOP: #203 head rewritten"; exit 1; }
  [ -z "$(git diff --name-only $Q $H | grep -vE '^docs/|\.md$')" ] || { echo "STOP: non-doc change above 7a620ff1 -> requalify"; exit 1; }
  START=$H
fi
DESIGNATED=<the session's designated branch>   # the integration branch; never a second branch or worktree
git checkout -B "$DESIGNATED" "$START"          # main checkout; only before its first push
mkdir -p docs/handoffs/next-phase-20261118 && echo "START=$START" >> docs/handoffs/next-phase-20261118/BASELINE.md
```

VERIFIED 2026-11-18: main lacks 7a620ff1; #203 head 71abc7e5 differs only in 4 docs files → START = 71abc7e5 today. If STOP fires: coordinator runs G-FULL on the new head, records it, asks owner before using it.

## 3. Conventions

### 3.1 Worktrees and branches

- Worker: `git worktree add ../wt/<WS-ID> -b ws/<WS-ID>-<slug> <integration SHA at window start>` (paths relative to `/home/user/GhostPay`; `/home/user/wt/cand` is the audit worktree: do not reuse). Setup: `npm ci --ignore-scripts && npm run build:libs`.
- Before the branch is first merged: `git rebase ws/WS-00-integration` allowed (private). After first merge: `git merge --ff-only ws/WS-00-integration`, then continue. Never force-push, never rewrite merged history.
- Commits: `<WS-ID>.<n>: <imperative summary>`; trailers per session attribution rules. No `--no-verify`.

### 3.2 Coordinator-owned paths (workers never edit; request via coord-request)

`package-lock.json`, `package.json`, `tsconfig.base.json`, `.github/workflows/**`, `.github/dependabot.yml`, `.github/actions/**`, `CLAUDE.md`, `AGENTS.md`, `docs/ai/**`, `apps/web/src/App.tsx`, `apps/web/src/AppLean.tsx`, `apps/web/src/AppShell.tsx`, `apps/web/locales/**`, `apps/web/playwright.config.ts`, `apps/web/vite.config.ts`, `apps/web/vitest.config.ts`, `apps/web/vitest.nocov.config.ts`, `eslint.config.js`, `docs/handoffs/**`, `.claude/skills/**`, `scripts/agent/**`, `docs/adr/README.md`, `packages/ux-vault/src/portable.ts`, `packages/ux-vault/src/index.ts`

- coord-request: ONE separate commit `coord-request(<WS>): <why>` in the worker branch: append-only hunks (new i18n keys at the end of the relevant object in `apps/web/locales/en.json` + same keys in es/ar/ja marked draft, route-table line, barrel export line, workspace script line). Never reformat, never dependencies/lockfile (dependency changes: recovery §9.6). Coordinator re-applies or merges it and owns conflicts.
- A path no active WS owns in a window is coordinator-merged the same way.

### 3.3 Exclusive ownership

- `owned_paths` are exclusive while the WS is active; transfer only by `handover_in` at a CP (registry). Validator `check_ownership()` (audit scratch `model.py`, not packaged; windows are per CP number, so CP-3 and CP-5 items that run concurrently are not compared): 0 overlaps among WS active in the same window, 0 worker overlaps with coordinator paths (VERIFIED by run; negative test with injected overlaps detected 80 conflicts). A more specific owned path beats an overlapping glob of another WS (WS-09 `docs/user/master-backup-recovery.md` in WS-02 `docs/user/**`).
- Frozen, nobody owns: `packages/contracts/src/**`, `packages/core-crypto/src/**`, `test-vectors/scheme1.json`.
- Reading any file is free. Needing to edit a non-owned path = STOP + handover request (recovery §9.2).

### 3.4 Rolling merge

Item done → handoff block → independent review (§7) → coordinator merge → worker ff to integration tip. Cross-WS item deps in the same window are satisfied by the dependency's rolling merge (e.g. WS-25.2 after WS-08.1 merges).

### 3.5 Evidence

Every claim marked VERIFIED (command run at SHA) / INFERRED / UNVERIFIED. Cite `path:line @ <sha>`, commands with exit code + pass/fail/skip counts. CI evidence only with run id.

### 3.6 Handoff block (every item, appended to `docs/handoffs/next-phase-20261118/ws/<WS-ID>.md` by the coordinator)

```text
HANDOFF <WS-ID> items=<ids> agent=<tier> date=<utc>
branch=ws/<WS-ID>-<slug> head=<sha> base=<integration sha>
done=<item ids + one line each>   not-done=<ids + reason + fail-closed default applied>
files=<git diff --name-only base..head>   within-owned=<yes|no>   coord-request=<sha|none>
tests=<exact command> -> <exit> <passed/failed/skipped>   (one line per command)
security=<invariants checked; secrets/egress/clipboard/logs; reviewer tier required>
evidence=<VERIFIED/INFERRED/UNVERIFIED lines>   risks=<...>   next=<...>
ws-specific=<see WS card "Handoff +">
```

## 4. Workstream table

| WS | Name | Exec | Impl/Review tier | Deps (WS) | CPs | Est d | Unblocked | Owner gate |
|---|---|---|---|---|---|---|---|---|
| WS-00 | Rebaseline + integration start (coordinator) | coordinator | strongest/strongest | - | CP-0 | 0.75–1.6 | all | - |
| WS-01 | Transport honesty: local-proxy CSP (TB-02), wss rejection, fetch options, net-transport claims, embed SRI | worker | mid/strongest | WS-00 | CP-1,CP-9 | 3.15–6.25 | partial | OD-07 |
| WS-02 | Honest copy + doc drift (TB-10, E-17, E-08) + regression scripts (TB-06) + recovered harness/doc hunk | worker | mid/mid | WS-00 | CP-1,CP-3 | 4.15–8.8 | all | OD-20,OD-16,OA-04 |
| WS-03 | Spec 18 core formats: K01 schemas + verified derivation, K02 single-keypair envelope (+F-KEY-13 later) | worker | strongest/strongest | WS-00,WS-18 | CP-2,CP-6 | 9.6–14.75 | all | OD-10,OD-09 |
| WS-04 | Pages origin gate (TB-03) + bundle/egress checks + static-beta deploy prep (F-WEB-21) | worker | mid/strongest | WS-00,WS-01,WS-05,WS-20,WS-24 | CP-1,CP-4,CP-7 | 3.6–7.25 | partial | OA-02,OD-08,OD-06,OD-07,OA-01,OA-05,OA-06 |
| WS-05 | Deployment of record: manifest signing helper, anvil rehearsal, matrix revalidation, B02-B04 evidence | worker | strongest/strongest | WS-00 | CP-1,CP-4,CP-7 | 6.75–12.5 | partial | OD-07,OD-14,OA-04,OD-08,OA-03 |
| WS-06 | Mythril keyed disposition mechanism (OD-03 option a prototype) + analyzer extensions (D-12) | worker | strongest/strongest | WS-00 | CP-4,CP-6,CP-9 | 4.75–9 | partial | OD-03,OA-01 |
| WS-07 | Step-up re-auth: OD-01 fail-closed default (SEC-03/TB-04) + archive export step-up (F-KEY-05) | worker | strongest/strongest | WS-00 | CP-1,CP-2 | 2.95–6 | all | OD-01 |
| WS-08 | Spec 18 K03-K04: Payment details export UI (public + encrypted keypair), raw single-key export | worker | strongest/strongest | WS-00,WS-03,WS-07,WS-18,WS-19,WS-25 | CP-5 | 10.25–16.5 | all | OD-01,OD-02 |
| WS-09 | Spec 18 K06: encrypted master spend/view backup; legacy keystore v1 unchanged and distinct | worker | strongest/strongest | WS-00,WS-03,WS-07,WS-18,WS-19 | CP-5 | 6.75–9.75 | all | OD-09,OD-01 |
| WS-10 | Payer UX + v2 buffer journey + fiat guards (TB-07 lean test) | worker | mid/strongest | WS-00,WS-02,WS-04 | CP-3,CP-6 | 6.9–12.2 | all | - |
| WS-11 | Scanner reorg cross-check + CLI/relayer evidence + CLI backup independent decode | worker | mid/strongest | WS-00,WS-19 | CP-3 | 2.2–4.45 | all | - |
| WS-12 | Accessibility + i18n enforcement + #201/#202 browser-regression recheck | worker | mid/mid | WS-00 | CP-1,CP-3,CP-6 | 7.6–14.25 | partial | OD-20,OD-16 |
| WS-13 | Hosting/ops verification: digest pins, HSTS at terminator, Tor image, compose/header checks | worker | mid/strongest | WS-00,WS-01,WS-05 | CP-6,CP-9 | 4–9.5 | partial | OD-07,OD-22,OD-06,OA-04 |
| WS-14 | Full-profile chains: TB-08 SOL/TRON meta-address format consolidation, seed-reveal parity, BTC regtest | worker | strongest/strongest | WS-00,WS-07 | CP-6 | 13.25–25.5 | partial | OD-20,OD-02 |
| WS-15 | Merchant/integration/SDK (scope-gated, OD-20/OD-17) | worker | mid/mid | WS-00,WS-23 | CP-6 | 14.75–28.6 | partial | OD-20 |
| WS-16 | Optional operator services (OD-21) + pool-sdk backup KDF parity (SEC-16) | worker | mid/strongest | WS-00,WS-18 | CP-6 | 12.75–27.5 | partial | OD-21 |
| WS-17 | Device/browser evidence records + CLI post-B02 cross-check + B06 run records | worker | cheap/mid | WS-00,WS-04,WS-05,WS-08,WS-09,WS-19,WS-25 | CP-7,CP-8 | 1.5–3 | none | OA-04 |
| WS-18 | Passphrase/KDF floor: offline estimator, generated-passphrase default, high tier for new exports (SEC-05) | worker | strongest/strongest | WS-00 | CP-1 | 2–4 | all | OD-09 |
| WS-19 | Independent GhostPay-free recovery tool (spec 18 / req 3q; SEC-04, TB-05) | worker | strongest/strongest | WS-00,WS-03,WS-08,WS-09,WS-25 | CP-2,CP-5 | 5–9.5 | all | - |
| WS-20 | CI/release pipeline: release verify anvil policy (TB-01), test-gap wiring (TB-09/TB-06), CI speed, attestation | coordinator | strongest/strongest | WS-00,WS-02,WS-19,WS-22 | CP-1,CP-2,CP-7,CP-9 | 4.45–9 | partial | OA-07,OD-07,OA-03,OA-01 |
| WS-21 | Lean shell hardening: anti-framing guard, opener nulling, sanitized root error handlers | worker | mid/strongest | WS-00 | CP-4 | 0.75–1.5 | all | - |
| WS-22 | Repo tooling + dependency refresh: #204 port (OD-15 default), minor/patch refresh (OD-18 default) | coordinator | strongest/mid | WS-00 | CP-1 | 1.5–3.5 | all | OD-15,OD-18 |
| WS-23 | Local data privacy: confirmed erase-all + linkable storage identifiers pseudonymized (SEC-23, SEC-22) | worker | strongest/strongest | WS-00,WS-01,WS-07,WS-10 | CP-5 | 3–6 | all | - |
| WS-24 | Strict on-chain verifier for web/CLI/relayer + dual-provider readback + registry pin; legacy manifest path removed | worker | strongest/strongest | WS-00,WS-05 | CP-2,CP-4 | 6.75–11.25 | all | OD-07,OA-04 |
| WS-25 | Spec 18 K05: encrypted bounded bulk archive of validated one-time keys (format, import, panel) | worker | strongest/strongest | WS-00,WS-03,WS-07,WS-08,WS-18,WS-19 | CP-5 | 3.25–4.25 | all | - |
| WS-90 | Experimental (45) + future (43): keep separate / defer | none | cheap/mid | - | - | 0–0 | all | OD-04,OD-05,OD-11,OD-12,OD-13,OD-20,OD-21,OD-22,OD-17 |

## 5. Workstream cards

### WS-00 — Rebaseline + integration start (coordinator)

- **Map**  · **Exec** coordinator · **Tier** impl strongest / review strongest · **Est** 0.75–1.6 d · **CP** CP-0 · **Unblocked** all
- **Features (owns)** - · **Findings** SEC-39 · **TB** TB-10
- **Deps** - · **Owner gate** - · **External** -
- **Worktree** main checkout (integration) · **Branch** the designated integration branch itself
- **Owned (exclusive)** `docs/handoffs/next-phase-20261118/**`
- **Objective** Fix start commit by rule; bootstrap toolchain; record baseline gate numbers; fresh census; create integration branch ws/WS-00-integration; erratum for packet docs-only claim (SEC-39).
- **Items**
  - `WS-00.1` w0 CP-0 0.1–0.25 d [implement] deps CP-0 · UB — Apply start-commit rule (PLAN §2); `git checkout -B <designated branch> $START` in the main checkout (prompt section 5 step 3); record SHA + tree in BASELINE.md
  - `WS-00.2` w0 CP-0 0.25–0.5 d [implement] deps CP-0 · UB — Foundry v1.8.5 from GitHub release tarball (sha256 recorded; foundry.paradigm.xyz blocked), solc 0.8.28 solc-static-linux via FOUNDRY_SOLC (binaries.soliditylang.org blocked), Chromium path, `npm ci --ignore-scripts`, `npm run build:libs`
  - `WS-00.3` w0 CP-0 0.25–0.5 d [implement] deps CP-0 · UB — Run G-FULL on start commit; compare with CI 44242366118 (web 2,749 passed/1 skipped; e2e full 78/1, lean 66/3; forge 490 passed); record in BASELINE.md
  - `WS-00.4` w0 CP-0 0.1–0.25 d [implement] deps CP-0 · UB — Fresh read-only branch census (refs at time T) before any retirement talk (OD-19 stays pending)
  - `WS-00.5` w1 CP-0 0.05–0.1 d [repair] deps CP-0 · UB — Verify packet at start commit: at 71abc7e5 PROMOTION_PACKET.md:15-16 already names 7a620ff1 + the R-18 SellerKeys.test.tsx delta (VERIFIED) -> SEC-39 closed by the #203 head; record in BASELINE.md, add erratum only if the start commit differs
- **Acceptance** FEATURE_ACCEPTANCE_CRITERIA.md -; SEC remediation: SEC-39; BLOCKERS §5 TB-10; item text = done-when for non-row items
- **Security review** n/a (baseline only)
- **Tests**
```bash
G-FULL (§8) on START; record counts
```
- **Handoff +** BASELINE.md: START sha, tree, toolchain sha256s, G-FULL counts vs CI 44242366118, census refs-at-T

### WS-01 — Transport honesty: local-proxy CSP (TB-02), wss rejection, fetch options, net-transport claims, embed SRI

- **Map** WS-01 (F-NET-01, F-WEB-18) · **Exec** worker · **Tier** impl mid / review strongest · **Est** 3.15–6.25 d · **CP** CP-1, CP-9 · **Unblocked** partial
- **Features (owns)** F-NET-01 F-WEB-18 · **Findings** SEC-10 SEC-19 SEC-27 SEC-20 SEC-45 SEC-43 · **TB** TB-02
- **Deps** WS-00 · **Owner gate** OD-07 · **External** -
- **Worktree** `../wt/WS-01` · **Branch** `ws/WS-01-transport-honesty`
- **Owned (exclusive)** `packages/net-transport/**`, `packages/chain-adapters/src/rpc.ts`, `packages/chain-adapters/src/rpc*.test.ts`, `apps/web/src/lib/scanPrivacy.ts`, `apps/web/src/lib/scanPrivacy*.test.ts`, `apps/web/src/lib/settings.ts`, `apps/web/src/lib/settings*.test.ts`, `apps/web/src/lib/settingsExchange.ts`, `apps/web/src/lib/settingsExchange*.test.ts`, `apps/web/src/views/Settings.tsx`, `apps/web/src/views/Settings*.test.tsx`, `apps/web/index.html`, `apps/web/public/_headers`, `apps/web/scripts/csp.mjs`, `apps/web/src/buildScripts.test.ts`, `apps/web/src/privacyInvariants.test.ts`, `deploy/nginx/security-headers.conf`, `deploy/nginx/security-headers-embed.conf`, `infra/proxy/ghostpay-headers.conf`, `infra/proxy/Caddyfile`, `infra/web/Caddyfile.static`, `apps/web/src/lib/embedHost.ts`, `apps/web/scripts/embed-sri.mjs`, `apps/web/public/ghostpay-embed-v2.js`, `docs/specs/10-feature5-stage1-private-scanning.md`, `docs/threat-model/PRIVACY_THREAT_MODEL.md`, `apps/web/e2e/scan-transport-csp.spec.ts`
- **Hands over** WS-13 at CP-1 (`deploy/nginx/security-headers.conf`, `deploy/nginx/security-headers-embed.conf`, `infra/proxy/ghostpay-headers.conf`, `infra/proxy/Caddyfile`, `infra/web/Caddyfile.static`); WS-23 at CP-1 (`apps/web/src/views/Settings.tsx`, `apps/web/src/views/Settings*.test.tsx`)
- **Objective** Make every transport claim true: local-proxy scan works under a CSP allowing http loopback origins (any port; BLOCKERS TB-02) in the full/self-host profile only, or is removed from lean UI + docs (coordinator default: remove from lean, fix-or-remove in full); reject wss://; fetch transports omit credentials/cache/referrer; docs match.
- **Items**
  - `WS-01.1` w1 CP-1 1–2 d [repair] deps CP-0 · UB — Lean: remove local-proxy mode from UI + docs; full/self-host: remove the mode by default, or keep it with connect-src loopback entries http://127.0.0.1:*, http://localhost:*, http://[::1]:* (a static meta CSP cannot be narrowed to the chosen port; BLOCKERS TB-02) under RV-SEC review; lean CSP never widened; reject wss:// in checkRpcUrl and drop `wss:` from connect-src (index.html, _headers, nginx, infra proxies, csp.mjs); Playwright test under the real meta CSP; fix docs/specs/10 mode b (docs/pages/README.md:49 via WS-04.4)
  - `WS-01.2` w1 CP-1 1.6–3 d [repair] deps CP-0 · UB — F-NET-01 rows IC (OHTTP vectors; credentials omit/no-store/no-referrer in chain-adapters rpc.ts + net-transport; Tor copy); PRIVACY_THREAT_MODEL 1.1/5 refreshed (SEC-27); random JSON-RPC ids or documented (SEC-45); embedHost.ts:8 comment fix; privacyInvariants extended to chain-adapters + net-transport
  - `WS-01.3` w9 CP-9 0.55–1.25 d [defer] deps CP-4 · BLK: release trust root; OD-07 — Publish embed v2 SHA-384 SRI + hash in signed release notes after OD-07 trust root (owner key)
- **Acceptance** FEATURE_ACCEPTANCE_CRITERIA.md §F-NET-01, §F-WEB-18; SEC remediation: SEC-10, SEC-19, SEC-27, SEC-20, SEC-45, SEC-43; BLOCKERS §5 TB-02; item text = done-when for non-row items
- **Security review** REQUIRED, strongest, RV-SEC (CSP / transport boundary)
- **Tests**
```bash
npm test -w @ghostpay/net-transport
(cd packages/chain-adapters && npx vitest run src/rpc.test.ts)
(cd apps/web && npx vitest run src/lib/scanPrivacy src/lib/settings src/views/Settings src/privacyInvariants src/buildScripts)
GHOSTPAY_LOCAL_BUILD_PROFILE=lean npm run build -w @ghostpay/web && GHOSTPAY_LOCAL_BUILD_PROFILE=full npm run build -w @ghostpay/web
(cd apps/web && for p in lean full; do GHOSTPAY_LOCAL_BUILD_PROFILE=$p npx playwright test e2e/scan-transport-csp.spec.ts e2e/embed-iframe.spec.ts || exit 1; done)
bash deploy/selftest.sh
! grep -n 'wss:' apps/web/index.html apps/web/public/_headers deploy/nginx/security-headers.conf infra/proxy/ghostpay-headers.conf infra/web/Caddyfile.static
```
- **Handoff +** CSP diff per file; local-proxy decision per profile (removed | works) + e2e proof under real meta CSP; `grep wss:` output

### WS-02 — Honest copy + doc drift (TB-10, E-17, E-08) + regression scripts (TB-06) + recovered harness/doc hunk

- **Map** WS-02 · **Exec** worker · **Tier** impl mid / review mid · **Est** 4.15–8.8 d · **CP** CP-1, CP-3 · **Unblocked** all
- **Features (owns)** F-WEB-23 F-DOC-01 F-WEB-09 F-DEP-05 F-WEB-06 F-KEY-03 F-DOC-02 · **Findings** SEC-28 SEC-21 SEC-17 SEC-15 · **TB** TB-10 TB-06
- **Deps** WS-00 · **Owner gate** OD-20, OD-16, OA-04 · **External** -
- **Worktree** `../wt/WS-02` · **Branch** `ws/WS-02-honest-docs`
- **Owned (exclusive)** `README.md`, `docs/user/**`, `docs/guides/**`, `docs/wiki/**`, `docs/developer/api/policy-scheme.md`, `docs/developer/security-model.md`, `docs/audits/00-slither-triage.md`, `docs/design/qr-colors.md`, `docs/specs/02-*.md`, `packages/chain-adapters/README.md`, `packages/chain-adapters/TODO-VERIFY.md`, `apps/web/help.html`, `apps/web/privacy.html`, `apps/web/src/views/About.tsx`, `apps/web/src/views/Home.tsx`, `apps/web/src/views/About*.test.tsx`, `apps/web/src/views/Home*.test.tsx`, `apps/web/scripts/test-reconciliation-idb.mjs`, `apps/web/scripts/test-seller-vault-idb.mjs`, `scripts/tests/privacy-claims.test.mjs`
- **Hands over** WS-10 at CP-1 (`docs/user/seller-privacy.md`)
- **Objective** Remove overclaims, fix doc/code drift, repair the broken IndexedDB reconciliation script, recover the 57dcf7e8 seller-vault Chromium harness and the 400e20f1 qr-colors hunk; banned-phrase test.
- **Items**
  - `WS-02.1` w1 CP-1 0.75–1.1 d [repair] deps CP-0 · UB — E-17 strings (en.json via coord-request; policy-scheme.md:233; README.md:5; docs/pages via WS-04.4) + scripts/tests/privacy-claims.test.mjs banned-phrase test
  - `WS-02.2` w1 CP-1 0.25–0.85 d [defer] deps CP-0 · UB: copy fixes now; translation later; OD-20,OD-16 — docs/user: browser/cloud history sync of invoice fragments (E-08); translated docs stay OD-16/EX-04 gated
  - `WS-02.3` w1 CP-1 0.25–0.75 d [repair] deps CP-0 · UB — TB-10 remainder: stale chain-adapters README text; Slither "no detector exclusions" claim (docs/developer/security-model.md, docs/audits/00-slither-triage.md) corrected to the CI reality (Low/Info excluded)
  - `WS-02.4` w2 CP-1 0.75–1.1 d [repair] deps CP-0 · UB — apps/web/scripts/test-reconciliation-idb.mjs:71 -> invalidateFrom(block, observed, canonicalHash); CI wiring by WS-20.2
  - `WS-02.5` w2 CP-1 0.6–1.35 d [repair] deps CP-0 · UB; OA-04 — chain-adapters README/TODO-VERIFY consistent with quote.ts FEEDS (4 testnet feeds)
  - `WS-02.6` w4 CP-3 0–0.45 d [defer] deps CP-0 · UB — docs/specs/02-* disposition note for rule 2 citing negative.test.ts:200,314; owner acknowledgement requested as OD-23 (engineering never records it)
  - `WS-02.7` w5 CP-3 0.85–1.75 d [recover] deps WS-02.6 · UB — Recover 57dcf7e8 apps/web/scripts/test-seller-vault-idb.mjs (R1-R3 + two-tab); independent decode vector moves to WS-19.1
  - `WS-02.8` w5 CP-3 0.7–1.45 d [repair] deps WS-02.7 · UB — docs/design/qr-colors.md hunk from 400e20f1 (bearer precedence matches qrKinds.test.ts:40-42); #140 wiki text not imported
- **Acceptance** FEATURE_ACCEPTANCE_CRITERIA.md §F-WEB-23, §F-DOC-01, §F-WEB-09, §F-DEP-05, §F-WEB-06, §F-KEY-03, §F-DOC-02; SEC remediation: SEC-28, SEC-21, SEC-17, SEC-15; BLOCKERS §5 TB-10, TB-06; item text = done-when for non-row items
- **Security review** mid copy review + human sign-off of privacy claims (F-WEB-23 RQ)
- **Tests**
```bash
node --test scripts/tests/privacy-claims.test.mjs
GHOSTPAY_CHROMIUM=<chromium> node apps/web/scripts/test-reconciliation-idb.mjs   # exit 0, PASS incl. "no external egress"
GHOSTPAY_CHROMIUM=<chromium> node apps/web/scripts/test-seller-vault-idb.mjs     # R1-R3 + two-tab PASS (WS-02.7)
(cd apps/web && npx vitest run src/views/About src/lib/qrKinds)
node scripts/i18n/check.mjs   # after coord-request merge
```
- **Handoff +** claims changed (old → new, file:line); coord-request keys for en.json

### WS-03 — Spec 18 core formats: K01 schemas + verified derivation, K02 single-keypair envelope (+F-KEY-13 later)

- **Map** WS-03 · **Exec** worker · **Tier** impl strongest / review strongest · **Est** 9.6–14.75 d · **CP** CP-2, CP-6 · **Unblocked** all
- **Features (owns)** F-KEY-07 F-KEY-08 F-KEY-13 · **Findings** SEC-04 SEC-38 SEC-05 SEC-37 SEC-15 · **TB** -
- **Deps** WS-00, WS-18 · **Owner gate** OD-10, OD-09 · **External** -
- **Worktree** `../wt/WS-03` · **Branch** `ws/WS-03-spec18-formats`
- **Owned (exclusive)** `packages/ux-vault/src/stealth-export*.ts`, `packages/ux-vault/src/keystore-portable.ts`, `packages/ux-vault/src/portable-parity.test.ts`, `packages/ux-vault/src/portable-errors.ts`, `test-vectors/stealth-export-v1.json`, `test-vectors/keystore-v1-golden.json`, `docs/developer/key-portability-formats.md`, `docs/developer/byte-layouts.md`, `docs/specs/18-stealth-keypair-export.md`, `packages/secret-box/**`
- **Handover in** after CP-1 from WS-18: `packages/ux-vault/src/keystore-portable.ts`, `packages/ux-vault/src/portable-parity.test.ts`, `packages/ux-vault/src/portable-errors.ts`
- **Objective** Freeze K01/K02 (CP-2): strict typed formats, verified derivation, new AAD domain envelope, golden v1 vector; legacy keystore v1 byte-identical; no secret JSON-hex plaintext.
- **Items**
  - `WS-03.1` w3 CP-2 4.25–6 d [implement] deps CP-0 · UB; OD-10 — K01 per rows IC; OD-10 recommendation applied + recorded in spec 18 for owner sign-off; D-21 hash convention recorded
  - `WS-03.2` w3 CP-2 4.25–6.5 d [implement] deps WS-03.1, WS-18.2 · UB: floor for new formats per OD-09 default (WS-18 `high` tier: generated diceware default or ≈80-bit estimate; never score>=3 alone); OD-09 — K02 per rows IC; golden keystore v1 vector first (test-vectors/keystore-v1-golden.json, injected salt/IV, test-only); docs/developer/byte-layouts.md:195-198 drift fixed (SEC-15); passphrase tier `high` from WS-18 (OD-09 default)
  - `WS-03.3` w8 CP-6 1.1–2.25 d [defer] deps CP-5 · UB — secret-box wiring revisit after KC (deferred; suites stay green)
- **Acceptance** FEATURE_ACCEPTANCE_CRITERIA.md §F-KEY-07, §F-KEY-08, §F-KEY-13; SEC remediation: SEC-04, SEC-38, SEC-05, SEC-37, SEC-15; item text = done-when for non-row items
- **Security review** REQUIRED, strongest, RV-CRYPTO; second strongest reviewer signs the CP-2 format freeze
- **Tests**
```bash
npm test -w @ghostpay/ux-vault && npm test -w @ghostpay/core-crypto && npm test -w @ghostpay/cli
(cd packages/ux-vault && npx vitest run src/portable-parity src/stealth-export)
git diff --exit-code "$START" -- test-vectors/scheme1.json packages/core-crypto/src
node --test tools/independent-recovery/test   # run by WS-19; WS-03 runs read-only at freeze
GHOSTPAY_LOCAL_BUILD_PROFILE=lean npm run build -w @ghostpay/web   # lean import boundary
```
- **Handoff +** freeze note: schema ids, AAD domain string, KDF params, error codes, vector sha256; frozen-path diff empty

### WS-04 — Pages origin gate (TB-03) + bundle/egress checks + static-beta deploy prep (F-WEB-21)

- **Map** WS-04 (F-WEB-21) · **Exec** worker · **Tier** impl mid / review strongest · **Est** 3.6–7.25 d · **CP** CP-1, CP-4, CP-7 · **Unblocked** partial
- **Features (owns)** F-WEB-21 · **Findings** SEC-09 SEC-24 SEC-40 SEC-10 SEC-28 SEC-46 SEC-01 SEC-08 SEC-02 · **TB** TB-03 TB-07
- **Deps** WS-00, WS-01, WS-05, WS-20, WS-24 · **Owner gate** OA-02, OD-08, OD-06, OD-07, OA-01, OA-05, OA-06 · **External** -
- **Worktree** `../wt/WS-04` · **Branch** `ws/WS-04-pages-gate`
- **Owned (exclusive)** `scripts/pages/**`, `apps/web/scripts/scan-bundle.mjs`, `apps/web/src/scanBundle.test.ts`, `apps/web/scripts/localBuildProfile.mjs`, `apps/web/scripts/localBuildProfile.test.mjs`, `scripts/qualify-lean.sh`, `docs/pages/**`, `docs/adr/ADR-0029-github-pages-static-beta.md`
- **Objective** Origin gate checks the deployed origin, not the declared one; every *.html scanned; one lean exclusion list; extended egress smoke; deploy prep short of owner dispatch.
- **Items**
  - `WS-04.1` w1 CP-1 0.5–1 d [repair] deps CP-0 · UB — smoke.mjs/smoke-url.mjs/build-pages.sh: assert new URL(page_url).origin === GHOSTPAY_PAGES_ORIGIN; any origin serving other project sites = shared; pages.yml assertion + cname/https_enforced check via coord-request (WS-20)
  - `WS-04.2` w1 CP-1 0.5–1 d [repair] deps CP-0 · UB — scan-bundle.mjs checks every emitted *.html (inline script/CSP); single exported lean exclusion list used by localBuildProfile.mjs and scripts/pages/verify-pages-site.mjs
  - `WS-04.3` w1 CP-1 0.1–0.25 d [repair] deps CP-0 · UB — Pages banner link (build-pages.sh) target=_blank rel="noopener noreferrer"
  - `WS-04.4` w2 CP-1 0.25–0.5 d [repair] deps CP-0 · UB — docs/pages: TB-07 default (lean keeps v1 payer buffer) in README/RELEASE_MATRIX; E-17 lines 48-49; local-proxy claim :49
  - `WS-04.5` w6 CP-4 0.75–1.5 d [implement] deps WS-04.4 · UB — smoke.mjs walks every lean view + opens a fixture invoice; asserts zero requests outside the site; run on local Pages artifact (`bash scripts/pages/build-pages.sh` + `node scripts/pages/serve-pages.mjs`)
  - `WS-04.6` w9 CP-7 1.5–3 d [defer] deps CP-4, WS-05.4 · BLK: prep only; OA-02,OD-08,OD-06,OD-07,OA-01,OA-05,OA-06 — After OD-06/OD-07/OD-08/OA-01/OA-02/OA-05/OA-06: live `node scripts/pages/smoke.mjs <url> --commit <sha>` incl. origin assertion + extended egress walk; deployment and release recorded as separate states
- **Acceptance** FEATURE_ACCEPTANCE_CRITERIA.md §F-WEB-21; SEC remediation: SEC-09, SEC-24, SEC-40, SEC-10, SEC-28, SEC-46, SEC-01, SEC-08, SEC-02; BLOCKERS §5 TB-03, TB-07; item text = done-when for non-row items
- **Security review** REQUIRED, strongest, RV-SEC (origin gate, bundle scan)
- **Tests**
```bash
node --test scripts/pages/*.test.mjs apps/web/scripts/localBuildProfile.test.mjs
(cd apps/web && npx vitest run src/scanBundle src/AppLean)
GHOSTPAY_PAGES_DEV=1 GHOSTPAY_PAGES_ORIGIN=http://127.0.0.1:4180 bash scripts/pages/build-pages.sh "$(realpath ..)/pages-WS-04"
node scripts/pages/serve-pages.mjs "$(realpath ..)/pages-WS-04" --port 4180 --base /GhostPay/ &  node scripts/pages/smoke.mjs http://127.0.0.1:4180/GhostPay/ --commit $(git rev-parse HEAD)
node scripts/pages/verify-pages-site.mjs <site dir> <lean report json> --expect-commit $(git rev-parse HEAD)
bash scripts/qualify-lean.sh "$(realpath ..)/lean-q-WS-04"
```
- **Handoff +** negative tests: declared≠deployed origin, shared origin; pages.yml coord-request patch

### WS-05 — Deployment of record: manifest signing helper, anvil rehearsal, matrix revalidation, B02-B04 evidence

- **Map** WS-05 (split: F-DEP-02, F-WEB-17, F-CTR-04 -> WS-24) · **Exec** worker · **Tier** impl strongest / review strongest · **Est** 6.75–12.5 d · **CP** CP-1, CP-4, CP-7 · **Unblocked** partial
- **Features (owns)** F-DEP-01 F-DEP-04 F-DEP-03 · **Findings** SEC-32 SEC-44 SEC-36 · **TB** TB-06
- **Deps** WS-00 · **Owner gate** OD-07, OD-14, OA-04, OD-08, OA-03 · **External** EX-06
- **Worktree** `../wt/WS-05` · **Branch** `ws/WS-05-deploy-record`
- **Owned (exclusive)** `apps/web/deployments/**`, `apps/web/scripts/validate-deployments.mjs`, `apps/web/e2e/prepare-manifest.mjs`, `apps/web/src/lib/bundledManifests.ts`, `apps/web/src/lib/releaseKeys.ts`, `apps/web/src/lib/releaseKeys*.test.ts`, `packages/chain-adapters/src/config/chains.ts`, `packages/chain-adapters/config/matrix.json`, `scripts/check-chain-matrix.mjs`, `scripts/lib/chain-matrix.mjs`, `scripts/tests/chain-matrix*.test.mjs`, `scripts/testnet/**`, `packages/contracts/script/SmokeSepolia.s.sol`, `packages/contracts/scripts/pre-deploy-check.sh`, `docs/operators/testnet-runbook.md`
- **Hands over** WS-13 at CP-7 (`docs/operators/testnet-runbook.md`)
- **Objective** Everything short of the owner broadcast proven on local anvil; offline signing helper; strict matrix gate unchanged; evidence ingestion after OA-04.
- **Items**
  - `WS-05.1` w2 CP-1 1.25–2.5 d [repair] deps CP-0 · UB: repair now; owner signing later; OD-07 — README:37 drift; scripts/testnet/sign-manifest.mjs offline helper (stdin/encrypted keystore, no argv secret, no network); validate-deployments refuses the public Playwright key 0x0707..07
  - `WS-05.2` w6 CP-4 2.25–4 d [implement] deps WS-05.1 · UB: broadcast blocked on OA-04; OD-14,OA-04,OD-08 — Deploy driver network list == enabled testnet set; rehearse on anvil network-free; FEE_RECIPIENT accepts ETH (readback smoke); OD-14 default EOA recorded in manifest; hoodi resolved
  - `WS-05.3` w6 CP-4 2.25–4 d [implement] deps WS-05.2 · UB: cells need B02 evidence; OA-04; EX-06 — `node scripts/check-chain-matrix.mjs --revalidate --rpc <user url>` read-only codehash re-read + diff; never edits matrix.json
  - `WS-05.4` w9 CP-7 1–2 d [implement] deps CP-4 · BLK: owner broadcast + key; OD-07,OA-03,OA-04 — Ingest owner Sepolia broadcast: tx hashes, blocks, verify-sources, runtime codehash read-back (CLI as 2nd impl), owner-signed manifest bundled, `GHOSTPAY_RELEASE_PUBKEYS=<key> node apps/web/scripts/validate-deployments.mjs`, Sepolia matrix cells pinned
- **Acceptance** FEATURE_ACCEPTANCE_CRITERIA.md §F-DEP-01, §F-DEP-04, §F-DEP-03; SEC remediation: SEC-32, SEC-44, SEC-36; BLOCKERS §5 TB-06; item text = done-when for non-row items
- **Security review** REQUIRED, strongest, RV-REL (no argv secrets, no logs, no network in signing helper)
- **Tests**
```bash
node --test scripts/testnet/*.test.mjs scripts/tests/chain-matrix.test.mjs scripts/tests/chain-matrix-cli.test.mjs
node scripts/check-chain-matrix.mjs && ! node scripts/check-chain-matrix.mjs --release   # release mode fails closed until evidence
bash scripts/testnet/deploy.sh sepolia rehearse   # local anvil, no network
GHOSTPAY_RELEASE_PUBKEYS=<synthetic pubkey> node apps/web/scripts/validate-deployments.mjs   # 0x0707..07 refused
(cd packages/contracts && forge build --sizes && forge test)
```
- **Handoff +** rehearsal transcript (no network); helper threat notes; `check-chain-matrix.mjs --release` still fails closed

### WS-06 — Mythril keyed disposition mechanism (OD-03 option a prototype) + analyzer extensions (D-12)

- **Map** WS-06 (F-CTR-07) · **Exec** worker · **Tier** impl strongest / review strongest · **Est** 4.75–9 d · **CP** CP-4, CP-6, CP-9 · **Unblocked** partial
- **Features (owns)** F-CTR-07 · **Findings** SEC-33 SEC-17 SEC-47 · **TB** -
- **Deps** WS-00 · **Owner gate** OD-03, OA-01 · **External** -
- **Worktree** `../wt/WS-06` · **Branch** `ws/WS-06-analyzer-gate`
- **Owned (exclusive)** `packages/contracts/scripts/run-mythril.sh`, `packages/contracts/scripts/run-echidna.sh`, `packages/contracts/scripts/mythril-compat.py`, `packages/contracts/scripts/collect-analysis-report.py`, `packages/contracts/test/MythrilExpiryDispositions.t.sol`, `packages/contracts/test/MythrilFactoryDispositions.t.sol`, `packages/contracts/test/echidna/**`, `packages/contracts/echidna.yaml`, `docs/audits/mythril-*`, `docs/audits/analyzer-*`, `scripts/audit/**`, `scripts/tests/mythril-runner.test.mjs`, `scripts/tests/echidna-runner.test.mjs`
- **Objective** Make OD-03 concrete without weakening the gate: keyed, source-matched disposition file; report-only comparison for the Sepolia gate ("no record beyond the 11"); D-12 Echidna/Slither extensions; enable only after OD-03. packages/contracts/src/** is frozen (no WS owns it).
- **Items**
  - `WS-06.1` w6 CP-4 2–3.5 d [refactor] deps CP-0 · UB — Disposition file keyed (contract, function, SWC, PC/source map, solc, source keccak) + checker in REPORT-ONLY mode; any unmatched/new/changed record reported; R8 timeout behaviour recorded; release.yml untouched
  - `WS-06.2` w8 CP-6 2.5–5 d [refactor] deps WS-06.1 · UB: analyzer extensions unblocked; OD-03,OA-01 — D-12: Echidna actions (permit paths, forged signers, hostile tokens, factory deploy/fee, PolicyRouter, L2 timestamp model); one-time full-severity Slither triage report; Mythril complete runs Router/PolicyRouter
  - `WS-06.3` w9 CP-9 0.25–0.5 d [refactor] deps WS-06.2 · BLK: OD-03; OD-03,OA-01 — Enable the keyed gate in release.yml/contract-analysis.yml (coord applies) only after OD-03 approval; rehearsal per WS-20.6
- **Acceptance** FEATURE_ACCEPTANCE_CRITERIA.md §F-CTR-07; SEC remediation: SEC-33, SEC-17, SEC-47; item text = done-when for non-row items
- **Security review** REQUIRED, strongest, RV-SEC (gate never weakened)
- **Tests**
```bash
node --test scripts/tests/mythril-runner.test.mjs scripts/tests/echidna-runner.test.mjs scripts/tests/contract-analysis-workflow.test.mjs
(cd packages/contracts && forge test --match-contract "Mythril(Expiry|Factory)Dispositions" && forge fmt --check)
git diff --exit-code "$START" -- packages/contracts/src
mythril/echidna/slither absent locally: analyzer evidence = contract-analysis.yml run id on the pushed integration branch, else UNVERIFIED
```
- **Handoff +** checker output: 11 known records all matched; mutated record / changed source hash fails

### WS-07 — Step-up re-auth: OD-01 fail-closed default (SEC-03/TB-04) + archive export step-up (F-KEY-05)

- **Map** WS-07 (F-KEY-05) · **Exec** worker · **Tier** impl strongest / review strongest · **Est** 2.95–6 d · **CP** CP-1, CP-2 · **Unblocked** all
- **Features (owns)** F-KEY-05 · **Findings** SEC-03 SEC-40 · **TB** TB-04
- **Deps** WS-00 · **Owner gate** OD-01 · **External** -
- **Worktree** `../wt/WS-07` · **Branch** `ws/WS-07-step-up`
- **Owned (exclusive)** `apps/web/src/lib/keyVault.ts`, `apps/web/src/lib/keyVault*.test.ts`, `apps/web/src/lib/session.ts`, `apps/web/src/lib/session*.test.ts`, `apps/web/src/lib/stepUp.ts`, `apps/web/src/lib/stepUp*.test.ts`, `apps/web/src/views/SellerKeys.tsx`, `apps/web/src/views/SellerKeys*.test.tsx`, `apps/web/src/views/Sweep.tsx`, `apps/web/src/views/Sweep*.test.tsx`, `apps/web/src/components/BackupPanel.tsx`, `apps/web/src/components/BackupPanel*.test.tsx`, `apps/web/src/components/TagArchive.tsx`, `apps/web/src/components/TagArchive*.test.tsx`, `apps/web/src/lib/tagArchive.ts`, `apps/web/e2e/backup-panel.spec.ts`
- **Hands over** WS-09 at CP-2 (`apps/web/src/lib/session.ts`, `apps/web/src/lib/session*.test.ts`, `apps/web/src/views/SellerKeys.tsx`, `apps/web/src/views/SellerKeys*.test.tsx`); WS-23 at CP-2 (`apps/web/src/lib/keyVault.ts`, `apps/web/src/lib/keyVault*.test.ts`)
- **Objective** No new secret export without re-authentication: vault-less sessions refuse the spec-18 exports (K03-K06 encrypted and raw keys, archive) through one step-up API that K03-K06 consume (OD-01 default); the existing encrypted keystore v1 backup and vault creation stay available with disclosure (constraint 4; BLOCKERS OD-01); sweep unchanged but warned.
- **Items**
  - `WS-07.1` w1 CP-1 1.25–2.5 d [repair] deps CP-0 · UB: fail-closed default; model choice OD-01 later; OD-01 — keep `authorizeKeyExport` returning undefined for the keystore v1 backup in vault-less sessions (keyVault.ts:257-266; it is the only encrypted backup of in-memory keys, BLOCKERS OD-01) and add a disclosure + typed confirmation before that download; keyVault.test.ts:241 pin kept and extended (vault-less v1 backup allowed after confirmation; keys tied to a vault need its passphrase); new spec-18 exports refuse without a vault through WS-07.2 `requireStepUp`; vault-less sweep warning + beta disclosure copy (coord en.json); beforeunload guard while backup unverified (SEC-40 part 2)
  - `WS-07.2` w3 CP-2 1.7–3.5 d [repair] deps WS-07.1 · UB: implements OD-01 choice if recorded, else default (a); OD-01 — requireStepUp(kind) API (vault passphrase re-entry; pluggable for OD-01 (c) WebAuthn UV); tag-archive export uses it
- **Acceptance** FEATURE_ACCEPTANCE_CRITERIA.md §F-KEY-05; SEC remediation: SEC-03, SEC-40; BLOCKERS §5 TB-04; item text = done-when for non-row items
- **Security review** REQUIRED, strongest, RV-CRYPTO (secret-export authorization)
- **Tests**
```bash
(cd apps/web && npx vitest run src/lib/keyVault src/lib/session src/lib/stepUp src/views/SellerKeys src/views/Sweep src/components/BackupPanel src/components/TagArchive)
(cd apps/web && for p in lean full; do GHOSTPAY_LOCAL_BUILD_PROFILE=$p npx playwright test e2e/backup-panel.spec.ts e2e/recovery.spec.ts e2e/sweep.spec.ts || exit 1; done)
```
- **Handoff +** refusal matrix: session {vault, vault-less} × export {keystore v1 backup, raw, archive, K03/K06, sweep} × factor {none, wrong, right}; vault-less keystore v1 backup = allowed after disclosure + typed confirmation (BLOCKERS OD-01), every other vault-less secret export = refused, sweep = warned

### WS-08 — Spec 18 K03-K04: Payment details export UI (public + encrypted keypair), raw single-key export

- **Map** WS-08 (F-KEY-11/K05 split -> WS-25) · **Exec** worker · **Tier** impl strongest / review strongest · **Est** 10.25–16.5 d · **CP** CP-5 · **Unblocked** all
- **Features (owns)** F-KEY-09 F-KEY-10 · **Contributes to** F-KEY-11 · **Findings** SEC-03 SEC-13 · **TB** -
- **Deps** WS-00, WS-03, WS-07, WS-18, WS-19, WS-25 · **Owner gate** OD-01, OD-02 · **External** -
- **Worktree** `../wt/WS-08` · **Branch** `ws/WS-08-spec18-export-ui`
- **Owned (exclusive)** `apps/web/src/views/PaymentDetails.tsx`, `apps/web/src/views/PaymentDetails*.test.tsx`, `apps/web/src/lib/stealthExport.ts`, `apps/web/src/lib/stealthExport*.test.ts`, `apps/web/src/views/Scan.tsx`, `apps/web/src/views/Scan*.test.tsx`, `apps/web/src/components/RawKeyReveal.tsx`, `apps/web/src/components/RawKeyReveal*.test.tsx`, `apps/web/e2e/stealth-export.spec.ts`
- **Objective** K03 seller-only export with re-auth and explicit chain/EOA/scope; K04 raw key behind re-auth + second confirmation, no clipboard (OD-02 default), anvil interop proof (WS-19.5); mounts the K05 panel from WS-25.
- **Items**
  - `WS-08.1` w7 CP-5 6–10 d [implement] deps CP-2 · UB: with OD-01/OD-02 fail-closed defaults (vault required, no clipboard); OD-01,OD-02 — K03 per rows IC (Payment details > Export from Scan row; ownership label separate from receipt status)
  - `WS-08.2` w7 CP-5 4–6 d [implement] deps WS-08.1 · UB: OD-02 default: no clipboard; file download + held reveal; OD-02,OD-01 — K04 per rows IC; independent proof via pinned Foundry 1.8.5 cast/anvil + WS-19.5
  - `WS-08.3` w7 CP-5 0.25–0.5 d [implement] deps WS-08.2, WS-25.2 · UB — Mount the WS-25 K05 archive panel in Payment details/Scan; e2e covers the mounted flow
- **Acceptance** FEATURE_ACCEPTANCE_CRITERIA.md §F-KEY-09, §F-KEY-10, §F-KEY-11; SEC remediation: SEC-03, SEC-13; item text = done-when for non-row items
- **Security review** REQUIRED, strongest, RV-CRYPTO + KC independent secret-flow review
- **Tests**
```bash
(cd apps/web && npx vitest run src/views/PaymentDetails src/lib/stealthExport src/views/Scan src/components/RawKeyReveal)
(cd apps/web && for p in lean full; do GHOSTPAY_LOCAL_BUILD_PROFILE=$p npx playwright test e2e/stealth-export.spec.ts || exit 1; done)
GHOSTPAY_LOCAL_BUILD_PROFILE=lean npm run build -w @ghostpay/web
node --test tools/independent-recovery/test   # K04 proof lands via WS-19.5
```
- **Handoff +** secret-flow trace (bytes, lifetime, wipe); no-clipboard proof; anvil interop transcript (via WS-19.5)

### WS-09 — Spec 18 K06: encrypted master spend/view backup; legacy keystore v1 unchanged and distinct

- **Map** WS-09 · **Exec** worker · **Tier** impl strongest / review strongest · **Est** 6.75–9.75 d · **CP** CP-5 · **Unblocked** all
- **Features (owns)** F-KEY-12 · **Findings** SEC-04 SEC-15 · **TB** -
- **Deps** WS-00, WS-03, WS-07, WS-18, WS-19 · **Owner gate** OD-09, OD-01 · **External** -
- **Worktree** `../wt/WS-09` · **Branch** `ws/WS-09-spec18-master`
- **Owned (exclusive)** `packages/ux-vault/src/stealth-master*.ts`, `apps/web/src/lib/keystore.ts`, `apps/web/src/lib/keystore*.test.ts`, `apps/web/e2e/master-backup.spec.ts`, `docs/user/master-backup-recovery.md`
- **Handover in** after CP-2 from WS-07: `apps/web/src/lib/session.ts`, `apps/web/src/lib/session*.test.ts`, `apps/web/src/views/SellerKeys.tsx`, `apps/web/src/views/SellerKeys*.test.tsx`
- **Handover in** after CP-1 from WS-18: `apps/web/src/lib/keystore.ts`, `apps/web/src/lib/keystore*.test.ts`
- **Objective** K06 master backup with scheme/version + recovery instructions; invoice-signing key never included; v1 keystore byte-identical; offline recovery of an omitted historic announcement.
- **Items**
  - `WS-09.1` w7 CP-5 6.75–9.75 d [implement] deps CP-2 · UB: after CP-2 (formats + step-up); OD-01 default; OD-09,OD-01 — K06 per rows IC (format + UI + recovery instructions)
- **Acceptance** FEATURE_ACCEPTANCE_CRITERIA.md §F-KEY-12; SEC remediation: SEC-04, SEC-15; item text = done-when for non-row items
- **Security review** REQUIRED, strongest, RV-CRYPTO + KC independent secret-flow review
- **Tests**
```bash
(cd packages/ux-vault && npx vitest run src/stealth-master src/portable-parity)
(cd apps/web && npx vitest run src/lib/keystore src/lib/session src/views/SellerKeys)
(cd apps/web && for p in lean full; do GHOSTPAY_LOCAL_BUILD_PROFILE=$p npx playwright test e2e/master-backup.spec.ts e2e/recovery.spec.ts || exit 1; done)
npm test -w @ghostpay/cli   # CLI keystore v1 unchanged
```
- **Handoff +** v1 byte-identity proof; recovery instructions text; omitted-announcement recovery transcript (WS-19.4)

### WS-10 — Payer UX + v2 buffer journey + fiat guards (TB-07 lean test)

- **Map** WS-10 · **Exec** worker · **Tier** impl mid / review strongest · **Est** 6.9–12.2 d · **CP** CP-3, CP-6 · **Unblocked** all
- **Features (owns)** F-WEB-05 F-PROTO-05 F-WEB-26 F-WEB-02 F-CTR-06 F-WEB-04 · **Findings** - · **TB** TB-07
- **Deps** WS-00, WS-02, WS-04 · **Owner gate** - · **External** -
- **Worktree** `../wt/WS-10` · **Branch** `ws/WS-10-payer-ux`
- **Owned (exclusive)** `apps/web/src/lib/pay.ts`, `apps/web/src/lib/pay*.test.ts`, `apps/web/src/lib/payExec.ts`, `apps/web/src/lib/payExec*.test.ts`, `apps/web/src/lib/displayText.ts`, `apps/web/src/lib/transactionOutcome.ts`, `apps/web/src/lib/scanSpam.ts`, `apps/web/src/views/Pay.tsx`, `apps/web/src/views/Pay.test.tsx`, `apps/web/src/views/Pay.*.test.tsx`, `apps/web/src/views/CreateInvoice.tsx`, `apps/web/src/views/CreateInvoice*.test.tsx`, `packages/address-safety/**`, `packages/chain-adapters/src/quote.ts`, `packages/chain-adapters/src/quote*.test.ts`, `apps/web/src/lib/duplicateAttemptJournal.ts`, `docs/user/seller-privacy.md`
- **Handover in** after CP-1 from WS-02: `docs/user/seller-privacy.md`
- **Hands over** WS-23 at CP-3 (`apps/web/src/lib/duplicateAttemptJournal.ts`)
- **Objective** Close the payer-side gaps: lean payer-buffer test (TB-07 default), spec 05 2C hint, payeeTrust decision, OP-stack sequencer guard, v2 buffer anvil journey.
- **Items**
  - `WS-10.1` w4 CP-3 0.45–1.1 d [repair] deps WS-04.4 · UB — Lean + full payer-buffer unit tests (keep v1 buffer in lean; docs fixed in WS-04.4)
  - `WS-10.2` w4 CP-3 0.75–1.35 d [implement] deps WS-10.1 · UB — Spec 05 2C hint on Pay; no network call
  - `WS-10.3` w4 CP-3 0.7–1.5 d [repair] deps WS-10.2 · UB — payeeTrust decision (ADR note; export internal or wired with tests); owner acknowledgement requested as OD-23 (engineering never records it)
  - `WS-10.4` w4 CP-3 1.5–2.5 d [repair] deps WS-10.3 · UB — OP-stack sequencer-uptime + grace guard; deviation/USD-peg checks when configured (full profile)
  - `WS-10.5` w4 CP-3 1.5–2 d [implement] deps WS-10.4 · UB — Anvil journey: v2 bufferPolicy -> payment with buffer -> direct sweep paid only from buffer; net asserted
  - `WS-10.6` w8 CP-6 2–3.75 d [defer] deps CP-5 · UB — Confirm disclosure present (deferred)
- **Acceptance** FEATURE_ACCEPTANCE_CRITERIA.md §F-WEB-05, §F-PROTO-05, §F-WEB-26, §F-WEB-02, §F-CTR-06, §F-WEB-04; BLOCKERS §5 TB-07; item text = done-when for non-row items
- **Security review** REQUIRED, strongest, RV-WEB (payment path)
- **Tests**
```bash
(cd apps/web && npx vitest run src/lib/pay src/views/Pay src/views/CreateInvoice)
(cd packages/chain-adapters && npx vitest run src/quote.test.ts src/quote.guards.test.ts)
(cd packages/chain-adapters && REQUIRE_ANVIL=1 ANVIL_BIN=$(command -v anvil) npx vitest run src/quote.anvil.test.ts)
npm test -w @ghostpay/address-safety
node --test apps/web/scripts/localBuildProfile.test.mjs   # lean excludes fiat
(cd apps/web && ANVIL_BIN=$(command -v anvil) SOLC_BIN=$SOLC_0828 REQUIRE_ANVIL=1 npx vitest run <new v2-buffer anvil test>)
```
- **Handoff +** lean vs full payer-buffer table; anvil v2 journey transcript

### WS-11 — Scanner reorg cross-check + CLI/relayer evidence + CLI backup independent decode

- **Map** WS-11 · **Exec** worker · **Tier** impl mid / review strongest · **Est** 2.2–4.45 d · **CP** CP-3 · **Unblocked** all
- **Features (owns)** F-PROTO-03 F-RLY-01 F-CLI-01 F-CLI-03 · **Findings** SEC-34 SEC-04 · **TB** -
- **Deps** WS-00, WS-19 · **Owner gate** - · **External** -
- **Worktree** `../wt/WS-11` · **Branch** `ws/WS-11-scanner-cli`
- **Owned (exclusive)** `packages/chain-adapters/src/logs.ts`, `packages/chain-adapters/src/logs*.test.ts`, `packages/chain-adapters/src/scanVerify.ts`, `packages/chain-adapters/src/scanVerify*.test.ts`, `packages/chain-adapters/src/scanHardening.test.ts`, `apps/web/src/lib/scannerCore.fuzz.test.ts`, `packages/cli/src/backup-data.ts`, `packages/cli/src/commands/backup.ts`, `packages/cli/test/compiled.test.mjs`, `packages/cli/test/backup-independent.test.mjs`, `docs/developer/relayer-privacy.md`
- **Objective** Fail-closed per-log blockHash check; relayer + CLI compiled evidence; CLI backup decrypted by the independent tool.
- **Items**
  - `WS-11.1` w4 CP-3 0.7–1.5 d [repair] deps CP-0 · UB — Records only (~0.1 d; F-PROTO-03 VERIFIED_COMPLETE): cite the existing per-log blockHash check `packages/chain-adapters/src/logs.ts:438-460` + `logs.test.ts:132-148`; add no code
  - `WS-11.2` w4 CP-3 0.25–0.35 d [repair] deps WS-11.1 · UB — REQUIRE_ANVIL=1 relayer suite evidence; relayer metadata/fallback privacy note (SEC-34)
  - `WS-11.3` w4 CP-3 0.25–0.35 d [repair] deps WS-11.2 · UB — CLI compiled tests evidence
  - `WS-11.4` w4 CP-3 1–2.25 d [implement] deps WS-11.3, WS-19.1 · UB: after WS-19.1 (independent tool) rolling-merges — `ghostpay backup create` output decrypted by tools/independent-recovery (no GhostPay code); keys match
- **Acceptance** FEATURE_ACCEPTANCE_CRITERIA.md §F-PROTO-03, §F-RLY-01, §F-CLI-01, §F-CLI-03; SEC remediation: SEC-34, SEC-04; item text = done-when for non-row items
- **Security review** REQUIRED, strongest, RV-WEB (scanner fail-closed rule)
- **Tests**
```bash
(cd packages/chain-adapters && npx vitest run src/logs.test.ts src/scanVerify.test.ts src/scanHardening.test.ts)
(cd apps/web && npx vitest run src/lib/scannerCore src/lib/scanClient)
npm run build:cli && npm run test:compiled -w @ghostpay/cli
REQUIRE_ANVIL=1 ANVIL_BIN=$(command -v anvil) npm test -w @ghostpay/relayer
node --test packages/cli/test/backup-independent.test.mjs
```
- **Handoff +** reorg fixtures; request-count assertion; CLI compiled + relayer anvil exit codes

### WS-12 — Accessibility + i18n enforcement + #201/#202 browser-regression recheck

- **Map** WS-12 · **Exec** worker · **Tier** impl mid / review mid · **Est** 7.6–14.25 d · **CP** CP-1, CP-3, CP-6 · **Unblocked** partial
- **Features (owns)** F-A11Y-01 F-I18N-02 F-I18N-01 F-A11Y-03 F-I18N-03 F-DOC-04 · **Findings** SEC-29 SEC-30 · **TB** -
- **Deps** WS-00 · **Owner gate** OD-20, OD-16 · **External** EX-03, EX-04
- **Worktree** `../wt/WS-12` · **Branch** `ws/WS-12-a11y-i18n`
- **Owned (exclusive)** `apps/web/e2e/accessibility-audit.ts`, `apps/web/e2e/accessibility.spec.ts`, `apps/web/e2e/contextual-help.spec.ts`, `apps/web/e2e/focus-scope.spec.ts`, `apps/web/src/i18n/**`, `packages/i18n/**`, `packages/ux-i18n/**`, `scripts/i18n/**`, `docs/accessibility/**`, `apps/web/src/components/ContextHelp.tsx`, `apps/web/src/components/ContextHelp*.test.tsx`, `apps/web/src/AppShell.i18n.test.tsx`
- **Objective** Prove #201/#202 browser fixes hold; axe coverage of every dialog/theme; screen-reader protocol; literal checker (allowlist -> 0 by CP-5, each WS fixes its own files); selector stays as today: every listed locale labelled machine-drafted/no catalog (`apps/web/src/i18n/LanguagePicker.tsx:19-23`); trimming it to shipped locales is the owner's OD-16 choice.
- **Items**
  - `WS-12.1` w2 CP-1 0.75–1.5 d [repair] deps CP-0 · UB — Playwright re-run of #201/#202 lost-click/focus paths (POST_CONSOLIDATION_AUDIT §7); ContextHelp hover-leave collapse (SEC-29, UNVERIFIED) reproduce-then-fix; paste-submit focus test (SEC-30)
  - `WS-12.2` w4 CP-3 1.25–2.5 d [repair] deps WS-12.1 · UB
  - `WS-12.3` w4 CP-3 0.75–1 d [repair] deps WS-12.2 · UB: OD-16 default = keep today's labelled selector (no trim); OD-20,OD-16
  - `WS-12.4` w4 CP-3 2–4.25 d [repair] deps WS-12.3 · UB — literals.test.ts in report mode; allowlist shrinks per CP; 0 by CP-5
  - `WS-12.5` w4 CP-3 1.5–2.5 d [implement] deps WS-12.4 · UB: protocol now; run is human; EX-03 — Screen-reader protocol doc + log template; AT runs are EX-03
  - `WS-12.6` w8 CP-6 0.75–1.5 d [consolidate] deps CP-5 · UB; OD-20,OD-16 — Ownership ADR for the two i18n stacks
  - `WS-12.7` w8 CP-6 0.6–1 d [defer] deps WS-12.6 · BLK: waits for locale scope + native reviewers; OD-20,OD-16; EX-04
- **Acceptance** FEATURE_ACCEPTANCE_CRITERIA.md §F-A11Y-01, §F-I18N-02, §F-I18N-01, §F-A11Y-03, §F-I18N-03, §F-DOC-04; SEC remediation: SEC-29, SEC-30; item text = done-when for non-row items
- **Security review** mid (tests, i18n tooling)
- **Tests**
```bash
(cd apps/web && for p in lean full; do GHOSTPAY_LOCAL_BUILD_PROFILE=$p npx playwright test e2e/accessibility.spec.ts e2e/contextual-help.spec.ts e2e/focus-scope.spec.ts || exit 1; done)
(cd apps/web && npx vitest run src/i18n src/components/ContextHelp src/AppShell.i18n)
node scripts/i18n/check.mjs && npm test -w @ghostpay/i18n && npm test -w @ghostpay/ux-i18n
```
- **Handoff +** axe counts lean/full; literal checker counts per file (allowlist size per CP)

### WS-13 — Hosting/ops verification: digest pins, HSTS at terminator, Tor image, compose/header checks

- **Map** WS-13 · **Exec** worker · **Tier** impl mid / review strongest · **Est** 4–9.5 d · **CP** CP-6, CP-9 · **Unblocked** partial
- **Features (owns)** F-HOST-01 F-HOST-02 F-HOST-04 F-HOST-03 F-DOC-03 F-OPS-01 · **Findings** SEC-26 SEC-41 · **TB** -
- **Deps** WS-00, WS-01, WS-05 · **Owner gate** OD-07, OD-22, OD-06, OA-04 · **External** -
- **Worktree** `../wt/WS-13` · **Branch** `ws/WS-13-hosting-ops`
- **Owned (exclusive)** `deploy/**`, `infra/**`, `tools/portable-hosting-kit/**`, `packages/ops-monitor/**`, `docs/operators/**`, `apps/relayer/Dockerfile`
- **Handover in** after CP-1 from WS-01: `deploy/nginx/security-headers.conf`, `deploy/nginx/security-headers-embed.conf`, `infra/proxy/ghostpay-headers.conf`, `infra/proxy/Caddyfile`, `infra/web/Caddyfile.static`
- **Handover in** after CP-7 from WS-05: `docs/operators/testnet-runbook.md`
- **Objective** Supply-chain and verification debt of the optional self-host/Tor/hosting-kit paths; never required by lean.
- **Items**
  - `WS-13.1` w8 CP-6 1.25–2.25 d [repair] deps WS-01.2 · UB
  - `WS-13.2` w8 CP-6 1.25–2 d [repair] deps WS-13.1 · UB
  - `WS-13.3` w8 CP-6 0.75–2 d [repair] deps WS-13.2 · UB — compose config -q; check-headers.sh; HSTS at terminator
  - `WS-13.4` w8 CP-6 0–0.75 d [defer] deps WS-13.3 · BLK: owner gates; OD-07,OD-22,OD-06
  - `WS-13.5` w9 CP-9 0–0.75 d [defer] deps WS-05.4 · BLK: real infra; OA-04
  - `WS-13.6` w9 CP-9 0.75–1.75 d [defer] deps WS-05.4 · BLK: after B02; OA-04
- **Acceptance** FEATURE_ACCEPTANCE_CRITERIA.md §F-HOST-01, §F-HOST-02, §F-HOST-04, §F-HOST-03, §F-DOC-03, §F-OPS-01; SEC remediation: SEC-26, SEC-41; item text = done-when for non-row items
- **Security review** strongest for header/CSP/digest changes (RV-OPS); mid otherwise
- **Tests**
```bash
bash deploy/selftest.sh
for f in $(git ls-files "infra/*compose*.yml" "infra/**/*compose*.yml" "deploy/**/*compose*.yml"); do docker compose -f "$f" config -q || exit 1; done
bash infra/proxy/check-headers.sh <local container url>
npm test -w @ghostpay/ops-monitor && (cd tools/portable-hosting-kit && npm test)
```
- **Handoff +** digest pin list; compose config -q outputs; header check output

### WS-14 — Full-profile chains: TB-08 SOL/TRON meta-address format consolidation, seed-reveal parity, BTC regtest

- **Map** WS-14 · **Exec** worker · **Tier** impl strongest / review strongest · **Est** 13.25–25.5 d · **CP** CP-6 · **Unblocked** partial
- **Features (owns)** F-SOL-01 F-TRX-01 F-BTC-01 F-BTC-03 · **Findings** SEC-13 · **TB** TB-08
- **Deps** WS-00, WS-07 · **Owner gate** OD-20, OD-02 · **External** EX-07
- **Worktree** `../wt/WS-14` · **Branch** `ws/WS-14-multichain-format`
- **Owned (exclusive)** `packages/chain-solana/**`, `packages/chain-tron/**`, `packages/solana-stealth/**`, `packages/tron-adapter/**`, `packages/btc-silent-payments/**`, `apps/web/src/features/btc/**`, `apps/web/src/features/solana/**`, `apps/web/src/features/tron/**`, `test-vectors/solana-stealth.json`, `test-vectors/tron-stealth.json`
- **Objective** One meta-address format per chain with cross-implementation vectors (CLI <-> web); TRON backup not plaintext; raw-seed reveal aligned with K04 controls; promotion beyond experimental stays OD-20.
- **Items**
  - `WS-14.1` w8 CP-6 4.5–8.5 d [consolidate] deps CP-1 · UB: TB-08 defect fix unblocked; promotion OD-20; OD-20,OD-02 — Consolidate chain-solana on solana-stealth format + vectors
  - `WS-14.2` w8 CP-6 4.5–8.5 d [consolidate] deps WS-14.1 · UB: TB-08 defect fix unblocked; promotion OD-20; OD-20,OD-02 — Consolidate chain-tron tag on tron-adapter; encrypted backup
  - `WS-14.3` w8 CP-6 0.5–1 d [repair] deps WS-14.2 · UB; OD-02 — BTC/SOL/TRON seed reveal: re-auth + second confirmation, no clipboard (OD-02 default)
  - `WS-14.4` w8 CP-6 2–4 d [defer] deps WS-14.3 · BLK: scope decision; OD-20,OD-02; EX-07
  - `WS-14.5` w8 CP-6 1.75–3.5 d [defer] deps WS-14.4 · BLK: scope; OD-20
- **Acceptance** FEATURE_ACCEPTANCE_CRITERIA.md §F-SOL-01, §F-TRX-01, §F-BTC-01, §F-BTC-03; SEC remediation: SEC-13; BLOCKERS §5 TB-08; item text = done-when for non-row items
- **Security review** REQUIRED, strongest, RV-CRYPTO (meta-address formats, seed reveal)
- **Tests**
```bash
for w in chain-solana chain-tron solana-stealth tron-adapter btc-silent-payments; do npm test -w @ghostpay/$w || exit 1; done
(cd apps/web && npx vitest run src/features/btc src/features/solana src/features/tron)
(cd apps/web && GHOSTPAY_LOCAL_BUILD_PROFILE=full npx playwright test e2e/btc-worker.spec.ts)
node --test apps/web/scripts/localBuildProfile.test.mjs   # lean still excludes BTC/SOL/TRON
```
- **Handoff +** cross-implementation vector table (CLI vs web) per chain; seed-reveal control matrix

### WS-15 — Merchant/integration/SDK (scope-gated, OD-20/OD-17)

- **Map** WS-15 · **Exec** worker · **Tier** impl mid / review mid · **Est** 14.75–28.6 d · **CP** CP-6 · **Unblocked** partial
- **Features (owns)** F-CLI-06 F-MER-02 F-INT-01 F-INT-02 F-MER-01 F-MER-04 F-PROTO-12 · **Findings** - · **TB** -
- **Deps** WS-00, WS-23 · **Owner gate** OD-20 · **External** -
- **Worktree** `../wt/WS-15` · **Branch** `ws/WS-15-merchant`
- **Owned (exclusive)** `integrations/**`, `packages/merchant-billing/**`, `packages/merchant-ledger/**`, `packages/merchant-multisig/**`, `packages/sdk/**`, `packages/cli/src/commands/merchant-refund.ts`, `packages/cli/src/commands/merchant.ts`, `packages/ux-vault/src/reconciliation-portable.ts`
- **Handover in** after CP-5 from WS-23: `packages/ux-vault/src/reconciliation-portable.ts`
- **Objective** Only F-MER-02 consolidation and the F-CLI-06 exit-code test are unblocked; everything else waits for OD-20.
- **Items**
  - `WS-15.1` w8 CP-6 0–0.1 d [defer] deps CP-1 · UB
  - `WS-15.2` w8 CP-6 2.25–3.75 d [consolidate] deps CP-5, WS-15.1 · UB; OD-20
  - `WS-15.3` w8 CP-6 2.75–5.5 d [defer] deps WS-15.2 · BLK: scope; OD-20
  - `WS-15.4` w8 CP-6 2.25–3.75 d [defer] deps WS-15.3 · BLK: scope; OD-20
  - `WS-15.5` w8 CP-6 3.75–7.5 d [defer] deps WS-15.4 · BLK: scope; OD-20
  - `WS-15.6` w8 CP-6 2.5–4.5 d [defer] deps WS-15.5 · BLK: scope; OD-20
  - `WS-15.7` w8 CP-6 1.25–3.5 d [defer] deps WS-15.6 · BLK: owner; OD-20
- **Acceptance** FEATURE_ACCEPTANCE_CRITERIA.md §F-CLI-06, §F-MER-02, §F-INT-01, §F-INT-02, §F-MER-01, §F-MER-04, §F-PROTO-12; item text = done-when for non-row items
- **Security review** mid (strongest if any custody-adjacent code changes; none expected)
- **Tests**
```bash
for w in merchant-billing merchant-ledger merchant-multisig sdk cli; do npm test -w @ghostpay/$w || exit 1; done
php integrations/woocommerce/tests/run.php && php integrations/prestashop/tests/run.php
```
- **Handoff +** reconciliation model mapping (old → new)

### WS-16 — Optional operator services (OD-21) + pool-sdk backup KDF parity (SEC-16)

- **Map** WS-16 · **Exec** worker · **Tier** impl mid / review strongest · **Est** 12.75–27.5 d · **CP** CP-6 · **Unblocked** partial
- **Features (owns)** F-RLY-04 F-OPS-03 F-PROTO-11 F-POOL-04 · **Contributes to** F-POOL-03 · **Findings** SEC-16 SEC-27 SEC-17 · **TB** -
- **Deps** WS-00, WS-18 · **Owner gate** OD-21 · **External** -
- **Worktree** `../wt/WS-16` · **Branch** `ws/WS-16-operator-optional`
- **Owned (exclusive)** `packages/pool-relayer/**`, `packages/relayer-guard/**`, `packages/sandbox/**`, `packages/scan-source/**`, `packages/pool-sdk/**`
- **Objective** Operator services stay optional/experimental and never required by lean; confirmed pool-sdk KDF defect fixed.
- **Items**
  - `WS-16.1` w8 CP-6 0.5–1 d [repair] deps WS-18.1 · UB — pool-sdk seed backup reuses ux-vault KDF/estimator/bounds (N 2^17, max 2^18), NFKC, version/params in AAD
  - `WS-16.2` w8 CP-6 1.5–2.75 d [defer] deps WS-16.1 · UB
  - `WS-16.3` w8 CP-6 1.75–3.75 d [defer] deps WS-16.2 · UB
  - `WS-16.4` w8 CP-6 4–10 d [defer] deps WS-16.3 · BLK: operator backends; OD-21
  - `WS-16.5` w8 CP-6 5–10 d [defer] deps WS-16.4 · BLK: experimental; OD-21
- **Acceptance** FEATURE_ACCEPTANCE_CRITERIA.md §F-RLY-04, §F-OPS-03, §F-PROTO-11, §F-POOL-04, §F-POOL-03; SEC remediation: SEC-16, SEC-27, SEC-17; item text = done-when for non-row items
- **Security review** strongest for WS-16.1 KDF; mid otherwise
- **Tests**
```bash
for w in pool-sdk pool-relayer relayer-guard sandbox scan-source; do npm test -w @ghostpay/$w || exit 1; done
node --test apps/web/scripts/localBuildProfile.test.mjs   # lean imports none
```
- **Handoff +** pool-sdk KDF params before/after; AAD binding test

### WS-17 — Device/browser evidence records + CLI post-B02 cross-check + B06 run records

- **Map** WS-17 · **Exec** worker · **Tier** impl cheap / review mid · **Est** 1.5–3 d · **CP** CP-7, CP-8 · **Unblocked** none
- **Features (owns)** F-CLI-05 F-A11Y-02 · **Findings** SEC-41 · **TB** -
- **Deps** WS-00, WS-04, WS-05, WS-08, WS-09, WS-19, WS-25 · **Owner gate** OA-04 · **External** EX-02, EX-01, EX-03
- **Worktree** `../wt/WS-17` · **Branch** `ws/WS-17-device-evidence`
- **Owned (exclusive)** `apps/web/e2e/devices.spec.ts`, `packages/cli/src/commands/chain.ts`, `packages/cli/src/commands/payment.ts`, `packages/cli/src/commands/scan.ts`, `packages/cli/src/commands/registry.ts`, `docs/beta/**`
- **Objective** Honest emulation labels; CLI as second implementation for Sepolia read-back; B06 per-run records.
- **Items**
  - `WS-17.1` w9 CP-7 0.5–0.75 d [defer] deps WS-05.4 · BLK: after B02; OA-04
  - `WS-17.2` w9 CP-8 0.5–1.25 d [defer] deps WS-17.1 · BLK: needs physical devices; EX-02 — Emulation labels; Firefox + Tor Browser Standard/Safer manual run records (KDF time) per EX-02
  - `WS-17.3` w9 CP-8 0.5–1 d [implement] deps CP-5, CP-7 · BLK: owner + external runs; EX-01,EX-02,EX-03 — B06 records: SHA, browser/device/wallet versions, pass/fail per step incl. 3q export + independent recovery
- **Acceptance** FEATURE_ACCEPTANCE_CRITERIA.md §F-CLI-05, §F-A11Y-02; SEC remediation: SEC-41; item text = done-when for non-row items
- **Security review** mid (records only)
- **Tests**
```bash
(cd apps/web && npx playwright test e2e/devices.spec.ts)
npm test -w @ghostpay/cli
```
- **Handoff +** per-run rows: SHA, browser/device/wallet versions, step, pass/fail

### WS-18 — Passphrase/KDF floor: offline estimator, generated-passphrase default, high tier for new exports (SEC-05)

- **Map** new (G-B) · **Exec** worker · **Tier** impl strongest / review strongest · **Est** 2–4 d · **CP** CP-1 · **Unblocked** all
- **Features (owns)** - · **Findings** SEC-05 SEC-41 · **TB** -
- **Deps** WS-00 · **Owner gate** OD-09 · **External** -
- **Worktree** `../wt/WS-18` · **Branch** `ws/WS-18-passphrase-floor`
- **Owned (exclusive)** `packages/ux-vault/src/passphrase-policy.ts`, `packages/ux-vault/src/passphrase-policy*.test.ts`, `packages/ux-vault/src/keystore-portable.ts`, `packages/ux-vault/src/portable-parity.test.ts`, `packages/ux-vault/src/portable-errors.ts`, `packages/ux-vault/src/envelope.ts`, `packages/ux-vault/src/envelope*.test.ts`, `apps/web/src/lib/keystore.ts`, `apps/web/src/lib/keystore*.test.ts`, `apps/web/e2e/passphrase-vault.spec.ts`
- **Hands over** WS-03 at CP-1 (`packages/ux-vault/src/keystore-portable.ts`, `packages/ux-vault/src/portable-parity.test.ts`, `packages/ux-vault/src/portable-errors.ts`); WS-09 at CP-1 (`apps/web/src/lib/keystore.ts`, `apps/web/src/lib/keystore*.test.ts`)
- **Objective** Offline policy module with tiers `standard` (current) and `high` (generated 6-7 word default or ~80-bit estimate, NFKC); high tier mandatory for every new spec 18 export (OD-09 fail-closed default); existing flows keep `standard` until OD-09; KDF progress text.
- **Items**
  - `WS-18.1` w1 CP-1 1.75–3.5 d [implement] deps CP-0 · UB: stricter floor for new exports is the OD-09 default; existing-flow floor waits for OD-09; OD-09 — Extract estimator (keystore-portable.ts:182-216) to passphrase-policy.ts; add `high` tier; generated passphrase offered as default in keystore/vault creation with explicit override; no network, bundled wordlist, lean size checked
  - `WS-18.2` w1 CP-1 0.25–0.5 d [repair] deps WS-18.1 · UB — KDF progress text for slow (JIT-less ~28 s) scrypt in keystore/vault flows
- **Acceptance** FEATURE_ACCEPTANCE_CRITERIA.md -; SEC remediation: SEC-05, SEC-41; item text = done-when for non-row items
- **Security review** REQUIRED, strongest, RV-CRYPTO (KDF / passphrase policy)
- **Tests**
```bash
(cd packages/ux-vault && npx vitest run src/passphrase-policy src/portable-parity src/envelope) && npm test -w @ghostpay/ux-vault
(cd apps/web && npx vitest run src/lib/keystore)
(cd apps/web && for p in lean full; do GHOSTPAY_LOCAL_BUILD_PROFILE=$p npx playwright test e2e/passphrase-vault.spec.ts || exit 1; done)
GHOSTPAY_LOCAL_BUILD_PROFILE=lean npm run build -w @ghostpay/web   # record lean size delta
```
- **Handoff +** policy table: tier × min length × estimator bits × generated default; lean size delta

### WS-19 — Independent GhostPay-free recovery tool (spec 18 / req 3q; SEC-04, TB-05)

- **Map** new (G-B) · **Exec** worker · **Tier** impl strongest / review strongest · **Est** 5–9.5 d · **CP** CP-2, CP-5 · **Unblocked** all
- **Features (owns)** - · **Contributes to** F-KEY-07 F-KEY-08 F-KEY-11 F-KEY-12 F-KEY-10 · **Findings** SEC-04 SEC-15 SEC-38 · **TB** TB-05
- **Deps** WS-00, WS-03, WS-08, WS-09, WS-25 · **Owner gate** - · **External** -
- **Worktree** `../wt/WS-19` · **Branch** `ws/WS-19-independent-recovery`
- **Owned (exclusive)** `tools/independent-recovery/**`, `docs/recovery/independent-recovery.md`, `test-vectors/independent-recovery/**`
- **Objective** Clean-room tool (author != WS-03/08/09 author) built from spec 18 text + vectors only: zero @ghostpay/* imports, zero npm deps (node>=22 scrypt/aes-256-gcm + vendored keccak-f[1600] and secp256k1 BigInt arithmetic checked against published vectors); decodes keystore v1, K02, K05, K06; derives scheme-1 stealth keys and addresses; spend proofs use pinned Foundry 1.8.5 cast/anvil (no hand-rolled ECDSA or transaction signer in the tool).
- **Items**
  - `WS-19.1` w3 CP-2 3–5 d [implement] deps CP-0 · UB — v1 keystore + CLI backup decode; scheme-1 derivation recomputes 100% of test-vectors/scheme1.json (second 5564 implementation, SEC-38); CI job via coord-request
  - `WS-19.2` w3 CP-2 0.5–1.5 d [implement] deps WS-19.1, WS-03.2 · UB — Decode K01/K02 vectors (stealth-export-v1.json, fixed-salt/IV K02 vectors) at format freeze
  - `WS-19.3` w7 CP-5 0.25–0.5 d [implement] deps WS-25.1 · UB — K05 archive decode + per-record address check
  - `WS-19.4` w7 CP-5 0.5–1 d [implement] deps WS-09.1 · UB — K06 master backup recovers an announcement omitted from the K05 archive (offline scan of a fixture log set)
  - `WS-19.5` w7 CP-5 0.75–1.5 d [implement] deps WS-08.2 · UB — K04 raw key -> EIP-55 address == announced (computed by the tool); the transfer is signed and sent with pinned Foundry 1.8.5 `cast` (the independent EVM implementation NEXT_PHASE_QUEUE K04 names) and accepted by anvil; synthetic keys only; the tool implements no transaction signing
- **Acceptance** FEATURE_ACCEPTANCE_CRITERIA.md §F-KEY-07, §F-KEY-08, §F-KEY-11, §F-KEY-12, §F-KEY-10; SEC remediation: SEC-04, SEC-15, SEC-38; BLOCKERS §5 TB-05; item text = done-when for non-row items
- **Security review** REQUIRED, strongest, RV-CRYPTO + clean-room check (reviewer confirms spec + vectors were the only inputs)
- **Tests**
```bash
node --test tools/independent-recovery/test
! grep -rnE '@ghostpay/|packages/|apps/' tools/independent-recovery/src tools/independent-recovery/bin   # clean-room: no output
test ! -e tools/independent-recovery/package.json   # zero npm deps (node >= 22 built-ins + vendored primitives)
node tools/independent-recovery/bin/recover.mjs --self-test   # keccak/secp256k1 published vectors
anvil --version   # 1.8.5; proof tests start their own anvil, synthetic keys only
```
- **Handoff +** clean-room attestation (inputs: spec 18 text, vectors); import grep output; 100 % vectors recomputed

### WS-20 — CI/release pipeline: release verify anvil policy (TB-01), test-gap wiring (TB-09/TB-06), CI speed, attestation

- **Map** new (G-B) · **Exec** coordinator · **Tier** impl strongest / review strongest · **Est** 4.45–9 d · **CP** CP-1, CP-2, CP-7, CP-9 · **Unblocked** partial
- **Features (owns)** - · **Contributes to** F-AA-05 · **Findings** SEC-26 SEC-48 SEC-02 SEC-43 SEC-47 · **TB** TB-01 TB-09 TB-06
- **Deps** WS-00, WS-02, WS-19, WS-22 · **Owner gate** OA-07, OD-07, OA-03, OA-01 · **External** -
- **Worktree** main checkout (integration) · **Branch** short-lived local `ws/WS-20-ci-release` cut from the integration tip, merged `--no-ff`
- **Owned (exclusive)** `.github/workflows/**`, `.github/dependabot.yml`, `.github/actions/**`, `scripts/ci/**`, `scripts/tests/workflows.test.mjs`, `scripts/tests/workflow-files.test.mjs`, `scripts/tests/contract-analysis-workflow.test.mjs`, `scripts/tests/release-verify*.test.mjs`
- **Objective** Release verify cannot fail for env reasons; every existing test suite runs somewhere; PR critical path shorter without third-party actions; attestation ready for the owner key.
- **Items**
  - `WS-20.1` w1 CP-1 0.5–1 d [repair] deps CP-0 · UB — release.yml verify: per-workspace anvil policy identical to ci.yml (no global REQUIRE_ANVIL for payer-sponsor, external-pools-railgun/privacypools); local reproduction of the exact verify command list. Also applies the WS-04.1 coord-request: pages.yml deployed-origin assertion + cname/https_enforced check (C-08) at CP-1
  - `WS-20.2` w2 CP-2 1.1–2.25 d [implement] deps WS-02.4 · UB — Nightly/path-filtered job: 56 examples/ tests, anvil/circuit suites (payer-sponsor, railgun, privacypools, pool-relayer, pool-circuits), policy-recovery model tests (F-AA-05 Info), test-reconciliation-idb + seller-vault harness, `npm run test:compiled -w @ghostpay/cli`, independent-recovery vectors (WS-19); dependabot docker ecosystem entries (SEC-26)
  - `WS-20.3` w3 CP-2 2–4 d [refactor] deps WS-20.2 · UB — Step-timing summary; single coverage pass; build web once per profile, share dist with e2e + lean-candidate; affected-only lint/typecheck only as an extra fast pre-check (the full lint/typecheck still runs on every PR); cost-balanced shards; Mythril and Echidna stay on every PR that touches their paths (contract-analysis.yml:3-12) and on nightly/tag; lean+full e2e share one install. No job, analyzer, test file or required check may stop running on PRs (prompt section 3)
  - `WS-20.4` w9 CP-7 0.1–0.25 d [implement] deps CP-4 · BLK: owner exports or grants read access; OA-07 — Review CodeQL / Dependabot / secret-scanning alert inventories once OA-07 lands; record counts + dispositions in CP-7.md
  - `WS-20.5` w9 CP-7 0.5–1 d [implement] deps CP-4 · BLK: owner key + protection; OD-07,OA-03,OA-01 — pages.yml: actions/attest-build-provenance on Pages SHA256SUMS; signed checksum publication path (owner signs); deployed-origin assertion (C-08) already landed at CP-1 via WS-20.1
  - `WS-20.6` w9 CP-9 0.25–0.5 d [implement] deps WS-20.5 · BLK: owner runs the tag rehearsal; OA-01,OA-03 — Runbook for a signed pre-release tag rehearsal in a sandbox repo; OWNER executes (agents never tag)
- **Acceptance** FEATURE_ACCEPTANCE_CRITERIA.md §F-AA-05; SEC remediation: SEC-26, SEC-48, SEC-02, SEC-43, SEC-47; BLOCKERS §5 TB-01, TB-09, TB-06; item text = done-when for non-row items
- **Security review** REQUIRED, strongest worker-tier reviewer, RV-REL (CI/release gates)
- **Tests**
```bash
node --test scripts/tests/workflows.test.mjs scripts/tests/workflow-files.test.mjs scripts/tests/contract-analysis-workflow.test.mjs scripts/tests/release-verify.test.mjs scripts/tests/release-verify-tag.test.mjs scripts/tests/release-verify-attestation.test.mjs scripts/tests/release-manifest.test.mjs
npm run ci:check-actions && npm run ci:scan-secrets
TB-01: run release.yml `verify` step list verbatim with Foundry 1.8.5 → exit 0
```
- **Handoff +** CI timing before/after per job; job list diff; TB-01 local repro transcript

### WS-21 — Lean shell hardening: anti-framing guard, opener nulling, sanitized root error handlers

- **Map** new (G-B) · **Exec** worker · **Tier** impl mid / review strongest · **Est** 0.75–1.5 d · **CP** CP-4 · **Unblocked** all
- **Features (owns)** - · **Findings** SEC-18 SEC-42 · **TB** -
- **Deps** WS-00 · **Owner gate** - · **External** -
- **Worktree** `../wt/WS-21` · **Branch** `ws/WS-21-shell-hardening`
- **Owned (exclusive)** `apps/web/src/main.tsx`, `apps/web/src/lib/frameGuard.ts`, `apps/web/src/lib/frameGuard*.test.ts`, `apps/web/src/lib/rootErrors.ts`, `apps/web/src/lib/rootErrors*.test.ts`, `apps/web/e2e/framing.spec.ts`
- **Objective** Pages cannot send frame-ancestors: refuse key/sweep/export views when framed unless the embed protocol is active; null window.opener; React root errors never logged with input snippets.
- **Items**
  - `WS-21.1` w6 CP-4 0.5–1 d [implement] deps CP-0 · UB — frameGuard: window.top !== window.self -> refuse sensitive views unless embed protocol active; opener nulled at startup
  - `WS-21.2` w6 CP-4 0.25–0.5 d [repair] deps WS-21.1 · UB — createRoot onCaughtError/onUncaughtError sanitized (main.tsx:11)
- **Acceptance** FEATURE_ACCEPTANCE_CRITERIA.md -; SEC remediation: SEC-18, SEC-42; item text = done-when for non-row items
- **Security review** REQUIRED, strongest, RV-SEC (anti-framing)
- **Tests**
```bash
(cd apps/web && npx vitest run src/lib/frameGuard src/lib/rootErrors)
(cd apps/web && for p in lean full; do GHOSTPAY_LOCAL_BUILD_PROFILE=$p npx playwright test e2e/framing.spec.ts e2e/embed-iframe.spec.ts || exit 1; done)
```
- **Handoff +** framed/unframed behaviour matrix; embed regression result (full)

### WS-22 — Repo tooling + dependency refresh: #204 port (OD-15 default), minor/patch refresh (OD-18 default)

- **Map** new (G-B) · **Exec** coordinator · **Tier** impl strongest / review mid · **Est** 1.5–3.5 d · **CP** CP-1 · **Unblocked** all
- **Features (owns)** - · **Findings** SEC-49 SEC-25 · **TB** -
- **Deps** WS-00 · **Owner gate** OD-15, OD-18 · **External** -
- **Worktree** main checkout (integration) · **Branch** short-lived local `ws/WS-22-tooling-deps` cut from the integration tip, merged `--no-ff`
- **Owned (exclusive)** `CLAUDE.md`, `AGENTS.md`, `docs/ai/**`, `.claude/skills/**`, `scripts/agent/**`, `package.json`, `package-lock.json`
- **Objective** Port #204 as one separate reviewable commit (regenerated PACKAGE_MAP.md, merged CLAUDE.md, ci.yml line); refresh minor/patch deps once, early, with full gates; majors deferred.
- **Items**
  - `WS-22.1` w5 CP-1 0.5–1.5 d [recover] deps CP-0 · UB: OD-15 default: port as separate reviewable commit; OD-15 — First coordinator task after CP-0 (agents started earlier use their WS card). Port 2693b08e content: .claude/skills/{ghostpay-affected-checks,ghostpay-package-map,ghostpay-security-invariants}, scripts/agent/{affected,package-map,workspaces}.mjs + workspaces.test.mjs; regenerate PACKAGE_MAP.md on start commit; CLAUDE.md content merge; ci.yml 1-line re-apply
  - `WS-22.2` w5 CP-1 1–2 d [recover] deps WS-22.1 · UB: OD-18 default: minor/patch only; OD-18 — viem 2.57.19, vitest + @vitest/coverage 5.1.0, vite 8.3.8, prettier 3.10.1, @playwright/test 1.65 (browser availability checked), create-pull-request 8 (SHA-pinned); @scure/* 2.x, TypeScript 7, hardhat 3 deferred; picomatch override when the fix ships; full gates + lean bundle diff; rollback to CP-4 slot if triage > 0.5 d
- **Acceptance** FEATURE_ACCEPTANCE_CRITERIA.md -; SEC remediation: SEC-49, SEC-25; item text = done-when for non-row items
- **Security review** mid; strongest for crypto-adjacent packages (viem, @noble/*, @scure/*)
- **Tests**
```bash
node --test scripts/agent/workspaces.test.mjs
npm run test:dependency-tooling
npm audit --omit=dev --audit-level=high && npm ls --omit=dev
G-FULL
```
- **Handoff +** package diff old → new; npm audit before/after; lean bundle diff; PACKAGE_MAP regenerated

### WS-23 — Local data privacy: confirmed erase-all + linkable storage identifiers pseudonymized (SEC-23, SEC-22)

- **Map** new (G-B) · **Exec** worker · **Tier** impl strongest / review strongest · **Est** 3–6 d · **CP** CP-5 · **Unblocked** all
- **Features (owns)** - · **Findings** SEC-23 SEC-22 · **TB** -
- **Deps** WS-00, WS-01, WS-07, WS-10 · **Owner gate** - · **External** -
- **Worktree** `../wt/WS-23` · **Branch** `ws/WS-23-local-privacy`
- **Owned (exclusive)** `apps/web/src/lib/eraseAll.ts`, `apps/web/src/lib/eraseAll*.test.ts`, `apps/web/src/lib/scanClient.ts`, `apps/web/src/lib/scanClient*.test.ts`, `packages/ux-vault/src/seller-scope.ts`, `apps/web/src/lib/tags.ts`, `apps/web/src/lib/sweepAttemptJournal.ts`, `apps/web/src/lib/reconciliationLedger.ts`, `packages/ux-vault/src/reconciliation-portable.ts`, `apps/web/e2e/erase-all.spec.ts`
- **Handover in** after CP-1 from WS-01: `apps/web/src/views/Settings.tsx`, `apps/web/src/views/Settings*.test.tsx`
- **Handover in** after CP-3 from WS-10: `apps/web/src/lib/duplicateAttemptJournal.ts`
- **Handover in** after CP-2 from WS-07: `apps/web/src/lib/keyVault.ts`, `apps/web/src/lib/keyVault*.test.ts`
- **Hands over** WS-15 at CP-5 (`packages/ux-vault/src/reconciliation-portable.ts`)
- **Objective** In-app confirmed wipe of ghostpay.* storage + the three IndexedDB databases with backup warning; checkpoint slots/journals keyed by a viewing-key-derived pseudonym; minimal plaintext in the vault record (keystore v1 file format frozen); migration tested.
- **Items**
  - `WS-23.1` w7 CP-5 1–2 d [implement] deps CP-3 · UB — Settings > Erase all GhostPay data: confirmed, backup warning, clears ghostpay.* local/session + 3 IndexedDB DBs; e2e
  - `WS-23.2` w7 CP-5 2–4 d [refactor] deps WS-23.1 · UB — Pseudonymize slot/journal names with a viewing-key-derived key; minimize plaintext meta in the IndexedDB vault record; one-time migration with tests; keystore v1 bytes unchanged
- **Acceptance** FEATURE_ACCEPTANCE_CRITERIA.md -; SEC remediation: SEC-23, SEC-22; item text = done-when for non-row items
- **Security review** REQUIRED, strongest, RV-CRYPTO (storage pseudonymization + migration)
- **Tests**
```bash
(cd apps/web && npx vitest run src/lib/eraseAll src/lib/scanClient src/views/Settings src/lib/tags src/lib/sweepAttemptJournal src/lib/duplicateAttemptJournal src/lib/reconciliationLedger)
npm test -w @ghostpay/ux-vault
(cd apps/web && for p in lean full; do GHOSTPAY_LOCAL_BUILD_PROFILE=$p npx playwright test e2e/erase-all.spec.ts e2e/reconciliation.spec.ts || exit 1; done)
```
- **Handoff +** storage key inventory before/after; migration test; wipe coverage list (local, session, 3 IndexedDB DBs)

### WS-24 — Strict on-chain verifier for web/CLI/relayer + dual-provider readback + registry pin; legacy manifest path removed

- **Map** split from WS-05 · **Exec** worker · **Tier** impl strongest / review strongest · **Est** 6.75–11.25 d · **CP** CP-2, CP-4 · **Unblocked** all
- **Features (owns)** F-DEP-02 F-WEB-17 F-CTR-04 · **Findings** SEC-14 G-NOTE-01 · **TB** TB-10
- **Deps** WS-00, WS-05 · **Owner gate** OD-07, OA-04 · **External** -
- **Worktree** `../wt/WS-24` · **Branch** `ws/WS-24-strict-verifier`
- **Owned (exclusive)** `apps/web/src/lib/manifest.ts`, `apps/web/src/lib/manifest*.test.ts`, `apps/web/src/lib/deployment.ts`, `apps/web/src/lib/deployment*.test.ts`, `apps/web/src/components/ManifestBanner.tsx`, `apps/web/src/components/ManifestBanner*.test.tsx`, `packages/chain-adapters/src/deploymentsVerify.ts`, `packages/chain-adapters/src/deploymentsVerify*.test.ts`, `packages/chain-adapters/src/deploymentsSignature.ts`, `packages/chain-adapters/src/deploymentsSignature*.test.ts`, `packages/chain-adapters/src/verify.ts`, `packages/chain-adapters/src/verify*.test.ts`, `packages/chain-adapters/src/registry.ts`, `packages/chain-adapters/src/registry*.test.ts`, `packages/cli/src/payment-context.ts`, `apps/relayer/src/runtime.ts`, `docs/adr/ADR-0018-erc6538.md`
- **Objective** One exported strict verifier (canonical announcer, codehash pins, fixed 25 bps) used by Pay/Scan/Sweep, CLI and relayer; secondary-provider reconciliation fails closed; ERC-6538 singleton pin; no unsigned/legacy manifest path in any build.
- **Items**
  - `WS-24.1` w2 CP-2 0.5–1 d [repair] deps CP-0 · UB — Move loadManifest (manifest.ts:52-101) + verifyTextManifestSignature to test utilities; unit test that no production module exports them; bundle-scan rule line in scan-bundle.mjs via coord-request (no WS owns it in window 2)
  - `WS-24.2` w6 CP-4 3–5.5 d [refactor] deps WS-24.1, WS-05.1 · UB: announcer codehash pin waits for B02/B04 evidence — Rows IC: web verifyManifestForFlow + CLI payment-context.ts + relayer runtime.ts call one strict verifier (G-NOTE-01)
  - `WS-24.3` w6 CP-4 1.75–3 d [repair] deps WS-24.2 · UB: bundling of the real manifest owner-gated; OD-07 — When the user has configured a secondary RPC (opt-in; never a built-in default or automatic fallback), readback reconciles both providers and fails closed on disagreement/unreachable; single-provider mode unchanged; banner provider count
  - `WS-24.4` w6 CP-4 1.5–1.75 d [repair] deps WS-24.3, WS-05.3 · UB: pin values after B04; OA-04 — ERC-6538 singleton runtime codehash per-chain pin; unknown/mismatch disables registry features; ADR-0018 stale text
- **Acceptance** FEATURE_ACCEPTANCE_CRITERIA.md §F-DEP-02, §F-WEB-17, §F-CTR-04; SEC remediation: SEC-14, G-NOTE-01; BLOCKERS §5 TB-10; item text = done-when for non-row items
- **Security review** REQUIRED, strongest, RV-REL/RV-WEB (verifier strictness)
- **Tests**
```bash
(cd packages/chain-adapters && npx vitest run src/deploymentsVerify.test.ts src/verify.test.ts src/registry.test.ts src/registry.compat.test.ts src/deployments.test.ts)
(cd apps/web && npx vitest run src/lib/manifest src/lib/deployment)
npm test -w @ghostpay/cli && REQUIRE_ANVIL=1 ANVIL_BIN=$(command -v anvil) npm test -w @ghostpay/relayer
GHOSTPAY_LOCAL_BUILD_PROFILE=lean npm run build -w @ghostpay/web   # scan-bundle: no unsigned-dev manifest path
(cd apps/web && GHOSTPAY_LOCAL_BUILD_PROFILE=lean npx playwright test e2e/core-journey.spec.ts e2e/sweep.spec.ts)
```
- **Handoff +** verifier rule table (rule × web/CLI/relayer); dual-provider disagreement test

### WS-25 — Spec 18 K05: encrypted bounded bulk archive of validated one-time keys (format, import, panel)

- **Map** split from WS-08 · **Exec** worker · **Tier** impl strongest / review strongest · **Est** 3.25–4.25 d · **CP** CP-5 · **Unblocked** all
- **Features (owns)** F-KEY-11 · **Findings** - · **TB** -
- **Deps** WS-00, WS-03, WS-07, WS-08, WS-18, WS-19 · **Owner gate** - · **External** -
- **Worktree** `../wt/WS-25` · **Branch** `ws/WS-25-spec18-archive`
- **Owned (exclusive)** `packages/ux-vault/src/stealth-archive*.ts`, `apps/web/src/components/StealthArchive*.tsx`, `apps/web/e2e/stealth-archive.spec.ts`
- **Objective** Encrypted only; header count/chain/scope; no master keys; deterministic order (chainId, blockNumber, logIndex, stealthAddress); caps mirror tag-archive; atomic reject on any malformed/duplicate record.
- **Items**
  - `WS-25.1` w7 CP-5 2.25–3 d [implement] deps CP-2 · UB: format after CP-2 — K05 container format + strict atomic import + fixed vectors for WS-19
  - `WS-25.2` w7 CP-5 1–1.25 d [implement] deps WS-25.1, WS-08.1 · UB: UI after K03 (rolling merge of WS-08.1) — StealthArchivePanel component using the K03 export controls (re-auth via requireStepUp, scope display)
- **Acceptance** FEATURE_ACCEPTANCE_CRITERIA.md §F-KEY-11; item text = done-when for non-row items
- **Security review** REQUIRED, strongest, RV-CRYPTO
- **Tests**
```bash
(cd packages/ux-vault && npx vitest run src/stealth-archive)
(cd apps/web && npx vitest run src/components/StealthArchive)
(cd apps/web && GHOSTPAY_LOCAL_BUILD_PROFILE=lean npx playwright test e2e/stealth-archive.spec.ts)
```
- **Handoff +** bounds table; atomic-reject cases; vector sha256 for WS-19.3

### WS-90 — Experimental (45) + future (43): keep separate / defer

- **Map** new (G-B) · **Exec** none · **Tier** impl cheap / review mid · **Est** 0–0 d · **CP** - · **Unblocked** all
- **Features** experimental (45): F-AA-01 F-AA-02 F-AA-03 F-AA-04 F-AA-05 F-BTC-04 F-BTC-05 F-EVMX-01 F-INT-04 F-MER-07 F-NET-03 F-NET-04 F-OPS-02 F-POOL-01 F-POOL-02 F-POOL-03 F-POOL-05 F-POOL-06 F-POOL-07 F-POOL-08 F-POOL-09 F-PRIV-01 F-PRIV-02 F-PRIV-03 F-PRIV-04 F-PRIV-05 F-RLY-05 F-SOL-02 F-TRX-02 F-UX-01 F-UX-02 F-UX-03 F-UX-04 F-UX-05 F-UX-06 F-UX-07 F-UX-08 F-UX-09 F-UX-10 F-UX-11 F-UX-12 F-UX-13 F-UX-14 F-UX-15 F-WEB-15
- **Features** future (43): F-AA-06 F-FUT-01 F-FUT-02 F-FUT-03 F-FUT-04 F-FUT-05 F-FUT-06 F-FUT-07 F-FUT-08 F-FUT-09 F-FUT-10 F-FUT-11 F-FUT-12 F-FUT-13 F-FUT-14 F-FUT-15 F-FUT-16 F-FUT-17 F-FUT-18 F-FUT-19 F-FUT-20 F-FUT-21 F-FUT-22 F-FUT-23 F-FUT-24 F-FUT-25 F-FUT-26 F-FUT-27 F-FUT-28 F-FUT-29 F-FUT-30 F-FUT-31 F-FUT-32 F-FUT-33 F-FUT-34 F-FUT-35 F-FUT-36 F-FUT-37 F-FUT-38 F-FUT-39 F-FUT-41 F-INT-03 F-KEY-14
- **Deps** - · **Owner gate** OD-04, OD-05, OD-11, OD-12, OD-13, OD-20, OD-21, OD-22, OD-17 · **External** -
- **Objective** No work this phase. Stay out of the lean build (CORE_ORDER/VITE flag guard tests green). Confirmed-defect fixes are executed elsewhere: TB-08 F-SOL-02/F-TRX-02 format split -> WS-14; SEC-16 F-POOL-03 -> WS-16.1; F-AA-05 CI wiring -> WS-20.2. Scheme-2 (F-AA-*, F-WEB-15, F-POOL-08) waits for OD-04/OD-05/OD-11/OD-12/OD-13 + SEC-06/07/11/12/31/35; contracts frozen.
- **Acceptance** FEATURE_ACCEPTANCE_CRITERIA.md n/a; SEC remediation: SEC-06, SEC-07, SEC-11, SEC-12, SEC-31, SEC-35; item text = done-when for non-row items
- **Security review** n/a
- **Tests**
```bash
guard only: node --test apps/web/scripts/localBuildProfile.test.mjs && (cd apps/web && npx vitest run src/AppLean)
```
- **Handoff +** -

## 6. Concurrency schedule (≤ 6 workers + coordinator lane)

Planned lanes from the simulation (lo estimates, review overhead included; days from session start). Real order = ready queue (§6.2); lanes are the default assignment, not a promise.

| Lane | Sequence (item start→end, d) |
|---|---|
| L1 | WS-01.1 0.8→1.9 · WS-01.2 1.9→3.7 · WS-04.5 3.7→4.6 · WS-05.2 4.6→7.2 · WS-05.3 7.2→9.8 · WS-24.4 9.8→11.5 · WS-15.1 11.5→11.5 · WS-16.1 11.5→12.1 · WS-09.1 12.1→19.8 · WS-10.6 25→27.3 |
| L2 | WS-03.1 0.8→5.6 · WS-03.2 5.6→10.5 · WS-19.2 10.5→11.1 · WS-14.1 11.1→16.3 · WS-14.2 16.3→21.4 · WS-14.3 21.4→22 · WS-14.4 22→24.3 · WS-14.5 24.3→26.3 |
| L3 | WS-04.1 0.8→1.3 · WS-04.2 1.3→1.9 · WS-04.3 1.9→2 · WS-04.4 2→2.3 · WS-12.1 2.3→3.1 · WS-19.1 3.1→6.6 · WS-21.1 6.6→7.2 · WS-07.2 7.2→9.1 · WS-02.8 9.1→9.9 · WS-06.2 9.9→12.8 · WS-05.4 12.8→13.9 · WS-04.6 13.9→15.6 · WS-06.3 15.6→15.9 · WS-16.2 15.9→17.6 · WS-16.3 17.6→19.7 · WS-16.4 19.7→24.3 · WS-16.5 24.3→30 |
| L4 | WS-07.1 0.8→2.2 · WS-05.1 2.2→3.6 · WS-12.2 3.6→5 · WS-12.3 5→5.8 · WS-12.4 5.8→8 · WS-12.5 8→9.7 · WS-21.2 9.7→10 · WS-13.1 10→11.4 · WS-13.2 11.4→12.8 · WS-01.3 12.8→13.5 · WS-23.1 13.5→14.6 · WS-17.1 14.6→15.2 · WS-17.2 15.2→15.7 · WS-13.3 15.7→16.6 · WS-13.4 16.6→16.6 · WS-13.5 16.6→16.6 · WS-13.6 16.6→17.4 · WS-25.2 18.5→19.7 · WS-03.3 25→26.2 |
| L5 | WS-18.1 0.8→2.8 · WS-18.2 2.8→3 · WS-24.1 3→3.6 · WS-24.2 3.6→7.1 · WS-24.3 7.1→9.1 · WS-11.1 9.1→9.9 · WS-11.2 9.9→10.2 · WS-11.3 10.2→10.5 · WS-11.4 10.5→11.6 · WS-08.1 11.6→18.5 · WS-08.2 18.5→23.1 · WS-08.3 23.1→23.4 · WS-12.6 25→25.8 · WS-12.7 25.8→26.5 |
| L6 | WS-02.1 0.8→1.6 · WS-02.2 1.6→1.9 · WS-02.3 1.9→2.1 · WS-02.4 2.1→3 · WS-02.5 3→3.6 · WS-10.1 3.6→4.1 · WS-10.2 4.1→5 · WS-06.1 5→7.3 · WS-02.6 7.3→7.3 · WS-10.3 7.3→8.1 · WS-02.7 8.1→9 · WS-10.4 9→10.8 · WS-10.5 10.8→12.5 · WS-25.1 12.5→15.1 · WS-19.3 15.1→15.4 · WS-23.2 15.4→17.7 · WS-19.4 19.8→20.4 · WS-19.5 23.1→24 · WS-17.3 25→25.5 · WS-15.2 25.5→28 · WS-15.3 28→31 · WS-15.4 31→33.5 · WS-15.5 33.5→37.6 · WS-15.6 37.6→40.4 · WS-15.7 40.4→41.8 |
| Coord | WS-00.1 0→0.1 · WS-00.2 0.1→0.3 · WS-00.3 0.3→0.6 · WS-00.4 0.6→0.7 · WS-00.5 0.7→0.8 · WS-20.1 0.8→1.2 · WS-22.1 1.2→1.8 · WS-22.2 1.8→2.8 · WS-20.2 3→4.1 · WS-20.3 4.1→6.1 · WS-20.4 12→12.1 · WS-20.5 12.1→12.6 · WS-20.6 12.6→12.9 |

### 6.1 Who runs together, per checkpoint window (planned)

| Window → CP | Workers (≤6) | Coordinator | Gate to close |
|---|---|---|---|
| start → CP-0 | — (none) | WS-00.1–00.5 | G-FULL baseline recorded |
| CP-0 → CP-1 | WS-01, WS-02, WS-04, WS-07, WS-18, WS-03 (K01, merges CP-2); as slots free: WS-05.1, WS-12.1, WS-24.1, WS-19.1 | WS-22.1 #204 port, WS-20.1 TB-01, WS-22.2 deps refresh (quiet branch, before CP-1 gate) | all wave-1 items merged; wave-2 items that are ready |
| CP-1 → CP-2 | WS-03 (K02), WS-19 (19.1, 19.2), WS-07 (07.2), WS-05 (05.2…), WS-24 (24.1, 24.2…), WS-10 or WS-11 (fill) | WS-20.2 wiring, WS-20.3 CI speed | FREEZE: K01/K02 + step-up API + independent decode of v1/K01/K02 vectors; second strongest reviewer sign-off |
| CP-2 → CP-3 / CP-4 | WS-08 (K03), WS-09 (K06), WS-25 (K05 format), WS-24 (verifier, readback, pin), WS-05 (rehearsal, revalidation), one of WS-10/11/12/04.5/21/06.1/02.7 | — | CP-3: wave-4 merged; CP-4: beta engineering-ready (gate=start items) |
| CP-4 → CP-5 | WS-08 (K04, mount), WS-09, WS-25.2, WS-19 (19.3→19.5), WS-23, WS-12 (allowlist → 0) | Firefox/WebKit projects (C-06) in playwright.config.ts | KC on one exact SHA (CP-5 gate) |
| CP-4 + owner → CP-7 | WS-05.4, WS-04.6, WS-17.1 (when OA-04 / OA-06 happen) | WS-20.5 attest, WS-20.4 alert inventories (OA-07) | Sepolia static beta START |
| CP-5 → CP-6 | WS-03.3, WS-06.2, WS-10.6, WS-12.6/12.7, WS-13, WS-14, WS-15, WS-16 (≤6, priority: confirmed defects first: WS-14.1/14.2 TB-08, WS-16.1 SEC-16, WS-14.3 SEC-13) | WS-20 nightly upkeep | optional; never blocks CP-7/CP-8 |
| CP-5 + CP-7 → CP-8 | WS-17.2, WS-17.3 (records) | evidence ledger | beta EXIT |
| CP-7 → CP-9 | WS-01.3, WS-06.3, WS-13.5, WS-13.6 | WS-20.6 rehearsal runbook (owner executes) | release-tag qualification |

### 6.2 Ready-queue order (when a slot frees)

1. Wave-1 items and critical-path items (WS-03.1/03.2, WS-18, WS-08.1/08.2, WS-24.2/24.3, WS-19.2/19.5). 2. Wave-2 items and any `gate=start|exit` item. 3. Remaining waves 3–7, 9 by wave. 4. Wave 8, confirmed-defect fixes first. Tie-break: longer downstream chain first. Never start an item whose owned paths are held by another active WS or whose deps have not rolling-merged.

## 7. Independent reviewer rules

- Reviewer ≠ author agent, ≠ same agent instance, ≠ coordinator for coordinator WS. One review per item before merge.
- Tier: strongest for crypto / security / integration (RV-CRYPTO: WS-03, 07, 08, 09, 14, 16.1, 18, 19, 23, 25; RV-SEC: WS-01, 04, 06, 21; RV-REL: WS-05, 20, 24; RV-WEB: WS-10, 11, 24); mid for docs/tests/ops (WS-02, 12, 13, 15, 17, 22).
- Clean-room: WS-19 author and reviewer must not have authored WS-03/08/09/25 code; reviewer checks inputs = spec 18 text + vectors only.
- Two-key points: CP-2 format freeze and CP-5 KC need a second, separate strongest reviewer (independent secret-flow review, NEXT_PHASE_QUEUE KC).
- Inputs: diff vs base, owned-paths check output, handoff block, test transcripts. Reviewer re-runs at least the WS card test commands for touched areas.
- Output: APPROVE | CHANGES (blocking findings, `path:line`, severity) | ESCALATE (security finding → coordinator, private). Reviewer never commits to the author branch.
- Blocking always: secret in logs/URL/storage/clipboard/telemetry; new network egress or fallback request; weakened gate/verifier/CSP; frozen-path diff; lean bundle importing relayer/operator/CLI runtime; unbounded parser; partial-state import; test deleted/skipped without coordinator approval.

## 8. Integration checkpoints and gate commands

```bash
# G-FULL — run from the worktree root on the exact SHA being qualified; record exit codes + pass/skip counts
: "${START:?set START to START_SHA or to the last origin/main merged into the integration branch}"   # used by the frozen-path line
npm run typecheck
npm run lint
(cd packages/contracts && forge build)                                     # artifacts for anvil suites
SOLC_0828="${SOLC_0828:-$HOME/.svm/0.8.28/solc-0.8.28}"; test -x "$SOLC_0828"   # written by the forge build above (ci.yml:152, foundry.toml:8-10); else the solc-static-linux v0.8.28 release binary
ANVIL_BIN=$(command -v anvil) SOLC_BIN=$SOLC_0828 REQUIRE_ANVIL=1 npm test -w apps/web -w packages/chain-adapters -w packages/policy-scheme
ANVIL_BIN=$(command -v anvil) REQUIRE_ANVIL=1 npm test -w apps/relayer
ANVIL_BIN=$(command -v anvil) npm test -w packages/confidential-contracts   # hardhat; needs binaries.soliditylang.org (blocked here: HH502)
npm test $(npm query .workspace | jq -r '.[].location' | grep -vxE 'apps/web|apps/relayer|packages/chain-adapters|packages/policy-scheme|packages/confidential-contracts' | sed 's/^/-w /') --if-present
node --test scripts/testnet/*.test.mjs scripts/regtest/*.test.mjs scripts/tests/*.test.mjs scripts/pages/*.test.mjs apps/web/scripts/localBuildProfile.test.mjs
GHOSTPAY_LOCAL_BUILD_PROFILE=lean npm run build -w @ghostpay/web           # postbuild = scan-bundle
GHOSTPAY_LOCAL_BUILD_PROFILE=full npm run build -w @ghostpay/web
(cd apps/web && GHOSTPAY_LOCAL_BUILD_PROFILE=lean npx playwright test)     # baseline 66 passed / 3 skipped
(cd apps/web && GHOSTPAY_LOCAL_BUILD_PROFILE=full npx playwright test)     # baseline 78 passed / 1 skipped
(cd packages/contracts && forge build --sizes && forge test && forge fmt --check && forge snapshot --check --no-match-test "testFuzz|invariant")
(cd packages/pool-contracts && forge build --sizes && forge test && forge fmt --check)    # ci.yml:473-506; baseline 86/0
(cd packages/payer-hiding-contracts && bash scripts/fetch-entrypoint.sh && forge build --sizes && forge test && forge fmt --check)   # baseline 109/0
node --test examples/merchant-checkout/money.test.mjs examples/pos-terminal/parity.test.mjs   # ci.yml:111
python3 scripts/tests/audit-permissions.test.py                                   # ci.yml:553
npm run ci:scan-secrets
npm run ci:check-actions
git diff --exit-code "$START" -- packages/contracts/src packages/core-crypto/src test-vectors/scheme1.json   # frozen paths
```
Never set REQUIRE_ANVIL=1 globally (TB-01: payer-sponsor, external-pools-railgun/privacypools fail without circuits).
`packages/confidential-contracts` (hardhat) needs binaries.soliditylang.org: blocked here (HH502) → UNVERIFIED locally, CI only.
`SOLC_0828` = solc-static-linux v0.8.28 from GitHub release (sha256 recorded in BASELINE.md); Foundry v1.8.5 from GitHub release tarball.

| CP | Meaning | Gate = G-FULL + |
|---|---|---|
| CP-0 | Rebaseline: start commit fixed, toolchain, baseline gates recorded | baseline only (record, no pass/fail judgement beyond reproducing CI 44242366118 counts) |
| CP-1 | Wave 1-2 closed: critical security/correctness defects + consolidation regressions + doc drift; #204 tooling ported; minor/patch deps refreshed | `node --test scripts/agent/workspaces.test.mjs` (#204 port); `npm audit --omit=dev --audit-level=high` + lean bundle diff (deps refresh); `node --test scripts/tests/privacy-claims.test.mjs`; `GHOSTPAY_CHROMIUM=<chromium> node apps/web/scripts/test-reconciliation-idb.mjs`; origin-gate negative tests (WS-04); wss grep empty (WS-01); TB-01 release verify local repro (WS-20.1) |
| CP-2 | Spec 18 format freeze (K01/K02) + step-up API (WS-07.2) + shared foundations (independent tool, CI wiring/speed) | `node --test tools/independent-recovery/test` (v1 golden, K01, K02 vectors decoded without GhostPay code); `(cd packages/ux-vault && npx vitest run src/portable-parity)` byte-identical v1; refusal matrix tests (WS-07); second strongest reviewer sign-off; new nightly job definitions pass `node --test scripts/tests/workflows.test.mjs` |
| CP-3 | Wave 4 nearly-complete features + wave 5 recovered harness/doc hunk | `npm run build:cli && npm run test:compiled -w @ghostpay/cli`; relayer `REQUIRE_ANVIL=1`; a11y specs lean+full 0 serious/critical; seller-vault harness |
| CP-4 | Browser beta engineering-ready (waves 5-6): strict verifier, dual readback, rehearsal, smoke, shell hardening | `bash scripts/qualify-lean.sh <abs new dir>` (two clean builds identical); local Pages artifact build + `serve-pages.mjs` + `smoke.mjs --commit` extended walk; `bash scripts/testnet/deploy.sh sepolia rehearse`; `node scripts/check-chain-matrix.mjs`; Mythril report-only comparison (WS-06.1) = 11 matched, 0 new (CI run id, else UNVERIFIED) |
| CP-5 | KC: spec 18 K01-K06 acceptance on one exact integrated SHA (+ independent recovery proof) | all spec 18 suites + e2e lean/full; Firefox/WebKit where supported; `node --test tools/independent-recovery/test` incl. anvil K04 spend + K06 omitted-announcement recovery; literal allowlist = 0; independent secret-flow review signed; frozen-path diff empty |
| CP-6 | Wave 8 optional advanced merged (never blocks CP-7/CP-8) | per optional WS card tests; integration.yml regtest/docker parity where run; lean guard tests green (nothing optional leaks into lean) |
| CP-7 | Sepolia static beta START qualification (owner-gated: OD-06/07/08, OA-01..06) | exact-SHA CI 24/24 + Pages/Beta/Integration/Hosting/CLI-operator/CodeQL green (run ids from the pushed integration branch's draft PR); `GHOSTPAY_RELEASE_PUBKEYS=<owner key> node apps/web/scripts/validate-deployments.mjs`; Pages build with signed manifests; live `node scripts/pages/smoke.mjs <url> --commit <sha>` incl. origin assertion; attestation present; BR-01..BR-23 closed or owner-accepted in writing |
| CP-8 | Beta EXIT qualification: CP-5 + B06 acceptance incl. 3q export + independent recovery on Sepolia | beta SHA == KC SHA or KC re-run on beta SHA; B06 records complete (WS-17.3); BX-01..BX-09 closed |
| CP-9 | Release-tag qualification (owner-gated: OD-03, OD-07/OA-03 keys, OA-01 tag ruleset); mainnet out of scope | owner: signed pre-release tag rehearsal in sandbox (WS-20.6 runbook), OD-03 recorded, keyed gate enabled (WS-06.3), allowed_signers populated; agents never create tags |

CP record (`docs/handoffs/next-phase-20261118/CP-n.md`): SHA, tree, merged WS items, every gate command with exit code and counts, deviations vs baseline, open risks, next window plan. A CP never "passes with known failures" unless the failure is pre-recorded in BASELINE.md as environmental (e.g. HH502) and unchanged.

## 9. Recovery procedures

- **9.1 Failing tests** — Reproduce red first on the exact SHA; classify regression vs pre-existing (compare BASELINE.md) vs environmental. Regression → owning WS fixes with a regression test before anything else merges into that area. Flaky → 3 isolated reruns, timer/IO coupling root-caused (R-18 precedent: `7a620ff1`); never `.skip`/`.only`/retry-wrapping security or crypto tests; quarantine only with coordinator approval recorded in CP-n.md.
- **9.2 Conflicts** — Owned paths make code conflicts impossible by design; if one appears the ownership map is wrong → STOP, coordinator fixes the map. Coordinator paths (lockfile, locales, routes, barrels): coordinator resolves. Need to edit a non-owned path → stop that item, request handover (coordinator moves the path at the next CP or edits it via coord-request).
- **9.3 Blocked feature** — Implement the decision-independent part + fail-closed default (IMPLEMENTATION_SEQUENCE §6); mark item BLK in handoff with OD/OA/EX ID; pull next ready item. Owner answer arrives mid-flight → coordinator re-plans that item only; already-merged default stays until the change is reviewed.
- **9.4 Context exhaustion** — At ~70 % context: commit `wip(<WS>.<n>): checkpoint` on the WS branch (never merged as-is) + full handoff block with exact resume point (file, function, failing test). Coordinator starts a fresh agent of the same tier on the same worktree/branch from the handoff. Never two agents on one WS.
- **9.5 CI unavailable** — The coordinator pushes the designated integration branch at every checkpoint (authorized by the session's own branch instructions; also the durability safeguard against container restarts) and its draft PR runs CI. If GitHub CI is unavailable, local gates (G-FULL) are the evidence; CI-only checks (Mythril, Echidna, Slither, CodeQL, confidential-contracts hardhat, docker integration) are recorded UNVERIFIED with the reason. Never claim CI green without a run id; never push any other branch.
- **9.6 Dependency changes** — Coordinator only (WS-22 procedure): one package per commit; `npm install <pkg>@<exact>` with node 22 / npm 10.9; lockfile regenerated, `npm ls --omit=dev`, `npm audit --omit=dev --audit-level=high`, lean bundle diff, G-FULL. Crypto majors (@scure/* 2.x) and TypeScript 7 / hardhat 3 forbidden this phase (OD-18). New runtime dependency in lean needs strongest review + privacy check (no network, no telemetry). Workers needing a dependency: STOP + request.
- **9.7 Discovered vulnerability** — Stop the item; private note to coordinator (severity Critical/High/Medium/Low/Info, status CONFIRMED/SUSPECTED, `path:line @ sha`, repro). No details in commit messages, PR text, issues or comments. Critical/High: freeze merges touching the area, owning WS (or coordinator-assigned strongest agent) fixes with regression test + strongest review; owner informed. Out-of-scope area (contracts/src frozen, experimental): record only, owner decides.
- **9.8 Estimate overrun** — Item > 1.5× hi estimate → coordinator re-scopes (split item, move to later CP, or reassign tier). Critical-path overrun → reprioritize ready queue, never skip review.
- **9.9 Bad merge** — Integration branch never rewritten: `git revert -m 1 <merge sha>` + CP re-run; WS branch fixed and re-merged.

## 10. Authorization limits (all agents, coordinator included)

- NO merge to `main`, NO mark-ready/merge of PR #203/#204 (OA-02 is owner).
- NO deploy: no Pages dispatch, no `deploy=true`, no environment approval (OA-06).
- NO release, NO tags (`v*` or any), NO draft-release publish (CP-9 rehearsal = owner).
- NO real-key broadcast: Sepolia broadcast and manifest signing with real keys are owner (OA-03, OA-04); agents use synthetic keys on local anvil only.
- NO branch deletion, NO PR closure, NO retirement actions (OD-19).
- NO push by workers. The coordinator pushes ONLY the session's designated integration branch (where this plan says `ws/WS-00-integration`) and maintains ONE draft PR for it (create, update its description, subscribe, answer review threads on it). NO other GitHub writes: no comments, issues, labels or reviews on other PRs/issues, no approvals, no merges.
- NO edits to frozen paths; NO weakening of gates, CSP, verifier strictness, lean boundary; NO telemetry/analytics; NO new network surface without strongest review + owner note.
- NO secrets or real key material in repo, logs, handoffs or test fixtures; `npm run ci:scan-secrets` at every merge.
- Owner silence ≠ approval; defaults only.
