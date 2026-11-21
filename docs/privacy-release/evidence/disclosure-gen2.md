# External wallet disclosure — independent generation 2

## Source and checkpoint

- Feature/spec: `v11-03-wallet-disclosure`, v1.1 Beta; the specification precedes implementation.
- Worker: `/root/disclosure_gen2`.
- Branch: `privacy/v11-wallet-disclosure-20261120`.
- Worktree: `/workspace/scratch/dc1ef37f4621/privacy-disclosure`.
- Released predecessor: `7052b217ba4ac8ee8247371acd3429de7ff7d295`; predecessor runtime: `15e14ba2f3e3ee45f49f6c14cf984776cf68e92b`.
- Ownership: `2116eafa` in `docs/ai/ACTIVE_WORK.md`.
- Frozen generation-2 source: `a3099a0bd26a2da055932f604f06c5bb2671542b`.
- Frozen source tree: `46a7bef86d000da69a8a0ff3a8c644b086c64958`.

**M2 implementation and independent focused review checkpoint reached:** 18 complete files and 249 tests pass, with no skips. The browser acceptance case is authored but unexecuted. Full combined-source release qualification remains open. This evidence commit changes documentation/logs only; its parent is the frozen tested source above.

## Changes and independent review

### Explicit consent in the existing application journeys

The original Pay, Registry and Policy UI fixtures now make a real, explicit decision for each wallet request. The shared `src/test/walletDisclosure.ts` helper verifies the method on the actual disclosure dialog and clicks Continue once. It does not replace the production gate, globally approve requests, poll for future dialogs, or change `renderApp`.

The fixture census also includes Pay localization, signer-authority races, AppShell privacy/network authority, and PolicyReceive regressions. ERC-20 approval and payment remain separate decisions; typed permits and wrong-network switches use their respective method decisions. Tests that reject before disclosure do not invent an approval. The original owner-action test was split into independent cancel/request/execute cases so each case starts with a current wallet session while preserving all three no-extra-send assertions.

The complete original UI fixture set on this branch is:

- `src/views/Pay.test.tsx`, `Pay.i18n.test.tsx`, and `Pay.signer.test.tsx`.
- `src/AppShell.privacy.test.tsx`.
- `src/features/registry/RegistryView.test.tsx` and `RegistryView.i18n.test.tsx`.
- `src/features/policy/PolicyView.test.tsx`, `PolicyView.more.test.tsx`, `PolicyView.scope.test.tsx`, `PolicyView.network.test.tsx`, `PolicyView.guard.test.tsx`, and `PolicyReceive.regression.test.tsx`.

A source census found exactly three production `connectWallet` callers: Pay, Registry and Policy. Each injects the mandatory context gate. Preserve the fifth options argument when combining the independent v1 wallet-lifecycle implementation; the v1 branch must remain usable without any v1.1 module dependency.

### Concrete fixes

**Draft catalogs and security classification.** The Spanish, Japanese and Arabic catalogs now explicitly contain all 23 disclosure keys as English draft fallback text, including the new domain-chain label. Exhaustive classification still requires every English key to belong to exactly one policy category. The consent-boundary test explicitly requires every disclosure key to remain security-critical. These are not reviewed translations.

**Typed-data domain chain.** The signature summary now separately displays the chain actually specified by the typed-data domain. The selected wallet chain and signed domain chain can differ, so one must not stand in for the other. Safe nonnegative integer, canonical decimal-string and bounded hexadecimal forms normalize to a decimal display; unavailable, malformed and out-of-range values remain unknown. The preview retains the original typed-data JSON bytes unchanged. Tests cover a domain chain of 1 with a selected wallet chain of 84532 and unchanged outbound parameters.

**Connected wallet after a visual preference change.** The original disclosure scope included the entire settings-object identity. Turning privacy mode on and revealing details therefore invalidated an established wallet session's captured gate permanently, even though the operation's execution settings and wallet were unchanged. The isolated connected-but-not-prepared regression failed at the expected transaction dialog before the fix. `AppShell` now derives the disclosure scope from the existing `sameExecutionSettings` boundary. Hiding still cancels a pending prompt/grant; after a deliberate reveal, the same connected wallet may request a fresh disclosure. Execution settings, route/session and network changes retain revocation. No new RPC or storage read was added.

