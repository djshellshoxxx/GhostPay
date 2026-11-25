# GhostPay authoritative completion ledger

**Issue #286 item 5, exports and notifications.** Integration branch `claude/w-export-privacy-286-20261125` merges donor [PR #570](https://github.com/djshellshoxxx/GhostPay/pull/570) (`55781533`, reviewed at `25966864`) onto main `32ae3977`. Changes beyond the donor: downloads keep a closed list of fixed `ghostpay-*` names, and any other requested name becomes `export.<ext>` (`apps/web/src/lib/downloadNames.ts`). The wallet-attempt replacement hash, the Pay approve/permit/revoke amount and spender, and the uncertain-sweep expected hash leave their live regions and stay visible beside them. Each fix has a red-then-green regression. Status: merged on main `e2c11634` (PR #675, merge `236501fe`) through candidate #681, whose exact head passed hosted CI (42 pass, 0 fail, 3 deploy-only jobs skipped). This is integration evidence for one #286 item, not release qualification.


## Current status (2026-11-18 consolidation)

This section is the present-tense status. The 2026-11-16 content below it is retained as source-pinned history for
`2962554d`/`beb525dd`; where it says browser or analyzer results are pending, the table below supersedes it.

Consolidation candidate: branch `nodata/wizardly-allen-qwol6u`, draft PR
[#203](https://github.com/djshellshoxxx/GhostPay/pull/203), built on unified #187 (`beb525dd`) plus main ancestry,
Pages #192/#194–#202, specs #190/#191 and the fixes listed in
[the consolidation record](consolidation-20261118/CANDIDATE_INTEGRATION.md). Exact final head, tree, checks and the
proposed next action: [promotion packet](consolidation-20261118/PROMOTION_PACKET.md). Branch dispositions:
[ledger](consolidation-20261118/BRANCH_DISPOSITION_LEDGER.md). Validation evidence:
[matrix](consolidation-20261118/VALIDATION_MATRIX.md). Reviews: [findings](consolidation-20261118/REVIEW_FINDINGS.md).
Next phase: [queue](consolidation-20261118/NEXT_PHASE_QUEUE.md).

States are cumulative only where stated. **Implemented**: source and focused tests exist. **Integrated**: present in
the consolidation candidate. **Automated-qualified**: required repository CI and analyzers passed on the candidate
source. **Externally-qualified**: real deployment, wallet, device, network or independent audit evidence exists.
**Design-blocked**: needs an owner decision before production authority. **Release-ready**: all gates for the
stated scope passed on one source and the owner approved release. Nothing is release-ready.

| Area | Implemented | Integrated | Automated-qualified | Externally-qualified | Design-blocked / owner gate |
|---|---|---|---|---|---|
| Static lean Pages beta (invoice, pay, scan, receipt, sweep, backup, lock, re-import) | Yes | Yes | Application CI 24/24, Pages, beta, integration, hosting and CLI qualification green on qualified head `7a620ff1` (e2e full 78 passed / 1 skipped, lean 66 passed / 3 skipped) | No: no authenticated testnet deployment, signed manifest, dedicated origin, real wallet/device/screen-reader/native-language acceptance | ADR-0029 origin and release trust root; deployment facts |
| Full profile (merchant embedding, BTC BIP-352, private transport, relayer observability) | Yes (per 2026-11-16 rows below) | Yes | Covered by the same CI jobs | No (live nodes, proxies, receivers, wallets) | Optional; not required by the static beta |
| Spec 18 / requirement 3q payment-key portability | No (specification only; canonical, approved, before beta exit) | Specification integrated | No | No | Spec wording items before K03 (NEXT_PHASE_QUEUE) |
| Contracts (Router, PolicyRouter, Sweep relayer, PolicyAccount, Factory) | Yes | Yes (source unchanged from `beb525dd`) | Foundry, coverage, Slither and static checks green; **Echidna green in CI** on qualified head `7a620ff1` (all canaries reached, all 13 safety properties hold, full budgets); **Mythril red by design**: 11 records individually dispositioned and independently reviewed (all 11 reproduced on `7a620ff1`, none new), no suppression | No external audit | Mythril finding-specific disposition mechanism (owner); factory fee-token freeze residual before any production scheme-2 deployment; L2 cancel-window guidance |
| Release process | `release.yml` requires source-matched Echidna and Mythril success | Yes | Workflow tests only; never run on a real tag | No | Release signer key absent; `main` unprotected, no rulesets or `v*` tag ruleset, environment reviewers unverified |
| Chain/deployment matrix | Strict 14-chain/9-token/4-feed matrix | Yes | Schema passes; release mode rejects 73 unverified cells (42 chain, 27 token, 4 feed) | No | Authentic deployments and provider evidence (Sepolia first, then Base Sepolia) |
| Policy/AA, guardian recovery, milestone escrow, automatic checkout | Experimental or model-only | Retained | Model tests only | No | Each needs an accepted specification before any fund-control path |
| Future privacy 5a–5j, 5l | No (proposed) | Specifications integrated | No | No | Owner scheduling |
| Private security inventories (CodeQL, Dependabot, secret scanning, Sonar) | — | — | Scanner jobs pass; alert inventories not accessible (HTTP 403 / proxy) | No | Owner access or export |

## 2026-11-16 ledger (history)

Updated 2026-11-16. Coordinator: Caveman root. Integration branch: `codex/ghostpay-unified-completion`.
Product checkpoint for this update: `2962554d` (local source commit; later documentation does not change that source).
Draft integration PR: [#187](https://github.com/djshellshoxxx/GhostPay/pull/187).

This ledger supersedes current-status statements in older completion matrices. Historical reports remain evidence
for their own source. Implementation, integration tests, independent agent review, external acceptance and release
qualification are separate states. **Neither implementation-complete nor release-qualified is asserted.** All listed source lanes are integrated with independent agent review. Final hosted browser checks, analyzer campaigns and development artifact reproducibility remain active. No arbitrary completion
percentage is used: an implementation count would conceal unresolved acceptance requirements.

## Source and consolidation provenance

Baseline is #182 `0c4c3c8d951a9d6e71affcdaa26478911c8037f1`, not the less developed default branch.
Default main at last read: `bd2652bf1853948594522140a6a0fe0cbe54e32b`.

| Input | Exact original source | Integration decision / destination |
|---|---|---|
| [#182](https://github.com/djshellshoxxx/GhostPay/pull/182) | `0c4c3c8d951a9d6e71affcdaa26478911c8037f1` | Baseline; already contains #179/#180/#181 and broad historical recovery. |
| [#183](https://github.com/djshellshoxxx/GhostPay/pull/183) | `2de9b0c5764cb1fb80a648e18d269b4d91210dcc` | Tree identical to #182; retained ancestry without duplicating code. |
| [#184](https://github.com/djshellshoxxx/GhostPay/pull/184) | `73371b57040c61bdb480e724e8593313d95c6781` | Stream cancellation retained in `28dabcfb`; 113 package tests pass. |
| [#185](https://github.com/djshellshoxxx/GhostPay/pull/185) | `c738f96e2f1a0dfef9003ae29ad636b03cf74b09` | Metrics/alert baseline plus independently reviewed bounded delivery and telemetry; integrated `9689600d`. |
| [#186](https://github.com/djshellshoxxx/GhostPay/pull/186) | `27852ba898968a08f7d7c448fac8b19058189281` | Corrected canonical header cache and timestamp/provider behavior; integrated `a9a95919`; later CLI integration corrected in `e8da90de`. |
| Historical remote refs | 200 exact heads in [snapshot](agents/TEAM_J_BRANCH_SNAPSHOT.md) | 150 ancestor-contained, 14 patch-equivalent, 36 with unique patch histories reviewed/dispositioned. Unique patches do not automatically mean missing features. See [behavioral dispositions](agents/TEAM_J_UNIFIED.md). |
| First published checkpoint | Local `63b20b03444abf1815bde5133afe992bd2447b79`; remote `5dd6f3be93f6e90c98f345c9060e67d2ffb47c26` | Identical Git tree `1bd0510d7f954c90d9fe4fe13ad7931b96c31133`, verified before publication. Remote commit preserves the source PR parents. |

Local source SHAs in agent handoffs are provenance, not automatically GitHub commit objects. API publication creates
an exact-tree checkpoint with different commit identity; the PR body records the latest published SHA and tree.
No source branch was deleted, force-pushed or merged into protected main.

## Numbered feature inventory

All rows target the integration branch above. Owner/source identifiers refer to the detailed source-pinned handoffs
in the next section, which record original branches, exact SHAs, commands, security findings and next actions.

| Feature / specification | Owner and source | Current implementation / verification | Dependencies and concrete next action |
|---|---|---|---|
| [01 Manifest readback](../specs/01-manifest-readback.md) | D; baseline + matrix | Runtime hashes/constants, secondary-provider comparison and strict signed configuration loader retained. Matrix makes missing release evidence fail closed. | Supply authenticated announcer/registry/runtime pins and approved signed manifests; run public-provider readback. Optional cache is not required to bypass verification. |
| [02 Reconciliation](../specs/02-scanner-robustness-and-payment-verification.md) | A; `e79821d3` → `e8da90de` | Canonical block time, exact bigint sums, imported-history exclusion, conflicts/reorg/finality checks. CLI now derives time from fetched headers and rechecks both providers before publishing. Focused CLI52/web36 and native CLI124 pass. | Compiled acceptance21/21 and native CLI124/124 passed; hosted CLI570/570 passed on Linux, macOS and Windows. Repair stale browser timestamp fixtures and requalify final source. |
| [03 Fiat quotes](../specs/03-fiat-price-feeds.md) | D; `39f79175`, `d7b12e69` → `d7ae5b6a` | Configured decimals enforced by payer. Optional sequencer uptime/grace, fresh reference-feed deviation and USD peg guards use exact bigint math; conversion precision bounded. 46 tests including5 native checks pass. | Verified guard/feed configuration, real-feed fork acceptance and consumer activation remain separate. Configured relayer feed/provider sources are implemented and reviewed; TWAP and signed priceRoundId retain their documented protocol/source gates. |
| [04 Permit fallback](../specs/04-permit-griefing-fallback.md) | C/J; retained baseline | Existing permit diagnostics, preflight and refusal paths retained; core419 and relayer443 native-inclusive tests pass at cited source. Obsolete browser unauthorized classification removed with regression. | Requalify final candidate's browser/CLI/relayer paths; optional contract alternatives do not imply an approved ABI change. |
| [05 Scanner abuse bounds](../specs/05-announcer-spam-anonymity-set.md) | A/J; reconciliation source | Bounded scans, replay/conflict rejection, selected-provider checks and disclosures retained; corrected chain suite and native cases pass. | Final combined scanner/browser acceptance; announcement count must not imply measured anonymity. |
| [06 Registry and ENS](../specs/06-erc6538-registry.md) | B; `ef3c1cfe` → `ab5039a3` | Validated immutable EIP-712 delegation, explicit signing/verification callbacks and bounded EOA/ERC1271 signatures are implemented.73 focused and9 native registry tests pass; independent53 helper/9 native pass. ENS still uses selected RPC and pure ABI/name helpers, with no CCIP/default transport. | Verified runtime pins and real wallet/ENS acceptance. On-behalf UI remains explicitly excluded from v1, not silently enabled. |
| [07 Relayer observability](../specs/07-relayer-metrics-observability.md) | C; `364efaf3` → `9689600d` | Private authenticated metrics/stats, signed bounded alert queue, deadline/cancel/retry identity, rejection spikes, exact receipt gas/nominal fees and redacted logs.443 tests pass, including real authenticated Anvil scrape. | Optional secondary-provider canonical-header checks and registry-feed pricing now supply actual rpc_disagree/price_stale events; final relayer475/475 passes including native cases. External Prometheus/HTTPS receiver acceptance remains pending. |
| [08 Archive and rotation](../specs/08-feature4-archive-key-rotation.md) | E/root; baseline + `b0b7afa9` | Atomic CAS/batch rotation, authenticated encrypted archives and recovery retained; vault284 tests pass. Corruption regression now always flips a bit instead of randomly leaving a byte unchanged. | Fresh custody287/287 passed; final browser storage, process restart, real-device lifecycle and combined coverage remain separate. |
| [09 Chain/deployment matrix](../specs/09-chain-token-deployment-matrix-and-pins.md) | D; `aa1d5153` | Strict machine-readable14-chain/9-token/4-feed inventory, configuration parity and manifest digest binding. Inventory tests pass; release gate correctly rejects73 unverified required cells. | Record actual deployments, runtime/token/feed/provider evidence and approved signed manifests; do not fabricate verification flags. |
| [10 Private transport](../specs/10-feature5-stage1-private-scanning.md) | H; retained baseline | Explicit transport configuration, privacy disclosures and fail-closed routing remain. | External Tor/SOCKS route and provider qualification; a webpage cannot establish or attest that route by itself. |
| [11 BIP-352 wallet](../specs/11-bip352-wallet-hardening.md) | H; package + worker sources | Official vectors, full-block txid/Merkle/witness validation, local spend tracking and bounded scanning retained; integrated BTC package525 tests pass. | External wallet/device interoperability and final combined candidate checks. Full profile only. |
| [12 Persistent light scan](../specs/12-bip352-light-client-scanning.md) | H; `9b911803`, `2fc1d217`, `7bdfa683` | Opt-in encrypted wallet/network state, CAS-safe restart/reorg checkpoints, bounded historical recovery, optional bounded gRPC-Web adapter and cancellable no-network worker are integrated. Worker85 tests and full/lean guards pass. | Own-Esplora remains the default. Optional HTTP/gRPC oracle full-block comparisons and light scans now require exact-output transaction inclusion against checked headers before spend authority or checkpoints. Source-scoped tests/review pass; live node/proxy acceptance remains external. Hosted scan-key modeC stays ADR-gated. |
| [13 Gas buffer](../specs/13-gas-buffer-v2.md) | D; retained baseline | Full-profile v2 buffer policies remain; lean excludes v2. Existing quote/contract tests cover retained implementation. | Verified native/USD feeds and external acceptance; optional permit-plus-buffer ABI extensions retain design gates. |
| [14 Merchant embedding](../specs/14-embed-merchant-profile.md) | B/I; `5d36ac5d` → `c5814cf2` | Consented bounded signed-profile fetch, independently confirmed identity pin, cross-tab Web Locks, rotation warning, signed template presentation and matching local-signer invoice issuance.115 integration plus21 independent tests pass. | Profile-only automatic checkout needs signed destination/fee/pricing schema or approved merchant signing transport. Native-language/browser acceptance remains separate. |
| [15 AA and policy](../specs/15-eip7702-aa-policy-account-path.md) | F/J; retained experimental source | Existing experimental contracts/schemes retained; core419 and payer-hiding109 native Foundry tests pass. | AUD24-01 policy-hash disclosure and convenience EIP-7702 delegate ABI/privacy decision unresolved. No real-funds qualification. |
| [16 Guardian recovery](../specs/16-policy-account-recovery.md) | G/J; ADR-0028 model | Isolated19-test authority model passes. ADR explicitly remains unaccepted. | Choose owner/guardian powers, quorum and recovery precedence; approve schema/contracts before creating a fund-control path. |
| [17 Milestone escrow](../specs/17-milestone-escrow.md) | G/J; research/design brief | Separate isolated authority model and threat analysis implemented at307f9008, integrated cb415199.19 tests/100% model coverage,42 state/action pairs,15,444 attempted transitions and396 reachable states; independent review passes. Four explicit variants have no default; this is supporting work, not a production escrow. | Approve custody/dispute/administration model and prerequisites; existing Pausable reuse proposal conflicts with no-admin requirement and is not approval. |

## Source-pinned implementation, tests and independent review

Counts overlap; do not sum them as unique tests. Handoffs distinguish author tests, independent reruns, native
acceptance, failed attempts and unavailable external checks.

| Owner / source branch | Exact implementation source | Evidence and security disposition |
|---|---|---|
| A — `codex/unified-reconciliation` | `a9950d54` final lane head | [Reconciliation handoff](agents/TEAM_A_UNIFIED.md): original10 failures reproduced; corrected151 chain/provider,24 vault and19 amount cases pass. |
| B — `codex/unified-registry` | `ef3c1cfe8d67ee66dafc044dfc6cab4a7ee00200` | [ENS bundle correction](agents/TEAM_B_REGISTRY_BUNDLE_CORRECTION.md):62 tests; full18/lean17 artifact scans; independent review clear. |
| B/I — `codex/unified-merchant` | `5d36ac5db78ebdb1698c79dfa28a1294dbcc6b8a` | [Merchant handoff](agents/TEAM_B_UNIFIED.md) and [review](agents/TEAM_B_MERCHANT_REVIEW.md). Signature means key control; independent identity confirmation remains explicit. |
| C — `codex/unified-observability` | `364efaf3902351886eb2baa739e8e0dc70101617` | [Relayer handoff](agents/TEAM_C_UNIFIED.md):443/443;97.23/92.96/97.95/98.89 coverage; typecheck/build/lint; independent source and14-test instrumentation review. |
| D — `codex/unified-matrix` | `39f79175e249ecd35f6bff1abbb8750d9ade814b` | [Matrix handoff](agents/TEAM_D_UNIFIED.md): inventory16/combined workflow21; decimals22 adapter/55payer; red-green and source review. |
| D — `codex/unified-price-gates` | `d7b12e69a18426e112c29fa55d47dab102659420` | [Optional guards](agents/TEAM_D_PRICE_GATES.md):46 tests incl5native, quote coverage100%; independent19; no claim of automatic activation or source independence. |
| H — `codex/unified-btc` | `9b911803` product; `c106b58c` final head | [Persistence handoff](agents/TEAM_H_UNIFIED.md): encrypted metadata, revalidation and pagination; independent review found/fixed tombstone ABA before integration. |
| H — `codex/unified-blindbit-grpc` | `2fc1d217df42374ad9381df7b4c1b17b3c9b5b6b` | [gRPC handoff](agents/TEAM_H_GRPC_UNIFIED.md):66 tests incl32 new;99.58/98.83/100/100 new-adapter coverage; independent32; MIT schema provenance preserved. |
| H — `codex/unified-btc-worker` | `7bdfa683cfbec5635ebd1717e730e2a2af09dfde` | [Worker handoff](agents/TEAM_H_WORKER_UNIFIED.md):85 focused, independent16, typecheck/lint/full+lean guards. Review caught direct worker network conflict and late-response cleanup; both corrected. |
| J — `codex/unified-dependencies` | `379fe3004f06261949a7cd3303ae1699927bdc6a` | [Dependency handoff](agents/TEAM_J_DEPENDENCIES_UNIFIED.md):33→17low dev findings; production0; all154 production lock records unchanged. npm10 clean install,5 tooling+5independent,39 Hardhat checks pass. Full FHE and npm11 install exited137 locally, not passes. |
| C/D — `codex/unified-relayer-sources` | `87f3dd504de5de8a2fe27d0215429ccaa7520da3` → `89bc0534` | [Sources handoff](agents/TEAM_C_SOURCES_UNIFIED.md):475/475 with native execution,97.04/92.56/98.03/98.86 coverage; independent29/29. Fixed feed expiry across nonce/signing waits before broadcast. Public503 remains uncertain in browser retry policy. |
| H — `codex/unified-btc-sources` | `d5632c9e` + `d9ba1253` → `e076cff8`; helper `1eb2c4c8` + `a4496071` | [Source handoff](agents/TEAM_H_SOURCES_UNIFIED.md): bounded oracle selection, mandatory transaction/output inclusion, second-source checks, worker cleanup and source-scoped encrypted continuity. Independent34/34 plus12/12; author full/lean artifact guards pass. Root42/42 includes all17 locale outcomes; critical catalog boundary integrated at6797fdee with independent12/12. |
| E — `codex/unified-custody-review` | `9da076c546e51d9ee46817cba69dbee2c1b38bcf` → `2504c788` | [Custody review](agents/TEAM_E_CUSTODY_REVIEW.md): fresh287 tests across20 files passed; no new source defect demonstrated. Browser/device gates remain separate. |
| J — `codex/unified-ci-final` | `91ef6b98` → `d8bd86ef` | [CI repair](agents/TEAM_J_CI_FINAL.md): required injected BTC transport preserves audited fetch allowlist; native shard uses pinned compiled solc.51web+5workflow+5native tests; independent51+5 pass. |
| B — `codex/unified-registry-delegation` | `7b4c06b2` + `4cfe30a7` + `ba7deab2` → `af752992` | [Signing handoff](agents/TEAM_B_DELEGATION_UNIFIED.md):73 focused/100% helper coverage;9 native EOA/ERC1271 tests. Independent53/9 passed; real wrong-chain and wrong-account rejection. Public deployment pins remain unverified. |
| G — `codex/unified-escrow-support` | `307f900823944f7de59597ba5be550e657c4c5ae` → `cb415199` | [Escrow supporting evidence](agents/TEAM_G_ESCROW_SUPPORT.md): isolated19-test proposed model and explicit threat/authority alternatives. Design blocked; no production fund path. |
| I — `codex/unified-browser-final` | `9642e75a11bcc49d1f782e58c5141da2c037c58e` → `b1cc3bbe` | [Browser repair](agents/TEAM_I_BROWSER_FINAL.md): real skip-link focus order fixed; canonical timestamp fixture corrected.77 focused tests, full web typecheck/scopedlint and independent34 pass. Original QR browser rejection assertion remains pending real rerun. |
| J — fresh final delta reviewer | `278e4b7f` → `2962554d` | [Independent delta review](agents/UNIFIED_FINAL_DELTA_REVIEW.md): source-scoped signing, escrow, transport, CI, locale and browser review; no blocking source defect found. No external audit or final hosted qualification claim. |
| Root — integration | `b0b7afa9de68510b821cc702a0f82847a205495b` | Browser refusal allowlist narrowed; new401 refusal regression red before fix;52/52 relayer-client/archive tests and focusedlint pass, independent review clear. |

## Combined qualification and current failures

- Checkpoint `55e8bf49feb854d37a55d36492b0710d1226b64c` matches local94d8 tree `348e269e2f25999586dc81a395e893f6051d608e`. [Hosted job snapshot](agents/UNIFIED_CHECKPOINT_55E8_CI.json) records successful typecheck, lint, Slither, all contract gates, relayer/BTC/core/confidential/rest0/rest2 and CLI across all three OSes. Web2686 passed/1 skipped/6 failed: five worker-locale fixtures and one implicit fetch boundary. Rest1 lacked SOLC_BIN. Both are repaired in later source. Focus and canonical browser fixture repairs are integrated; the prior hosted pairing observation remains unqualified until rerun. This checkpoint is not final qualification.
- Local full web coverage at94d8 lost its execution handle during environment recovery before a final result. It is not a pass. All401 web source/browser-test files passed batched ESLint at94d8; repository typecheck also passed. Later source needs final combined gates.

- The first published source `5dd6f3be` has [complete hosted check provenance](agents/UNIFIED_CHECKPOINT_5DD6_CI.json).
  Native contract, Slither, relayer, BTC, core, confidential, rest0/rest1 and CodeQL jobs passed there. Build guards,
  web and CLI failed. The failures exposed ENS bundled fallback hosts, missing CLI canonical time, stale UI/compiled
  fixtures, an obsolete refusal class and a nondeterministic corruption fixture. All listed repairs are integrated; those old jobs are **not** final-source evidence.
- Coordinator native core Foundry:419/419; payer-hiding Foundry:109/109. Contract source is unchanged by subsequent
  TypeScript work. Local Slither0.11.6:34 contracts/64 detectors/zero results with unchanged nightly flags.
- Coordinator corrected chain coverage:498 pass/18 native skips; separately all20 native chain tests pass with
  REQUIRE_ANVIL=1 (counts overlap). BTC package525/525; vault284/284; ops-monitor113/113. Final combined runs pending.
- Initial script suite:218 pass/1 failure because gpg-agent cannot start in this environment. No passing full script
  suite is claimed locally. Hosted checkpoint rest0 passed its separate script matrix.
- Chromium cannot launch locally: Unix socket EPERM before any browser test. Hosted checkpoint55e8 Pages native journey16/16 and beta browser3/3 passed. Full/lean E2E exposed focus, pairing and stale timestamp fixture failures; focus and timestamp repairs are integrated and pairing awaits actual rerun. Physical devices/native languages remain external.
- Real pinned Echidna2.2.7 completed Router300021 and Sweep300063 calls. The completed reports exposed a parser defect
  (`passing` versus `passed!`), fixed while requiring the full call budget and all properties/canaries. Policy attempts
  ended137/timeout without a complete inventory; final local retry also ended137. Wrapper fixtures are distinct from
  campaigns. A reviewed read-only, path-scoped PR workflow now runs the unchanged full campaigns and retains bounded source-pinned evidence; its final run remains pending. No complete campaign pass is asserted.
- Real Mythril0.24.8 attempts: Router/PolicyRouter/Factory137 or incomplete; Sweep and PolicyAccount produced low
  timestamp findings at intended signed-expiry guards. Findings remain visible; no clean full campaign is claimed.
- Private CodeQL alert inventory is unavailable through the connector's permitted endpoint. Successful hosted CodeQL
  jobs do not prove every private annotation or Sonar issue is closed.

## Release gates and next integration order

1. Qualify integrated source2962554d with fresh hosted CI and resolve the remaining observed pairing browser failure from that actual run; no assertion is removed. All source-lane handoffs and independent delta reviews are integrated.
2. Preserve exact lock evidence: clean npm10 install passed and lock remained unchanged. All libraries and workspace typechecks passed atd8bd86ef, as did the full artifact guard. New registry/browser deltas passed their author and independent checks; run final combined full/lean guards and hosted coverage. Prepare deterministic development artifacts and two-build reproducibility evidence. A development artifact is not a signed release.
3. Publish the exact tree to draft PR187 using a lease on the observed remote head; obtain fresh hosted CI, browser,
   OS and analyzer results. Repair actual failures; retain resource and external gates as pending when appropriate.
4. Supply authenticated deployment/feed evidence, approved release trust root and dedicated origin/ADR-0029;
   complete real-wallet/device/camera/screen-reader/native-language acceptance and independent external security audit.
5. Resolve the explicit policy/guardian/escrow and merchant automatic-checkout authority decisions separately.

No protected-main merge, production deployment, release signing, release publication or real-funds operation was
performed. No continuous background execution or scheduled continuation is claimed.

### v1.1 beta — local address reuse (issue #287, item 1)

Checkout compares the derived EVM destination on explicit payment preparation. Seller sweep compares the chosen destination with earlier submitted sweeps. Acceptance requires account and chain isolation, same-invoice and different-invoice cases, session reload, storage failure, nonblocking controls, and no new remote requests. See [user-facing scope and retention](../user/privacy-limits.md#repeated-evm-destinations). The v1.1 release gate remains open through independent review and integration.
