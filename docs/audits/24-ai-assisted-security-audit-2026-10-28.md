# AI-assisted security audit of the completed modules (2026-10-28)

> **This is not a professional security audit.** It was carried out by AI agents (Claude Code) in one working session. It is evidence for the owner's own review: it is not an independent assessment, a certification or a guarantee that the code is secure. The findings were reproduced or traced in code by AI verifiers, and their severities are those agents' judgment. The limits and the areas that were not covered are listed at the end.

## Scope

- **Baseline:** PR #37 head `6a3e85c` (lane reviews started at `9ce5614`; `6a3e85c` changes only the lockfile and an npm override).
- **Covered:** what is complete or shipped.
  - The lean one-EVM beta core: seller keys, vault, session and local storage; invoice creation and pay; scanning and the reconciliation ledger; sweeping and the sweep signing lock.
  - The chain adapters and core crypto it uses.
  - The sponsored-sweep relayer and its guard library.
  - The hosting kit, deploy and infra recipes, and the CI and release workflows.
  - The BTC, Solana and TRON views that ship in the default navigation (test networks only).
  - The merchant plugins and examples.
  - For preserved packages that are not shipped: reachability, i.e. whether anything ships or imports them.
- **Not covered:** see [Limits](#limits). Contracts were reviewed only where the beta uses them (EIP-712 sweep, permit, nonces).

## Method

1. **Review lanes.** Eight lanes each reviewed one part of the code and wrote reproductions for their claims. The reproductions were scratch tests against the real code, and none is committed. The lanes were:
   1. keys and storage
   2. pay and sweep
   3. scanning and privacy
   4. chain adapters and non-EVM clients
   5. the relayer
   6. contracts in beta use
   7. hosting, deploy and CI
   8. preserved packages
2. **Coverage-gap pass.** A second pass covered three areas the lanes did not reach:
   - invoice links and embedding
   - the non-EVM views and secret display
   - the merchant plugins
3. **Adversarial verification.** For every finding, one agent tried to refute it and another judged its real-world impact. A third agent adjudicated every disagreement and every High.
   - All 83 reported findings were confirmed; none was refuted.
   - Two lane notes were not sent for verification: L4-I2, a positive note that the in-house BTC BIP-32 derivation, Solana raw-scalar Ed25519 signing and the TRON protobuf and BTC header/Merkle/witness parsers were reviewed and found correct, and L5-09, an Info observation the lane itself marked "no action".
   - Verification changed many lane severities. L4-01 went from Medium to High.
   - L5-01 and L5-02 went from High to Medium, because the loss is relayer gas and the budgets cap it.
   - L8-02 and L8-03 dropped to Info because nothing ships them.
4. **Fixes.** For each area, one AI agent wrote a test that fails on the code before the change, then the smallest fix.
   - A separate AI reviewer agent checked each fix. It re-ran the new tests against the base to confirm they fail there, and it ran the area's checks.
   - When a reviewer approved a fix but raised issues, a follow-up round (A-R, B-R, ... items) fixed them and was reviewed again.
   - Fixes are merged only after the combined test suites pass.
   - Both the implementer and the reviewer are AI agents. Neither is a human reviewer.

## Results

83 confirmed findings: 2 High, 12 Medium, 44 Low, 25 Info. 55 are new. 24 were already recorded as open in earlier audits and 4 were already accepted by design.

| Severity | Total | Fixed | Deferred | Accepted |
|---|---:|---:|---:|---:|
| High | 2 | 2 | 0 | 0 |
| Medium | 12 | 12 | 0 | 0 |
| Low | 44 | 39 | 5 | 0 |
| Info | 25 | 10 | 11 | 4 |
| **All** | **83** | **63** | **16** | **4** |

Status meanings:
- **Fixed:** the fix is in this branch with a test that fails before it, and an AI review approved it.
- **Deferred:** left open on purpose, for the stated reason.
- **Accepted:** already accepted by design or by the owner in earlier work.

### The most important findings

All High and Medium findings are fixed in this branch. The most important were:
- **L1-01 (High), seller keys:** the idle lock could destroy the only copy of keys that were never backed up. Now each session records its custody (import, keystore download, vault save or waiver). The idle lock wipes keys only when a copy survives, otherwise it keeps them under a visible no-backup banner, and creating an invoice or publishing the meta-address waits for a backup.
- **L4-01 (High), scanning:** a burst of ERC-5564 announcements in one block stopped every EVM scan behind it. Now read and log limits end a fetch at the last complete window, an oversized block is re-read for the manifest router only, and the scan reports the narrowed block instead of stopping.
- **L2-F2 (Medium):** native direct sweeps failed on OP-stack chains because the L1 data fee was not reserved. The sweep now keeps back twice the oracle's L1 fee plus operator fee, and refuses clearly when the balance cannot cover it.
- **L1-02 (Medium):** the per-sweep vault passphrase could be bypassed from an unlocked tab. The vault record is now bound to the session, and keystore export, a new vault save and deleting the loaded identity's vault all need its passphrase.
- **L3-F1 and L3-F2 (Medium):** a missing checkpoint block could tombstone the reconciliation ledger, and spam or head lag stalled two-RPC scans. A null block is now an RPC failure, reorg invalidation compares canonical hashes from both RPCs, and pages end at the lower of the two heads.
- **G2-01 (Medium):** the BTC view preselected every output. A scan now selects none, and selecting more than one shows a linkage warning.
- **G3-01 and G3-02 (Medium), merchant plugins (not packaged):** webhook secrets now come only from constants or the environment, and amounts use the app's currency exponent table.

## Fixed in this branch

| ID | Severity | Area | Finding | Commits |
|---|---|---|---|---|
| [L1-01](#l1-01) | High | Keys/session | Idle lock wipes never-backed-up keys; payments to them become unrecoverable | `e765934`, `953fcea` |
| [L4-01](#l4-01) | High | Scanner/ledger | Announcement spam in one block stops every scan behind it | `8c6dadb`, `fe9a267`, `c6127dd`, `8969cf2`, `d0f8d38` |
| [G2-01](#g2-01) | Medium | Chain views | BTC view preselects every output; no linkage warning | `447a5bd` |
| [G3-01](#g3-01) | Medium | Merchant plugins | WooCommerce secrets stored as readable gateway settings | `7df1cd1`, `c92b61b` |
| [G3-02](#g3-02) | Medium | Merchant plugins | Plugins scale amounts by display decimals, not ISO-4217 exponents | `eddb39a`, `e4e79f3` |
| [L1-02](#l1-02) | Medium | Keys/session | Sweep passphrase gate bypassed by deleting the vault or exporting a keystore without step-up | `e765934`, `953fcea`, `72e6d1a`, `7389dea` |
| [L2-F2](#l2-f2) | Medium | Pay/sweep | Native direct sweep on L2s with an L1 data fee; failure jams the lock | `8d4532e` |
| [L3-F1](#l3-f1) | Medium | Scanner/ledger | A different or missing anchor hash from one RPC tombstones the ledger and rescans from 0 | `8c6dadb`, `63b48da` |
| [L3-F2](#l3-f2) | Medium | Scanner/ledger | Second-RPC comparison stalls on log spam or head lag | `8c6dadb`, `c6127dd`, `8969cf2`, `d0f8d38` |
| [L5-01](#l5-01) | Medium | Relayer | Permit lapsing before inclusion produces a relayer-paid revert | `6399a56` |
| [L5-02](#l5-02) | Medium | Relayer | Shared global loss cap lets reverts deny every sweep; trips at half the cap | `a6bd2da` |
| [L5-03](#l5-03) | Medium | Relayer | Global quote bucket exhaustible from a few addresses | `2ded69e` |
| [L5-05](#l5-05) | Medium | Relayer | deploy/ compose puts every client in one rate-limit bucket | `b9f1e5d` |
| [L7-M3](#l7-m3) | Medium | Hosting | Archive path ignores --expect-sha256 | `259934c` |
| [G1-01](#g1-01) | Low | Pay/sweep | Huge expiry or quote timestamps blank the app (no error boundary) | `c8ee18c`, `9a00a7a` |
| [G2-02](#g2-02) | Low | Chain views | App idle lock does not lock BTC/Solana/TRON views | `e0861bc`, `9a00a7a` |
| [G2-03](#g2-03) | Low | Chain views | Chain-view secrets shown and copied without a reveal step | `1acb7d6` |
| [G2-04](#g2-04) | Low | Chain views | BTC view never zeroizes keys or tweaks | `d199f0f` |
| [G2-05](#g2-05) | Low | Keys/session | Controlled secret inputs mirror values into the DOM attribute | `0f74acd` |
| [G2-06](#g2-06) | Low | Keys/session | Passphrase fields invite browser password saving | `32c5882`, `18b6beb` |
| [G3-03](#g3-03) | Low | Merchant plugins | PrestaShop webhook selects a dropped column; every event fails | `70cd56f` |
| [G3-04](#g3-04) | Low | Merchant plugins | WooCommerce event claim is not atomic | `4021887` |
| [G3-05](#g3-05) | Low | Merchant plugins | WooCommerce transitions ignore order state and superseded invoices | `fc5acc2`, `e4e79f3` |
| [G3-06](#g3-06) | Low | Merchant plugins | Example receiver acknowledges in-flight duplicates | `cc2714f`, `e4e79f3` |
| [L1-03](#l1-03) | Low | Scanner/ledger | One-RPC checkpoint mismatch tombstones the whole reconciliation ledger (root shared with L3-F1) | `63b48da` |
| [L1-04](#l1-04) | Low | Keys/session | "Wipe keys" leaves the tag vault unlocked for the next identity in the tab | `a2ba169`, `f6a9659` |
| [L1-05](#l1-05) | Low | Pay/sweep | Sweep status check could overwrite a newer lock (no compare-and-swap) | `e8cdb31` |
| [L1-06](#l1-06) | Low | Keys/session | Passphrase strength check accepts guessable phrases | `9799f9e`, `5fb88f1`, `7389dea` |
| [L1-07](#l1-07) | Low | Keys/session | requireSession hands all plaintext scalars to callers that need one | `6986d66`, `f6a9659` |
| [L2-F1](#l2-f1) | Low | Pay/sweep | Pre-send dry run cannot refuse a revert (node error detail dropped) | `d809dfd` |
| [L2-F3](#l2-f3) | Low | Pay/sweep | Wallet-altered transaction check skipped when the RPC is slow | `cf5e57c` |
| [L2-F4](#l2-f4) | Low | Pay/sweep | Seller-chosen fiat total not checked against a fixed token amount | `5f4f646` |
| [L3-F3](#l3-f3) | Low | Scanner/ledger | Worker batch timeout on slower devices for large pages | `c6127dd` |
| [L3-F4](#l3-f4) | Low | Scanner/ledger | Non-default open-log budget defers a page on every run | `c6127dd`, `d0f8d38` |
| [L3-F5](#l3-f5) | Low | Scanner/ledger | Second-RPC disclosure understates what that RPC learns | `c6127dd`, `d0f8d38` |
| [L3-F6](#l3-f6) | Low | Scanner/ledger | Indexer/Esplora/Solana/TRON bodies read without a streaming size cap | `cad187d` |
| [L4-02](#l4-02) | Low | Pay/sweep | Deep-scan payment with a wrong view tag offers a Sweep that throws | `0eec2f7` |
| [L4-03](#l4-03) | Low | Chain views | Esplora client aborts on blocks whose tx count is a multiple of 25 | `7dbc34b` |
| [L4-04](#l4-04) | Low | Chain views | BTC verification text claims genesis anchoring that is not done | `49a3a44`, `1c1f5d0` |
| [L4-05](#l4-05) | Low | Chain views | Non-EVM responses read without a streaming size limit | `cad187d`, `9470177` |
| [L5-04](#l5-04) | Low | Relayer | Spend groups never evicted; newcomers share one overflow group | `a6bd2da`, `49c123c`, `52a294a` |
| [L5-06](#l5-06) | Low | Relayer | Receipt timeout holds budgets and lane; breaker and health miss stuck txs | `ef3700d` |
| [L5-07](#l5-07) | Low | Relayer | Stale trustProxyHops key in docs crash-loops the relayer | `5894f64` |
| [L5-10](#l5-10) | Low | Relayer | RPC outage never opens the breaker | `61c0ae4` |
| [L7-L1](#l7-l1) | Low | Embed | Embed headers lack ACAO for the SRI snippet | `c4e3aea` |
| [L7-L2](#l7-l2) | Low | Hosting | Attribute check not config-proof ($GIT_DIR/info/attributes) | `259934c` |
| [L7-L3](#l7-l3) | Low | Hosting | deploy/nginx proxies any /api/ path including /metrics | `b9f1e5d` |
| [L7-L4](#l7-l4) | Low | CI | PR file listing truncation (3000 files) fails open | `80ac097` |
| [L7-L5](#l7-l5) | Low | Hosting | Directory target re-read after verification | `259934c` |
| [L7-M1](#l7-m1) | Low | Hosting | Kit README promises a rendered _headers that static export drops | `259934c` |
| [L7-M2](#l7-m2) | Low | Hosting | selfhost.sh never compares --commit | `111b19e` |
| [L7-M4](#l7-m4) | Low | CI | Pages workflow restores library dist from cache | `80ac097` |
| [L8-04](#l8-04) | Low | Packages (preserved) | PIR client would ship if createScanSource were imported | `378ec6b` |
| [F5](#f5) | Info | Packages (preserved) | verifyReceipt marks any final router claim verified | `eaeacc5`, `ace3c65` |
| [G1-03](#g1-03) | Info | Packages (preserved) | Payment-link host check accepts hex/short IPv4 forms | `fe9f120` |
| [I-1](#i-1) | Info | Keys/session | Storage keys derived from public keys survive "wipe keys" (device-seller linkability) | `4d58712` |
| [I-2](#i-2) | Info | Keys/session | Archive export silently omits chains disabled in the build | `6fc1b1b`, `2c13938` |
| [I-3](#i-3) | Info | Keys/session | Optional tag fields not type-checked | `20b824d`, `f690464` |
| [L2-I2](#l2-i2) | Info | Pay/sweep | Huge timestamps blank the app (same as G1-01) | `c8ee18c`, `9a00a7a` |
| [L2-I3](#l2-i3) | Info | Pay/sweep | Wallet rejection leaves an 'unknown' payment-journal entry | `28de7d7` |
| [L3-F7](#l3-f7) | Info | Embed | Embed profile adds no gate beyond frame-ancestors | `c4e3aea` |
| [L4-I3](#l4-i3) | Info | Core crypto | SecretBytes does not block toHex/toBase64; registry accepts bad-checksum addresses | `f59b51e` |
| [L7-I1](#l7-i1) | Info | Hosting | infra/proxy camera policy drift | `c4e3aea` |

Notes on these fixes:
- **Relayer defaults (L5-03, L5-02):** the new per-network quote limit (60/min, burst 20) and the 25% clean-source share of the global loss cap are untuned defaults for the owner to set.
- **`/healthz`:** it now reports degraded on a sustained mined-revert rate, so it should not be used as a liveness probe.
- **L5-06:** replace-by-fee and cancel for a stuck relayed transaction are deferred.
- **Not run against real servers:** no Docker daemon was available, so the nginx and Compose changes were not run end to end. The relayer review ran the new `/api/` route allowlist and real-IP handling against a real nginx 1.24 on a scratch copy.

### Open follow-ups from the fix reviews

Each fix cluster went through rounds of implementation and adversarial AI review until the reviewer approved. The last review of each cluster approved the fixes and raised the issues below. They are open. None is a confirmed audit finding, and none blocks the beta on test networks. 3 are minor and 26 are nits. The full text, with suggested fixes, is in `docs/audits/data/24/status.json` (`_clusters.<round>.review_issues`).

| Cluster | Round | Severity | Where | Problem |
|---|---|---|---|---|
| A (scanning) | AR2 | minor | `packages/chain-adapters/src/logs.ts:365 (A-R7 'to - next + 1n <= served')` | `served` spans the whole fetch, so in a result-limited dense stretch after a sparse one (Infura -32005, Alchemy -32602) each regrown window is refused again (1 refused per 2 served). |
| A (scanning) | AR2 | nit | `packages/chain-adapters/src/scanVerify.test.ts (A-R6 describe block)` | Mutation 'accept the router-lane logs before the second whole-block read' passes all 15 tests: block 7 has no router-caller log that fails validation, so skipped logs double-counted on the success path would go unnoticed. |
| A (scanning) | AR2 | nit | `packages/chain-adapters/src/logs.ts:136 (mayBeRateLimit)` | New public export (index.ts `export *`) with no direct unit asserts, unlike isLogSizeError/isLogLimitError in logs.test.ts (-320050, non-ChainAdapterError, other codes). |
| A (scanning) | AR2 | nit | `packages/chain-adapters/src/scanVerify.ts:125-137` | compareProviders has no request budget. |
| A (scanning) | AR2 | nit | `apps/web/src/views/Scan.tsx:338 (outside cluster ownership)` | The narrowed-block warning says 'likely announcement spam', while the updated user doc says a residual -32005 rate limit can narrow a block that holds no spam. |
| B (sweep guards) | BR | nit | `apps/web/src/views/Sweep.tsx:290-291; apps/web/src/lib/sweep.ts:465` | When the final look is inconclusive (a receipt read failed or was malformed), the lock comes back unchanged and the UI shows sweep.note.pendingDirect: 'No receipt found for this hash yet'. |
| B (sweep guards) | BR | nit | `apps/web/src/views/Sweep.tsx:59,412-419; apps/web/src/state.tsx:107-110` | Once a lock records MAX_OTHER_HASHES (3) other hashes, the hint, the button and the unknownDirect copy still offer a same-nonce replacement. |
| B (sweep guards) | BR | nit | `apps/web/src/views/Sweep.tsx:59; apps/web/src/state.tsx:149-151 (B-R5 trade-off)` | A 'submitted' tx that the node later drops (evicted or never propagated) never uses its nonce. |
| B (sweep guards) | BR | nit | `docs/developer/api/chain-adapters.md:56-65; packages/chain-adapters/src/config/chains.ts:25-31` | The new opStack paragraph names OP Sepolia. |
| B2 (pay) | B2R | nit | `apps/web/src/features/policy/send.ts:31-37 (sendPolicyPayment)` | Same root cause as B2-R2 remains in the experimental policy flow: after the approval it checks receipt and allowance readback but ignores res.verification, so an unverified, larger swapped approve still continues to the payment. |
| B2 (pay) | B2R | nit | `docs/developer/api/chain-adapters.md:29-31` | The documented `reverted` contract still says code 3 or -32000/-32015 with a revert, out-of-gas or invalid-opcode text; |
| B2 (pay) | B2R | nit | `docs/developer/api/README.md:29-30` | Repo-wide address rule says chain-adapters accepts all-lowercase or valid EIP-55 mixed case; |
| B2 (pay) | B2R | nit | `apps/web/src/lib/sweep.ts:520-529 (readOperatorFee)` | readOperatorFee treats any `reverted` as 'no getOperatorFee'. |
| C (seller keys) | CR2 | minor | `docs/user/troubleshooting.md:23-24; docs/guides/troubleshooting-by-symptom.md:50-51; apps/web/README.md:21 (o…` | User docs now contradict C-R10: they list hex imported without its signing key among keys the idle lock keeps and say its meta-address needs the waiver; |
| C (seller keys) | CR2 | nit | `apps/web/src/features/registry/RegistryView.tsx:247; apps/web/src/features/policy/PolicyCreate.tsx:102 (outsi…` | Both keep BackupGate's default, so after a signer-less hex import they stay gated and show copy about invoice signing, though neither uses the signing key: over-gated and slightly confusing, not unsafe. |
| C (seller keys) | CR2 | nit | `apps/web/src/views/SellerKeys.tsx:377,503; en.json sellerKeys.wipeUnsaved.confirm / unlockReplaces.confirm` | In the signerOnly state the confirm buttons still say 'Replace the unsaved keys' / 'Wipe the unsaved keys', while the new titles say only the signing key lacks a backup. |
| D (relayer) | D3 | minor | `apps/relayer/src/service.ts runSettled (order-state read, permit ladder and first simulation all run before t…` | Pre-existing (implementer's open question 1). |
| D (relayer) | D3 | nit | `deploy/selfhost.sh:213-216 (subnet_of check)` | Only one entry on its own can 'cover' the subnet. |
| D (relayer) | D3 | nit | `docs/operators/relayer-runbook.md:95 (half_open row)` | The row now says one probe can hold half_open for up to 180 s by default. |
| D (relayer) | D3 | nit | `deploy/selfhost.sh:188-189 (lines.index of 'networks:' and ' backend:')` | Header lines still need an exact match. |
| D (relayer) | D3 | nit | `deploy/selfhost.sh:214 (backend.subnet_of)` | ipaddress subnet_of needs Python 3.7 or later. |
| E (hosting) | E | nit | `scripts/verify-release.sh:48,58` | A missing manifest is caught only after steps 1-2 have printed PASS lines (then exit 2). |
| E (hosting) | E | nit | `.github/workflows/ci.yml:41-45 (changes filter)` | The filter pages through pulls/$PR/files twice (names, then lengths) at the default 30 per page. |
| E (hosting) | E | nit | `eslint.config.js:51-71` | no-restricted-imports does not catch dynamic import('@ghostpay/scan-source') (checked with eslint --stdin). |
| G (non-EVM chains) | GR | nit | `apps/web/src/components/SecretBackup.tsx:22-28 (retryAtActivation)` | A refused clear is retried only on click or keydown. |
| G (non-EVM chains) | GR | nit | `apps/web/src/components/SecretBackup.tsx:10` | The comment says 'Only a clear that worked unmarks it', but the path with no clipboard API (writeText throws synchronously, then settle(true)) also unmarks the copy. |
| H (merchant plugins) | H3 | nit | `integrations/prestashop/ghostpay/ghostpay.php:121-122 (hookPaymentOptions) vs controllers/front/validation.ph…` | The hook copies the validation controller's checks (active, service URL, pay host, service secret) instead of sharing them. |
| H (merchant plugins) | H3 | nit | `docs/remote/usability/specs/fiat-display.md:14,45 (outside this cluster's ownership)` | This spec still asks formatFiat to use ISO 4217 exponents ("3-dec BHD/KWD"; |
| H (merchant plugins) | H3 | nit | `docs/remote/usability/specs/accounting-export.md:5 (R2)` | The check that R2 matches the app table was a scratch script and was not committed (no test file in scope fits). |

## Not yet fixed

| ID | Severity | Area | Finding | Status |
|---|---|---|---|---|
| [F1](#f1) | Low | Contracts (flagged) | Policy factory fee waiver needs a standing allowance; any approver deploys free | Deferred: Policy-scheme contracts are behind a flag that is off, and nothing is deployed. Fix before any deployment. |
| [F2](#f2) | Low | Contracts (flagged) | payERC20WithBuffer strands native buffer with a non-zero limits root | Deferred: Only the flagged policy-scheme builder can produce it; remove or guard the buffer option before the flag is enabled. |
| [F3](#f3) | Low | Contracts (flagged) | Docs describe the N-01 salt ABI that consolidation dropped | Deferred: Documentation drift for flagged contracts (PRIVACY-E2E-05 stays open). |
| [F4](#f4) | Low | Contracts (flagged) | Policy factory/router code hash not pinned | Deferred: Defense in depth for flagged contracts; tracked in DEVIATIONS R6/R9. |
| [G1-02](#g1-02) | Low | Embed | Embed profile accepts any origin (later-preserved, not reachable as shipped) | Deferred: Embedding is later-preserved and off in the shipped build; the docs now state that frame-ancestors is the only gate (c4e3aea). Bind the profile to the invoice signer before enabling it. |
| [F6](#f6) | Info | Contracts | Local announcer build cannot reach the canonical CREATE2 address (by design) | Accepted by design |
| [L2-I1](#l2-i1) | Info | Pay/sweep | Fiat quote slippage shown but not enforced | Deferred: Latent: the beta chain has no price feed and fiat quotes are later-preserved. Cap the price age and re-read the price before send before any feed is enabled. |
| [L2-I4](#l2-i4) | Info | Pay/sweep | Live manifest read-back ignores the secondary RPC | Deferred: Info: bundled manifests are release-signed, so a lying RPC can only confirm an already-wrong signed manifest. Wire the secondary RPC into the read-back later. |
| [L3-F8](#l3-f8) | Info | Hosting | CSP/SRI postbuild helpers are dead code since consolidation | Deferred: Dead code. The underlying CSP/SRI build steps (S3-10/S3-11) stay open and are recorded in apps/web/DEVIATIONS.md. |
| [L3-F9](#l3-f9) | Info | Keys/session | Scan slot keys linkable to the public meta-address (duplicate of I-1) | Deferred: Info: needs access to the browser profile and reveals the device-seller link and scan progress, no keys or funds (PRIVACY-E2E-09, ADR-0025). Open: list the identifiers in the THREAT_MODEL browser-profile row and add a confirmed "forget this seller's local scan data" action. |
| [L4-I1](#l4-i1) | Info | Chain adapters | Manifest digest has no domain prefix | Deferred: Release-format decision: add the domain prefix before the first real release signature (build validator, web loader, relayer config, ops monitor and the e2e fixture change together). |
| [L5-08](#l5-08) | Info | Relayer | Gas reserve default 0 (no beta-chain impact) | Deferred: Pricing default for the owner to tune; no effect on the beta chain. |
| [L8-01](#l8-01) | Info | Packages (preserved) | Dev pool ceremony makes proofs forgeable (testnet only, accepted) | Accepted by design |
| [L8-02](#l8-02) | Info | Packages (preserved) | Plugin hooks run in the host realm (not wired) | Deferred: Preserved package with no importer; must be sandboxed before any wiring. |
| [L8-03](#l8-03) | Info | Packages (preserved) | Payjoin stores are memory-only (not wired) | Deferred: Preserved package with no importer; needs a durable store before any use. |
| [L8-05](#l8-05) | Info | Packages (preserved) | Payjoin URL check accepts private hosts (not wired) | Deferred: Preserved package with no importer (BITCOIN-08). |
| [L8-06](#l8-06) | Info | Packages (preserved) | Pool relayer key stays in /proc environ | Accepted by design |
| [L8-07](#l8-07) | Info | Packages (preserved) | Pool SDK backup KDF weaker; import trusts logN up to 20 | Deferred: Preserved package used only by pool-relayer (not shipped). |
| [L8-08](#l8-08) | Info | Packages (preserved) | payer-sponsor drains oversized bodies | Deferred: Preserved package with no entry point or deploy recipe. |
| [L8-09](#l8-09) | Info | Packages (preserved) | Test-only self-signed key in net-harness (accepted) | Accepted by design |

## Verification of the fixes in this branch

**Where the checks ran:** in the agent container, on the integration of every fix cluster: A, B, B2, C, D, E, G and H, each with its review rounds, plus `9a00a7a` and `2fcab7f`. The machine has 4 vCPUs and Node 22.22.0.

- **Build and static checks:** `build:libs`, the all-workspace typecheck and the all-workspace lint pass on that integration.
- **Each fix cluster:** the reviewer ran the area's checks and re-ran the new tests against the base, where they fail. Where a reviewer ran the full web suite with coverage, coverage stayed above the thresholds (for example 91.82/87.22/93.57/95.72 after round CR2, against 90/85/90/90).
- **Known slow tests:** two time-limited web tests, the 1M-log scanner fuzz and the ReconciliationLedger "saturated backup" test, fail under load in this container and pass in CI. Their code is unchanged by the fixes. See `scripts/dev/README.md`.
- **Integration commits:** `9a00a7a` (idle lock and error boundary) and `2fcab7f` (unlock confirmation) add tests that fail before the change.
- **The authority** for the full combined suites (every package, the web suite with coverage, scripts, PHP and kit) is the GitHub CI run on the PR head that contains this report.
- **Failing before the fix:** every fixed finding has a test that fails on the code before the change. The fix commit messages name those tests, and the reviewer re-ran them against the base.

## Limits

- **Model and environment:** the review was done by AI agents with read access to the repository and a local toolchain. There were no live chains, mainnet or testnet RPCs, real wallets, Docker daemon, WordPress/WooCommerce/PrestaShop runtime, or mobile browsers.
- **Verified from upstream source only:** platform behaviour for these was taken from upstream source code, not run:
  - op-geth L1 fees
  - electrs paging
  - WooCommerce REST
  - WordPress `add_option`
  - PrestaShop Db
- **Not covered:**
  - contract formal verification, fuzzing (echidna) and vendored libraries (OpenZeppelin, Poseidon, fhEVM)
  - the generated Groth16 verifiers and circuit compilation
  - third-party SDKs
  - timing side channels
  - memory forensics and browser extensions
  - password-manager, clipboard-history and mobile-keyboard behaviour (reasoned about, not run)
  - real-browser CSP, SRI and storage partitioning
  - ops-monitor
  - the policy-scheme anvil tests
  - SDK, CLI and `ux-links` packages
  - GitHub repository settings (environment reviewers, tag protection, Pages source)
  - container image digests
- **Grep-level only:** many later-preserved packages were checked only for reachability.
- **Severity is judgment.** It reflects the lean beta as shipped: test networks, no deployment, flags off. Several Info items become High if their packages are wired into the app.
- **The usual gates still apply:** a professional audit, trusted setup, release and deployer custody, real deployments and funded-device testing are still required ([completion gates](08-completion-gates.md)).

## All findings

### L1-01

**Idle lock wipes never-backed-up keys; payments to them become unrecoverable**  
High · new · Keys/session · Fixed in this branch (`e765934`, `953fcea`)

- **Finding:** Reproduced in the default UI: Generate keys -> Create invoice (no backup gate or prompt) -> 15 min without pointerdown/keydown (scroll, mousemove, focus, visibilitychange do not re-arm; a background tab idles) -> clearSession() destroys the only copy. Payments to the still-valid invoice (24 h default, up to 90 d) or the shared meta-address are unspendable forever. Needs a skipped backup (not Critical), but app copy says keys stay until wipe/close: plausible fund loss = High.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** App.tsx:109-118 idle timer calls clearSession() unconditionally, re-armed only by pointerdown/keydown (121-122); settings.ts:24,108 default 15, range 1-240 (cannot disable); CreateInvoice.tsx:51 gates only on a session; en.json:28 'Keys stay in memory until you wipe them or close the tab'; DEVIATIONS.md:47-48 says no wipe. verify/B1-C/l101.adjudicate.repro.test.tsx 2/2 pass: hasSession=false, vault empty, only DIV.sr-only note, new keys checkAnnouncement {matches:false}.
- **Recommended fix:** Track a per-session durable-copy flag (keystore, vault or hex import; keystore download; vault save). Until set, the idle lock locks tags only and shows a visible banner. Gate Create invoice and meta-address copy/QR/registry behind 'Back up now' or a typed waiver (spec idea 04). Fix settings.lock.hint, DEVIATIONS 11, troubleshooting.md:25 and the web README.

### L4-01

**Announcement spam in one block stops every scan behind it**  
High · known-open · Scanner/ledger · Fixed in this branch (`8c6dadb`, `fe9a267`, `c6127dd`, `8969cf2`, `d0f8d38`)

- **Finding:** Real on default stack: permissionless canonical announcer, 2 MiB client cap; logs.ts rethrows RESPONSE_TOO_LARGE at a 1-block window and its read/log caps throw, not truncate; runScan rethrows. Every seller whose cursor precedes the block fails there each run (any RPC), also hiding earlier payments in that fetch. ~12M gas once, free on Base Sepolia, repeatable; only a blind manual restart past it recovers: cheap service-wide detection outage. Audit 05 CHAIN-ADAPTERS-01; audit 17 says Closed.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** B2-C/l401.repro.test.ts 12/12 (l401.out.txt), default stack (createClient fetch cap, planScan+openScanClients, runScan+InlineWorker): 2000 logs/1 block -> 'Blocked by a safety check (RESPONSE_TOO_LARGE).' 3 runs, checkpoint 49900, payments @79500/@120000 never shown (1800 ok); start 80001 works, skips @79990; 1100 one-log blocks -> read cap x2; 6x1700 -> log-cap throw. gas/run.cjs (EDR): 2000 announces=12.1M gas, getLogs 2.10MB. logs.ts:247-253,274,281; scanClient.ts:207,418
- **Recommended fix:** logs.ts:268-282: if the log budget or read cap would be exceeded after a completed window, stop there with truncated=true. Progress is guaranteed: a window needs at most 999 reads, and a 2 MiB block holds under 2,100 logs. For a 1-block RESPONSE_TOO_LARGE, re-query with topics[3]=router (widen assertScanFilter) and report the skipped open lane. Also halve on other result-limit errors.

### G2-01

**BTC view preselects every output; no linkage warning**  
Medium · new · Chain views · Fixed in this branch (`447a5bd`)

- **Finding:** Reachable by default (nav 'Bitcoin (test)', no flag). runScan pre-checks every output and reviewSweep has no linkage warning, so clicking through with the defaults consolidates payments. Audit 17 marks PRIVACY-E2E-03 closed, but every BtcView.tsx revision in all refs keeps the preselect line, so the closure is false. Live harm is test-coin linkage in a later-preserved view. Medium stands: a documented privacy control is silently absent and would carry into mainnet qualification.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** BtcView.tsx:119 selects all found outputs; sweep.ts:46-49 warns only on fee and self-address; audit 17:28 claims 'initializes outputs unchecked'. G2-B g201FixNuance: 2 payments -> checkboxes [true,true], review lists 2 inputs, warnings []. With only the proposed one-line change (fixcopy/BtcViewFixed), 4/9 existing BtcView tests fail. That includes the QR/paste destination test, which gets 'Some input was missing or out of range.' because the importer validates via reviewSweep(wallet, selected=[]).
- **Recommended fix:** Right direction, incomplete. Also validate a scanned or pasted destination without needing a selection (BtcView.tsx:371 calls reviewSweep with selected=[] -> INVALID_INPUT). Warn at selection time and in review when >1 input is selected, and say that separate sweeps to one destination also link. Update the 4 tests. Revert audit 17's PRIVACY-E2E-03 row to open.

### G3-01

**WooCommerce secrets stored as readable gateway settings**  
Medium · new · Merchant plugins · Fixed in this branch (`7df1cd1`, `c92b61b`)

- **Finding:** Confirmed against WooCommerce trunk: v2/v3 gateway REST returns raw settings values; GET needs only key permission 'read' plus an owner with manage_woocommerce. A read-only key, or any read-only SQLi/backup of wp_options, yields webhook_secret and lets anyone complete pending orders. Needs secrets typed into the form (README only prefers wp-config). Latent: manual-install plugin, not in the release tarball, out of lean scope, no manifest ships. PS half is README-known.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** (scratch) (real WC_Gateway_GhostPay): read-key GET payment_gateways/ghostpay -> settings.webhook_secret.value 'cdcd..'; invoice.paid signed with it -> HTTP 200, order 42 pending->processing via payment_complete. WC trunk v3 controller:92, v2:314 'value' unmasked; rest-auth:758-762; wc-rest-functions:348; settings-api:466. Plugin :82-93, :144.
- **Recommended fix:** Correct. Minimal: read secrets only from GHOSTPAY_*_SECRET constants/getenv and drop both form fields; on upgrade unset stored service_secret/webhook_secret and tell merchants to rotate. If a UI field must stay, keep it in a separate never-echoed option and blank it in woocommerce_rest_prepare_payment_gateway (covers v2+v3). PS: env, not Configuration.

### G3-02

**Plugins scale amounts by display decimals, not ISO-4217 exponents**  
Medium · new · Merchant plugins · Fixed in this branch (`eddb39a`, `e4e79f3`)

- **Finding:** Mismatch confirmed with real to_minor, formatFiat and fiatToTokenAmount: plugin scales by WC display decimals (PS: CLDR precision); the app assumes 0 for 8 codes, else 2. Acceptance follows if the service maps amountMinor to fiat.minorUnits (README/example imply) and the event echoes it. Latent: no manifest ships, mainnets disabled, Base Sepolia has no feed so fiat_quote fails closed, plugins out of scope. Example README and fiat-display spec note the gap; the contract defect is new.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** (scratch) USD 49 (dec 0) -> 49 -> app 'USD 0.49', quote 0.000245 vs 0.0245 ETH; IDR/PYG 150000 (dec 0) -> '1500.00'; JPY 1000.00 (WC default dec 2) -> 'JPY 100000'; KWD 12.500 -> 'KWD 125.00'. Plugin :187,:364; PS validation.php:36, webhook.php:106; pay.ts:142-157; quote.ts:46 FEEDS = Sepolia ETH/USD only; chains.ts:41-47.
- **Recommended fix:** Scale by one ISO-4217 exponent table (not wc_get_price_decimals/Currency::precision) at invoice creation and webhook comparison; to_minor then fails closed only on precision loss (USD at 0 store decimals still gives 4900, so refusing differing store decimals is unneeded). Send the exponent so the service asserts it; complete the app table (FIATD-5).

### L1-02

**Sweep passphrase gate bypassed by deleting the vault or exporting a keystore without step-up**  
Medium · new · Keys/session · Fixed in this branch (`e765934`, `953fcea`, `72e6d1a`, `7389dea`)

- **Finding:** Confirmed in the UI. With a vault saved, Sweep refuses without the passphrase. But 'Delete encrypted vault' then 'Confirm' needs none; after that Sweep shows no field and broadcasts. 'Download encrypted keystore' exports all keys under any new passphrase. So the gate labelled 'required for each sweep' does not stop the walk-up or unattended-tab attacker it targets. It needs access to an unlocked tab with keys loaded inside the 15 min window: a safety control that does not work, Medium.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** keyVault.ts:176-182: undefined when the store is empty. Sweep.tsx:129-133 skips vaultGuard; the field is only shown when a vault exists (Sweep.tsx:288). SellerKeys.tsx:204-235: delete needs no passphrase; :89-121: export has no step-up; en.json:82. Repro verify/B1-B/l102.stepup.repro.test.tsx (2/2 pass): baseline 'Wrong passphrase'; delete text shows no meta-address; then 'Submitted', raw 0x02f8..; the export decrypts with the attacker phrase to the loaded spend key. Not in audits 17/22 or PR30 status.
- **Recommended fix:** Tie the gate to the session: keep the vault ciphertext in memory when keys are unlocked from or saved to the vault, and check every sweep against it even if IndexedDB is emptied. Require the same step-up for keystore export and for deleting a vault whose meta.metaAddress equals the loaded identity. Let a non-matching vault be deleted, showing its meta.metaAddress; it blocks all sweeps.

### L2-F2

**Native direct sweep on L2s with an L1 data fee; failure jams the lock**  
Medium · new · Pay/sweep · Fixed in this branch (`8d4532e`)

- **Finding:** Native sweep sets value = balance - 21000*maxFee, so tx cost equals the balance exactly. OP-stack txpool and consensus also charge the L1 data fee (op-geth TotalTxCost, buyGas), so any L1 fee > 0 rejects it. Base Sepolia, the beta chain, is OP-stack; native ETH is the default invoice asset and has no relayer path, so native payments cannot be swept, and each try jams the tab's lock (receipt-only resolution). Funds stuck, not lost. (b) and (c) are outside the beta.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** sweep.ts:432-437,478,493-507,404-411; CreateInvoice.tsx:28 (default 'native'); Sweep.tsx:114 (relayer needs permit token). op-geth a5f16412: core/txpool/validation.go:313-320 + rollup.go TotalTxCost; core/state_transition.go:285-328. r2-l2f2.repro.test.tsx 2/2: headroom 0; node 'insufficient funds ... overshot 1' at 1 wei L1 fee; lock still unknown after 3 checks; UI sign disabled. Default build ships no manifest.
- **Recommended fix:** Reserve the L1 fee: on OP-stack chains call GasPriceOracle (0x42..0F) getL1Fee(unsigned tx) with a margin and subtract it; elsewhere set gas from eth_estimateGas({from, to: dest, value}) (covers Arbitrum and contract/7702 destinations) and pass gas to the dry run. To unjam, allow a same-nonce re-sign (no double-spend); a finalized-nonce check alone never fires because nothing consumes the nonce.

### L3-F1

**A different or missing anchor hash from one RPC tombstones the ledger and rescans from 0**  
Medium · new · Scanner/ledger · Fixed in this branch (`8c6dadb`, `63b48da`)

- **Finding:** Real. Default is one RPC (settings.ts:20). A null or different hash for the saved anchor counts as a reorg to block 0; Scan.tsx persists invalidateFrom(0): every ledger record for that seller+chain is tombstoned, can't be re-saved or restored by import, no UI notice, plus a rescan from 0. Triggers: hostile RPC, stale load-balanced backend, or a node 1-100 blocks short of the anchor. Ledger integrity, no funds: Medium. THREAT_MODEL has single-RPC trust Open, not this outcome. Overlaps L1-03.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** Reran r1 (verify/B12-B): invalidateFrom ['0'], record invalidated-after-reorg, save rejects. f1-impact.verify.test.ts V1: honest run saves anchor 9900 (head 10,000 minus finalityDepth); resume on a merely lagging node at 9,850 -> invalidateFrom(0), rescan from 0-999, record invalidated; node at 9,799 fails closed (logs.ts:214). V2 (two RPCs, primary null once): no invalidation, checkpoint cleared (scanClient.ts:239-240). logs.ts:200-207; Scan.tsx:182-191; reconciliationVault.ts:583-592,225-228.
- **Recommended fix:** logs.ts:202: a null anchor is unavailable (RPC_FAILURE, retry), not a reorg. On a single-provider hash mismatch, quarantine records >= cutoff reversibly and rescan; tombstone only records the replacement scan no longer finds (or a second RPC confirms orphaned). With two RPCs, keep the old checkpoint when confirmRollback shows the old anchor still canonical on both.

### L3-F2

**Second-RPC comparison stalls on log spam or head lag**  
Medium · new · Scanner/ledger · Fixed in this branch (`8c6dadb`, `c6127dd`, `8969cf2`, `d0f8d38`)

- **Finding:** Part (b) is real: with the opt-in second RPC, compareProviders uses fixed 1000-block chunks without halving, maps any error (2 MiB cap, -32602/-32005, rate limits) to secondary_error and needs secondary head >= primary page end. Page withheld, cursor held: ~1,950 spam logs in any 1000 blocks stall it until the user drops the second RPC; head lag withholds intermittently (r6 static heads overstate 'every run'). Medium. Part (a) duplicates L4-01/CHAIN-ADAPTERS-01 (all users; arguably High).
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** Reran in verify/B12-B: r3 RESPONSE_TOO_LARGE on both runs, control finds payment; r4 secondary_error both runs, nextBlock 0, 2,687,535-byte reply for 2,500 logs (~1,075 B/log), one-RPC control finds payment; r6 secondary_behind both runs, payment 28,800 blocks old withheld. scanVerify.ts:93,98-100,120-121; scanClient.ts:334-351,381-388; rpc.ts:216. Docs: audit 17 marks CHAIN-ADAPTERS-01 Closed (single-block fail-closed); no doc covers the two-provider stall.
- **Recommended fix:** (b) compareProviders: halve on RESPONSE_TOO_LARGE/-32602/-32005 like fetchAnnouncements (or wrap the secondary in the windowed client) and end each page at min(primary, secondary) head via toBlock (or retry secondary_behind once after a block). (a), per L4-01: at one block, fetch router-caller logs (topics[3]) or use a larger streamed cap, then skip the rest visibly.

### L5-01

**Permit lapsing before inclusion produces a relayer-paid revert**  
Medium · new · Relayer · Fixed in this branch (`6399a56`)

- **Finding:** Real: the in-lane check only refuses permit.deadline<=now. The permit is outside the sweep signature and the quote MAC, and the contract swallows a failed permit, so a permit that lapses before inclusion gives a mined revert the relayer pays for. The strike is recorded only afterwards. Not High for the beta: the loss is relayer gas, capped by the loss and daily budgets. The 429-for-everyone result needs about 10 gwei per revert. That is far above Base Sepolia prices, and the relayer is opt-in (relayerUrl '').
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** service.ts:569-576 (only deadline<=now), :318-327 (MAC fields, no permit), GhostPaySweepRelayer.sol:35-37,54-58 (permit not signed, try/catch), service.ts:684 (strike after receipt). Reran the auditor test as verify/B5-B/t/auditor-timebomb.test.ts: 34x200, then honest 429 loss_budget_exhausted, healthz 200, dailyUsed 2.38e16 at 10 gwei. Docs call it 'harmless' (specs/04 1b) and 'not exploitable' (contracts-reference.md:111). Remote R-14 asked for a permit window, but only for error clarity.
- **Recommended fix:** Refuse when permit.deadline < sweep.deadline, reusing permit_expired (already a PRE_BROADCAST class), at service.ts:573 or in validation. Add no margin: web sweep.ts:169,247 and hops execute.ts:61-84 sign permit.deadline == sweep.deadline, so '+margin' would reject every honest request. The sweep deadline (>now+30 s) then bounds the window.

### L5-02

**Shared global loss cap lets reverts deny every sweep; trips at half the cap**  
Medium · known-open · Relayer · Fixed in this branch (`a6bd2da`)

- **Finding:** Real: all users share the global loss cap. Once it is spent, every sweep gets 429 for the window, mined reverts stay breaker-neutral and healthz stays ok. It is worse than stated: the global cap is reserved and settled once per key (dst+net), so it trips at half the configured loss. Medium, not High: the cap fails closed by design and is alerted. With beta-chain gas and the example budget it needs far more reverts per hour than a one-tx-per-receipt lane can send. It is only cheap at L1-like gas.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** limiter.ts:297-339 (global += estimate on each reserve), service.ts:621-630 (one reserve per key), :679-692 (settled per key, neutral), breaker.ts:278-293. verify/B5-B/t/accounting.test.ts: one revert of 7e14 wei charged 1.4e15 to the global cap and 7e14 to the daily budget. In the auditor run the 5e16 cap tripped after 2.38e16 of real loss. Documented: audits/05/relayer.md RELAYER-04 and RELAYER-14, P1 in 05-full-audit, apps/relayer/DEVIATIONS.md (neutral reverts, defaults not tuned).
- **Recommended fix:** Charge the global cap once per sweep: reserve it separately from the per-key reservations. Keep a slice of the global cap for sources with no loss in the window, so one source group cannot 429 everyone. Alert or degrade health on a sustained mined_revert rate. Fixing L5-01 removes the cheap source of reverts.

### L5-03

**Global quote bucket exhaustible from a few addresses**  
Medium · known-open · Relayer · Fixed in this branch (`2ded69e`)

- **Finding:** Real: server.ts:296-300 spends the single global quote token before the CT/body checks (301-303). Ordering is not the root cause: valid JSON quotes are as cheap (gas price cached 3 s), so 'charge after validation' alone changes nothing. ~21+ IPv4 /32s or one /48 (no per-/48 rate) deny every quote, so every relayed sweep. Relayer is optional, direct sweep remains, no funds at risk: Medium. Known RELAYER-01 (P1 open); audit 17 wrongly calls it bounded.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** Re-ran lane5 t/quote-drain: 100x415+100x429, honest 429. B6-B/t/b6b-quote-valid.test.ts: 20 IPv4 valid JSON -> 200x100, 429 global x100, honest 429; 24 IPv4 staggered 60 s -> honest 4/60 admitted; one /48 with 60 /64s -> 600/600 pass the per-IP limiter. server.ts:126-130,293-303; config.ts:414-415; docs/audits/05/relayer.md:27-31; 05-full-audit.md:126,680; 17-final-security-snapshot.md:21.
- **Recommended fix:** Reordering alone is cosmetic. Add a per-/24 and per-/48 group limiter ahead of the global take, single-flight the quote gas-price cache and raise or drop the global cap (quotes are CPU-cheap), then take the global token after parseQuoteRequest; alert on rate_limited_global. Durable fix per RELAYER-01: let /v1/sweep price the fee itself so sweeps do not need a quote.

### L5-05

**deploy/ compose puts every client in one rate-limit bucket**  
Medium · new · Relayer · Fixed in this branch (`b9f1e5d`)

- **Finding:** Real: in deploy/ compose the relayer's peer is the nginx container, not in the example trustedProxies, so XFF is ignored and all clients share one bucket of 30/min, burst 10 (quote+sweep; junk counts, since ipLimiter runs before the CT check). One IP at 0.5 req/s denies the relayer to everyone. The proposed fix is incomplete: nginx sets XFF=$remote_addr, the docker gateway of the host TLS terminator for every client. Recipe untested, no project relayer (ADR-0015): Medium.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** B6-B/t/b6b-compose.test.ts (peer 127.0.0.2 as nginx): example trustedProxies -> attacker 10x415, then 5 other clients all 429 rate_limited_ip; nginx trusted but XFF=gateway -> still all 429; $proxy_add_x_forwarded_for + trust [nginx,gateway] -> honest 5x200, forged left entry 429. XFF line is deploy/nginx/nginx.conf:70 (cited as compose:70); compose:39,40,58; example.json:4; client.ts:63; server.ts:293-295; deploy/README.md:16,18.
- **Recommended fix:** nginx: set_real_ip_from <host gateway IP only>; real_ip_header X-Forwarded-For; real_ip_recursive on (TLS terminator overwrites XFF), keep XFF $remote_addr. Pin the backend subnet in compose and set relayer trustedProxies to it. Replace trustProxyHops in deploy/config/README.md. selfhost.sh: warn when trustedProxies is loopback-only. Re-test with two client IPs.

### L7-M3

**Archive path ignores --expect-sha256**  
Medium · new · Hosting · Fixed in this branch (`259934c`)

- **Finding:** The archive branch of openVerified never passes --expect-sha256 to extractArchive. parseArgs accepts the flag for every command, the directory branch rejects it (so it looks enforced), and verify's output tells operators to use it. A substituted archive that is consistent with its own manifest is profiled or previewed with exit 0. Reach is limited: documented recipes run verify --expect-digest first, USAGE lists the flag under verify only, and ADR-0015 gating applies. It is still an integrity check that silently does nothing.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** verify/B8-B/m3.sh: profile demo-site.zip --expect-sha256 0*64 exit=0; --expect-digest sha256:0*64 exit=1; verify --expect-sha256 0*64 exit=1; runPreview(zip,{expect-sha256:0*64}) served GET / 200; profile <unpacked-dir> --expect-sha256 gives E_USAGE, exit 2. cli.mjs:425 calls extractArchive(...,{limits}) only; :427-428 check the digest only; :360 rejects for directories; :67 usage; :97 OPTIONS; :381 recommends --expect-sha256.
- **Recommended fix:** In openVerified's archive branch, validate both flags as verifyTarget does and pass expectedContentDigest and expectedArchiveSha256 to extractArchive, keeping the explicit mismatch messages. Add CLI tests for profile and preview with a wrong --expect-sha256. Hardening: reject options a command does not use (validate and package also ignore --expect-*).

### F1

**Policy factory fee waiver needs a standing allowance; any approver deploys free**  
Low · known-open · Contracts (flagged) · Open (deferred)

- **Finding:** Real but narrower. The waiver needs an existing allowance (Factory.sol:162). A paused FiatToken rejects approve/permit, so a caller without one cannot deploy until unpause. A blacklisted factory blocks approve only on FiatToken <=v2.1; in v2.2 approve/permit check only pause, so the permanent case fails for current USDC. Any standing approver can deploy every account without paying. Not shipped: flag off, no deployment, the runbook says do not deploy, and the web app refuses FLAT_FEE!=0. Low.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** verify/B7-B/repro.cjs (Hardhat, repo contracts): while paused, a fresh approve fails 'Pausable: paused' and deploy reverts FeeTransferFailed; a pre-approved caller deploys 3 accounts [FeeWaived] and its allowance stays 3000000. Factory blacklisted: v2.2 fresh approve and deploy succeed, v2.1 approve reverts. FiatTokenV2_2.sol upstream: approve/permit whenNotPaused only. withdraw.ts:144; deployment-runbook.md:55; README:99-106 lists M-03 open; DEVIATIONS:102-104 overclaims.
- **Recommended fix:** Operational: FLAT_FEE=0 for pausable fee tokens (the README already advises this), or keep a funded, pre-approved deployer of last resort (waived deploys do not use up its allowance). In-contract alternative: charge the fee in native coin. Correct DEVIATIONS P7 and contracts-reference.md:150. Add a FiatToken-like mock (approve/permit whenNotPaused) test.
- **Why deferred:** Policy-scheme contracts are behind a flag that is off, and nothing is deployed. Fix before any deployment.

### F2

**payERC20WithBuffer strands native buffer with a non-zero limits root**  
Low · new · Contracts (flagged) · Open (deferred)

- **Finding:** Confirmed. payERC20WithBuffer sends msg.value to A_acct, a contract that cannot spend it as gas (withdrawals are relayable signatures). With a non-zero limitsRoot and no address(0) leaf, native requestWithdraw always reverts InvalidLimitProof; no rescue (L-05, by design). Only the policy-scheme builder option produces it: web pay.ts never passes a buffer, the flag is off, nothing is deployed. Loss bounded to a small payer-chosen buffer. Low. L-05 covers the generic lock, not this entry point.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** repro.log F2: payERC20WithBuffer{0.01 ETH} succeeds; account holds 0.01 ETH, owner EOA 0; native requestWithdraw with proof [] or [usdcLeaf] reverts InvalidLimitProof; USDC control succeeds. f2/f2.mjs: buildPolicyPaymentTx({buffer}) returns payERC20WithBuffer 0x77903b8e, value 1e16, stealth == predicted account. GhostPayPolicyRouter.sol:176; PolicyAccount.sol:172-179; apps/web/src/features/policy/pay.ts:54-63 (no buffer).
- **Recommended fix:** Remove the buffer option from buildPolicyPaymentTx now. Before any policy-router deployment, either delete payERC20WithBuffer (A_acct never needs gas) or forward msg.value to policy.owner, the EOA that can spend it. Owner and policyHash are already in calldata, so this links nothing new.
- **Why deferred:** Only the flagged policy-scheme builder can produce it; remove or guard the buffer option before the flag is enabled.

### F3

**Docs describe the N-01 salt ABI that consolidation dropped**  
Low · known-open · Contracts (flagged) · Open (deferred)

- **Finding:** Confirmed. Code and generated ABI use PolicyRef{owner, policyHash}. Developer docs describe the N-01 salt ABI and its selectors as shipped and say undeployed accounts stay unlinkable. Cause: consolidation commit 8672a9a re-imported the pre-N-01 router, dropping 50881e4's salt change and the DEVIATIONS R10-R13 the docs still cite. The linkability is tracked as PRIVACY-E2E-05 (open); DEVIATIONS R2/R3 and CONTRACTS_SPEC s4 match the code. Scheme 2 is not shipped, so Low.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** f3/sel.mjs: both the solc ABI and the policy-scheme dist ABI give payERC20 0x0730d511, payNative 0x2f95df89, permit 0xb20a9d6f, buffer 0x77903b8e. The documented 0x95e21466/0x2efffba1/0x992f560d/0xd403121c are the bytes32-salt signatures. byte-layouts.md:93-100; contracts-reference.md:233-247; api/policy-scheme.md:150-162. git: 50881e4 (salt router) is an ancestor of HEAD; 8672a9a re-added the PolicyRef router. privacy-e2e.md:102 PRIVACY-E2E-05 open.
- **Recommended fix:** Now: correct the three developer docs to the PolicyRef ABI and selectors, remove references to the missing DEVIATIONS R10/R11, and mark N-01/PRIVACY-E2E-05 open. Before any scheme-2 deployment, re-port 50881e4's salt-only router with its builders, decoder, ABI and tests. Even then, policyHash becomes public once an account is deployed.
- **Why deferred:** Documentation drift for flagged contracts (PRIVACY-E2E-05 stays open).

### F4

**Policy factory/router code hash not pinned**  
Low · known-open · Contracts (flagged) · Open (deferred)

- **Finding:** Confirmed as a defense-in-depth gap. EXPECTED_POLICY_FACTORY_CODEHASH is optional, pre-deploy-check has no policy-router mode, the manifest schema has no policyRouter, and the flagged web view only reads back user-typed factory/router addresses. Testnet-only (chain.testnet check), flag off, nothing pinned, warning banner shown. Already tracked in DEVIATIONS R6/R9, CONTRACTS-CORE-04, CHAIN-ADAPTERS-08 and N3. The finding's DeployPolicyRouter line numbers are wrong.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** DeployPolicyRouter.s.sol:20,117-121: the pin is optional (the file has 125 lines, not 213-230). pre-deploy-check.sh:26 accepts only router|policy. deployments/schema.json has no policyRouter property. chain.ts:33 PINNED_POLICY_DEPLOYMENTS={}; :72-99 verifyPolicyDeployment takes user text; :73 testnet-only. DEVIATIONS R9: 'no policyRouter field yet'. docs/audits/05/contracts-core.md:83-91; chain-adapters.md:86-92; contracts-reference.md:310.
- **Recommended fix:** Before enabling scheme 2 on any network: add policyRouter and its runtime codehash to the schema and the signed manifest, and have the web app read pins only from there. Make the factory and implementation codehash pins mandatory outside local chains. Add a policy-router mode to pre-deploy-check.sh. The factory codehash also pins its immutables.
- **Why deferred:** Defense in depth for flagged contracts; tracked in DEVIATIONS R6/R9.

### G1-01

**Huge expiry or quote timestamps blank the app (no error boundary)**  
Low · new · Pay/sweep · Fixed in this branch (`c8ee18c`, `9a00a7a`)

- **Finding:** Reproduced at HEAD on the beta-core Pay review: a signed link with expiresAt or fiat-quote times > 8.64e12 s blanks the whole React root via direct link, paste, scanned-QR open and same-tab hashchange, even with no manifest (unknown chain). Per-victim, one click, no funds or keys at risk; reload recovers (autoClearFragment default on). The opener-hashchange vector adds nothing an opener cannot do by navigating. Contradicts THREAT_MODEL 4.1 D 'fail closed: Mitigated'; undocumented.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** G1-B/g101.repro.test.tsx: formatUnix(253402300800)='+010000-01-01 00:00:00 UTC' (no throw), formatUnix(8_640_000_000_001) RangeError; App with hash -> container '' and hash '' (auto-cleared); same for fiat_quote quote.timestamp=9e12, paste+'Read invoice', hashchange. No ErrorBoundary/onUncaughtError (main.tsx:11). Pay.tsx:797 renders review once any manifest state resolves. Receipt issuedAt toISOString (ReceiptPanel:163, Ledger:788) shows only the seller's own receipts.
- **Recommended fix:** Minimal: make formatUnix total (invalid Date -> 'invalid date'); covers Pay.tsx:895/900/1201 and PrintableBill:43. Then cap invoice/quote times in validateInvoice at 253402300799 so SDK/CLI/merchant-ledger Date code is safe too, and add a root error boundary as defense in depth. Receipt issuedAt cap is optional (not attacker-reachable). Update THREAT_MODEL 4.1 D.

### G1-02

**Embed profile accepts any origin (later-preserved, not reachable as shipped)**  
Low · new · Embed · Open (deferred)

- **Finding:** Code facts reproduced: a fresh-key profile naming any origin is accepted and that origin gets gp:init/gp:done. Unreachable as shipped: default bundle compiles startEmbedHost(window,p,!1); a test forbids the flag on Pages; nginx default sends frame-ancestors 'none'; hosting kit cannot express an allowlist; embedding/profiles are later-preserved (LEAN_RELEASE_SCOPE). Needs an operator-reviewed framer; leak is {status,chainId,txHash} only. Missing fingerprint UI is known-open (DEVIATIONS 6).
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** G1-B/g102.repro.test.ts: key 0x09.. profile accepted, origins [https://evil.example]; parent got gp:init + gp:done{submitted,84532,0xbb..}. dist/assets/index-*.js: 'bo(window,e,!1)'. App.tsx:80, ghostpay-embed-v2.js:11-13 and security-headers-embed.conf:7-8 call the profile an app-layer gate. startEmbedHost(win,profile,enabled) and done({status,chainId,txHash}) never see the invoice; Pay.tsx:710 has ctx.review.invoice.signer.
- **Recommended fix:** Pinning alone is incomplete: a pinned merchant could still frame another seller's invoice, as completion is not bound to it. Better: send gp:done only if the paid invoice's signer equals profile.signer (pass ctx.review.invoice.signer at Pay.tsx:710), show signerFingerprint/'unverified identity' (spec 14), fix the comments. While later-preserved, documenting frame-ancestors as sole gate suffices.
- **Why deferred:** Embedding is later-preserved and off in the shipped build; the docs now state that frame-ancestors is the only gate (c4e3aea). Bind the profile to the invoice signer before enabling it.

### G2-02

**App idle lock does not lock BTC/Solana/TRON views**  
Low · new · Chain views · Fixed in this branch (`e0861bc`, `9a00a7a`)

- **Finding:** Reachable: chain views are in the default nav and stay mounted while shown. The idle timer only locks tags and clears the EVM session. Settings promises only 'Lock local tags after idle minutes', so no false claim is made. Leaving the view already wipes TRON/Solana keys (not BTC, see G2-04). Needs a user who leaves a chain view open on an unattended unlocked machine. The keys guard test coins in later-preserved, non-beta-core views. Low; gap vs draft KL-27.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** App.tsx:114-117 timer body: vault.lock(); clearSession(); setLive(...). G2-B g202Context (full App, default flags): nav lists Bitcoin/Solana/TRON (test); Settings label 'Lock local tags after idle minutes'. After 15 min: EVM session false, TRON backup shown, scan panel mounted, spend/view non-zero. After clicking Home the TRON keys are zero. G2-A also signed and broadcast after idle. No chain view handles visibilitychange.
- **Recommended fix:** Add a lockEpoch to AppContext, bumped by the idle timer. Btc/Solana/TronView run their lock() when it changes (BTC needs the G2-04 wipe), and the announcement names them. Do not remount every view (Pay mid-payment). Add the hidden-page timeout (KL-27) once in App, covering the EVM session too. Say in the view that the idle lock forgets unexported test wallets.

### G2-03

**Chain-view secrets shown and copied without a reveal step**  
Low · new · Chain views · Fixed in this branch (`1acb7d6`)

- **Finding:** Reachable by default: 'Create new test wallet' shows the plaintext seed/backup at once. It stays until Hide, Lock or leaving, and Copy puts it on the clipboard with no warning or clear. The qr-colors SECRET rule covers secret QR frames, not this text, so it shows intent rather than a broken control. Beta-core never shows or copies raw keys; these three CopyButtons are the only ones that copy wallet keys. Test-coin keys in later-preserved views: defense in depth, Low.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** TronView.tsx:290-297, SolanaView.tsx:282-289 and BtcView.tsx:243-250 render the secret on create (reveal=true). Common.tsx:47 calls writeText with no clear. Only QrFrame.tsx:116, Pay.tsx:349 and reconciliationVault.ts:280 handle visibilitychange. SellerKeys copies only the meta-address; its backup is QrFrame kind='secret'. G2-find and G2-A repros: the secret renders without a reveal, is still shown after hidden + 120 s, and the clipboard holds the key 10 min after Lock.
- **Recommended fix:** Hide by default behind 'Show backup', which can re-reveal while the wallet is loaded (backupHex is recomputable). Auto-hide on visibilitychange or after 60 s. Keep Copy only behind a warning. Run the best-effort writeText('') inside the Lock/Hide click handlers: timer-driven clears lack focus or user activation (Safari, Firefox) and never purge OS clipboard history.

### G2-04

**BTC view never zeroizes keys or tweaks**  
Low · new · Chain views · Fixed in this branch (`d199f0f`)

- **Finding:** BtcView has no walletRef or zeroize: Lock and unmount only drop references, and resetFlow drops spendTweak scalars without wiping them, unlike TronView/SolanaView. Exploiting it needs a later heap disclosure (dump, swap, debugger) on a test-only, later-preserved view. The wipe is best-effort anyway: seed hex strings and bigints live until GC (secret.ts:94-100, KL-23/25). Matches the WEB-APP-07 heap-residue precedent: Low, defense in depth.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** BtcView.tsx:44-49: unmount only aborts. :164-169: lock() = abort + setWallet/setSeedShown(undefined) + resetFlow(). :51-59: resetFlow drops the scan without a wipe; no zeroize import. Contrast TronView.tsx:58-65,201-208 (wipeWallet) and SolanaView.tsx:59-79 (wipeWallet, wipeFound). G2-find btcNoWipe: BTC scanSecret/spendSecret non-zero after Lock and after unmount; TRON zero after Lock.
- **Recommended fix:** Correct and minimal. Add wipeWallet (keys.scanSecret, keys.spendSecret) and wipeFound (spendTweak). Keep walletRef/scanRef and call both in lock(), in resetFlow() before a new scan, and on unmount. Add the TRON/Solana op guard so a late scan result after Lock is wiped, not stored. Test that the buffers are zero. Keep the 'best effort' wording (KL-23).

### G2-05

**Controlled secret inputs mirror values into the DOM attribute**  
Low · known-open · Keys/session · Fixed in this branch (`0f74acd`)

- **Finding:** True (react-dom 19.3.1 mirrors controlled values into the value attribute), but it adds little. The CSP (style-src 'self', img-src 'self' data:) blocks page CSS injection and exfiltration, and anyone with DevTools or an extension can read input.value anyway. The real residue is a key left after a failed import and not cleared by the idle lock, which is open S3-26 ('failed imports leave them') and draft KL-26. SellerKeys import is beta-core. Low, known-open.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** react-dom-client.production.js:1295-1298 and 1358-1359 set node.defaultValue for any controlled input, password included; apps/web/package.json pins 19.3.1. SellerKeys.tsx:76-87 clears spend/view/signing only on success; the :57-61 effect on app.session never clears them. CSP: public/_headers. S3-26 open: docs/audits/05/web-app.md:130; KL-26: key-lifecycle.md:93. G2-find and G2-A: value attribute === key after a failed import and after 15 min idle.
- **Recommended fix:** Minimal: clear secret-field state on failed import and on lock/idle (KL-26). The attribute mirrors state, so this removes it too. Uncontrolled ref inputs (track only emptiness for disabled buttons) are optional hardening. Drop the 'remove the value attribute after each change' alternative: React re-sets defaultValue on every render.

### G2-06

**Passphrase fields invite browser password saving**  
Low · new · Keys/session · Fixed in this branch (`32c5882`, `18b6beb`)

- **Finding:** Holds in default build (no flag). Real risk: user accepts the browser's save/generate offer for the vault passphrase; after the 15-min idle lock or a reload, one autofill+click restores the spend key to anyone at the profile, which THREAT_MODEL says that party never gets and the UI calls offline-guess only. Tokens aren't the root cause: Chrome/Firefox offer to save password fields even with autocomplete=off; new-password adds generation. Sweep-gate autofill adds ~0 (export/delete ungated). Low.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** Scratch repro gap/G2-C/autocomplete.repro.test.tsx (3/3 pass) renders default SellerKeys: unlock input current-password (form off), save inputs new-password x2; Sweep.tsx:290 static current-password. en.json has no 'password manager' text; unlockExplain: 'your passphrase is never saved'. exportKeystore needs no vault passphrase. S3-26 (2026-10-21) covers export only, predates vault fields (ecc29c1, 10-22); KL-14 is DRAFT. MDN/Chromium: save offered despite autocomplete=off.
- **Recommended fix:** Only partly effective: browser password managers largely ignore autocomplete=off on password fields. Keep it for KL-14, but rely on: dropping new-password on vault save (no generated password), copy saying 'do not let the browser save this; it defeats the vault and idle lock', and fixing 'never saved'. Consider requiring the vault passphrase for keystore export.

### G3-03

**PrestaShop webhook selects a dropped column; every event fails**  
Low · new · Merchant plugins · Fixed in this branch (`70cd56f`)

- **Finding:** Ran the real webhook controller over HTTP with a PS 8.2-faithful Db shim and the module's own DDL: every valid event fails at the SELECT. PHP 8: PrestaShopException, 500 on every retry. PHP 7.4 (arrow fns need 7.4; PS ships polyfill-php81): 200 {ok:true}, event dropped. Claim table never used, so audit 15's PS claim fix is unreachable. Fails closed, no forged acceptance; skeleton, not packaged, not in CI.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** (scratch) exception mode -> 'PrestaShopException: ... no such column: event_ids [HTTP 500]' x2; silent mode -> '{"ok":true} [HTTP 200]' x2; claim rows 0; SELECT id_order alone -> 42. PS 8.2.x DbPDO::getPDO sets no ERRMODE, _query rethrows; displayMessage sends 500. e4f6825 DDL had event_ids; HEAD ghostpay.php:55-57 lacks it, webhook.php:88 selects it.
- **Recommended fix:** Correct: select only `id_order`. Add CI that runs the install DDL and every controller query (SQLite/MySQL) plus both PHP suites (CI runs neither). order_action: pay only from awaiting, PS_OS_ERROR or PS_OS_CANCELED (late payment, as WooCommerce allows); other states get a note. Ignoring every non-awaiting, non-error state would drop late payments.

### G3-04

**WooCommerce event claim is not atomic**  
Low · new · Merchant plugins · Fixed in this branch (`4021887`)

- **Finding:** Confirmed with the real claim_identity under true multi-process concurrency and WP trunk add_option semantics (check, then INSERT..ON DUPLICATE KEY UPDATE; 2 rows = true): both deliveries ran payment_complete in 3 of 4 runs; B can overwrite A's completed claim, so both may answer 200. Needs duplicate dispatch inside the check-to-insert window (wider with a persistent object cache). Duplicate side effects or a paid order on hold; no fund loss.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** (scratch) sequential control -> second '200 duplicate:true', one payment_complete. Concurrent (400 ms at the add_option hook) -> A 200, B 200 duplicate:false; log '[A] payment_complete(evt_race)', '[B] payment_complete(evt_race)'. Exact-replay control nonce_race.sh -> 200 then 400. WP trunk option.php add_option; README.md:8 claims concurrent idempotency.
- **Recommended fix:** Correct. Claim via $wpdb->query(prepare("INSERT IGNORE INTO {$wpdb->options} (option_name,option_value,autoload) VALUES (%s,%s,'no')")) === 1; read state back with $wpdb->get_var, not get_option (stale notoptions/cache can fool it), then wp_cache_delete. Or a UNIQUE-key claim table created on activation, as in PS. Nonce claim needs no change.

### G3-05

**WooCommerce transitions ignore order state and superseded invoices**  
Low · new · Merchant plugins · Fixed in this branch (`fc5acc2`, `e4e79f3`)

- **Finding:** Reproduced with the real apply_event: a sufficient invoice.paid on a processing order, and invoice.paid then invoice.over on one invoice, flip the order to on-hold with a false 'below the order total' note; invoice.expired for an older invoice cancels a pending order whose newer invoice (retries are by design, :224) is still payable. Operational only: a later payment still completes the cancelled order; no funds lost. Out of beta scope.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** (scratch) order 43 processing + invoice.paid 4900 -> 'processing->on-hold (GhostPay reported a payment below the order total ...)'; order 47 paid -> processing, then invoice.over 5100 -> on-hold; order 44 (inv_44_old, inv_44_new) + invoice.expired inv_44_old -> 'pending->cancelled'. Code :369-374, :379-382, :224-225.
- **Recommended fix:** Correct and minimal: if is_paid(), only add a note (flag double/over payment for refund); use on-hold only when cmp<0 or null on an unpaid order. Cancel on expiry only if the event invoiceId equals the order's last _ghostpay_invoice_id (or a single _ghostpay_current_invoice meta set in process_payment).

### G3-06

**Example receiver acknowledges in-flight duplicates**  
Low · new · Merchant plugins · Fixed in this branch (`cc2714f`, `e4e79f3`)

- **Finding:** Confirmed with the real receiver.mjs: a retry arriving while the first delivery is still in onEvent gets 200 duplicate; the first then fails and releases, but the sender already has a 2xx, so the event is never applied. Needs a handler slower than sender timeout plus the 15-30 s first retry (e.g. a 50 s InnoDB lock wait) or parallel duplicate dispatch. Example only, not packaged or in CI; lost order update, funds still received.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** (scratch) 'retry while attempt 1 is in flight -> HTTP 200 {"ok":true,"duplicate":true}', 'attempt 1 completes -> HTTP 500', 'orders marked paid: []'; control delivery after release -> 200, applied. receiver.mjs:63 claim -> 200 duplicate, :67 release -> 500; IdempotencyGuard (merchant-hooks webhooks.ts:222-241) has only claim/release.
- **Recommended fix:** Correct. Better in merchant-hooks: make IdempotencyGuard tri-state (processing/done) so an in-flight duplicate gets a retryable 409/503, 200 duplicate only after onEvent resolves, release on failure; the receiver just maps states. Keep the note that a durable shared store is needed beyond one process.

### L1-03

**One-RPC checkpoint mismatch tombstones the whole reconciliation ledger (root shared with L3-F1)**  
Low · new · Scanner/ledger · Fixed in this branch (`63b48da`)

- **Finding:** Real. Default is one RPC: a null or changed hash for the saved checkpoint block rolls back to 0, and Scan.tsx persists invalidateFrom(0): every record is tombstoned and can't be re-saved, even after Delete (same root as L3-F1). New here: after any invalidation, records verified later restore as invalidated on a fresh profile, and the preview under-counts. Correction: a real tip reorg on a consistent RPC throws 'retry'. Ledger only, but beta-core reconcile/restore: Medium.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** try2/l103.repro.test.ts 5/5: one null for block 200 -> onReorg [0], records 120,150 invalidated, re-save refused before and after clearRecords; 10-block tip reorg -> 'chain reorganised during scan; retry'; lagging null at window end 1999 -> rolledBackTo 1000, record 1500 invalidated; restore -> preview invalidatedCount 1, restored 3/3 invalidated; cutoff 0 -> all restored invalidated, preview 0. logs.ts:200-207,302-321; scanClient.ts:245; reconciliationVault.ts:583-591,626,648-673
- **Recommended fix:** logs.ts:202,310: a null checkpoint/window block is RPC_FAILURE (retry), not a reorg. invalidateFrom: tombstone only records whose stored blockHash is no longer canonical at their height (second RPC if set), not all >= cutoff. Import: skip the cutoff for records saved after the invalidation (store its time), let a live save clear a non-tombstoned downgrade, preview via the activation merge.

### L1-04

**"Wipe keys" leaves the tag vault unlocked for the next identity in the tab**  
Low · new · Keys/session · Fixed in this branch (`a2ba169`, `f6a9659`)

- **Finding:** Confirmed in the App UI. 'Wipe keys from memory' only calls clearSession(), so the tag vault keeps A's derived keys. Identity B loaded in the same tab finds tags already unlocked. B's tag saves (or archive imports) are encrypted under A's profile: A can read them later, and B can never open them again. Only the idle path locks tags. Export and rotate re-check the viewing key. It needs two identities in one tab or profile and leaks only labels and addresses: Low.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** SellerKeys.tsx:347: wipe is clearSession() only; App.tsx:115 locks only on idle. tags.ts:179-214: unlock has no session guard. TagArchive.tsx:68-70 reuses an unlocked vault. Repro verify/B1-B/l104.tags.repro.test.tsx: after wipe, vault.unlocked=true; B sees 'Lock tags'; A reads ['B customer: Acme @ 0xabab..']; B's unlock gives 'different viewing key'. Not in the F4 review or DEVIATIONS.
- **Recommended fix:** Lock the tag vault on every session change (subscribe in App.tsx, or call services.vault.lock() wherever clearSession/install runs). Take captureSessionGuard() in Scan/TagArchive unlock and save, so an unlock or save started under identity A cannot finish after the keys change.

### L1-05

**Sweep status check could overwrite a newer lock (no compare-and-swap)**  
Low · new · Pay/sweep · Fixed in this branch (`e8cdb31`)

- **Finding:** Real: onCheckStatus writes the result for the lock captured at render with no compare-and-swap. Navigation unmounts Sweep, so 'checking' resets; a slow but successful check #1 (createClient: 10 s x 3 tries per call) can land after check #2 and a newly signed order and replace that order's lock, re-arming signing. Impact small: pending orders share balance and permit nonce, so at most one runs, to the user's own destination. Needs a signed 84532 manifest and a relayer.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** Sweep.tsx:238-250 (closure lock; recordSweepAttempt(next) unconditional); state.tsx:112-114; App.tsx:27-57 (switch unmounts view). Ran verify/B3-B/r2-l105.repro.test.tsx (real App+Sweep): 'lock after stale completion: <order1> expired' while order 2 was 'submitted'; relayer then got a 3rd POST (3 distinct nonces). Existing suites 180/180 pass. Not in docs/handoffs CONSOLIDATION open items.
- **Recommended fix:** Add a CAS helper in state.tsx (resolveSweepAttempt(expected, next)) that writes only if the stored lock for (chain, owner) still has the same identity (order relayer+nonce, or expectedHash+nonce) and is unresolved, merging the new status into the stored lock; use it in onCheckStatus. compare identity fields, not object reference.

### L1-06

**Passphrase strength check accepts guessable phrases**  
Low · new · Keys/session · Fixed in this branch (`9799f9e`, `5fb88f1`, `7389dea`)

- **Finding:** Confirmed. passphraseProblem gates the vault, keystore, tag archive and invoice passphrases. It uses only character classes, length and a 13-word denylist. Repeats of the app name, season or year with symbols, and keyboard walks pass; the estimator scores some as 'strong' (that label is not shown in the UI). Exploiting it needs the ciphertext (profile copy or keystore file) and a user who picks such a phrase. scrypt N=2^17 slows rule-based guessing but does not stop it. Low.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** keystore.ts:66,80-104. Repro verify/B1-B/l106.passphrase.repro.test.ts, all accepted: ghostpayghostpay fair 47; Summer2026!!!!! good 69; qazwsxedcrfvtgb good 71; 1qaz2wsx3edc4rfv strong 83; Ghostpay2026!!! strong 84; ghostpay-vault-1 strong 84; Football2026!! good 72. Used at SellerKeys.tsx:91,149, tagArchive.ts:72,182, invoiceCreate.ts:106. S3-13 (audit 03) asked for an estimator; how good it is was never documented.
- **Recommended fix:** Offer, and pre-fill by default, a generated 5-6 word EFF-wordlist passphrase. Before the score threshold, have passphraseStrength penalise repeated halves or substrings, keyboard walks, years/months/seasons padded with symbols, 'ghostpay', and a small bundled common-password list. Keep scrypt N=2^17.

### L1-07

**requireSession hands all plaintext scalars to callers that need one**  
Low · known-open · Keys/session · Fixed in this branch (`6986d66`, `f6a9659`)

- **Finding:** Confirmed. requireSession opens the spending, viewing and signing scalars and keeps them in `issued` until clearSession (at most 24). Scan needs only the viewing key and invoice creation only the signing key, so a plaintext spending key stays on the heap for the session, defeating the SecretBox design. It matters only to heap-reading attackers (debugger, extension, memory dump): defense in depth, Low. Same as audit 05 WEB-APP-07, which was never dispositioned.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** session.ts:205-211. Callers: Scan.tsx:152 and :444 (viewing key only), invoiceCreate.ts:101 (signing key only, used at :157). Repro verify/B1-B/l107.issued.repro.test.ts (2/2 pass): the spending copy is still plaintext after scan-style use and after buildInvoiceLink, while the withSessionSecrets copy is zeroed on return. docs/audits/05/web-app.md:78-80 lists WEB-APP-07 as Low and open; audit 17 covers only C/H/M.
- **Recommended fix:** At Scan.tsx:152 and :444 use revealViewingKey() (runScan and TagVault.unlock already wipe it). In invoiceCreate.ts use withSessionSecrets((s) => signInvoice(invoice, s.signingKey)). Move test/keys.ts to withSessionSecrets, then delete requireSession and `issued`.

### L2-F1

**Pre-send dry run cannot refuse a revert (node error detail dropped)**  
Low · new · Pay/sweep · Fixed in this branch (`d809dfd`)

- **Finding:** Real: createClient keeps only the JSON-RPC code ('RPC_FAILURE: json-rpc error 3'), so REVERT_TEXT never matches and every revert is 'unavailable', which callers ignore. Loss is gas only and mostly covered elsewhere: eth_estimateGas stops ERC-20 direct sweeps first, wallets estimate payments, and native sweeps on Base Sepolia fail earlier (L2-F2). Defense in depth, so Low (auditor: Medium). Extends WALLET-SAFETY-05 (Low, open), which assumed regex detection works.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** rpc.ts:313-326,346-349; txGuard.ts:89,106-110; defaultServices.ts:39 (createRpc=createClient). r2-l2f1.repro.test.ts 5/5: code 3 and -32000 reverts -> 'unavailable'; Error('execution reverted') (what txGuard.test.ts:68,95 and sweep.test.ts:468 mock) -> refused; native direct sweep still reaches eth_sendRawTransaction; payment still reaches wallet eth_sendTransaction; ERC-20 sweep stops at eth_estimateGas (sweep.ts:442).
- **Recommended fix:** In rpc.ts parseResponse set a sanitized flag on ChainAdapterError (reverted = code 3, or -32000/-32015 with /revert/ in the message; no message text kept). simulateCall refuses on it (keep REVERT_TEXT for EIP-1193 errors). Show 'unavailable' as a warning, not a hard block. Pass gas in the direct-sweep dry run. Test through createClient with a node-like transport.

### L2-F3

**Wallet-altered transaction check skipped when the RPC is slow**  
Low · new · Pay/sweep · Fixed in this branch (`cf5e57c`)

- **Finding:** Real: verifySubmission stops after 6 reads (7.5 s), pollReceipt checks only receipt.to, and the tx is never re-fetched, so the UI says 'included in block N' and the local receipt/proof says 'included' with previewed amounts. A malicious wallet controls broadcast timing, so it can skip the check at will; no slow RPC is needed. Still Low: it needs a malicious wallet that could steal anyway, the UI says 'could not be checked', and the proof is labelled not independent.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** payExec.ts:98-106,304; wallet.ts:401-424 (6 polls), 432-458 (to only); Pay.tsx:1118-1127. r2-l2f3.repro.test.ts 2/2: tx visible at 0 s -> SubmissionMismatchError (call data); wallet swaps the stealth arg and broadcasts at 8 s -> 'not-visible-yet', receipt 'success', local receipt 'included', eth_getTransactionByHash called 6 times only. DEVIATIONS.md #14 says this check catches mutation; WALLET-SAFETY-11 is a different gap.
- **Recommended fix:** In submitTx, when a receipt exists and verification was 'not-visible-yet', fetch the tx again and run the same comparison (throw SubmissionMismatchError on mismatch); if it is still unavailable, mark it unverified. Pay.tsx, buildReceipt and PaymentProofQr must not show or record 'included' unless verified ('no-rpc' keeps its label).

### L2-F4

**Seller-chosen fiat total not checked against a fixed token amount**  
Low · known-open · Pay/sweep · Fixed in this branch (`5f4f646`)

- **Finding:** Real: in fixed_token mode the signed fiat total comes only from line items (invoiceCreate.ts:119,138) and reviewInvoice only checks items+tax vs fiat (pay.ts:81-84), so Pay shows 'Invoice total USD 10.00' beside 'Fixed: 1000 USDC' with no warning. Payee-crafted misdirection; the true token amount is shown 3+ times (Pricing, You pay, Final check) and in the wallet, so Low. Reachable in the 84532 beta (fixed_token is the only mode there). Audit 03 poc-03 said 'UI must flag', never dispositioned.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** verify/B4-B/l2f4.repro.test.tsx (real buildInvoiceLink + App, 84532 USDC, manifest+readback mocked): text 'Invoice totalUSD 10.00PricingFixed: 1000 USDC', 'You pay (gross)1002.506265 USDC', no mismatch wording, no blocker -> PASS. Code Pay.tsx:889-896, pay.ts:81-84. Prior: docs/audits/poc/poc-03-invoice-parser-fuzz.mjs:70-71 ('UI must flag; see report') but no S3 finding; display-only notes docs/remote/audits/security-tslibs.md:113-116.
- **Recommended fix:** In fixed_token mode relabel the row 'Seller-stated fiat total (not checked; you pay the token amount)' and make the token amount the headline total; add a non-blocking warning when USDC/EURC differs from a USD/EUR fiat total by >1%; mirror a hint in CreateInvoice. Never block (surcharges are legitimate), no feeds needed.

### L3-F3

**Worker batch timeout on slower devices for large pages**  
Low · new · Scanner/ledger · Fixed in this branch (`c6127dd`)

- **Finding:** Mechanism real: one 60 s timer per worker batch (scanClient.ts:145,156), 'progress' replies ignored (:190-191), whole page up to 10,000 logs posted as one batch. Measured 3.37 ms/check (ECDH 86%, inherent to view tags; spending-key re-parse 3.4%): 10k page = 34 s, so devices >=1.8x slower than this 2.1 GHz Xeon time out on that page every run. Needs ~6-10k announcements in one page (spam); the cheaper L4-01 spam already halts all users. Low (lane said Low-Medium).
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** f3-timeout.verify.test.ts: a 10,000-log page arrives as one batch ([10000]); a worker posting progress every 50 ms is still killed at replyTimeoutMs ('did not answer in time'). bench-parts.mjs (node 22, Xeon 2.1 GHz): Point.fromBytes 0.116 ms, getSharedSecret 2.895 ms, checkAnnouncement 3.367 ms -> 2x slower device 67 s per 10k page; bench-copy.mjs 3.526 ms each. Scan.tsx sets no replyTimeoutMs (60 s default). THREAT_MODEL notes only that spam raises cost.
- **Recommended fix:** Re-arm the reply timer on each 'progress' message for the pending batch (the worker already posts one per 128 logs), or post pages in <=1,000-log batches; keep an idle timeout for hung workers. Parsing the spending key once saves only ~3% (measured), so it is optional.

### L3-F4

**Non-default open-log budget defers a page on every run**  
Low · new · Scanner/ledger · Fixed in this branch (`c6127dd`, `d0f8d38`)

- **Finding:** Real but needs a non-default setting. openSeen restarts at 0 each run, so a page whose non-router logs exceed the budget is deferred with the cursor held on every run (scanClient.ts:261,389-397). Router payments inside that page still show; later ones never do. Default 20,000 exceeds the 10,000 per-page cap, so the default is safe; the ungated Settings input (1-100000) and hint 'never skipped' make it reachable. Low. Undocumented; spec 05 and tests cover only cross-page overflow.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** Reran r2 (verify/B12-B): budget 5, 6 spam logs in first page -> runs 0-2 backlog=6 nextBlock=0 matches=0; control with default budget nextBlock=70001 matches=1. Settings.tsx:245-247 input min 1, save check 1-100000 (:193); locales/en.json:214 'deferred to the next scan, never skipped'; scanPrivacy.ts:60,123. Existing scanClient.test.ts:720-744 only tests 30 open logs per page against budget 40.
- **Recommended fix:** Guarantee progress: never defer the first page of a run, i.e. defer only when openSeen > 0 && openSeen + open > budget. Per-run work becomes budget + one page (<= 10,000), still under the 100,000 cap. Shrinking the page via maxLogs alone can still throw on one dense block.

### L3-F5

**Second-RPC disclosure understates what that RPC learns**  
Low · new · Scanner/ledger · Fixed in this branch (`c6127dd`, `d0f8d38`)

- **Finding:** Real: the second RPC gets exact getLogs ranges from the checkpoint and exact anchor reads, while the disclosure says 'the same scan ranges'. But the default 1000-block windowing barely hides position from the primary either: logs.ts and persistable() read eth_getBlockByNumber at the exact anchor, cursor+999 and new anchor. Opt-in second RPC; metadata only (scan position/cadence); verification requests are already disclosed. Low. Undocumented; ideas/05 rule 7 and line 87 state the intent.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** Reran r5: primary 123000-123999,124000-124999; secondary 123457-124456,124457-125000. f5-primary-heights.verify.test.ts with the DEFAULT_SCAN_PRIVACY plan (window 1000): primary getLogs grid-aligned, but primary getBlockByNumber heights 123456 (anchor), 124456 (cursor+999), 124900 (new anchor). scanVerify.ts:98-100; scanClient.ts:226-231,335-344,442,492; scanPrivacy.ts:229,236,329; logs.ts:201,237; docs/specs/ideas/05-private-rpc-padded-queries.md:70,87.
- **Recommended fix:** Wrap the secondary in createWindowedScanClient with the same policy (fixes its getLogs ranges) and correct both RPC disclosure rows: each still learns the exact scan position from eth_getBlockByNumber at cursor, anchor and window-end heights. Full fix: grid-align window ends and checkpoint anchors (ideas/05 rule 7).

### L3-F6

**Indexer/Esplora/Solana/TRON bodies read without a streaming size cap**  
Low · new · Scanner/ledger · Fixed in this branch (`cad187d`)

- **Finding:** Real in what ships: the indexer source is a Settings option (no flag; Base Sepolia allowed) and the BTC view is in the default nav. Precondition: user picks a hostile/compromised https indexer or Esplora. Result: own-tab memory blowup or hang (Esplora has no timeout, only Cancel); no funds/keys unless unsaved in-memory keys die with the tab (user error). Doc comment promises a 'streamed size cap'. Esplora part duplicates L4-05; indexer part is new. Low.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** scanPrivacy.ts:370 'streamed size cap', :380 arrayBuffer() then :381 check; esplora.ts:205-216 no redirect/timeout, res.text() then length check. Repro verify/B13-B/f6-body-cap.verify.test.ts (64 MiB body, 16 MiB cap): indexer read 64 MiB, Esplora 64 MiB (init redirect/signal undefined), net-transport createFetchTransport 17 MiB. Reach: Settings.tsx:229-237, App.tsx:25,42. Not in docs/audits.
- **Recommended fix:** Shared readCapped(res,max) using res.body.getReader() that cancels past the cap (as net-transport fetchTransport.ts:59-70), plus early Content-Length reject; use it in fetchHttpTransport and EsploraClient.text (byte cap, not UTF-16 length). Esplora: redirect:'error', cache:'no-store', linked AbortController with ~30s timeout. Proposed fix is correct; no side effects.

### L4-02

**Deep-scan payment with a wrong view tag offers a Sweep that throws**  
Low · known-open · Pay/sweep · Fixed in this branch (`0eec2f7`)

- **Finding:** Real: deep scan lists a wrong-tag router payment as verified with a Sweep button, but both sweep paths call deriveStealthSecret, which throws VIEW_TAG_MISMATCH even though the address check proves control. It needs a non-GhostPay or tampered payer (the app's pay path always uses the derived tag), who gains nothing. The error is loud and the key is still derivable from the seller's keys, so funds can be recovered with exported keys or a fixed build: Low. Documented as an open gap.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** try2/l402.repro.test.ts 1/1: normal runScan -> 0 matches; deep -> {receipt:'verified',viaRouter:true,tagMatches:false}; deriveVerifiedSweepKey -> 'A cryptographic check failed (VIEW_TAG_MISMATCH).'; 1 of 256 tag bytes gives a key controlling the paid address. stealth.ts:211,219; sweep.ts:38-45,167,416; Sweep.tsx:112; Scan.tsx:369,405; router.ts:150-157. Docs: specs/ideas/02-claim-by-hash-and-spam-filter.md:14,37,333 (open); THREAT_MODEL.md:290 D4 Open.
- **Recommended fix:** Add an opt-in option to deriveStealthSecret (e.g. { allowTagMismatch: true }) that skips only the tag compare at stealth.ts:211 and keeps the ZERO_STEALTH_KEY and ADDRESS_MISMATCH checks. Pass it from deriveVerifiedSweepKey, which already checks addressOfSecret === owner. Defaults and vectors stay the same. Update THREAT_MODEL D4 and receive-and-scan.md, which still say deep scan is not built.

### L4-03

**Esplora client aborts on blocks whose tx count is a multiple of 25**  
Low · new · Chain views · Fixed in this branch (`7dbc34b`)

- **Finding:** Real: both electrs forks return 4xx when start >= tx count (Blockstream 400, mempool 404), so any block with a multiple of 25 txs throws TRANSPORT_FAILURE and the whole scan (always to the tip) is lost; a payment followed by such a block is undetectable in the UI. Ships in default nav, but the BTC view is test-network-only (mainnet off), later-preserved, fails loudly, coins stay recoverable: Low, not Medium. Fixture, shim and live e2e use []-semantics, hiding it.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** esplora.ts:244-250,214. electrs e863e6a schema.rs:848-851 -> 400 (rest.rs test :1911); mempool/electrs 160585b rest.rs:918-919 -> 404. verify/B10-B/l403.repro.test.ts via scanForPayments: block2 n=24/26/51 found 1; n=25,50 THROW TRANSPORT_FAILURE on both forks; fixture semantics found 1; scan from 3 works but skips the payment; count-first variant finds it on both. esplora.test.ts 19/19 pass (30-tx block only). Not in any doc.
- **Recommended fix:** Get the count first (GET /block/:hash tx_count or /block/:hash/txids, both in both forks), fetch exactly ceil(n/25) pages, require page len = min(25, n-start) and txids equal to the list. Drop the /block/:hash/raw option: raw blocks lack the prevout scripts BIP-352 tweaks need. Make the fixture and regtest shim return 4xx past the end; add 25/50-tx tests.

### L4-04

**BTC verification text claims genesis anchoring that is not done**  
Low · new · Chain views · Fixed in this branch (`49a3a44`, `1c1f5d0`)

- **Finding:** Real: linked starts with only genesis and a new source per scan, so only a scan from height 1 reaches genesis; UI windows are <=500 blocks to tip, so on testnet4/signet the first block's parent is never checked. Forgery itself is the known BITCOIN-03 low-work-fork limit (SCAN_LIMITS[0], user doc); anchoring would not stop a forged tip. Impact is an overclaim in a test-only view: Low (borderline Info). 'Never' is overstated: true for regtest from height 1.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** esplora.ts:319,352-356; scan.ts:47; verification.ts:9 'down to the pinned genesis', :14 'cannot invent one'. l404.repro.test.ts: signet block, prevHash abab.., mined at 0x1e0377ae in 4.28M dSHA (40 s JS) -> found 10 tBTC unspent; regtest: forged tip+1 linked to real tip found; random-parent tip found when scanned alone, REORG_DETECTED only if parent in window. Docs repeat the claim (user/bitcoin-silent-payments.md:32, SESSION_STATUS item 7).
- **Recommended fix:** Correct the text: 'Consecutive blocks within one scan must link by previous-block hash; the first scanned block is not linked to earlier blocks', and scope :14 to prevout edits ('cannot invent one by altering these; a low-work fork can'). Fix the same claim in docs. HeaderChain anchoring needs absent checkpoints and still admits a forged min-difficulty tip on testnet4.

### L4-05

**Non-EVM responses read without a streaming size limit**  
Low · new · Chain views · Fixed in this branch (`cad187d`, `9470177`)

- **Finding:** Real: the Solana client has no cap; Esplora (16 MiB) and Tron (8 MiB) check only after res.text() buffered everything, and Esplora has no timeout. Needs a user-picked hostile or compromised server; result is memory blowup, freeze or crash of the user's own tab in test-only views, where such a server can already stall or lie. Defense in depth: Low. Same class is documented for BlindBit and relayerClient, not for these clients.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** solana-stealth/src/rpc.ts:77; esplora.ts:215-216; tron-adapter/src/rpc.ts:53-54; views pass plain fetch (defaultServices.ts:37). l405.repro.test.ts, 48 MiB pull-on-demand body: Esplora pulled 48.0 MiB then INVALID_RESPONSE; Solana pulled 48.0 MiB and ACCEPTED result 42; Tron pulled 48.0 MiB then INVALID_RESPONSE; EVM fetchTransport stopped at 2.0 MiB with RESPONSE_TOO_LARGE.
- **Recommended fix:** fetchTransport is JSON-RPC-only (global fetch, fixed POST), so it is not directly reusable. Add a small shared readCapped(res, maxBytes) (reader loop, cancel on overflow, early reject on Content-Length) and use it at the three sites (Esplora 16 MiB, Tron 8 MiB, Solana e.g. 8 MiB); add a default timeout to EsploraClient.

### L5-04

**Spend groups never evicted; newcomers share one overflow group**  
Low · new · Relayer · Fixed in this branch (`a6bd2da`, `49c123c`, `52a294a`)

- **Finding:** Real: groupSpends (limiter.ts:378-393) never evicts and salted keys rotate daily, so after maxKeys groups ever seen all newcomers share overflowGroupSpend; one sweep's dst and net reservations both hit it. 'One revert 429s all' is overstated: on Base Sepolia at default perKeyWei the lockout needs ~2.5k-25k reverts/hour (serial lane can't) and zero-loss refusal needs gasLimit*price >2.5e15 (above the 5 gwei cap): Low. Medium on ~0.1-5 gwei chains with long uptime.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** Lane5 lossgroup tests: 429s come from the double reservation into the overflow, before any revert. B6-B/t/b6b-lossgroup-relayer.test.ts (maxKeys 16, filled): 0.01 and 5 gwei -> revert then newcomers 200; 20 gwei -> all 429. b6b-lossgroup-scale.test.ts (maxKeys 10000): reverts to lock out unrelated newcomer after fill 24999 (1e11 loss), 2499 (1e12), 4 (5e14); unfilled never. relayer-guard spec :56,78; service.ts:452-461,620-630.
- **Recommended fix:** Evict stale groups like the key table: hold groups in a BoundedTable whose idle test is window != current window, so a full table only overflows on live entries. Give dst and net keys separate overflow buckets so one sweep is not reserved twice against one shared group. Emit a metric when a reservation uses an overflow entry.

### L5-06

**Receipt timeout holds budgets and lane; breaker and health miss stuck txs**  
Low · known-open · Relayer · Fixed in this branch (`ef3700d`)

- **Finding:** Real: on a receipt timeout the daily-budget reservation is kept until UTC midnight, and both loss-budget reservations until the window ends. The lane is held for receiptTimeoutSeconds, and nothing bumps the fee or cancels. The breaker already recorded success at broadcast, so healthz stays ok. Medium: breaker and health silently miss stuck txs, and a stall needs a fee spike or sequencer stall. Budget exhaustion is negligible at beta gas; the main effect is a silent stall.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** service.ts:649 (success at broadcast), :652-673 (timeout returns without budget or loss release), :521-525 (breaker permit settled before the receipt), chain.ts:177-183 (errors become 'timeout'). verify/B5-B/t/accounting.test.ts: after 6 timeouts dailyUsed was 9e14 (6x1.5e14) and 1.8e15 of global loss stayed held; breaker closed, healthz 200. Documented open: audits/05/relayer.md RELAYER-05 (prior RL-04/S3-18f), P1 in 05-full-audit.
- **Recommended fix:** After a receipt timeout, record a breaker failure explicitly and alert. The job's permit is already settled at broadcast, so a setOutcome there is too late. Keep the reservation in a pending ledger that a later receipt lookup releases. Replace-by-fee or cancel the head nonce.

### L5-07

**Stale trustProxyHops key in docs crash-loops the relayer**  
Low · new · Relayer · Fixed in this branch (`5894f64`)

- **Finding:** Real doc drift: deploy/config/README.md:5 says trustProxyHops 1; the strict parser rejects unknown keys -> 'fatal: config $: invalid' (key not named), api crash-loops, /api 502. Fails closed. Removing the key leaves loopback-only trustedProxies, which is L5-05. Duplicate of L7-L3's README half and the root of L5-05's misconfig. The same stale key is also in docs/operators/relayer-runbook.md and docs/developer/api/apps.md. Ops/docs only: Low.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** B6-B/t/b6b-config.test.ts: example + listen 0.0.0.0 + trustProxyHops:1 -> 'ConfigError: config $: invalid'; without it -> trustedProxies [127.0.0.1, ::1]. config.ts:358-366; codec.ts:23-24; main.ts:43-46; apps/relayer/DEVIATIONS.md:48; relayer-runbook.md:34,38,40,103,124; apps.md:72,87. Prior DOCS-CLAIMS-07 covered apps/relayer/README.md only, now fixed (README:154).
- **Recommended fix:** Replace trustProxyHops in deploy/config/README.md, docs/operators/relayer-runbook.md and docs/developer/api/apps.md with trustedProxies guidance that matches the L5-05 fix. Make the config parser name the unknown key and hint that trustProxyHops was replaced by trustedProxies.

### L5-10

**RPC outage never opens the breaker**  
Low · known-open · Relayer · Fixed in this branch (`61c0ae4`)

- **Finding:** Real: gasPrice() turns RPC errors into RelayerError rpc_unavailable, and the first in-lane call runs outside op(). Both op() and the default outcome treat that as neutral, so a full RPC outage never opens the breaker and healthz stays 200. Low, a monitoring gap: during an outage quotes fail too, so the service is down either way, and error-level logs and 503 metrics still show it. It is not attacker-triggerable. The runbook wrongly says the breaker opens.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** service.ts:491-501, :538-546 (op rethrows a RelayerError without setting the outcome), :548, :603. verify/B5-B/t/accounting.test.ts: with getGasPrice down, 8x 503 rpc_unavailable, breaker closed, healthz 200. With getBalance down, the breaker opened after 3, healthz 503. Documented open: audits/05/relayer.md RELAYER-06; relayer-runbook.md:101 says 'Breaker will open on errors'.
- **Recommended fix:** The proposed op() wrap does not work: gasPrice() already throws a RelayerError, which op() rethrows without setting the outcome. Use op(() => this.d.gasPrices.getGasPrice(chainId)), then apply the cap check, at both service.ts:548 and :603. gas_price_too_high must stay neutral.

### L7-L1

**Embed headers lack ACAO for the SRI snippet**  
Low · new · Embed · Fixed in this branch (`c4e3aea`)

- **Finding:** Real: the embed rules in _headers, deploy/nginx and infra lack ACAO, so the snippet in the v2 header (integrity + crossorigin=anonymous) is CORS-blocked. SRI without crossorigin is also blocked, so only a tag without SRI loads. embed-sri.mjs (adds ACAO, v1 only) is not wired into postbuild or release-build.sh. Hosts that send ACAO:* by default (GitHub Pages; Cloudflare Pages per its docs) are fine. Embedding is later-preserved, and harm needs a compromised host (S3-10, open).
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** Browser repro verify/B9-B/l1-sri-cors.mjs (Chromium 1243, real ghostpay-embed-v2.js, headers per _headers:28-30). No ACAO: integrity+crossorigin -> ERROR 'blocked by CORS policy'; integrity only -> ERROR 'Subresource Integrity...requires CORS'; plain tag -> LOADED. With ACAO:* the documented snippet -> LOADED. web package.json postbuild = scan-bundle only; release-build.sh:43-45 has no embed-sri. LEAN_RELEASE_SCOPE.md:23: embedding is later-preserved.
- **Recommended fix:** Add Access-Control-Allow-Origin: * to the v1 and v2 embed rules in _headers (after the CORP line, for the embedHeaders.test.ts regex), deploy/nginx/nginx.conf, infra/proxy Caddyfile and nginx.conf, and infra/web/Caddyfile.static. For S3-10: extend embed-sri.mjs to v2, run it in release-build.sh, add routes for the hashed names, and publish the SRI value.

### L7-L2

**Attribute check not config-proof ($GIT_DIR/info/attributes)**  
Low · new · Hosting · Fixed in this branch (`259934c`)

- **Finding:** --attr-source replaces only in-tree .gitattributes. git still reads $GIT_DIR/info/attributes, so a repo-local filter.*.clean runs during `git status`, contradicting the 'config-proof' comment. Exploiting it needs a hand-delivered .git directory (clone and fetch never transfer config or info/), and any git command in that directory would run the filter too. The documented use is the operator's own checkout; in CI, PR code already runs in the build step. The auditor's top-level check misses submodules.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** git 2.43.0. verify/B8-B/l2.sh: info/attributes '* filter=evil' plus filter.evil.clean -> package exit 0, marker PWNED-TOP. Control with in-tree .gitattributes: no marker. Submodule: filter in .git/modules/sub/config plus its info/attributes -> marker written, while the top level has no filter config and no info/attributes. A submodule core.fsmonitor did not fire. cli.mjs:238-244; tests cover only in-tree attributes (cli-hardening.test.mjs:62-84).
- **Recommended fix:** Add --ignore-submodules=all to git status, and refuse when `git config --get-regexp '^filter\..*\.(clean|smudge|process)$'` (same env and -C) returns anything. A filter attribute without a driver does nothing, so no info/attributes check is needed. Alternatively drop git status and record only the commit (dirty: null, with a schema note). Add tests for info/attributes and submodules.

### L7-L3

**deploy/nginx proxies any /api/ path including /metrics**  
Low · new · Hosting · Fixed in this branch (`b9f1e5d`)

- **Finding:** Two halves. The README/trustProxyHops to one-bucket half duplicates L5-07 and L5-05 (Medium there). Unique part: deploy/nginx 'location /api/' proxies any path, so /api/metrics reaches the relayer, unlike infra/proxy (4-route allowlist, /metrics 404). Compose sets no metricsTokenEnv, so /metrics is 404 by default; when enabled it needs a 32-256 char bearer compared in constant time. Defense in depth: Low. 'Trust the web subnet' alone does not restore per-client buckets.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** deploy/nginx/nginx.conf:63-75 (location /api/ -> proxy_pass http://api:8787/); server.ts:36-43,271-287 (/metrics 404 without token, timingSafeEqual); config.ts:328-332 (token 32..256); docker-compose.yml:23-28 (no metrics env); infra/proxy/nginx.conf:59,71 and Caddyfile route allowlist; docs/operators/hosting.md says /metrics not routed. b6b-compose.test.ts gateway case: still all 429.
- **Recommended fix:** Allowlist routes: location ~ ^/api/(healthz|v1/info|v1/quote|v1/sweep)$ { rewrite ^/api(/.*)$ $1 break; proxy_pass http://api:8787; ... } and return 404 for every other /api/ path, including /api/metrics; scrape metrics from inside the backend network. For buckets apply the L5-05 fix (nginx real_ip plus pinned backend trustedProxies).

### L7-L4

**PR file listing truncation (3000 files) fails open**  
Low · new · CI · Fixed in this branch (`80ac097`)

- **Finding:** Logic holds: ci.yml:39 lists PR files through pulls/N/files, which GitHub caps at 3000. Truncation fails open: if only docs are seen, code=false, every heavy job is skipped, and the typescript and contracts gates pass on skipped. Exploiting it needs a maintainer to merge a PR of 3000+ files. CI on push to main always runs the full suite and release verify reruns the tests, so there is no direct impact. The aa*.md-before-apps/ ordering was not observed on GitHub.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** ci.yml:38 non-PR events set code=true; :39 gh api repos/$REPO/pulls/$PR/files --paginate; :43 grep -qvE '^(docs/.*|.*\.md)$' is false when every returned name is docs; :175-187 and :370-381 the gates fail only on failure or cancelled. GitHub REST docs for list-PR-files: 'Responses include a maximum of 3000 files'. The repo tracks 544 docs files, so an accidental trigger is unlikely. HANDOFF.md:93 records an earlier fail-open bug (pipefail), not this one.
- **Recommended fix:** Fail safe: read changed_files with gh api repos/$REPO/pulls/$PR --jq .changed_files and set code=true when it is >= 3000 or larger than the number of filenames returned. Alternatively, build the list with git diff --name-only base...head in a checkout. The only side effect is that very large PRs run full CI.

### L7-L5

**Directory target re-read after verification**  
Low · new · Hosting · Fixed in this branch (`259934c`)

- **Finding:** For a directory target, openVerified returns the original directory. policyFor, exportStatic and preview then re-read files without comparing them to the verified hashes. Anyone who can write to that directory can swap content after verification, and the profile still reports the verified digest. This needs hostile write access to the operator's input directory during the run (e.g. shared or synced dirs). Archives are safe: bytes are held in memory, extracted to a private mkdtemp dir and re-verified. A real race was reproduced.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** verify/B8-B/l5: packaged and unpacked a 1502-file site. watcher.mjs swaps site/zzz.js when .out.tmp-* appears. `profile <dir> --expect-digest <correct>` exit 0; the exported static/www/zzz.js contains alert("TAMPERED..."); PROFILE-README shows the verified digest; a later `verify <dir>` reports changed site/zzz.js. cli.mjs:418-421, 441-443; static-export.mjs:132-134; preview.mjs:204 (read per request, no hash).
- **Recommended fix:** In openVerified's directory branch, copy regular files (O_NOFOLLOW, no symlinks) into a private mkdtemp dir. Run verifyDirectory with the expectations on that copy, use only the copy for policyFor, export and preview, and clean it up as for archives. The auditor's fix is correct; copying first and verifying the copy avoids passing bytes out of verifyDirectory.

### L7-M1

**Kit README promises a rendered _headers that static export drops**  
Low · new · Hosting · Fixed in this branch (`259934c`)

- **Finding:** The README and the code disagree: README:94 promises a rendered `_headers`, but the static export drops it on purpose (code comment, SERVER-PROFILES §4, test) and nothing warns. Lowered because the kit is not in the shipped bundle and ADR-0015 forbids public hosting. The documented Cloudflare recipe uploads dist/, which has `_headers`, and the checklist requires curl -I plus a framing test. The meta CSP keeps script-src. Framing loses only defense in depth: storage is partitioned and the wallet confirms.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** Ran demo and `profile --with static`: no `_headers` anywhere in the profiles, though site/_headers exists. README.md:94 vs static-export.mjs:2-4,100,132, SERVER-PROFILES.md:154, static-export.test.mjs:53, cli.mjs:645. mirror-hosting.md:27 (upload dist/), :67 (curl -I/framing check). ADR-LOG.md:80-81 (no public instance). index.html:11-14 meta CSP has script-src 'self' and no frame-ancestors. keyVault storage is partitioned when framed.
- **Recommended fix:** Minimal: fix README:94 and PROFILE-README to say static/www omits `_headers` (it is the nginx/container root), and that `_headers` hosts should deploy dist/ per mirror-hosting.md. If support is wanted, render `_headers` at the static/www root, not <base>/ (Cloudflare and Netlify read only the root), with base-prefixed patterns. nginx already returns 404 for it.

### L7-M2

**selfhost.sh never compares --commit**  
Low · new · Hosting · Fixed in this branch (`111b19e`)

- **Finding:** Real: --commit is mandatory and the plan says it is verified (abort on FAIL), but selfhost.sh:221 calls verify-release.sh with 3 args, so the commit is never compared; it then extracts and runs up -d with no pause, though its own plan (:200) says to do the signed-tag/attestation checks 'then'. Needs an attacker-controlled download source or a downgrade (threat model 6.1). Passing the manifest alone does not help: a forged manifest passes.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** Repro verify/B9-B/m2: own tarball+SUMS, commit fff..f, 3-arg call as selfhost.sh:221 -> 5 PASS, 'hash checks passed', exit 0. Forged release-manifest.json naming real commit 9ce5614, listed in SUMS, 4-arg call -> all PASS, exit 0. verify-release.sh:46 checks commit only with a manifest; selfhost.sh:224 tar -x, :234-235 build + up -d. BUILD-WEB.md:5-8 makes --tarball the recommended path. Not in docs/audits (15-ext8 covers only archive safety).
- **Recommended fix:** Before extracting, require an authenticity gate: --expect-sha256 carried from the separate-machine check, or gh attestation verify <tarball> --repo R --signer-workflow R/.github/workflows/release.yml --source-ref refs/tags/<tag>. Also require and pass --manifest (catches downgrade or mix-up). Stop before up -d unless the operator confirms.

### L7-M4

**Pages workflow restores library dist from cache**  
Low · known-open · CI · Fixed in this branch (`80ac097`)

- **Finding:** Mechanism is real: pages.yml restores packages/*/dist from the main-scope libs cache and skips build:libs. Packages export ./dist/index.js and Vite has no alias, so a poisoned entry would ship. But Pages is workflow_dispatch and main only, the owner must enable it (docs: intentionally off), and the attacker needs code execution in a main-ref CI job (supply chain). The release tarball is unaffected (rm -rf dist). Unlikely preconditions, so Low.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** pages.yml:11-12 workflow_dispatch only, :25/:62 main only, :36 setup-node-libs; action.yml:15-21 a cache hit skips build:libs; core-crypto exports ./dist/index.js; vite.config.ts has no alias. Fork-PR caches are PR-scoped; no pull_request_target. docs/audits/05/supply-chain-ci.md:21 (CI-02) already says 'a poisoned main-scope cache entry would ship', with fix 'build with rm -rf dist'; 05-full-audit.md:428 lowered it to Low; release-and-verify.md:18.
- **Recommended fix:** In pages.yml replace setup-node-libs with actions/setup-node + npm ci --ignore-scripts + rm -rf packages/*/dist && npm run build:libs, with no libs-cache restore. Better: publish the attested release tarball. The npm download cache is integrity-checked against the lockfile and can stay. This does not cover a compromised build-time dependency.

### L8-04

**PIR client would ship if createScanSource were imported**  
Low · new · Packages (preserved) · Fixed in this branch (`378ec6b`)

- **Finding:** Mechanism confirmed: PIR is tree-shaken today, but importing createScanSource ships the PIR client and the bundle still passes scanBundle(). No current impact (the code would still need deliberate wiring), so Low, not Medium. REACHABILITY checks out: pir-two-server is the only preserved package in the web closure, the relayer closure is clean, and BTC/Solana/Tron views ship ungated. VITE_FLAG_BITCOIN is an unchecked acceptance item, not an existing flag.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** verify/B11-B/l8-04/bundle.mjs (rolldown, minified): current imports 4.6KB, no PIR markers; with createScanSource 22.7KB incl. 'PIR server request failed'; scan.mjs: scanBundle()=[]. scanPrivacy.ts:26; no no-restricted-imports in eslint.config.js. Dist has 'Bitcoin testnet4', 'Solana devnet'; env compiled to {DEV:!1,...}; embed flag !1. spec 11:25 '[ ] ...VITE_FLAG_BITCOIN'. LEAN_RELEASE_SCOPE.md:26.
- **Recommended fix:** Add an apps/web ESLint no-restricted-imports rule for '@ghostpay/scan-source' with importNames createScanSource, createPir2Source, createLightSource, createQuorumSource, describeScanMode and SCAN_MODE_CLAIMS. Add a preserved-code marker denylist to scan-bundle.mjs ('PIR server request failed', 'answer has wrong size', 'groth16'). Optionally move pir2 to a subpath export.

### F5

**verifyReceipt marks any final router claim verified**  
Info · known-open · Packages (preserved) · Fixed in this branch (`eaeacc5`, `ace3c65`)

- **Finding:** Confirmed. verifyReceipt returns 'verified' for any final viaRouter claim with no token allowlist, balance check or transfer evidence; the router accepts any token, so a junk-token router payment reads as verified. No callers: the web scan marks verified only when verifyClaimedPayment says received and final; apps/web's own verifyReceipt is a separate signed-receipt helper. Private package. Known as the router half of CHAIN-ADAPTERS-04; the 09 delta review calls it legacy. Info.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** f5/f5.mjs against chain-adapters dist: router claim, token 0x..dEaD, 1e30 units, no evidence -> 'verified'; the same claim sent direct -> 'claimed'; no RPC calls other than blockNumber. scanVerify.ts:49; scanVerify.test.ts:45 asserts this; exported at index.ts:23. grep finds no callers outside its tests. scanClient.ts:310-325 uses verifyClaimedPayment. docs/audits/05/chain-adapters.md:54-60; 09-security-delta-review.md:35-49.
- **Recommended fix:** Delete verifyReceipt and its tests, keeping the ReceiptStatus type (apps/web/src/lib/scanClient.ts uses it). Alternatively, make it delegate to verifyClaimedPayment. Nothing else calls it.

### F6

**Local announcer build cannot reach the canonical CREATE2 address (by design)**  
Info · known-accepted · Contracts · Accepted by design

- **Finding:** Confirmed, but by design. A CREATE2 address depends on the exact init code; the local 0.8.28 build with cbor_metadata=false can never produce 0x5564..5564, so the script needs ALLOW_NONCANONICAL_ANNOUNCER and Deploy needs ALLOW_CUSTOM_ANNOUNCER. Matters only on chains without the canonical announcer, which the testnet runbook checks first. Impact is interop with third-party ERC-5564 scanners; GhostPay scans the manifest's announcer. Documented in the script, the runbook and the 05 audit.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** DeployAnnouncer.s.sol:15-17 documents the opt-in; :69-71 enforces the NonCanonicalAddress gate. foundry.toml:11,15-16 (solc 0.8.28, bytecode_hash none, cbor_metadata false). test/DeployAnnouncer.t.sol:35 test_nonCanonicalRequiresOptIn. docs/operators/testnet-runbook.md:67-69. docs/audits/05/contracts-core.md:103 rates it checked and sound. Base Sepolia announcer presence could not be checked on-chain: the public RPC was blocked by the proxy (403).
- **Recommended fix:** None required. Optionally, note in the runbook that a custom announcer hides payments from third-party ERC-5564 wallets. Reproducing the canonical address would need the exact upstream init code and salt.

### G1-03

**Payment-link host check accepts hex/short IPv4 forms**  
Info · new · Packages (preserved) · Fixed in this branch (`fe9f120`)

- **Finding:** Reproduced: 0x7f000001, 0X7F000001, 0x7f.1, 0x7f.0.0.1, 1.2.3.0x4, 0xa9.0xfe.0xa9.0xfe accepted; decimal/octal/dotted forms rejected. No shipped consumer: package is private, its DEVIATIONS 1 says not integrated, web imports only builders, the web paste path keeps only the fragment, and the web QR wrapper compares to the canonical deployment hostname. allowedHosts ('strongly recommended') already blocks it. Docstring/contract mismatch only.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** G1-B/g103.repro.test.ts: '0x7f000001 ACCEPTED .. WHATWG = 127.0.0.1', '1.2.3.0x4 ACCEPTED .. = 1.2.3.4', '0xa9.0xfe.0xa9.0xfe ACCEPTED .. = 169.254.169.254'; 2130706433, 017700000001, 127.1 rejected; allowedHosts:['ghostpay.example'] -> INVALID_LINK. invoice-link.ts:32-34 docstring vs :50 /^[0-9.]+$/. payment-uri package.json private:true; fragment.ts:24-29 ignores host; Pay.tsx:46-48 requires host === base.hostname.
- **Recommended fix:** The new URL() comparison is correct. Simpler, dependency-free equivalent: apply WHATWG's 'ends in a number' rule and reject when the host's last label matches /^(?:[0-9]+|0x[0-9a-f]*)$/i (exactly when URL parses it as IPv4), keeping the dev exception for literal 127.0.0.1. Add hex/mixed vectors to negative.test.ts.

### I-1

**Storage keys derived from public keys survive "wipe keys" (device-seller linkability)**  
Info · new · Keys/session · Fixed in this branch (`4d58712`)

- **Finding:** Confirmed. Wiping keys leaves localStorage checkpoint keys and IndexedDB reconciliation records named by an unsalted SHA-256 of the public spend and view keys (derivable from the meta-address), plus chain ids and scan heights. Someone with profile access and a candidate meta-address can confirm the device used that identity. No funds or secrets are exposed. The THREAT_MODEL browser-profile row does not mention it. Info.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** scanClient.ts:75-77: checkpointKeyId = sha256(spendPub|viewPub). :514-516: key ghostpay.scan.checkpoint.v2.<chain>.<keyId>. reconciliationVault.ts:25-28, 48-54, 104-106: scope key `${sellerKeyId}:${chainId}`, with the scope in the plaintext envelope. clearSession (session.ts:266-278) clears memory only. THREAT_MODEL.md:30 lists only invoice links, settings and RPC URLs.
- **Recommended fix:** Document in THREAT_MODEL.md:30 and the user docs that scan checkpoints and encrypted reconciliation records stay until site data is cleared, keyed by a public-key hash. Optionally add 'forget this identity's local data'. Salting keyId (HMAC with a per-profile random salt) also works but needs a storage migration.

### I-2

**Archive export silently omits chains disabled in the build**  
Info · new · Keys/session · Fixed in this branch (`6fc1b1b`, `2c13938`)

- **Finding:** Real, no direct impact. Export walks services.chains (compile-time CHAINS.filter(enabled)), so stored history, invoice registrations and receipts for a chain this build doesn't list are left out and not counted in the warning. All 7 testnets are enabled now and no mainnet ever was, so it needs a later build that narrows chains. The data stays in IndexedDB, and import fails closed on unknown chains. The panel ships (SellerKeys.tsx:353) but is later-preserved. Info.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** try2/i2archive.repro.test.tsx 1/1 (real TagArchive via renderApp; vault factory and exportArchive wrapped): stored scope 11155111 present, build lists 84532 -> vaults opened [84532], history passed ['84532'], message 'Archive downloaded: 0 tag(s). SHA-256 ...' with no 'NOT in this archive'. TagArchive.tsx:74-90,114,122,152-154; defaultServices.ts:45; chains.ts:34-47 (git log: mainnets never enabled); LEAN_RELEASE_SCOPE.md:21. Not in any doc.
- **Recommended fix:** On export, list this seller's stored vault keys (IDB getAllKeys on 'vaults', prefix sellerKeyId:) and name chains the build doesn't list in the 'NOT in this archive' warning. Optionally carry them as opaque ciphertext and let import skip unknown chains with a warning instead of refusing the whole archive.

### I-3

**Optional tag fields not type-checked**  
Info · new · Keys/session · Fixed in this branch (`20b824d`, `f690464`)

- **Finding:** Confirmed. validatePayload checks only `.length` of invoiceLabel and notes, so null, numbers, booleans, objects and arrays pass and survive save/list. The tag archive import path (strict JSON) feeds this function. Nothing renders these fields and the UI never sets them, so there is no current impact. Info.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** tags.ts:150-157; tagArchive.ts:139-142 (archive import calls validatePayload). Repro verify/B1-B/i3.payload.repro.test.ts: null, 42, true, {length:3} and ['a','b'] are all accepted; save then list returns invoiceLabel {length:1,nested:{..}} and notes 12345. Grep finds no UI that renders invoiceLabel or notes.
- **Recommended fix:** In validatePayload, reject invoiceLabel and notes unless typeof === 'string', and apply the clientLabel trim and length rules, so stored and imported tags keep the declared TagPayload type.

### L2-I1

**Fiat quote slippage shown but not enforced**  
Info · known-open · Pay/sweep · Open (deferred)

- **Finding:** Real but latent: readPrice maxAge = clamp(quote TTL,60,86400) taken from the seller-signed invoice (pay.ts:150); maxSlippageBps is only displayed (Pay.tsx:895); price is not re-read in buildFinal. Only FEEDS entry is Sepolia ETH/USD, no heartbeat (quote.ts:46-59). Default build bundles no manifest and beta chain 84532 has no feed, so fiat_quote is unpayable in what ships; fiat/oracles are later-preserved (LEAN_RELEASE_SCOPE.md). Info.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** verify/B4-B/l2i1.repro.test.ts: Sepolia fiat_quote, TTL 1440 min, feed updatedAt now-23h accepted; quoted wei identical for maxSlippageBps 0 and 10000 (5e16); TTL 15 min refuses same price -> PASS. grep maxSlippageBps: display/create only. Known: docs/remote/audits/security-tslibs.md:79-88 (L-5 Low latent, unfixed). Drift: docs/developer/api/chain-adapters.md:265-268 lists effectiveMaxAge/withinSlippage that do not exist.
- **Recommended fix:** Before enabling a feed on any shipped chain: cap price age app-side (min(TTL, heartbeat+margin, e.g. 3600 s)), re-read the price at buildFinal/just before send and refuse if the amount moved more than maxSlippageBps from the reviewed amount, or drop the slippage text. Fix the API doc drift.
- **Why deferred:** Latent: the beta chain has no price feed and fiat quotes are later-preserved. Cap the price age and re-read the price before send before any feed is enabled.

### L2-I2

**Huge timestamps blank the app (same as G1-01)**  
Info · new · Pay/sweep · Fixed in this branch (`c8ee18c`, `9a00a7a`)

- **Finding:** Real: schema accepts expiresAt and quote timestamps up to 2^53-1 (schema.ts:293-299); formatUnix throws RangeError above 8.64e12 s; Pay renders it (Pay.tsx:900; :895 for fiat_quote) and apps/web has no error boundary, so React 19 unmounts the whole root. Reachable in the default build (details render without a manifest). Impact small: attacker link only blanks that tab, fragment is already cleared so reload recovers; no funds or keys. Info.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** verify/B4-B/l2i2.repro.test.tsx (self-signed invoice, encodeFragment ok, trust valid-signature): expiresAt=2^53-1 and fiat quote.expiresAt=2^53-1 -> container '' and 'RangeError: Invalid time value' (format.ts:60 via Pay.tsx:900/895); location.hash '' after crash; fresh render shows Home. 3/3 PASS. grep ErrorBoundary|componentDidCatch apps/web/src: 0. Only the 9e15 acceptance is noted (Info) in docs/remote/round-audits/core-crypto.md:87.
- **Recommended fix:** Make formatUnix total (fallback text when the Date is invalid), add a reviewInvoice blocker for timestamps past a sane horizon (e.g. > 253402300799 or now+10y), and wrap ViewSwitch in an error boundary that shows an error panel instead of unmounting.

### L2-I3

**Wallet rejection leaves an 'unknown' payment-journal entry**  
Info · new · Pay/sweep · Fixed in this branch (`28de7d7`)

- **Finding:** Real: call() maps 4001 to UserFacingError, which sendViaWallet rethrows after beginAttempt, leaving 'unknown' (wallet.ts:312-330); retry needs explicit clear. That part is deliberate and test-asserted (Pay.test.tsx:472-488). Undocumented: approve/revoke keys are calldata+account (wallet.ts:270-274; payExec.ts:164,183), so an identical approval or revoke for a later invoice is blocked even after success. Approvals are only used for buffer/permit fallback on 84532. Info.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** verify/B4-B/l2i3.repro.test.ts: MockWallet 4001 -> journal [{payment,unknown}], retry -> 'previous wallet attempt'; approve(router,100250627) submitted + payment submitted, same approve for a new invoice -> blocked; revoke approve(router,0) twice -> second blocked. 2/2 PASS. Design: RECONSTRUCTION-2026-10-23.md:39 (write-ahead unknown, explicit clear).
- **Recommended fix:** Scope approval/revoke keys by invoice digest, or exempt them (approve sets, not adds, so a duplicate only costs gas). Optionally (owner decision; current test asserts otherwise) treat EIP-1193 4001 on eth_sendTransaction as not sent and drop the pre-send record; keep 'unknown' for all other errors.

### L2-I4

**Live manifest read-back ignores the secondary RPC**  
Info · known-open · Pay/sweep · Open (deferred)

- **Finding:** Real: Pay/Sweep/Scan read back through verifyManifestForFlow/verifyManifestState -> verifyManifestOnChain with one client (manifest.ts:107-126; deploymentsVerify.ts:44-70), even with a secondary RPC set; two-provider verifyDeployment is reached only from lib/deployment.ts, imported only by hardening.test.ts. Manifests are bundled and release-signed, so a lying RPC can only pass an already-wrong signed manifest. Info; applies only to signed-manifest builds.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** grep: verifyDeployment caller = apps/web/src/lib/deployment.ts only; its only importer = hardening.test.ts; Scan.tsx:146 uses the primary although getSecondaryRpc exists (Scan.tsx:131). Settings hint scopes the 2nd RPC to scans (locales/en.json:18). apps/web/deployments/README.md:14-19 claims verifyDeployment + 2nd provider + canonical announcer (drift). Known: docs/audits/05/chain-adapters.md:63-69 (CA-05 one client), 09-security-delta-review.md:143.
- **Recommended fix:** Pass app.getSecondaryRpc() into verifyManifestForFlow and the Scan check and call verifyDeployment(m, primary, { secondary }) (also enforces the canonical announcer), failing closed on disagreement as Scan does; delete or wire lib/deployment.ts; correct apps/web/deployments/README.md.
- **Why deferred:** Info: bundled manifests are release-signed, so a lying RPC can only confirm an already-wrong signed manifest. Wire the secondary RPC into the read-back later.

### L3-F7

**Embed profile adds no gate beyond frame-ancestors**  
Info · new · Embed · Fixed in this branch (`c4e3aea`)

- **Finding:** Profile verifies only against its own embedded signer, so any framer can mint one naming its origin; it adds no gate beyond nginx frame-ancestors, contrary to security-headers-embed.conf:7-8. Small impact: needs VITE_EMBED_IFRAME=1 (no recipe sets it), the embed conf and an operator-allowlisted framer that embeds the invoice itself; it gets status/chainId/txHash, about what the payer knows. Embed is later-preserved. DEVIATIONS 6 notes only the missing fingerprint UI.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** merchantProfile.ts:176 verify(sig,digest,p.signer); embedHost.ts:84-102 trusts profile.origins; Pay.tsx:710 notifyEmbedDone with no signer check. Repro f7-self-signed-profile.verify.test.ts: profile from a random key with origin https://other-allowlisted-site.example accepted; gp:init and gp:done{submitted,84532,txHash} posted to that origin. VITE_EMBED_IFRAME appears only in doc/conf comments.
- **Recommended fix:** When embed is promoted: pass the parsed invoice signer to notifyEmbedDone and post only if its signature is valid and invoice.signer === profile.signer (spec 14 already signs profiles with the ADR-0002 invoice key). Operator-key pinning adds key management and duplicates frame-ancestors. Now: fix security-headers-embed.conf:7-8 and DEVIATIONS 6 to say frame-ancestors is the only gate.

### L3-F8

**CSP/SRI postbuild helpers are dead code since consolidation**  
Info · known-open · Hosting · Open (deferred)

- **Finding:** Dead code confirmed: csp.mjs/embed-sri.mjs were wired at 9654e9a (vite plugin + postbuild) and lost in consolidation tree 8672a9a. README now correctly says postbuild runs only scan-bundle, so no operator doc asks for GHOSTPAY_CONNECT_ORIGINS. Underlying S3-10/S3-11 are documented open (audit 03; 05/web-app.md:124-125). v2 header still advises SRI, which also fails without ACAO (L7-L1, overlap). Info.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** Only importer: src/buildScripts.test.ts:8-9 (related tests 69/69 pass). postbuild = scan-bundle only; vite.config.ts has no csp/CONNECT ref; dist and release tarball (out-base2) lack embed-sri.json/hashed SDK; connect-src 'self' https: wss:. 9654e9a postbuild ran embed-sri. f8-wiring-check.mjs: tightening dist with applyConnectSrc makes scanBundle fail 'unexpected origin https://sepolia.base.org'.
- **Recommended fix:** Restore the 9654e9a wiring (transformIndexHtml + closeBundle on dist/_headers; postbuild embed-sri then scan-bundle) AND let scan-bundle accept the configured origins (else build fails), extend embed-sri to v2, add ACAO/CORP/immutable rules for hashed files in deploy/nginx and infra (L7-L1). Or delete both scripts and drop the SRI advice from the v2 header.
- **Why deferred:** Dead code. The underlying CSP/SRI build steps (S3-10/S3-11) stay open and are recorded in apps/web/DEVIATIONS.md.

### L3-F9

**Scan slot keys linkable to the public meta-address (duplicate of I-1)**  
Info · known-open · Keys/session · Open (deferred)

- **Finding:** Real: slot key and vault scope are sha256(spendPub|viewPub), computable from the public meta-address, and 'Wipe keys from memory' (clearSession) touches no storage. Needs browser-profile access; reveals the device-seller link and scan progress only, no keys/funds. Documented: PRIVACY-E2E-09 (Info, open; written for v1 key, now more linkable) and ADR-0025 accepts the visible vault scope id. Duplicate of lane-1 I-1.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** scanClient.ts:75-77 checkpointKeyId=sha256(spend|view), :514-516 slot; reconciliationVault.ts:104-106 scopeKey, :342 HKDF info and AAD carry scope; SellerKeys.tsx:347 wipe = clearSession only. Repro f9-stored-identifier.verify.test.ts: after clearSession, slot recomputed from decodeMetaAddress(metaAddress) matches the stored key. docs/audits/05/privacy-e2e.md:133-137; ADR-LOG.md ADR-0025 Consequences.
- **Recommended fix:** Minimal: list these identifiers in the THREAT_MODEL browser-profile row and privacy docs, and add an explicit, confirmed 'forget this seller's local scan data' action. Do not auto-clear on memory wipe: it deletes encrypted reconciliation history and forces rescans. HMAC/HKDF(viewing key) ids need migration: scope id is in vault AAD, HKDF info and record ids.
- **Why deferred:** Info: needs access to the browser profile and reveals the device-seller link and scan progress, no keys or funds (PRIVACY-E2E-09, ADR-0025). Open: list the identifiers in the THREAT_MODEL browser-profile row and add a confirmed "forget this seller's local scan data" action.

### L4-I1

**Manifest digest has no domain prefix**  
Info · new · Chain adapters · Open (deferred)

- **Finding:** Real: the production scheme (build validator, web loadBundledManifest, relayer config.ts:225, ops-monitor) signs keccak256(canonicalManifestJson) with no domain tag; the legacy domain-tagged text scheme is still exported and the bare name verifyManifestSignature is the legacy one. No impact today: canonical JSON starts with '{' so it cannot collide with RLP tx, EIP-191 or EIP-712 preimages, and the release key is dedicated. Audit 05 credited a domain tag that production no longer uses.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** node verify/B4-B/l4/l4i1.mjs (dist): canonical JSON first byte 0x7b; manifestDigest == keccak256(json) true; legacy prefix 'GhostPay-deployment-manifest-v1\n'; verifyManifestSignature === verifyTextManifestSignature true. Code verify.ts:76-84; deploymentsSignature.ts:31,50-60; index.ts:21,27-32. deployments/README.md:25,36-37 documents both schemes. Only signed manifest in repo: apps/web/e2e/fixtures/84532.json (fake).
- **Recommended fix:** Before the first real release signature, sign keccak256(utf8('GhostPay.DeploymentManifest.v2\0') || canonicalJson), or EIP-191 over a domain-tagged text so standard signers work without raw-hash signing; re-sign the e2e fixture; remove or rename the legacy verifyManifestSignature/verifyTextManifestSignature exports.
- **Why deferred:** Release-format decision: add the domain prefix before the first real release signature (build validator, web loader, relayer config, ops monitor and the e2e fixture change together).

### L4-I3

**SecretBytes does not block toHex/toBase64; registry accepts bad-checksum addresses**  
Info · known-open · Core crypto · Fixed in this branch (`f59b51e`)

- **Finding:** Real: SecretBytes (secret.ts:29-59) blocks toString/toJSON/slice/subarray but not toHex/toBase64 (in current browsers) or ES2023 toReversed/with; secret.ts:15-18 already calls it a guardrail, not a boundary (S3-08); no shipped call site. buildLookupCall uses isAddress strict:false (registry.ts:114) on raw RegistryView input; the lookup is read-only and shows the normalized registrant, so a typo only yields a wrong or empty lookup. Info.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** node verify/B4-B/l4/l4i3.mjs: JSON.stringify/String/slice throw; Array.from, toReversed, with and toHex (browser-equivalent polyfill; Node 22 lacks it) return secret bytes; buildLookupCall('0x6538e6bf4B0e...') accepted and normalized; viem strict:true rejects it. No .toHex()/.toBase64() in shipped src. Known: audit 03 S3-08 (Open), docs/audits/05/wallet-safety.md:44-48 (WALLET-SAFETY-03, Low disputed).
- **Recommended fix:** (a) Add throwing overrides for toHex, toBase64, toReversed, toSorted and with in SecretBytes and keep the 'not a boundary' wording; (b) in buildLookupCall use isAddress(registrant, { strict: true }) (all-lowercase still accepted) and report a checksum mismatch instead of normalizing.

### L5-08

**Gas reserve default 0 (no beta-chain impact)**  
Info · known-open · Relayer · Open (deferred)

- **Finding:** The default is 0 as stated, but it has no impact on the beta chain. The reserve scales only the gas term, and at L2 gas prices the 50 bps floor sets the fee, so even the 5000 bps maximum changes nothing for typical amounts. It is a pricing knob, not a control: attacker reverts pay no fee anyway. It is documented as a default still to be tuned.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** config.ts:401 (default 0); service.ts:311-313; fees.ts:141-152 (max(gas*1.10, 50 bps)). verify/B5-B/t/griefreserve.test.ts, 100 USDC: at 0.01 gwei the fee is 500000 with bps 0 and with 5000; at 1 gwei it is 500000 vs 643500. Documented: apps/relayer/DEVIATIONS.md 'Permit griefing' (defaults to 0, UNVERIFIED, to be tuned per chain), README Quote pricing, specs/04.
- **Recommended fix:** None for the beta. Before enabling a high-gas chain, require an explicit per-chain griefReserveBps in config and refuse startup on non-testnet chains without it. Avoid a global non-zero default, which would raise every fee.
- **Why deferred:** Pricing default for the owner to tune; no effect on the beta chain.

### L7-I1

**infra/proxy camera policy drift**  
Info · new · Hosting · Fixed in this branch (`c4e3aea`)

- **Finding:** check-headers.sh fails: the infra/proxy Caddyfile and ghostpay-headers.conf still send camera=() while _headers sends camera=(self); 4309eb8 fixed only deploy/nginx. The drift is stricter, so the effect is a broken QR camera on infra-hosted instances, not weaker security. infra/proxy and infra/web lack v2 embed routes and a dotfile deny, but dist has no dotfiles. CI does not run the script (already noted in audit-05 CI-15), yet infra/README.md:9 still says 'Run and passing'.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** bash infra/proxy/check-headers.sh -> 'ERROR: Permissions-Policy differs from _headers' for Caddyfile and ghostpay-headers.conf, exit=1; infra/ and apps/ are unchanged since 9ce5614. infra/proxy/Caddyfile:71, nginx.conf:51 and infra/web/Caddyfile.static:37 have only a v1 route and no dotfile rule; deploy/nginx/nginx.conf:56,83 have both. embedHeaders.test.ts checks deploy/nginx only; no workflow calls check-headers.sh. CONSOLIDATION_2026-10-28.md:31,90.
- **Recommended fix:** Set camera=(self) in the infra/proxy Caddyfile, ghostpay-headers.conf and infra/web/Caddyfile.static. Add /ghostpay-embed-v2.js routes (CORP cross-origin, max-age=3600) and a dotfile deny. Extend check-headers.sh to cover Caddyfile.static and run it in the secrets-and-egress CI job.

### L8-01

**Dev pool ceremony makes proofs forgeable (testnet only, accepted)**  
Info · known-accepted · Packages (preserved) · Accepted by design

- **Finding:** Real and by design: the beacon-only dev ceremony makes withdraw/ragequit proofs forgeable. Not shipped: pool-circuits and pool-contracts are outside the web and relayer closures, and the pool/registry constructors revert except on 31337 (no mainnet WETH9), 11155111 and 84532, so only valueless testnet pools can exist. DeployPool also needs ACK_INSECURE_DEV_CEREMONY. Shipped risk Info; Critical if these verifiers ever guard value. Owner-accepted (PC-01, C-1, D-4).
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** transcript.txt:3-5 'toxic waste is PUBLIC'; PoolConstants.sol:39-42; GhostPayShieldedPool.sol:98 and GhostPayAssociationSetRegistry.sol:37 WrongChain; DeployPool.s.sol:43-48. privacy-specs/audit-pool-circuits.md:41 PC-01 'Accepted / documented'; audit-pool-contracts.md:29 C-1 'Accepted, guarded'; pool-circuits/DEVIATIONS.md:9 D-4; audits/05-full-audit.md:450. graph.mjs: no pool-* in web/relayer closure; dist grep groth16=0.
- **Recommended fix:** None needed for beta. Before any value-bearing chain: phase 1 from Perpetual Powers of Tau and a public multi-party phase 2, plus a circuit audit. Keep isAllowedChain. Make DeployPool refuse verifiers whose vkey hash matches the committed dev SHA256SUMS. Add the pool and circuit contracts to CI and release gating (SUPPLY-CHAIN-CI-04).

### L8-02

**Plugin hooks run in the host realm (not wired)**  
Info · known-open · Packages (preserved) · Open (deferred)

- **Finding:** Repro confirms hooks run in the host realm. A plugin with no network grant called global fetch with a realm secret and kept running after TIMEOUT. Not shipped: nothing imports @ghostpay/plugin-api, there is no loader, and the bundle has 0 hits. Shipped risk Info. If wired into the web app: High with third-party plugins (key exfiltration via connect-src https:), Low with reviewed static first-party plugins. The limit is documented; isolation is still open.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** verify/B11-B/l8-02-plugin-escape.mjs: ctx.network absent, failures=[TIMEOUT], global fetch got attacker.example/x (body=secret) and /after-timeout. registry.ts:307-331 Promise.race, no cancel; sandbox.ts:114-115. Importers outside the package: package-lock only. wiring/plugin-api.md:29-33 'Hard isolation (recommended before third-party plugins)'. Self-audit 'Not a JS sandbox' (7575694) was dropped in 84c2c18, so '(see audit)' dangles.
- **Recommended fix:** None for beta. Before third-party plugins: run hooks in a dedicated Worker or a sandboxed iframe without allow-same-origin. Use a message-passing shim, terminate the worker on timeout, and set the worker CSP connect-src to the granted hosts only. Until then, allow only reviewed first-party static plugins, and restore the self-audit doc.
- **Why deferred:** Preserved package with no importer; must be sandboxed before any wiring.

### L8-03

**Payjoin stores are memory-only (not wired)**  
Info · known-open · Packages (preserved) · Open (deferred)

- **Finding:** Code matches: only Memory* stores exist, and the session checks seen.has then later seen.add, with a per-process in-flight set. A restart or a second process therefore reopens BIP-78 probing and re-entrancy. The host must pass a store, and docs mark Memory* test-only. Not shipped: btc-payjoin has no importer in any app or package. Shipped risk Info. A non-interactive receiver hosted on the memory store would be a Medium privacy leak (UTXO probing), not fund loss.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** seen.ts:5-6 'Production implementations MUST persist', :13 'Tests and single-process dev only'; session.ts:52-56; checks.ts:125. Importers outside the package: package-lock only. privacy-specs/audit-btc-payjoin.md:31 PJ-01 (High for non-interactive hosting, Open) and :36 PJ-06 (Open); audits/05/bitcoin.md:124 'open, as documented'; btc-payjoin/DEVIATIONS.md:23.
- **Recommended fix:** None for beta. Before hosting a receiver: use a persistent store with an atomic addIfAbsent(outpoints) in place of has() then add(). Move Memory* to a test-only export, and have ReceiverSession refuse non-interactive mode unless the store declares persistence.
- **Why deferred:** Preserved package with no importer; needs a durable store before any use.

### L8-05

**Payjoin URL check accepts private hosts (not wired)**  
Info · known-open · Packages (preserved) · Open (deferred)

- **Finding:** Confirmed: validatePjUrl accepts https to any host, including private and link-local IP literals, and http to loopback on any port. The impact is smaller than stated. Plain-http metadata (169.254.169.254) is rejected, and https to an internal IP needs a valid cert. The real vector is a blind POST of the sender's PSBT to loopback, which is BITCOIN-08. Not shipped: no importer, and the web BTC view has no payjoin. Shipped risk Info; Low for a server-side sender handling untrusted URIs.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** verify/B11-B/l8-05-pjurl.mjs: accepts https://169.254.169.254/, https://10.0.0.5:8443/admin, https://[fd00::1]/, http://127.0.0.1:2375/..., http://localhost:6379/; rejects http://10.0.0.5/pj and http://169.254.169.254/. uri.ts:38-40,98-115; v1-http.ts:159-173 (redirect:'error', 30 s timeout, injectable fetch). audits/05/bitcoin.md:108-112 BITCOIN-08. Web src grep payjoin|pj= returns nothing.
- **Recommended fix:** Allow http loopback only when the network is regtest (BITCOIN-08). Outside regtest, reject IP-literal hosts that are not global unicast. Do not resolve DNS in the library. Server-side hosts must inject an egress-filtering fetch through the existing V1HttpOptions.fetch hook.
- **Why deferred:** Preserved package with no importer (BITCOIN-08).

### L8-06

**Pool relayer key stays in /proc environ**  
Info · known-accepted · Packages (preserved) · Accepted by design

- **Finding:** Confirmed by repro: deleting the key from process.env does not scrub /proc/<pid>/environ, so POOL_RELAYER_KEY stays readable by the same uid, root and orchestrators. The README's 'removed from process.env' overstates the scrub. The Hardhat DEPLOYER_PRIVATE_KEY is a standard Sepolia-only pattern, and rpcUrl is operator config, not attacker input. Not shipped: there is no deploy recipe for pool-relayer, and keys are testnet-only. Shipped Info; Low if enabled. Accepted as PS-08.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** verify/B11-B/l8-06-environ.mjs: after delete, 'in process.env' is false but /proc/self/environ still holds the key. pool-relayer main.ts:27-30, README.md:16; confidential-contracts/hardhat.config.ts:20-21. Grep of Dockerfile, compose, .service, *.sh and workflows for pool-relayer finds nothing. privacy-specs/audit-pool-sdk.md:31 PS-08 'Use a key with testnet funds only. | Accepted'. The shipped relayer uses RELAYER_KEY_FILE (secrets.ts:48-59).
- **Recommended fix:** Add POOL_RELAYER_KEY_FILE using the apps/relayer secrets loader (regular file, no symlink, 0600, owner check) and prefer it to the env var. Fix the README wording. For Hardhat, use an encrypted keystore or a hardware signer instead of a raw env key.

### L8-07

**Pool SDK backup KDF weaker; import trusts logN up to 20**  
Info · known-open · Packages (preserved) · Open (deferred)

- **Finding:** Confirmed. Export uses scrypt N=2^15 and an 8-character minimum, weaker than the shipped keystore (2^17, 14 characters, import cap 2^18). Import trusts the blob's logN up to 20: about 6.5 s synchronous and 970 MiB RSS in Node, worse in a mobile tab. Exploiting it needs an attacker-supplied backup (self-DoS) or a leaked blob for offline guessing. Not shipped: pool-sdk is used only by pool-relayer. Shipped Info; Low if enabled.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** verify/B11-B/l8-07-scrypt-dos.mjs on pool-sdk/dist: logN=15 took 191 ms/34 MiB; logN=20 took 6460 ms/969 MiB, then STORE_CORRUPT; logN=21 was rejected. store.ts:119-121,143-144 (sync scrypt; default maxmem admits 2^30+1KiB). Compare web keystore.ts:30-38 (N=2^17, MAX_N 2^18, min passphrase 14, maxmem 2^29). privacy-specs/audit-pool-sdk.md:33 PS-10 Open; the DoS mirrors WEB-APP-11/S3-13.
- **Recommended fix:** Reuse the web keystore profile. Export with N=2^17, r=8, p=1, a passphrase of at least 14 characters and NFKC. On import accept only logN in [14,18], pass maxmem 2^29, use scryptAsync, and bind v, logN and salt in the AES-GCM AAD.
- **Why deferred:** Preserved package used only by pool-relayer (not shipped).

### L8-08

**payer-sponsor drains oversized bodies**  
Info · new · Packages (preserved) · Open (deferred)

- **Finding:** Confirmed. Over-limit bodies are drained to the end instead of closing the connection: 64 MiB was accepted against a 1 KiB cap. Node defaults apply (60 s headersTimeout, 300 s requestTimeout, no maxConnections), and there is no nosniff header. Memory stays bounded and the default bind is loopback. Not shipped: payer-sponsor has no process entry point and no deploy recipe. Shipped Info; Low if exposed (connection and bandwidth exhaustion). Not documented.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** verify/B11-B/l8-08-sponsor-http.mjs on payer-sponsor/dist: headersTimeout 60000, requestTimeout 300000, maxConnections undefined; 64 MiB streamed before the 413; only content-type and cache-control headers. http.ts:116-141. Contrast pool-relayer/src/server.ts:26,99-102 (nosniff, 10 s/120 s, 1024). wiring/payer-sponsor.md:50 'There is no process entry point'. startHttpServer is called only in http.test.ts.
- **Recommended fix:** When the body exceeds maxBodyBytes, answer 413 with Connection: close and call req.destroy(). Set headersTimeout=10_000, requestTimeout=15_000, maxConnections and keepAliveTimeout as pool-relayer does. Add X-Content-Type-Options: nosniff.
- **Why deferred:** Preserved package with no entry point or deploy recipe.

### L8-09

**Test-only self-signed key in net-harness (accepted)**  
Info · known-accepted · Packages (preserved) · Accepted by design

- **Finding:** Confirmed but benign. The exported PKCS8 key belongs to a self-signed cert for rpc/relay/gateway.example.test (reserved .test TLD), valid to 2126. Only net-harness's own test client trusts it. net-harness is private and only a devDependency of net-transport, its dist is gitignored, and no PRIVATE KEY string appears in the web or relayer bundles. Owner-accepted as H3. Info.
- **Evidence (scratch reproductions and code locations; reproductions are not committed):** tlsFixture.ts:1-30; index.ts:13; httpEcho.ts:84,91 (the only ca: user). openssl: CN=rpc.example.test, CA:TRUE, Not After Sep 27 2126. Grep for 'PRIVATE KEY' in apps/web/dist and apps/relayer/dist finds nothing; net-transport/package.json:34 lists it as a devDependency. scan-secrets.sh:16-18 excludes **/test/**. privacy-specs/audit-net-harness.md:15 H3 'Accepted ... convention, not enforced'.
- **Recommended fix:** None required. Optional: export TEST_TLS_* only from a test-only subpath instead of the root index, so production code cannot import it by accident.
