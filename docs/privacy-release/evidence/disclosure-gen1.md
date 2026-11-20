# External wallet disclosure — generation 1 handoff

## Source and milestone

- Feature: `v11-03-wallet-disclosure`, v1.1 Beta only; spec committed before implementation in `docs/privacy-release/v11-03-wallet-disclosure.md`.
- Worker: `/root/disclosure_gen1`.
- Branch: `privacy/v11-wallet-disclosure-20261120`.
- Worktree: `/workspace/scratch/dc1ef37f4621/privacy-disclosure`.
- Spec/base: `bbcf71b79d4efd00892948faa833cb7d8f471406`.
- Published dependency: `137628961463fc5abd8b7927b2efe6b18a0a206a`.
- Ownership commit: `82b5d55a`.
- Tests-only RED commit: `cbe1307ae178af789cd9959b3d312493086df5f9`.
- Frozen implementation and final tested source: **`15e14ba2f3e3ee45f49f6c14cf984776cf68e92b`**.
- Frozen implementation tree: `2244437163e282868b48a71b3ac31d1f3ec36b00`.
- This evidence commit changes documentation/logs only. It is not a substitute for final combined-source qualification.

**M1 is implemented and focused tests pass. M2 and release qualification remain open.** All three live connection callers are wired, but only two original Pay/AppShell journeys were adapted and executed at this checkpoint. The complete historical Pay/Registry/Policy suites must be migrated to explicit disclosure decisions and run; they are not claimed green.

## Delivered behavior

`lib/walletDisclosure.ts` owns pure immutable request snapshots and a single pending approval controller. `components/WalletDisclosure.tsx` owns the context and accessible presentation. `AppShell` mounts the presenter within the existing privacy context. Pay, Registry and Policy explicitly supply the context gate to the wallet boundary.

The four supported outbound request types are account access, chain switch, transaction submission and EIP-712 v4 signature. The dialog displays the method, requested/expected chain, known account/target/native wei amount or bounded known typed-message fields, and a lossless ASCII JSON rendering of the exact request. Unavailable values are explicit. The rendered request and submitted parameters come from one snapshot; caller edits cannot substitute new transaction data or attempt identity while review is pending. Complete serialized requests exceeding 65,536 ASCII bytes are refused.

No provider reads populate the preview. Existing account/chain consistency checks run after approval. A declined review occurs before provider interaction and before duplicate-journal reads or writes. Application and provider authority are checked again after awaits. A chain switch has its own decision rather than inheriting the account-access decision. A returned submission hash is still preserved and journaled if the presenter is revoked after provider submission begins.

The application gate fails closed without an active visible presenter, when sensitive presentation is masked, on cancellation, and on concurrent pending requests. Grants expire after two minutes and are revoked by host/scope/session/lock/visibility changes, provider account/chain/disconnect events while a review is pending, and unmount. Clock rollback and invalid clocks invalidate approval. Request payloads are not logged, persisted, placed in titles or emitted as live announcements.

The dialog is labelled, initially focuses Cancel, traps focus, handles Escape, renders the background inert, and restores the opener after inert is removed. Privacy masking removes the entire dialog rather than leaving its payload hidden in the modal DOM. The ordinary transaction review and wallet confirmation remain required.

## API and integration contract for the v1 wallet team

```ts
connectWallet(
  wallet: WalletInfo,
  expectedChainId: number,
  assertCurrent?: () => void,
  signal?: AbortSignal,
  options?: { readonly disclosure: WalletDisclosureGate },
): Promise<WalletSession>

type WalletDisclosureGate = (
  request: WalletDisclosureRequest,
  signal?: AbortSignal,
) => Promise<{ assertCurrent(): void }>;
```

`WalletSession` gains optional `readonly disclosure?: WalletDisclosureGate`. Existing low-level callers may omit injection, retaining their tested API semantics. **Every production connection call passes the mandatory `useWalletDisclosure()` result**; the hook's absent-host default rejects. Do not replace this with a missing-host approval fallback or reserve the third positional argument for an options object. Sessions carry the same gate into signing/submission.

Pay passes its existing session guard and current network signal. Registry passes its existing authority guard and operation signal. Policy's narrow M1 edit passes `undefined, undefined, { disclosure }`; its fuller connection-operation ownership remains part of the planned v1 wallet lifecycle work. Pending connection review attaches temporary provider-event listeners and removes them before actual account access/switch; a v1 worker must preserve expected provider events while strengthening the full connection lifetime.

The address-reuse team's Pay changes are separate narrow hunks: hook import/binding, known-hash observation, and notice. Root owns reconciliation. The address UI journey also needs explicit disclosure decisions after integration.

## Evidence

Commands ran from the worktree's `apps/web` directory, using root-installed locked dependencies and copied source-aligned workspace builds. No independent package install, dependency or lockfile edit occurred. Focused runs use the repository Vitest configuration, `--coverage=false --maxWorkers=1`, and a 1,024 MiB Node heap. They do not replace original coverage/release gates.

| Source/run | Command | Actual result |
| --- | --- | --- |
| Tests-only `cbe1307a` | `NODE_OPTIONS=--max-old-space-size=1024 ../../node_modules/.bin/vitest run src/lib/wallet.disclosure.test.ts --coverage=false --maxWorkers=1` | Exit 1: 3 behavioral failures. Baseline connected, sent or signed despite a declining gate. |
| Final `15e14ba2` | `NODE_OPTIONS=--max-old-space-size=1024 ../../node_modules/.bin/vitest run src/lib/wallet.disclosure.test.ts src/lib/walletDisclosure.test.ts src/lib/wallet.test.ts src/components/WalletDisclosure.test.tsx src/i18n/securityKeys.test.ts --coverage=false --maxWorkers=1` | Exit 0: 5 files, **80 tests passed**, no skips. Includes 29 original wallet tests. |
| Final `15e14ba2` | `NODE_OPTIONS=--max-old-space-size=1024 ../../node_modules/.bin/vitest run src/views/Pay.test.tsx --testNamePattern='shows the connected wallet chain ID ungrouped\|shows decoded calldata, sends only after the explicit click' --coverage=false --maxWorkers=1` | Exit 0: **2 original Pay/AppShell journeys passed; 64 tests intentionally skipped** by the explicit name filter. |
| Final staged source | `git diff --cached --check` | Exit 0. |

