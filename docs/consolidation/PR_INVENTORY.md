# GhostPay PR inventory (H01)

- Repository: `djshellshoxxx/GhostPay`
- Snapshot date: 2026-11-11 (UTC, from GitHub API at session time)
- `main` at inventory time: `bd2652bf1853948594522140a6a0fe0cbe54e32b`
- Open PRs: 75 (53 draft, 22 ready for review)
- Closed and merged PRs seen in the same snapshot include #97 and #99.

## Method and limits

- Source: GitHub MCP `list_pull_requests` (state open, and state all for closed-PR context). Head and base SHAs are as reported by the API.
- **Mergeability and CI status were NOT retrieved.** The `mergeable_state` field was returned as null for every PR. Per-PR check runs were not queried. Both are recorded as **NOT TESTED** and must not be read as passing.
- Ancestry was verified only for the listed checks below, using a bounded fetch (`git fetch --depth=300` of PR #119's head; 1,249 commits in the fetched history). Anything outside that window is **unverified**.
- No branches were merged, closed, rebased or deleted.

## Verified ancestry (PR #119 head `07968599cd37a98b8fb7b212609bc343e62c5c94`)

| Commit | Tip | Result |
|---|---|---|
| PR #84 tip | `5f9e444d3c9775f920b2f4f9a8771a7f8a3d86bf` | ancestor of #119 head |
| PR #102 tip | `a37e89f333a9fa7712d9ee015c20b83e5977214b` | ancestor |
| PR #103 tip | `b858ef92eda25281e977a9c1ba4cc31c5931d111` | ancestor |
| PR #104 tip | `2838abe7db239958dac95b32f226ee25cdfd94f6` | ancestor |
| PR #105 tip | `83d17adb4a07ff2120c6674a5128684e4f13776a` | ancestor |
| PR #106 tip | `5280569b7eaad9b4d996861410211cd40d005fdb` | ancestor |
| PR #107 tip | `0ab175e552485032672c59d9b38c733545c7c50f` | ancestor |
| PR #108 tip | `0a61e2c7fc54a87fc80cb8f7fadd143d1f1789aa` | ancestor |
| PR #109 tip | `969d1b270b243ce6fbdf1d7b9f5e813b775e7ea3` | ancestor |
| PR #110 tip | `bbe300b7fb21829350f66677d270a689f3a79ecf` | ancestor |
| PR #111 tip | `b12a20e1d6e284e8e3e228ab6bf08c83c012777a` | ancestor |
| PR #113 tip | `0641d41a4e869b9a1b16d25aa839070b4492bea1` | not in window: **unverified** |
| PR #114 tip | `1bf25be7c5405c0055c3bb99b0ceec8a2226fe23` | not in window: **unverified** |
| PR #118 tip | `c411a530f52ee4a48805b9656ae13730e44f52d7` | not in window: **unverified** |

PRs #102–#111 and the #84 tip are therefore already contained in #119's history. Those PRs are candidates for supersession once #119 is qualified. They must not be ported again.

## Stack structure (grouped by base branch)

Base branches with open PRs that target them:

- `main` ← #30, #31, #36, #42, #47, #49, #51, #52, #54, #55, #56, #57, #58, #75, #76, #78, #79, #81, #82, #83, #84, #85, #86, #87, #98, #101, #112, #115, #116
- `integration/ghostpay-beta-consolidated-20261109` ← #100, #102, #103, #104, #105, #106, #107, #108, #109, #110, #111, #113, #114, #118, #119
- `claude/ar-a0-pr47-green` ← #60, #61, #62, #63, #64, #65, #66, #70, #71, #72, #73, #74
- `codex/ghostpay-policy-localization-20261109` ← #91, #93, #94
- `claude/ghostpay-autonomous-completion-y4sk2h` ← #39, #41
- `codex/ghostpay-consolidation-20261030` ← #43, #44
- `claude/gifted-planck-115x2k` ← #40
- `integration/ghostpay-accepted-20261102` ← #59
- `claude/ar-c4-i18n-pay` ← #67
- `claude/ar-c4-i18n-scan` ← #68
- `claude/ar-c4-i18n-create-b4-buffer-ui` ← #69
- `claude/admiring-albattani-6kydor` ← #88
- `codex/ghostpay-continuation-20261109` ← #89
- `codex/ghostpay-product-20261109` ← #90
- `codex/ghostpay-companion-merchant-20261109` ← #92
- `gpt/ghostpay-cli-completion-20261109` ← #95
- `gpt/ghostpay-product-completion-20261109` ← #96
- `claude/vibrant-cori-scu18b` ← #117

Key stacks:
- **Beta candidate:** PR #98 (draft, head `integration/ghostpay-beta-consolidated-20261109` @ `364b1f1`) targets `main`. Child PRs #100, #102–#111, #113, #114, #118 and #119 target that integration branch. #117 stacks on #113.
- **Accepted/lean chain:** PR #47 (`integration/ghostpay-accepted-20261102`) and PR #59 (`claude/ar-a0-pr47-green`) are the base. #60–#65, #70–#74 target #59's branch. #66 → #67 → #68 → #69 form a linear chain.
- **Policy/localization chain:** `codex/ghostpay-continuation-20261109` → #89 → #90 → #91 → #92 (merchant CLI) → #95. #93, #94 and #96 also depend on this chain.
- **Older chains** (PRs #30–#44, #75–#88): many target `main` or old codex/claude branches. The review must check each against the current `main` before any action.

## Open PR table

| PR | Status | Head branch | Head SHA | Base branch | Base SHA (as recorded) | Title |
|---|---|---|---|---|---|---|
| #30 | draft | `claude/cool-albattani-xopr89` | `7373172db` | `main` | `edb0051eb` | Remaining engineering waves: embed, private scanning, policy, BTC, relayer permit fallback |
| #31 | draft | `claude/adoring-wozniak-850ue6` | `a2217ea1c` | `main` | `edb0051eb` | test(devnet): prove detect → receipt in the core EVM end-to-end flow |
| #36 | draft | `claude/portable-hosting-kit` | `cb917c67b` | `main` | `edb0051eb` | Portable hosting kit (tools/portable-hosting-kit) |
| #39 | draft | `claude/gifted-planck-115x2k` | `1d28f24d8` | `claude/ghostpay-autonomous-completion-y4sk2h` | `dfd5cbdd9` | Audit 24 review follow-ups D3, AR2, B2R (onto PR #37) |
| #40 | ready | `codex/ghostpay-security-audit-20261030` | `63994db6c` | `claude/gifted-planck-115x2k` | `1d28f24d8` | fix(relayer): prevent secret-file validation/read races |
| #41 | ready | `codex/ghostpay-consolidation-20261030` | `70d8bf6ec` | `claude/ghostpay-autonomous-completion-y4sk2h` | `b6a0871d0` | Consolidate scanner regrowth and descriptor-bound secret loading |
| #42 | draft | `claude/sharp-bohr-uigfgh` | `c9a8c3d3c` | `main` | `edb0051eb` | docs(handoff): Haiku wave prompts and Opus M1 milestone prompt |
| #43 | draft | `claude/haiku-wave-2-handoff-qepfoe` | `8d1bde36b` | `codex/ghostpay-consolidation-20261030` | `70d8bf6ec` | docs: wave 2 frontier status, nightly diagnosis, handoff markers |
| #44 | draft | `claude/happy-maxwell-onl4x5` | `fd710eb36` | `codex/ghostpay-consolidation-20261030` | `70d8bf6ec` | fix(audit): keep report file mode when regenerating audit 24 report |
| #47 | draft | `integration/ghostpay-accepted-20261102` | `f8193502e` | `main` | `c148ee13e` | Consolidate published work and implement supported lean checkout |
| #49 | ready | `dependabot/npm_and_yarn/follow-redirects-1.16.2` | `6bffb63d1` | `main` | `6f36e7ca2` | deps: bump follow-redirects from 1.16.1 to 1.16.2 |
| #51 | ready | `automation/ghostpay-recurrent-backlog-20261103` | `5835736c1` | `main` | `ecbd085cf` | ci: continue GhostPay API-funded backlog development twice daily |
| #52 | draft | `automation/ghostpay-parallel-four-agents-20261103` | `68dc5b502` | `main` | `ecbd085cf` | ci: add four parallel API-funded GhostPay QA agents with guarded integration |
| #54 | draft | `codex/ghostpay-research-acceptance-tests-41750257638` | `57b414bfb` | `main` | `0014bc5b2` | docs: independent GhostPay acceptance-tests research 41750257638 |
| #55 | draft | `codex/ghostpay-research-security-review-41750257638` | `2d9c30e12` | `main` | `0014bc5b2` | docs: independent GhostPay security-review research 41750257638 |
| #56 | draft | `codex/ghostpay-research-documentation-ux-41750257638` | `96fc22c42` | `main` | `0014bc5b2` | docs: independent GhostPay documentation-ux research 41750257638 |
| #57 | draft | `codex/ghostpay-research-release-qualification-41750257638` | `6bd5b15ce` | `main` | `0014bc5b2` | docs: independent GhostPay release-qualification research 41750257638 |
| #58 | draft | `claude/ghostpay-autonomous-prompt-scpgun` | `1db8e967a` | `main` | `0014bc5b2` | docs(handoff): autonomous completion prompt and launch recommendations |
| #59 | ready | `claude/ar-a0-pr47-green` | `4a38efdfa` | `integration/ghostpay-accepted-20261102` | `f8193502e` | A0: fix web typecheck that turns PR #47 CI red (axe page-global cast) |
| #60 | ready | `claude/ar-c2-qr-pairing` | `78be1730a` | `claude/ar-a0-pr47-green` | `4a38efdfa` | C2: seller device pairing (public config) and registry meta-address QR export |
| #61 | ready | `claude/ar-a6-combined-backup` | `f5d219851` | `claude/ar-a0-pr47-green` | `4a38efdfa` | A6: combined backup checklist (seller keys + tag archive, full profile) |
| #62 | ready | `claude/ar-b1-core-journey` | `e0a499bdd` | `claude/ar-a0-pr47-green` | `4a38efdfa` | B1: chained lean-core browser journey and devnet backup/restore step |
| #63 | ready | `claude/ar-c7-embed-iframe-e2e` | `2b9db8ab1` | `claude/ar-a0-pr47-green` | `4a38efdfa` | C7: iframe-mode embed e2e + SDK handshake fix |
| #64 | ready | `claude/ar-b2-lean-bound-receipts` | `2bcfd11f9` | `claude/ar-a0-pr47-green` | `4a38efdfa` | B2': require invoice-bound seller receipts in the lean profile |
| #65 | ready | `claude/ar-a7-policy-send-guard` | `f7b8ee9db` | `claude/ar-a0-pr47-green` | `4a38efdfa` | A7: session, reviewed-tx and deadline guards on the policy-account send path |
| #66 | ready | `claude/ar-c4-i18n-pay` | `e02d04c75` | `claude/ar-a0-pr47-green` | `4a38efdfa` | C4a: localize the Pay view through the i18n catalog |
| #67 | ready | `claude/ar-c4-i18n-scan` | `7f4702fdd` | `claude/ar-c4-i18n-pay` | `e02d04c75` | C4b: localize the Scan view through the i18n catalog |
| #68 | ready | `claude/ar-c4-i18n-create-b4-buffer-ui` | `4fe95fc0f` | `claude/ar-c4-i18n-scan` | `7f4702fdd` | C4c + B4: localize Create invoice; seller gas-buffer policy control (full profile only) |
| #69 | ready | `claude/ar-b3-sweep-permit-states` | `9d100956f` | `claude/ar-c4-i18n-create-b4-buffer-ui` | `4fe95fc0f` | B3': specific Sweep messages for relayer permit refusals (spec 04 acceptance) |
| #70 | draft | `claude/ar-a5-announcer-budget` | `d9fe8b4e9` | `claude/ar-a0-pr47-green` | `4a38efdfa` | A5: announcer spam lanes/budget adversarial tests and four scan-cursor fixes (spec 05) |
| #71 | ready | `claude/ar-c1-reconciliation-adr` | `1e8710911` | `claude/ar-a0-pr47-green` | `4a38efdfa` | C1: ADR-0026 local reconciliation and receipt archive (docs) |
| #72 | ready | `claude/ar-b5-testnet-feeds` | `76199cdac` | `claude/ar-a0-pr47-green` | `4a38efdfa` | B5 (blocked): record unreachable Chainlink primary sources for testnet feeds (docs) |
| #73 | ready | `claude/ar-c5-device-matrix` | `92af349a2` | `claude/ar-a0-pr47-green` | `4a38efdfa` | C5: Chromium device-emulation Playwright projects (a11y + responsive) |
| #74 | draft | `claude/ar-a4-btc-headersync` | `27d1580c5` | `claude/ar-a0-pr47-green` | `4a38efdfa` | A4: validate and persist the BTC header chain and anchor scans to it (full profile) |
| #75 | draft | `docs/ghostpay-deep-research-20261103` | `894dc868d` | `main` | `0014bc5b2` | docs: deep GhostPay research and Claude handoff with verified upstreams |
| #76 | draft | `claude/wizardly-babbage-mfsdrl` | `ade77362d` | `main` | `0014bc5b2` | docs(handoff): parallel consolidation and build prompt |
| #78 | draft | `claude/consolidation-2026-11-04` | `a28ca06a8` | `main` | `0014bc5b2` | Consolidate open branches and PRs (2026-11-04) |
| #79 | draft | `claude/cw-w8` | `f16296045` | `main` | `0014bc5b2` | ci: harden the API-funded agent workflows' merge gate, path policy and cache |
| #81 | draft | `codex/ghostpay-cloud-41868394956` | `f34a80f71` | `main` | `0014bc5b2` | codex: GhostPay cloud engineering checkpoint 41868394956 |
| #82 | draft | `codex/setup-autonomous-agent-20261104` | `122e51710` | `main` | `14f9b2673` | Configure OpenAI autonomous development workflow and prompts |
| #83 | draft | `codex/ghostpay-consolidation-audit-20261104` | `e2ac398c2` | `main` | `14f9b2673` | Audit GhostPay consolidation ancestry and plan gated integration |
| #84 | draft | `claude/admiring-albattani-6kydor` | `5f9e444d3` | `main` | `bd2652bf1` | Consolidation refresh (2026-11-07): #78 + later branch tips, two vetted remediations, P... |
| #85 | ready | `dependabot/github_actions/actions-1850456dc8` | `d071b3939` | `main` | `14f9b2673` | ci: bump the actions group across 1 directory with 2 updates |
| #86 | ready | `dependabot/npm_and_yarn/npm-minor-patch-f818bbfb6d` | `e09bbc120` | `main` | `14f9b2673` | deps: bump the npm-minor-patch group across 1 directory with 10 updates |
| #87 | ready | `dependabot/npm_and_yarn/npm-major-1ddf9439d6` | `5338a7e04` | `main` | `14f9b2673` | deps: bump the npm-major group across 1 directory with 11 updates |
| #88 | draft | `codex/ghostpay-continuation-20261109` | `0a68a57b7` | `claude/admiring-albattani-6kydor` | `48b6bc201` | i18n: classify shared notice labels for translation |
| #89 | draft | `codex/ghostpay-product-20261109` | `cfc7b0f33` | `codex/ghostpay-continuation-20261109` | `0a68a57b7` | Harden public exchange, reconciliation and policy scopes; finish W5 messages |
| #90 | draft | `codex/ghostpay-policy-localization-20261109` | `5628bc00b` | `codex/ghostpay-product-20261109` | `cfc7b0f33` | Authenticate policy payments, persist withdrawals, and extend localization |
| #91 | draft | `codex/ghostpay-companion-merchant-20261109` | `b748ecdce` | `codex/ghostpay-policy-localization-20261109` | `5628bc00b` | Merchant companion: restart-safe workflows, strict approvals and qualified CLI |
| #92 | ready | `gpt/ghostpay-cli-completion-20261109` | `3a9ce554f` | `codex/ghostpay-companion-merchant-20261109` | `b748ecdce` | Complete supported CLI and operator parity with shared verification and recovery |
| #93 | draft | `gpt/ghostpay-product-completion-20261109` | `3cd1e5544` | `codex/ghostpay-policy-localization-20261109` | `5628bc00b` | Complete product outcomes, accessible help and retry/security boundaries |
| #94 | draft | `fix/ghostpay-reconciliation-saturated-state-20261109` | `a864949d9` | `codex/ghostpay-policy-localization-20261109` | `5628bc00b` | test(web): await saturated reconciliation restore before UI assertion |
| #95 | draft | `codex/ghostpay-integrate-product-cli-20261109` | `3ec039c55` | `gpt/ghostpay-cli-completion-20261109` | `3a9ce554f` | Integrate qualified CLI and product stacks; finish shared QR codec |
| #96 | draft | `gpt/ghostpay-beta-spec-20261109` | `6697390ff` | `gpt/ghostpay-product-completion-20261109` | `3cd1e5544` | Specify accelerated beta delivery and reject empty release archives |
| #98 | draft | `integration/ghostpay-beta-consolidated-20261109` | `364b1f185` | `main` | `14f9b2673` | [DRAFT] Consolidate GhostPay implementation, merchant CLI, product security and beta sp... |
| #100 | draft | `codex/ghostpay-approval-gated-auto-integration-20261109` | `e36786bce` | `integration/ghostpay-beta-consolidated-20261109` | `364b1f185` | Harden cloud auto-integration: exact-head independent review and checked path policy |
| #101 | draft | `chatgpt/zero-codex-continuation-spec-20261109` | `d15921981` | `main` | `bd2652bf1` | docs: ChatGPT-only zero-Codex continuation specification |
| #102 | draft | `chatgpt/zero-codex/qualify-98-20261110` | `a37e89f33` | `integration/ghostpay-beta-consolidated-20261109` | `364b1f185` | docs(qualify): source-pin GhostPay #98 exact CI and unresolved Sonar gate |
| #103 | draft | `chatgpt/zero-codex/audit-secret-box-20261110` | `b858ef92e` | `integration/ghostpay-beta-consolidated-20261109` | `364b1f185` | docs(audit): seed-rotated read-only review of secret-box lifecycle boundaries |
| #104 | draft | `chatgpt/zero-codex/docs-wiki-20261110` | `2838abe7d` | `integration/ghostpay-beta-consolidated-20261109` | `364b1f185` | docs: source-pinned GhostPay User/Developer guides and wiki navigation |
| #105 | draft | `chatgpt/zero-codex/receipt-boundary-regressions-20261110` | `83d17adb4` | `integration/ghostpay-beta-consolidated-20261109` | `364b1f185` | test(cli): invoice-bound receipt negative-case qualification |
| #106 | draft | `chatgpt/zero-codex/ops-monitor-bounded-fetch-20261110` | `5280569b7` | `integration/ghostpay-beta-consolidated-20261109` | `364b1f185` | fix(ops-monitor): bound untrusted release-asset streaming before allocation |
| #107 | draft | `chatgpt/zero-codex/signed-receipt-no-rpc-proof-20261110` | `0ab175e55` | `integration/ghostpay-beta-consolidated-20261109` | `364b1f185` | test(cli): require live RPC evidence despite archived signed receipts |
| #108 | draft | `chatgpt/zero-codex/b0-receipt-recovery-20261110` | `0a61e2c7f` | `integration/ghostpay-beta-consolidated-20261109` | `364b1f185` | test(cli): exercise receipt creation, encrypted archival and offline recovery |
| #109 | draft | `chatgpt/zero-codex/recovery-auth-negative-20261110` | `969d1b270` | `integration/ghostpay-beta-consolidated-20261109` | `364b1f185` | test(cli): reject unauthenticated encrypted receipt recovery without writes |
| #110 | draft | `chatgpt/zero-codex/rpc-response-correlation-20261110` | `bbe300b7f` | `integration/ghostpay-beta-consolidated-20261109` | `364b1f185` | test(chain-evm-extra): fail closed on mismatched RPC response identity |
| #111 | draft | `chatgpt/zero-codex/rpc-concurrent-byte-budget-20261110` | `b12a20e1d` | `integration/ghostpay-beta-consolidated-20261109` | `364b1f185` | test(cli): reserve shared byte budgets before concurrent RPC reads |
| #112 | draft | `claude/docs-screenshots` | `0476cb117` | `main` | `bd2652bf1` | docs: screenshots, README package map and wiki refresh |
| #113 | draft | `claude/vibrant-cori-scu18b` | `0641d41a4` | `integration/ghostpay-beta-consolidated-20261109` | `364b1f185` | Hard-lane closure on the beta candidate: BTC local spend tracking and wallet policy, sp... |
| #114 | draft | `claude/nice-ritchie-8vivls` | `1bf25be7c` | `integration/ghostpay-beta-consolidated-20261109` | `364b1f185` | Core beta: real-chain lifecycle acceptance (library, CLI, browser), F1/F2 scan and reco... |
| #115 | draft | `claude/gracious-heisenberg-97ji6q` | `c6ce2259e` | `main` | `bd2652bf1` | Complementary beta workstream: release integrity, build health, hosting, contract/crypt... |
| #116 | draft | `research/privacy-evidence-matrix-20261110` | `a0a2d1dfb` | `main` | `bd2652bf1` | docs(privacy): establish four-axis evidence matrix and qualification tests |
| #117 | draft | `claude/kind-faraday-8qzf6e` | `1e4d19f1a` | `claude/vibrant-cori-scu18b` | `0641d41a4` | QR & device exchange completion (stacked on #113): classifier, multipart, camera lifecy... |
| #118 | draft | `claude/wonderful-thompson-ir89i9` | `c411a530f` | `integration/ghostpay-beta-consolidated-20261109` | `364b1f185` | Relayer: restart-safe budget and nonce journal, permit failure classes, ops CLI, contai... |
| #119 | draft | `claude/exciting-brown-7v69cr` | `07968599c` | `integration/ghostpay-beta-consolidated-20261109` | `364b1f185` | Integrate child PRs 102-111 and the PR 84 tip; fix 20+ verified defects incl. hidden-pa... |

## Observations for the coordinator

1. `docs/CONSOLIDATION_STATUS.md` and `docs/CONSOLIDATION_PROGRESS.md` on `main` (dated 2026-10-22) say migration is complete and continuing work is on `main`. The open-PR frontier (#98–#119 and the stacks) shows active development after that date. Those docs are stale, and they should not be used as the integration state.
2. Many draft PRs (for example #102–#111) are already contained in #119. Duplicate work must be avoided.
3. The `integration/ghostpay-beta-consolidated-20261109` branch is the working integration target named in the directive, and it is also the base for most of the beta stack.
4. A large number of `claude/*`, `chatgpt/*`, `codex/*`, `gpt/*` and `automation/*` branches exist with no PR (about 150 refs in total). They are not inventoried line by line here. Each one needs an ancestry check before any port.
5. Dependabot PRs #49, #85, #86 and #87 are non-draft. #87 is a major-version bump; treat it as a separate, breaking-change review.
