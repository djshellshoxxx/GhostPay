# Completion gates

## Current product snapshot — 2026-11-09

The current review stack is **#84 → #88 → #89 → #90**. `main` remains
`14f9b2673ac25c7ec60a0a3a78eb17e2c7acf44d`; the application consolidation has not been merged.
The older migration evidence below applies only to its named historical commits. It does not qualify this stack.
See the [current source ledger](../handoffs/SOURCE_FOLLOWUP_2026-11-09.md) for source heads,
ancestry, review dispositions and the [Sonar access/result follow-up](SONAR_FOLLOWUP_2026-11-09.md).

The previous gap list was stale: seller public-config pairing, Settings/Registry QR exchange, encrypted local
invoice matching, and receipt archival already existed in #88. This continuation checks and hardens their remaining
boundaries rather than introducing duplicate implementations. The [PR #90 handoff](../handoffs/POLICY_LOCALIZATION_CONTINUATION_2026-11-09.md)
records final runtime-qualified head `42ae712f5804724b4213bed4e2e0cb129f855abf`, successful CI/Hosting/Integration,
2,188 hosted web passes plus one separately passed live-Core test, and full/lean browser results
(60/52 passes; one opposite-profile skip each). Local interrupted aggregate commands are not counted as passes.

| Feature | Implemented behavior and current limits |
| --- | --- |
| Seller/device QR exchange | Strict bounded public configuration, public-key comparison, Settings preview/apply and Registry meta-address export/import exist. The continuation rejects unsupported pairing chains and invalidates stale camera/file/settings/registry previews, including repeat imports. These flows do not transfer secrets or authenticate seller identity. See [public device exchange](../user/public-device-exchange.md). |
| Reconciliation and receipt archive | Opt-in invoice registration and an encrypted seller/chain-scoped vault propose matches and require confirmation. Receipt signatures never count as payment evidence. The continuation rechecks scan identity inside the storage transaction, includes unsaved competing observations, checks announcement recipients, and treats observations first recorded at/after invoice expiry as ambiguous. See [ADR-0026](../adr/ADR-0026-local-reconciliation-and-receipt-archive.md) and the [user guide](../user/reconciliation-and-receipts.md). |
| Localization | PR #90 adds ledger/static errors, current-language descriptor rendering, passphrase/sweep guards, navigation and QR copy: 430 keys, including 414 deliberately English security messages. Catalog check: 0 errors, 2,013 warnings; extraction: 0 missing. Dynamic post-broadcast/permit outcome modeling and native review remain open; no locale was promoted. |
| Policy accounts / scheme 2 | PR #90 validates code identity/linked deployment, isolated direct native/ERC-20 payment evidence, canonical withdrawal history and durable cross-tab submission guards. The feature remains disabled/testnet-only, production pins empty, and ordinary receipt/reconciliation status isolated. Accepted deployment-bound request/record formats, other execution variants, complete browser lifecycle and lost-key recovery remain open; see [ADR-0027](../adr/ADR-0027-policy-end-to-end-gates.md) and unaccepted [ADR-0028](../adr/ADR-0028-policy-recovery-authority-model.md). |
| Scanner privacy estimate | The continuation uses the latest reachable provider head rather than an obsolete highest head; budget-limited scans still disclose partial counts. This is a local announcement-volume heuristic, not a privacy guarantee. |

No contracts, manifests, trust roots, release settings, fee policy or API-funded workflows are enabled by this work.
No current source branch is deleted or merged into `main`. Current validation belongs to the continuation handoff
and draft PR; historical green runs below are not current-head evidence.

### Remaining product and owner gates

- Accept the recovery authority model before any contract implementation; obtain authorized deployment/asset pins,
  finish versioned request/record identity and unsupported execution variants, and qualify the complete policy
  lifecycle before enabling scheme 2. An announcement match alone remains insufficient payment evidence.
- Preserve the real local PP/Railgun/sponsor and Bitcoin fixture evidence. Internal pool witness and ceremony-dependent
  tests remain a separate unqualified scope; no trusted setup was regenerated.
- Finish remaining application-wide literal-copy coverage and native review of every shipped locale. Security
  translations are deliberately held on the reviewed-English path.
- Resolve or review the actual Sonar security issue causing #84's D rating. Retrieved GitHub annotations alone do
  not establish the cause; do not suppress or lower the quality gate.
- Decide API-funded automation PRs #79/#82/#51/#52 separately. The existing invalid `openai-agents.yml` fragment
  is unchanged. Draft feature PRs do not enable that automation.
- Complete external deployment, custody, release signing, funded-wallet/device, professional audit and launch
  gates listed below. Code and local tests cannot supply those external decisions or evidence.

## Historical migration and automated-validation gates

**Closed for the promoted source tree.** Audit 22 records candidate `c206655ebfa747b3dd56b1dc9f4e7f16e641a833`, promotion merge `5795857d9e366cc9a4304c6afa9b03365e7c1844`, successful uncancelled CI and Integration runs, zero candidate/worktree and promoted runtime-tree differences, and every authored remote source tip as an ancestor of `main`. Audit 19 and the source inventory/ledger provide path-level dispositions; generated `gh-pages` output and historical `.source` harnesses are not product source or current test evidence.

Audit 22 records the final gates: hosted workspace typecheck, lint, dependency-ordered build and production dependency audit; 630 web tests and web coverage at 92.29% statements / 87.24% branches / 91.45% functions / 95.46% lines; Playwright 17/17; all 29 imported package suites (2,253 tests / 128 files); invoice/core/BTC/chain adapter counts of 626/55/353/332; relayer/guard counts of 248/146; main/pool/payer contract counts of 411/86/108; confidential contract suite 46; EVM, Bitcoin and Solana integration results; local Bitcoin regtest and PayJoin checks; and 13 operator-script tests. The ordinary web suite skips one live-Bitcoin test; audit 22 records its independent real-regtest execution. The stopped duplicate local coverage run is not counted as a pass. Optional upstream research-pool integrations retain explicit contract/circuit fixture gates.

## Security and release gates

Audits 09, 17, 20 and 21 document scoped findings, fixes and regressions. Audit 17 closes the reviewed PayJoin prevout-trust, duplicate Solana memo, bounded paymaster-field, pool relayer gas-grief, scanner availability/checkpoint, post-broadcast duplicate-send and other specific triggers. Audits 20 and 21 close the named scan-evidence and stale payment/receipt races. Audit 22 records final security review and hosted gates. These reviews are extensive automated and AI-assisted checks, not an independent professional audit or a security guarantee.

### Before any real or valuable testnet funds

- [ ] Establish deployer and fee-recipient custody, deploy and verify testnet contracts, publish verified manifests and source, select independent RPC/provider arrangements, and complete an operator rehearsal. Repository tests do not establish these external facts.
- [ ] Supply the production release-signing trust root and real release/deployment evidence. The code checks bundled manifest signatures and reads deployments back on-chain before sensitive use; real production keys, deployments and source verification remain external prerequisites.
- [ ] Complete funded wallet and device workflows against the intended deployments, including supported mobile/browser combinations. Local regression and browser suites do not replace operating with funded keys on target devices.

### Before mainnet or public launch

- [ ] Obtain an independent professional security audit of contracts, cryptography and web code; triage and close its findings. AI-assisted reviews are not a substitute.
- [ ] Complete the real trusted-setup ceremony and verify resulting artifacts before any verifier holds value. Development-ceremony pool artifacts must never secure valuable funds.
- [ ] Address or explicitly accept the remaining provider privacy disclosures: Bitcoin spentness checks reveal matched outpoints to the configured Esplora provider; EVM token and receipt queries can reveal matched recipients/transactions to configured RPC providers. Current UI disclosures do not provide unlinkability. See audit 17.
- [ ] Run and report any release-required tools that are not current evidence. Audit 22 explicitly does not claim Mythril or mutation-testing success; historical outputs are not current results. Apply any applicable tool to the promoted snapshot and document limits.
- [ ] Verify chain, token and feed data from authoritative sources with dated evidence; populate feeds only after verification and keep unready mainnets disabled.
- [ ] Complete human review for accessibility, native-language quality, cross-browser/device behavior, and launch scope/legal decisions.

## Scope boundaries

Solana, Tron, Bitcoin and experimental EVM extensions require their own deployment, privacy and adversarial-use gates. Optional research-pool integrations remain fixture-gated. Signed receipts establish control of a key and consistency of signed fields, not seller identity or independent on-chain payment. A green hosted build or merged source does not satisfy deployment, custody, trusted setup, professional audit or user-device gates.

## Evidence standard

For each future gate, record the promoted commit, relevant implementation and test paths, command and result, skipped or unavailable coverage, and reviewer/owner. Security fixes need regressions for the reported exploit mechanism. Deployment or external gates need verifiable chain, release, audit or accountable sign-off evidence. Do not infer closure from ancestry, merged filenames, partial jobs, or reports against older snapshots.