The command above escapes the table's pipe delimiter for Markdown; the actual `--testNamePattern` contains a normal `|` alternative, not a literal backslash.

Logs are committed under `docs/privacy-release/evidence/disclosure-gen1/`. Terminal empty lines were removed after the documentation staging whitespace check flagged them; test output content is otherwise unchanged. Hashes below identify the committed log bytes:

- `red.log`: SHA-256 `7f27a15f22a1c283eb63d605bb14bd6aa657314edee3c7c9a48d202d42cad8fc`.
- `focused-final.log`: SHA-256 `cde774701a52137f1fa8e504dfa0955ffb96c45d6fe9f0faeb739ffce7b3e51a`.
- `pay-final.log`: SHA-256 `023eac27d60f18c0504ffdaa65ce53f55f163cebd536c9b6f72076af9830af8f`.

A preceding working-tree run found one real accessibility defect (69 passed/1 failed): focus restoration ran before inert was removed. The final source captures the opener before rendering inert and restores focus in passive cleanup; the original failing assertion passes. This intermediate working tree was not a frozen source and is not presented as exact-source qualification.

Coverage includes immutable/escaped request rendering, input bounds, unknown fields, missing host, concurrency, stale prompt identity, abort, deadlines/clock rollback, lifecycle revocation, focus behavior, app masking, provider-event cancellation, no preview RPC, untouched journal on cancel, captured journal identity, checks after approval/recheck awaits, separate chain switching, and preservation of a returned hash after host closure.

**Not run here:** full web/repository tests, coverage thresholds, web typecheck, ESLint, static production build, browser/Playwright, real extension, mobile visual review, and hosted checks. Root deferred heavy type/lint checks after a sibling typecheck was killed under shared memory pressure. These gates remain mandatory; they were not overridden or waived.

## Reuse and research

The M0 reuse inventory is `docs/privacy-release/REUSE.md`. This feature reuses existing pinned `viem` address validation, GhostPay's neutral errors, privacy/session/app-lock hooks, wallet authority checks and duplicate-attempt journal. The new descriptor, controller, presentation and focused tests are authored here. No external code was copied and no dependency was added.

Additional GitHub candidate research on 2026-11-20 checked [Rabby](https://github.com/RabbyHub/Rabby), its [MIT license with reserved branding](https://github.com/RabbyHub/Rabby/blob/develop/LICENSE), and [MetaMask's extension license](https://github.com/MetaMask/metamask-extension/blob/main/LICENSE). Rabby's documented approval architecture belongs to its browser-extension provider/background/keyring session; it does not offer a standalone GhostPay application-side no-RPC request gate. MetaMask's currently inspected license imposes noncommercial restrictions; it was not approved as a source to copy. These are mutable-branch research references, not vendored source pins. No wallet extension code or third-party notice was added. The narrow local implementation avoids importing extension custody, background services, or simulation network calls.

## Known limits and next internal assignment

Assign a fresh generation to independently review `15e14ba2` before extending it. Use a dedicated branch, record ownership, and retain this source/evidence pin. Do not expose internal worker instructions in the user-facing answer.

1. Migrate and run the original Pay/Registry/Policy journeys with explicit, per-request decisions. Cover account access, chain switches, ERC-20 approval/payment pairs, typed permits, registry publish/clear/signature, policy payment/withdrawal and cancellation. Do not globally autoapprove in `renderApp`, mock away the production gate, or remove assertions to avoid the new modal. Current `Pay.test.tsx` updates only two cases and the `toPrepared` connection helper; the remaining fixtures need adaptation.
2. Review new await boundaries against route/invoice/settings/network/session/provider changes and original duplicate/outcome recovery. Coordinate Policy picker lifetime and full connection races with the v1 wallet team. Ensure an initiated external request's unknown outcome or returned hash is never reclassified as safely cancelled.
3. Complete semantic preview coverage without new RPC: the M1 summary shows native wei and selected known top-level typed fields; full raw calldata/typed JSON is always exact. It does not decode token amounts, recipients or arbitrary contract effects, nor separately summarize a typed domain's chain. Avoid implying zero native value means zero token approval. Improve summaries only with explicit schemas/known app operations and tests proving displayed fields remain bound to actual outgoing bytes.
4. Exercise actual privacy reveal expiry/quick hide, hidden-page and browser focus/inert behavior; validate real extension compatibility with frozen params and accessibility/mobile layouts. Keep all raw payloads out of logs, storage, document titles and live announcements. Only the English catalog and critical-key classification group were updated in M1. Root identified that repository convention also requires explicit draft fallback entries in the Spanish, Japanese and Arabic catalogs; the successor must add these and validate exhaustive classification/catalog rules. Reviewed translations are not yet supplied.
5. Run original typecheck/lint/build and complete focused/full/browser gates on the final combined source when root's resource window opens. Add regression tests for concrete findings, then record exact commands/exits and a source-pinned next-generation handoff. Never mark M2 or the full feature complete solely from this M1 evidence.

No push, merge, deployment, contract, fee, security-gate, dependency or future-feature change was made by this worker. Root owns final artifact preservation and any publication approval.