**Account-scoped attempt presentation dependency.** The full original UI runs exposed four pre-existing `WalletAttempts` call sites missing their connected-wallet prop. The dedicated independent history team reproduced and fixed that issue in `4cc9026f4e9ee27905da70f75b0b8487f8f14a2b`. This branch carries the exact runtime repair as cherry-pick `4109c034`. Root must also carry the original fix into standalone v1 and reconcile the duplicate patch ancestry. The history team's tests and evidence remain theirs; they are not counted as this branch's current-source evidence.

### Retained boundaries

Review and focused checks cover immutable request/attempt snapshots, bounded lossless request rendering, unknown fields, the missing-host refusal, cancelled/expired/stale grants, concurrency, privacy concealment, focus and background inertness, provider-event cancellation, and post-await authority checks. Wallet reads remain after disclosure approval, and cancelling a disclosure occurs before duplicate-journal mutation. Returned transaction hashes and uncertain initiated requests retain their existing outcome/journal handling. This generation makes no cryptographic, fee, contract, transaction-wire, dependency or network-topology change.

## Browser acceptance authored

`e2e/wallet-disclosure.spec.ts` exercises the real App shell with the existing authored EIP-6963 wallet and mock-network fixtures. The shared wallet fixture was extracted from `flows.spec.ts` without changing its existing behavior; a recorded method list supports no-extra-call assertions.

The new case checks account-access cancellation with zero wallet requests, one explicit account approval, exact native-payment request bytes, cancellation with no send or journal write, quick-hide removal and safe focus, then fresh disclosure and exactly one submitted request equal to the reviewed bytes. It invokes the existing axe audit with all rules intact and retains its metadata. The audit helper's navigation lookup includes hidden elements only to read route metadata while the modal makes the background inert; this does not alter axe's document input or rules.

**This browser case has not been executed by this worker.** The original Playwright build, postbuild CSP/bundle gates and configuration are unchanged. Original broader `flows.spec.ts` journeys still need explicit disclosure decisions on the combined v1.1 source. Browser launch, responsive checks and real extension behavior remain open, as do the other full release gates below.

## Verification

The final focused run uses the original Vitest configuration, a 1,024 MiB Node heap and one worker. It runs complete files without a name filter; `--coverage=false` is explicitly a focused run, not a replacement for the original coverage gates. Locked dependencies and source-aligned workspace builds were supplied by root. No package installation or lockfile change occurred here.

From `apps/web`:

```sh
NODE_OPTIONS=--max-old-space-size=1024 ../../node_modules/.bin/vitest run \
  src/lib/walletDisclosure.test.ts src/lib/wallet.disclosure.test.ts \
  src/lib/wallet.test.ts src/lib/walletJournal.test.ts \
  src/components/WalletDisclosure.test.tsx src/i18n/securityKeys.test.ts \
  src/views/Pay.test.tsx src/views/Pay.i18n.test.tsx src/views/Pay.signer.test.tsx \
  src/AppShell.privacy.test.tsx \
  src/features/registry/RegistryView.test.tsx src/features/registry/RegistryView.i18n.test.tsx \
  src/features/policy/PolicyView.test.tsx src/features/policy/PolicyView.more.test.tsx \
  src/features/policy/PolicyView.scope.test.tsx src/features/policy/PolicyView.network.test.tsx \
  src/features/policy/PolicyView.guard.test.tsx src/features/policy/PolicyReceive.regression.test.tsx \
  --coverage=false --maxWorkers=1
```

Final result: **exit 0; 18 files passed; 249 tests passed; zero skips; 81.57 seconds**. The log retains one JSDOM `Not implemented: navigation to another Document` message; it did not fail or skip a test. No test or configuration was changed to suppress it.

Earlier source-pinned evidence is preserved in `disclosure-gen2/`. Each gzip contains the exact original log bytes; `runs.json` gives full source hashes, exit codes, and SHA-256 hashes for both compressed and original bytes. Logs with filtered tests record those skips honestly.

