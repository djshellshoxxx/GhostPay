# Payment proof preview cleanup — bounded implementation handoff

## Outcome and source

The deliberately shown payment-proof QR and JSON textarea now support explicit preview/cancel/confirm cleanup and an independent, default-off 5/15/60-minute active-app preference. Cleanup closes only that presentation. The original Pay result, context, built transaction, exact transaction reference, receipt copy/download and protected persistent records remain available. **Persistent invoice/transaction retention and terminal-record cleanup remain partial and unimplemented.** This work does not establish transaction finality or release readiness.

| Item | Immutable source |
| --- | --- |
| Canonical v1.1 base | `8c196d12fd45dc5a49a6c1d69f9b5d6c532994e9` |
| Ownership and acceptance before implementation | `a3b8eccdff64cd061de75551d268a26e131fab6b` |
| Tests-only controlled RED | `03b5816e1712efb23c4c674b3ef3de04e4b53012` |
| Runtime and original GREEN | `e075ab049210e7d6788dd4e7f71d196d2bffef8a` |
| Runtime tree | `2a3095a7439c4ff9c6578d3eacd9802a371a2070` |
| Authored browser assertion | `97ffe5b98344c345ab436a5557221e5be4160cb5` |
| Two inherited role-query typing repairs | `638ef16eda8161415a0d4547044af4327cd73367` |
| Strict decoded-download test helper and final proof/Pay execution | `e8b8bd334d6829de3145d350bd7d682c3e771383` |
| Application/fixture tree at that execution | `a5a8fbcc9dc8843538c34e51263ec8791789f56a` |
| Final prerequisite/fixture source; original full typecheck/lint | `b9fd13815d6b3ece0f081dd14c5f3009ca13e12e` |
| Final application/fixture tree | `f2401beadec3a4ea4d511cde7a78c7e7d4b58ff8` |

The isolated branch is `feature/ghostpay-retention-completion-20261120`. The canonical privacy branch, main, other feature worktrees and PR #307 were not modified. Production code and catalogs after `e075ab04` are unchanged at `e8b8bd33`; the intervening application-path deltas are the browser assertion and the two small test-helper repairs recorded below. The final prerequisite commit changes only fixtures, an unused browser type import and wallet event type declarations. Its emitted wallet JavaScript is byte-identical to the canonical base. Documentation checkpoints do not turn predecessor executions into new executions.

## Eligibility and retained authority

