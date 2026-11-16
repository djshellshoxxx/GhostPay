# GhostPay authoritative completion ledger

Updated 2026-11-16. Coordinator: Caveman root; integration branch `codex/ghostpay-unified-completion`.
Baseline: `0c4c3c8d951a9d6e71affcdaa26478911c8037f1` (#182), not stale `main`.
This ledger supersedes current-status claims in earlier matrices. Historical reports remain evidence for their exact source only.

## Status contract

Implemented means source and wiring exist. Verified means the explicitly listed checks passed at the cited source. Neither means release-qualified. Blocked means an external prerequisite or unresolved authority decision remains. A pending check is never a pass. No all-feature completion percentage is asserted until the complete acceptance inventory is qualified.

## Integration provenance

| Source | Original SHA | Destination / decision | Feature | Validation |
|---|---|---|---|---|
| #182 | 0c4c3c8d951a9d6e71affcdaa26478911c8037f1 | Integration baseline | Invoice totals, custody, registry, audit gates | Earlier source results remain historical; combined checks required |
| #183 | 2de9b0c5764cb1fb80a648e18d269b4d91210dcc | Tree identical to #182; ancestry preserved by 365a1c38 | Merchant identity disclosures | No duplicate implementation |
| #184 | 73371b57040c61bdb480e724e8593313d95c6781 | 28dabcfba9f9f26197415ea7397724e87b15ef8d | Stream cancellation | 113 tests pass; coverage 98.01/93.59/97.72/99.78 percent; independent source review |
| #186 | 27852ba898968a08f7d7c448fac8b19058189281 | Corrected in 694ca6b4 and 89d79c09; integrated a9a95919 | Canonical block-time reconciliation | Original scanner tests reproduced 10 failures; corrected 151 chain/provider and 24 vault cases pass; further checks in agent handoff |
| Coordinator | 192dd05dc144fda688586863d181be0d0b22c4c3 | Integrated | Merchant/ENS translation policy | 2 red/10 pass before classification; 12/12 afterward; four catalogs pass with untranslated/native-review warnings retained |

## Specification work and remaining gates

| Feature / spec | Owner | Status | Implementation / evidence | Dependencies and next action |
|---|---|---|---|---|
| Manifest runtime readback / 01 | D | Implemented subset | Existing runtime hashes/constants and secondary provider check | Verified announcer/registry pins, signed release manifests; cache proposal not required to bypass checks |
| Canonical reconciliation / 02 | A | Testing | #186 corrected; timestamp bound to header and independent provider, encrypted persistence; bigint summaries preserved | Combined scanner/vault/web tests and browser acceptance |
| Fiat feed validation / 03 | D | Blocked on evidence | Existing fail-closed freshness path retained; verified matrix underway | Verified feed inventory and live-provider acceptance |
| Permit fallback / 04 | Coordinator | Implemented subset | Existing classifier and refusal paths | Combined contracts/relayer/browser qualification |
| Scanner abuse bounds / 05 | A/J | Testing | Existing bounded scans/replay behavior retained | Regression/property and final integration qualification |
| ERC-6538 and ENS / 06 | B registry | Testing | Existing nonce/delegation builders; ENS resolution workstream | On-behalf UI expressly excluded from v1; verified runtime pins/external wallets still pending |
| Relayer observability / 07 | C | Testing | #185 listener/stats/signed alerts under review and remediation | Actual scrape/receiver checks; missing multi-provider/feed source telemetry cannot be invented |
| Archive rotation / 08 | E/coordinator | Implemented subset | Existing atomic TagStore batch and encrypted vault | Final recovery regressions and device lifecycle |
| Chain/deployment matrix / 09 | D | Testing | Machine-readable provenance and release gate workstream | Missing verified deployments remain a failing release prerequisite |
| Private transport / 10 | H | Implemented subset | Existing configured routes and fail-closed disclosure | Browser cannot establish or prove external SOCKS/Tor routing |
| BIP-352 wallet / 11 | H | Testing | Existing full-profile wallet and vector suites | External wallet/device interoperability |
| Persistent light scan / 12 | H | Implementation gap | Header persistence exists; wallet scan state wiring remains incomplete | Encrypted per-wallet/network state, restart/reorg acceptance, real node/oracle compatibility |
| Gas buffer / 13 | Coordinator | Implemented subset | Full-profile policies retained, lean excludes v2 | Verified feed data; optional contract extensions retain their design gates |
| Merchant embedding / 14 | B merchant/I | Testing | Explicit remote profile loading, pin/change workflow and signed template presentation underway | Independent review; browser acceptance; profile signature remains proof of key control only |
| AA/policy privacy / 15 | F/J | Blocked | Experimental implementation retained, AUD24-01 remains | Approved ABI/privacy model and independent audit |
| Guardian recovery / 16 | G/J | Blocked | ADR-0028 is explicitly unaccepted; reusable model/decision tests exist | Approved authority/schema/contract model and adversarial acceptance |
| Milestone escrow / 17 | G/J | Blocked | Separate-product brief and reuse research retained | Custody/dispute/authority decision before implementation |

## Executed shared checks

- `npm ci --ignore-scripts --no-audit --no-fund`: passed; 747 packages installed.
- `npm run build:libs`: passed at coordinator source before feature merges.
- `node --test scripts/tests/*.test.mjs scripts/pages/*.test.mjs`: 218 passed, 1 failed. PGP signing fixture cannot start `gpg-agent` in this execution environment. This is not a passing suite.
- Chromium launch with `/usr/bin/chromium`: blocked before any browser test by `socket() failed: Operation not permitted`. Hosted browser qualification remains mandatory.
- Full final-source tests/build/typecheck/lint and independent source reviews are pending as workers integrate.

## Release and external gates

Not release-qualified. No protected-main merge, public-chain deployment, release signing, publication or real-funds operation is authorized by this ledger. Dedicated origin/ADR-0029, trusted signed manifests, native-language review, real wallets/devices/cameras, external node/provider acceptance and independent security audit remain pending until actual evidence is recorded. Analyzer wrapper tests are distinct from pinned Mythril/Echidna campaigns.