| Source | Run | Actual result |
| --- | --- | --- |
| `5e70ab0a` | Catalog test filtered to `explicit draft entries` | Exit 1; 1 failed, 12 filtered. Missing fallback entries reproduced. |
| `9d0b3357` | Complete `securityKeys.test.ts` | Exit 0; 13 passed. |
| `999d5abd` | Complete original `Pay.test.tsx` | Exit 1; 65 passed, 1 failed. Missing wallet prop in attempt history. |
| `b4b77615` | Seven complete original Registry/PolicyView files | Exit 1; 54 passed, 6 failed. Four history-prop failures and two fixture authority/order assumptions. |
| `ced33b84` | Policy guard/network cases filtered to owner actions and queued deployment lock | Exit 0; 4 passed, 14 filtered. |
| `bd1c0cbc` | Pure descriptor tests filtered to domain chain | Exit 1; 3 failed, 1 passed, 20 filtered. |
| `10f0a743` | Complete descriptor and classification files | Exit 0; 37 passed in 2 files. |
| `47b2a44b` | Initial prepared-payment privacy fixture | Exit 1; 1 failed, 66 filtered. Independently owned prepared-context invalidation blocked the fixture before disclosure. |
| `4b5f5291` | Same prepared-payment fixture after initial scope fix | Exit 1; 1 failed, 66 filtered. The log's historical `privacy-green` filename does not indicate success. |
| `76f05164` | Intermediate prepared-payment fixture | Exit 1; 1 failed, 66 filtered. Still blocked before isolating disclosure. |
| `ac8e167d` | Connected-but-not-prepared privacy regression | Exit 1; 1 failed, 66 filtered. Exact fresh disclosure was missing after reveal. |
| `09700a7b` | Same isolated regression after execution-settings scope fix | Exit 0; 1 passed, 66 filtered. |

Supporting commands at the frozen source: `git diff --check` exits 0; `bash scripts/scan-secrets.sh` exits 0 with no committed environment files or key material found.

## Research and reuse

The M0 candidate inventory (`docs/privacy-release/REUSE.md`) and predecessor's GitHub/license review remain the reuse record. This generation copies no external repository code and introduces no dependency. It reuses the existing execution-settings comparator, privacy and session boundaries, duplicate-attempt journal, strict translation policy, test wallet/network fixture, and axe helper. New consent helpers, regression cases, domain-chain summary and browser case are locally authored.

## Open integration and next independent generation

Internal successor task; keep worker prompts out of the user-facing response. Begin from the frozen source and current branch head, claim ownership before editing, and reinspect root's combined candidate rather than assuming these feature branches have already been reconciled.

1. Preserve the fifth `connectWallet` options argument and carried session gate while merging v1's account/chain/disconnect/app-lock/connection-operation guards. Root owns this shared-file reconciliation. Preserve wallet generation 2's updated Policy fixture behavior: lock/session replacement immediately removes the old deployment/controls; a fresh send requires reverify, reconnect, fresh review and explicit disclosure.
2. Adapt the newly introduced combined-only fixtures using `approveWalletDisclosure(user, method)`: `Pay.addressReuse.test.tsx`, `WalletPrivacy.lifecycle.test.tsx`, the history team's `RegistryView.history.test.tsx`, and masking generation 2's `Pay.masking.test.tsx`. The independent v1 tests stay free of a v1.1 dependency. Retain all original assertions and no-extra-RPC checks.
3. Carry masking generation 2's separate Pay prepared-context repair and AppShell storage-clear masking repair. This branch deliberately does not claim those owned spans. The failed initial privacy fixtures above are preserved as discovery evidence; the final connected regression isolates only the disclosure-scope bug.
4. Run the complete original typecheck, typed lint, build/CSP/bundle checks, coverage/full tests and browser suites on the final combined exact source. Root found a viable 1,280 MiB typecheck heap after larger heaps were killed under the container memory limit; coordinate resource windows. This worker did not run heavy gates during parallel source work.
5. Execute the authored browser case first, then migrate the original browser journeys with explicit decisions at each wallet boundary. Investigate any focus/inert/quick-hide timing failure without weakening the modal or audit. Validate real wallet-extension acceptance of the immutable parameters and preserve returned/uncertain transaction outcomes.
6. Continue only bounded semantic preview improvements with explicit known schemas and no network enrichment. Native wei is not a token amount; arbitrary calldata effects and nested typed-message schemas remain undecoded. Real extension compatibility, manual accessibility/mobile review, reviewed translations, hosted checks and final publication remain open.

After a concrete next milestone, record its exact source/tree, commands/exits, retained failures and next-generation handoff. This feature checkpoint does not authorize a release or establish final combined-source green gates. No push, deployment or remote mutation was performed here.
