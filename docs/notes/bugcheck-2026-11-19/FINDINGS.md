# Confirmed unresolved findings

Branch names refer to the exact commits in [COVERAGE.md](COVERAGE.md), not moving remote branch names. **P2 = medium priority; P3 = low priority.** Priorities reflect the supported caller and observed effect. No P0/P1 finding was established in this audit. Source confirmation is distinguished from an executed regression; an API defect is not automatically a current browser defect.

## Findings index

| ID | Priority | Issue | Affected source | Evidence and full explanation |
|---|---|---|---|---|
| GP-BUG-01 | P2 | A newly signed receipt inherits an older receipt's archived state; its archive button stays disabled. | Main, integration, privacy | Integration local regression; [COMP-OPEN-01](details/components.md) |
| GP-BUG-02 | P2 | Global bill print CSS hides the printable receipt. | Main, integration, privacy; core/lean | Independently source-confirmed cascade; [UI verification §1](details/independent-ui-verification.md) |
| GP-BUG-03 | P2 | Tags from the old chain remain visible after selecting another chain. | Main, integration, privacy; core | Local regressions on both main and integration; [browser state](details/browser-state.md) |
| GP-BUG-04 | P2 | Importing selected preferences erases unrelated unsaved settings, including an RPC draft. | Integration and privacy; main comparison passes | Local comparison and independent privacy source review; [browser state](details/browser-state.md) |
| GP-BUG-05 | P2 | Privacy wallet history never receives the connected wallet from any production caller, hiding history and its clear control. | Privacy only; Pay/Registry plus optional Policy | All four callers traced; [UI verification §2](details/independent-ui-verification.md) |
| GP-BUG-06 | P2 | Destination-reuse advisory silently fails on five supported EVM testnets. | Integration and privacy; main lacks feature | Seven-network local check: two controls pass, five expected warnings absent; [CC-01](details/chain-contracts.md) |
| GP-BUG-07 | P2, latent | Editing a policy payment clears its visible review but does not revoke a pending asynchronous send. | Main/integration; experimental full profile, no production policy pins | Local mock wallet/RPC regression; [MV-02](details/multichain-views.md) |
| GP-BUG-08 | P3 | Importing another seller's policy record with equal terms is silently discarded while feedback implies success. | Main/integration; experimental full profile | Local React regression; [MV-01](details/multichain-views.md) |
| GP-BUG-09 | P3 | Solana, Bitcoin and TRON URI builders can emit strings rejected by their own 2,048-character parser limit. | Main/integration; exported API, long-metadata UI path not established | Benign encoded-text checks; [CP-01](details/core-packages.md) |
| GP-BUG-10 | P3 | Finishing an address-book password change after lock restores key context and contradictory unlocked state. | Main/integration; standalone API, not web `/portable` session | In-memory rekey check; [CP-02](details/core-packages.md) |
| GP-BUG-11 | P3 | Hygiene helpers do not bind returned logs to the requested token/range or preserve event identity for deduplication. | Main/integration; exported PoC APIs, no current web caller | Source and ordinary fixture trace; [CC-02](details/chain-contracts.md) |
| GP-BUG-12 | P3 | Bitcoin fee normalization can return below its configured minimum when the cap conflicts with it. | Main/integration; exported helper, no current web caller | Pure-function check; [CC-03](details/chain-contracts.md) |
| GP-BUG-13 | P3 | TRON scan iterator yields more buffered results after cancellation. | Main/integration; direct API, timing-dependent optional UI relevance | In-memory two-payment check on both pins; [MC-01](details/multichain-packages.md) |
| GP-BUG-14 | P3 | Successful no-opener popups get a false popup-blocked title/tooltip. | Main/integration/privacy; embed v2, excluded lean | Source plus HTML Standard; [UI verification §3](details/independent-ui-verification.md) |
| GP-BUG-15 | P3, existing | TRON's guard rejects mainnet but never verifies the selected Nile/Shasta testnet. | Main/integration; optional full profile | Existing TRON-4 traced; [MV-03](details/multichain-views.md) |
| GP-BUG-16 | P2, existing conditional | Nonzero policy-factory fees retain fee-token-dependent account-deployment liveness. | Main/integration; conditional contract configuration | Existing P7/R7/R8/N1 residual; [CC-K01](details/chain-contracts.md) |
| GP-BUG-17 | P3 | Bitcoin sweep preview accepts a valid silent-payment address from the wrong network, although the signing path rejects it. | Main/integration; exported API, browser validates first | Pure public-address check; [BTC-SPEND-API-1](details/bitcoin-spend.md) |

Fifteen findings are newly confirmed by this audit. GP-BUG-15 and GP-BUG-16 are previously documented open issues that remain present. The contract item does not assert a live deployment or approve a deployment decision. Findings in unchanged package/full-profile source also carry through the privacy snapshot where the relevant blobs match integration; the table foregrounds the two complete baseline reviews.

## Fix ordering

First address receipt archive identity and print output, scope the tags list correctly, preserve unselected settings drafts, and wire wallet history into the privacy feature. Align destination history's chain policy with all seven supported testnets. Add the concrete regressions described in each report.

The policy send issue requires a review/form generation checked before wallet operations; removing the visible review alone is insufficient. Keep it qualified as an experimental-flow defect until that feature has an approved deployment. Correct the API-only issues before those APIs gain wider callers.

## Existing fixes are separate dispositions

[RESOLVED-DIFFERENCES.md](RESOLVED-DIFFERENCES.md) records main defects corrected in newer reviewed source, plus two focused fixes newer than the integration snapshot. Do not count them as unresolved regressions in a head containing the correction. The privacy branch lacks some fixes already in integration; that merge risk is listed there.

## Evidence limits

Every finding includes a source contract and concrete impact. Mock-wallet checks never submitted a network transaction. Static findings are not labeled runtime reproductions. Selected passing tests, source review and builds do not establish exhaustive race coverage, cryptographic certification or release qualification. [VALIDATION.md](VALIDATION.md) preserves the timeout and incomplete checks as such.