The accepted contract is [the payment proof adapter amendment](../v11-04-retention.md#payment-proof-preview-adapter-acceptance). Source review identified only one production caller: Pay's completed-result block. The child has independently retained parent source and receives no result, phase, wallet, journal, vault or storage mutation handle. Its cleanup callback calls only `setShown(false)`.

Only a deliberately shown proof with current `included` receipt status enrolls. `buildReceipt` uses a successful receipt plus transaction comparison for that status. Status limits which presentation is eligible; it does not prove that any durable record is disposable. Unconfirmed, reverted, unknown and hidden proofs remain outside the adapter. A downgrade removes eligibility while preserving the existing live caution display. A failed explicit Show action does not enroll. If a later live update makes the replacement QR too large, the already shown text remains a disposable projection; cleanup does not revalidate or change the receipt.

Pay supplies a stable source tuple covering result, result context, current context, built payment, session and fragment. Each deliberate Show gets a fresh occurrence token. Replacement or downgrade changes eligibility before the layout-effect cleanup; old registration revisions, confirmation plans and timer identities cannot close a replacement. The hook checks current identity and category immediately before calling the callback.

Receipt rendering stays live. Ordinary rerenders may update receipt timestamps and displayed/exported bytes without restarting the presentation's lifetime. Copy/download use the current props before and after cleanup. No receipt snapshot or sensitive persistent collection was added. Hiding the proof does not change the submitted state or create another Send action.

The earlier protected-store census still applies: saved invoices, payment attempts, Sweep records, recovery authority, duplicate/reorg/tombstone evidence, trust decisions, keys and backups have no new deletion path. A returned hash, age or terminal-looking label does not supply missing field-level eligibility. A redundant Sweep hash notice was inspected and rejected as an inadequate completion target; no Sweep source was changed.

## Reuse and implementation

The existing bounded callback registry, strict preference parser, permitted delays, revision-bound single-use plans and timer lifecycle are reused. A second registry and `ghostpay.proof-preview-retention.v1` preference keep proof consent separate from invoice consent. The existing invoice key, events and default behavior are preserved. A generic presentation hook checks category as well as identity; the existing invoice hook remains its compatibility wrapper. Scoped controls retain cancellation, stale-plan handling and explicit confirmation.

PaymentProofQr contains the narrow presentation adapter; Pay passes the stable source; Settings and the mounted proof expose the separate preference. The new controls describe closing shown previews and preserving original records. Ten keys are present and critically classified in en/es/ja/ar. The non-English entries intentionally follow the predecessor's source-English draft convention; this is catalog coverage, **not completed translation review**.

No dependency, lockfile, fee, protocol, contract, server, deployment or release-gate change was introduced. No external repository implementation was copied. No real user records, wallet or network transaction was used in these controlled tests.

## Executed evidence

The [execution index](retention-proof-preview-20261120/run-index.json) records source, commands/options, exit codes, counts and hashes. The JSON summaries retain per-test results with relative paths; RED summaries retain the first diagnostic line rather than synthetic DOM dumps. The original raw reporter hashes and exact console text are retained. Console logs use JSON wrappers: decode the `text` field as UTF-8 to recover every original byte, including diagnostic trailing whitespace and blank lines. The index records both raw-text and wrapper-file hashes. It explicitly marks normalized earlier invocations and the working-tree policy test; later gate receipts record exact argument arrays.

| Execution | Actual source | Outcome |
| --- | --- | --- |
| New component RED | `03b5816e` | 15 expected missing-control failures, three malformed-policy preservation controls passed; 18 executed, zero skips; exit 1 |
| Actual Pay RED | `03b5816e` | One intended missing-control failure; 67 existing cases excluded by the explicit name filter; exit 1 |
| Shared policy foundation | Working contents immediately committed as `d5a49403` | 17/17 in two complete files; exit 0; overlaps later shared evidence |
| Complete proof component GREEN | `e075ab04` | 18/18, zero skips; exit 0 |
| Existing registry, controls, invoice/merchant adapters and catalogs | `e075ab04` | 53/53 in seven complete files, zero skips; exit 0 |
| Complete Pay GREEN | `e075ab04` | 68/68, zero skips; exit 0 |
| Complete proof and Pay files after test-helper repairs | `e8b8bd33` | 86/86 in two complete files, zero skips; exit 0 |
| Complete AppShell privacy, merchant retention and three wallet files after prerequisites | `b9fd1381` | 78/78 in five complete files, zero skips; exit 0 |
| Playwright full configuration collection | `97ffe5b9` | One existing extended native-payment flow collected; zero tests executed; exit 0 |
| Playwright lean configuration collection | `97ffe5b9` | Same single flow collected; zero tests executed; exit 0 |
| Original full web typecheck, first attempt | `8bb5eff0` | Exit 2: missing local relayer-guard declarations and two inherited unsupported role-query options; no resource failure |
| Existing relayer-guard declaration build | Unchanged canonical package subtree | Exit 0; no source/service edit |
| Original full web typecheck after prerequisites/fixture repair | `638ef16e` | Exit 0, 22.724 seconds |
| Original full web typed lint, first attempt | `638ef16e` | Exit 1, 63.123 seconds: one new fixture string-coercion diagnostic and seven inherited diagnostics; no resource failure |
| Original full web typecheck, final | `b9fd1381` | Exit 0, 22.463 seconds |
| Original full web typed lint, final | `b9fd1381` | Exit 0, 58.094 seconds |
| Original committed-secret scan and feature-range whitespace check | `b9fd1381` | Both exit 0; original script and checks retained |

At `e075ab04`, the three nonoverlapping GREEN selections cover **139 distinct cases in nine complete files**. The policy-foundation run and the later 86-case rerun overlap that set and must not be added to it. The latter rerun verifies the changed proof/Pay fixtures while retaining their original assertions. The other seven tested files and all production code remain unchanged at `e8b8bd33`. The separate 78-case prerequisite selection overlaps the four merchant cases in the original shared selection; it is not an additional nonoverlapping feature count.

Component regressions cover separate opt-in, exact expiry, manual cancellation/confirmation, replacement, same-source timestamp rerenders, fresh Show lifetime, current-status downgrades, failed Show, unmount and denied/malformed preferences. The exact clipboard strings and both decoded downloaded Blobs equal the current receipt JSON before and after cleanup. The actual Pay regression preserves submitted/verified presentation, wallet send calls and exact protected journal bytes; no new Send/Prepare action appears.

All Vitest selections use the repository configuration, `--coverage=false`, `--maxWorkers=1` and a 512 MiB Node heap. These are focused regressions, not a complete coverage pass. Full typecheck and typed lint use the original workspace scripts with a coordinated 1536 MiB heap. Assertions, includes/excludes, lint rules, type rules and release thresholds were not relaxed.

### Original gate diagnostics and fixture repairs

The first compiler attempt reached pre-existing tests importing the relayer workspace, which needed its local `relayer-guard` declarations. The existing package built successfully. Both unsupported `exact: true` role-query options already occur in the canonical base. Installed Testing Library `ByRoleOptions` has no such option; accessible-name filtering already compares a literal string by strict equality. Removing the options preserves names, roles, scoping and assertions. The independent reviewer approved the exact two-line change, and full web typecheck passed afterward.

Full typed lint then found eight errors. Seven occur in canonical code: an unused Page type import in the browser file; two Storage method captures in AppShell privacy tests; two merchant retention fixture diagnostics; and two provider method extractions in the wallet helper. The latter three files were byte-identical to the base at that failed run. The new proof fixture's `String(reader.result)` was replaced with an explicit string check and rejection of other results, preserving exact download-byte assertions. That test-only change was independently approved and the complete proof/Pay files passed.

After independent diagnosis and explicit coordinator authorization, an additive ownership claim at `51b80ee4` preceded the seven narrow prerequisite repairs at `b9fd1381`. The unused type import was removed. Storage captures use receiver-typed function properties and retain `read.call(this, key)`. Merchant tests await the existing pending promise and narrow the actual mock result to a successful return before inspecting its Promise. Wallet event declarations use function properties with an explicit `Eip1193Provider` receiver; runtime captures, type guards, `.call(provider, ...)`, cleanup and listener identity are unchanged. All original assertions remain. A separate reviewer approved the exact four-file diff. The affected five files passed 78/78; the original full compiler and typed-lint commands both passed on that exact commit.

The [wallet emission receipt](retention-proof-preview-20261120/wallet-emission.receipt.json) compares TypeScript 5.9.3 output before/after the type declaration change using identical transpile options. Both emitted JavaScript strings match, with SHA256 `149a083af2843b2667df0fc0ee1c7f0007c42f1cf3fee13b7f38182d8eb04bab` and zero transpile diagnostics. This is a type-erasure equivalence check; the separate original full typecheck establishes assignability. No lint/type rule, suppression, include/exclude set or test assertion was changed.

### Environment and prerequisites

Node was `v24.22.3`, npm `11.19.1`; installed Vitest `5.1.0`, Vite `8.3.8`, viem `2.57.19`, TypeScript `5.9.3`, ESLint `10.15.0`, Playwright `1.65.1` and Testing Library DOM `10.4.2`. The lock SHA256 is `1b22ab3e9f780d27a01b1beaa8c31b223b3649106e454e78fc50ac8d6900f517`.

Dependencies were copied from an available installation with the identical lock bytes and verified matching key versions; local workspace links were checked to resolve to this worktree. This was **not a fresh npm ci**. Nineteen required local library workspaces built serially from this source at 512 MiB; their exact results/log hashes are in [prerequisites](retention-proof-preview-20261120/prerequisites.json). Their package source is unchanged from the canonical base. An initial resource probe found no cgroup memory files and stopped before any build; later checks used `/proc/meminfo` MemAvailable. Original gate attempts retained actual failures and were not retried without a concrete prerequisite or source correction.

## Independent review and limitations

Root independently reviewed runtime `e075ab04` and found no blocking runtime issue. A separate eligibility reviewer approved the final runtime/browser boundary at `8bb5eff0` (tree `604120aae652b337f66b7689172d4259881df057`), then approved the inherited role-query repair at `638ef16e` and strict download helper at `e8b8bd33`. A different prerequisite reviewer approved `b9fd1381` against its ownership-only parent, with no blocker. These were read-only source reviews; they do not claim independent execution. The sole Low wording finding was resolved by specifying failed explicit Show behavior without changing live rendering.

Browser assertions were authored and collected under the existing full/lean configurations. No browser was launched for this lane. The coordinator's established local launch restriction was not bypassed; collection does not demonstrate browser acceptance. Full original coverage/nocov, static build/CSP/bundle, built-browser/real-wallet, hosted and owner-controlled release gates for this privacy branch remain separate. Existing [release blockers](../../release/RELEASE_BLOCKERS.md) continue to apply.

## Handoff and next bounded task

Root retains shared integration and publication ownership. The current feature branch is an isolated review candidate; no remote mutation is included in this checkpoint. Before integration or draft publication, refresh the relevant heads, resolve any overlap, review the final frozen diff and retain actual gate results. Keep the broader retention status partial. A future persistent adapter requires positive field-level proof of an independently retained nonessential copy and exact revision/concurrency checks; do not invent TTL eligibility or add a new sensitive collection merely to demonstrate deletion.
