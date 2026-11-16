# GhostPay authoritative completion ledger

Updated 2026-11-16. Coordinator: Caveman root. Integration branch: `codex/ghostpay-unified-completion`.
Product checkpoint for this update: `ccd7721a` (local source commit; later documentation does not change that source).
Draft integration PR: [#187](https://github.com/djshellshoxxx/GhostPay/pull/187).

This ledger supersedes current-status statements in older completion matrices. Historical reports remain evidence
for their own source. Implementation, integration tests, independent agent review, external acceptance and release
qualification are separate states. **Neither implementation-complete nor release-qualified is asserted.** Two source
integration lanes, final combined checks and hosted analyzer qualification remain active. No arbitrary completion
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
| [02 Reconciliation](../specs/02-scanner-robustness-and-payment-verification.md) | A; `e79821d3` → `e8da90de` | Canonical block time, exact bigint sums, imported-history exclusion, conflicts/reorg/finality checks. CLI now derives time from fetched headers and rechecks both providers before publishing. Focused CLI52/web36 and native CLI124 pass. | Finish compiled operator acceptance and combined-source web/CLI coverage; browser acceptance on hosted runner. |
| [03 Fiat quotes](../specs/03-fiat-price-feeds.md) | D; `39f79175`, `d7b12e69` → `d7ae5b6a` | Configured decimals enforced by payer. Optional sequencer uptime/grace, fresh reference-feed deviation and USD peg guards use exact bigint math; conversion precision bounded. 46 tests including5 native checks pass. | Verified guard/feed configuration, real-feed fork acceptance and consumer activation remain separate. Relayer source lane active; TWAP and signed priceRoundId require their documented protocol/source work. |
| [04 Permit fallback](../specs/04-permit-griefing-fallback.md) | C/J; retained baseline | Existing permit diagnostics, preflight and refusal paths retained; core419 and relayer443 native-inclusive tests pass at cited source. Obsolete browser unauthorized classification removed with regression. | Requalify final candidate's browser/CLI/relayer paths; optional contract alternatives do not imply an approved ABI change. |
| [05 Scanner abuse bounds](../specs/05-announcer-spam-anonymity-set.md) | A/J; reconciliation source | Bounded scans, replay/conflict rejection, selected-provider checks and disclosures retained; corrected chain suite and native cases pass. | Final combined scanner/browser acceptance; announcement count must not imply measured anonymity. |
| [06 Registry and ENS](../specs/06-erc6538-registry.md) | B; `ef3c1cfe` → `ab5039a3` | Nonce/invalidation/delegated calldata builders retained. ENS uses selected RPC and pure ABI/name helpers; no CCIP/default endpoint transport.62 focused plus5 native registry tests pass; full/lean guards pass. | Verified runtime pins and real wallet/ENS acceptance. On-behalf UI remains explicitly excluded from v1, not silently enabled. |
| [07 Relayer observability](../specs/07-relayer-metrics-observability.md) | C; `364efaf3` → `9689600d` | Private authenticated metrics/stats, signed bounded alert queue, deadline/cancel/retry identity, rejection spikes, exact receipt gas/nominal fees and redacted logs.443 tests pass, including real authenticated Anvil scrape. | Source lane is implementing truthful optional secondary-provider/feed inputs for missing rpc_disagree/price_stale events. External Prometheus/HTTPS receiver acceptance remains pending. |
| [08 Archive and rotation](../specs/08-feature4-archive-key-rotation.md) | E/root; baseline + `b0b7afa9` | Atomic CAS/batch rotation, authenticated encrypted archives and recovery retained; vault284 tests pass. Corruption regression now always flips a bit instead of randomly leaving a byte unchanged. | Final browser storage, process restart, real-device lifecycle and combined coverage. |
| [09 Chain/deployment matrix](../specs/09-chain-token-deployment-matrix-and-pins.md) | D; `aa1d5153` | Strict machine-readable14-chain/9-token/4-feed inventory, configuration parity and manifest digest binding. Inventory tests pass; release gate correctly rejects73 unverified required cells. | Record actual deployments, runtime/token/feed/provider evidence and approved signed manifests; do not fabricate verification flags. |
| [10 Private transport](../specs/10-feature5-stage1-private-scanning.md) | H; retained baseline | Explicit transport configuration, privacy disclosures and fail-closed routing remain. | External Tor/SOCKS route and provider qualification; a webpage cannot establish or attest that route by itself. |
| [11 BIP-352 wallet](../specs/11-bip352-wallet-hardening.md) | H; package + worker sources | Official vectors, full-block txid/Merkle/witness validation, local spend tracking and bounded scanning retained; integrated BTC package525 tests pass. | External wallet/device interoperability and final combined candidate checks. Full profile only. |
| [12 Persistent light scan](../specs/12-bip352-light-client-scanning.md) | H; `9b911803`, `2fc1d217`, `7bdfa683` | Opt-in encrypted wallet/network state, CAS-safe restart/reorg checkpoints, bounded historical recovery, optional bounded gRPC-Web adapter and cancellable no-network worker are integrated. Worker85 tests and full/lean guards pass. | Fresh source-selection lane active. Existing own-Esplora full-block proof is supported; optional oracle/cross-check wiring and live node/proxy acceptance must be distinguished. Hosted scan-key modeC stays ADR-gated. |
| [13 Gas buffer](../specs/13-gas-buffer-v2.md) | D; retained baseline | Full-profile v2 buffer policies remain; lean excludes v2. Existing quote/contract tests cover retained implementation. | Verified native/USD feeds and external acceptance; optional permit-plus-buffer ABI extensions retain design gates. |
| [14 Merchant embedding](../specs/14-embed-merchant-profile.md) | B/I; `5d36ac5d` → `c5814cf2` | Consented bounded signed-profile fetch, independently confirmed identity pin, cross-tab Web Locks, rotation warning, signed template presentation and matching local-signer invoice issuance.115 integration plus21 independent tests pass. | Profile-only automatic checkout needs signed destination/fee/pricing schema or approved merchant signing transport. Native-language/browser acceptance remains separate. |
| [15 AA and policy](../specs/15-eip7702-aa-policy-account-path.md) | F/J; retained experimental source | Existing experimental contracts/schemes retained; core419 and payer-hiding109 native Foundry tests pass. | AUD24-01 policy-hash disclosure and convenience EIP-7702 delegate ABI/privacy decision unresolved. No real-funds qualification. |
| [16 Guardian recovery](../specs/16-policy-account-recovery.md) | G/J; ADR-0028 model | Isolated19-test authority model passes. ADR explicitly remains unaccepted. | Choose owner/guardian powers, quorum and recovery precedence; approve schema/contracts before creating a fund-control path. |
| [17 Milestone escrow](../specs/17-milestone-escrow.md) | G/J; research/design brief | Separate-product reuse and authority alternatives documented; no completed escrow implementation claimed. | Approve custody/dispute/administration model and prerequisites; existing Pausable reuse proposal conflicts with no-admin requirement and is not approval. |

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
| Root — integration | `b0b7afa9de68510b821cc702a0f82847a205495b` | Browser refusal allowlist narrowed; new401 refusal regression red before fix;52/52 relayer-client/archive tests and focusedlint pass, independent review clear. |

## Combined qualification and current failures

- The first published source `5dd6f3be` has [complete hosted check provenance](agents/UNIFIED_CHECKPOINT_5DD6_CI.json).
  Native contract, Slither, relayer, BTC, core, confidential, rest0/rest1 and CodeQL jobs passed there. Build guards,
  web and CLI failed. The failures exposed ENS bundled fallback hosts, missing CLI canonical time, stale UI/compiled
  fixtures, an obsolete refusal class and a nondeterministic corruption fixture. Source repairs are being integrated;
  those old jobs are **not** final-source evidence.
- Coordinator native core Foundry:419/419; payer-hiding Foundry:109/109. Contract source is unchanged by subsequent
  TypeScript work. Local Slither0.11.6:34 contracts/64 detectors/zero results with unchanged nightly flags.
- Coordinator corrected chain coverage:498 pass/18 native skips; separately all20 native chain tests pass with
  REQUIRE_ANVIL=1 (counts overlap). BTC package525/525; vault284/284; ops-monitor113/113. Final combined runs pending.
- Initial script suite:218 pass/1 failure because gpg-agent cannot start in this environment. No passing full script
  suite is claimed locally. Hosted checkpoint rest0 passed its separate script matrix.
- Chromium cannot launch locally: Unix socket EPERM before any browser test. Hosted full/lean, Pages native journey,
  mobile emulation and worker cancellation tests remain required; physical devices/native languages remain external.
- Real pinned Echidna2.2.7 completed Router300021 and Sweep300063 calls. The completed reports exposed a parser defect
  (`passing` versus `passed!`), fixed while requiring the full call budget and all properties/canaries. Policy attempts
  ended137/timeout without a complete inventory; final local retry also ended137. Wrapper fixtures are distinct from
  campaigns. Hosted qualification work is active; no complete campaign pass is asserted.
- Real Mythril0.24.8 attempts: Router/PolicyRouter/Factory137 or incomplete; Sweep and PolicyAccount produced low
  timestamp findings at intended signed-expiry guards. Findings remain visible; no clean full campaign is claimed.
- Private CodeQL alert inventory is unavailable through the connector's permitted endpoint. Successful hosted CodeQL
  jobs do not prove every private annotation or Sonar issue is closed.

## Release gates and next integration order

1. Finish CLI compiled acceptance and merge its handoff. Complete source-selection and relayer-source lanes with
   independent review; keep shared dependency installs coordinated.
2. Install the exact patched lock with the verified npm10 command; build all packages; run combined typecheck/lint,
   web/native coverage and full+lean output guards. Prepare deterministic development artifacts and reproducibility
   evidence. A development artifact is not a signed release.
3. Publish the exact tree to draft PR187 using a lease on the observed remote head; obtain fresh hosted CI, browser,
   OS and analyzer results. Repair actual failures; retain resource and external gates as pending when appropriate.
4. Supply authenticated deployment/feed evidence, approved release trust root and dedicated origin/ADR-0029;
   complete real-wallet/device/camera/screen-reader/native-language acceptance and independent external security audit.
5. Resolve the explicit policy/guardian/escrow and merchant automatic-checkout authority decisions separately.

No protected-main merge, production deployment, release signing, release publication or real-funds operation was
performed. No continuous background execution or scheduled continuation is claimed.
