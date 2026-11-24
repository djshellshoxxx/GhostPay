## Question

Which executable acceptance specifications would independently qualify interrupted payment, cancellation, uncertain broadcast, replay, reorg, vault restore, and stale-session boundaries for `djshellshoxxx/GhostPay`, without duplicating or disturbing active work?

This is one bounded, read-only research pass on 2026-11-04 UTC, with this report as its sole repository write. **Implementation is blocked by overlapping ownership and unavailable candidate-source verification.** The scenarios below are runner-ready Given/When/Then specifications, not implemented tests or passing results.

## Current evidence

- Inspected checkout: `main` and local `origin/main` both at `0014bc5b26c7487ea1f9fb230194c36673193236` (commit subject: “Merge pull request #53 from djshellshoxxx/automation/ghostpay-parallel-review-wave-20261103”). Only that commit is exposed in the local log; no PR-head refs are available locally.
- `active-pr-ownership.md` was already untracked when research began. It is supplied ownership evidence, not a committed or independently refreshed inventory. It was preserved.
- Live ownership refresh failed: `gh api repos/djshellshoxxx/GhostPay/pulls --paginate` required a token; an unauthenticated public API request failed DNS resolution for `api.github.com`. No credentials were read or modified. Consequently PR states and head contents are not live-verified.
- Read `README.md`, `docs/handoffs/LEAN_RELEASE_SCOPE.md`, `docs/handoffs/SOURCE_RECONCILIATION_2026-11-02.md`, and the supplied ownership file. The accepted scope is one client-only EVM path using local/fake/test assets, including explicit consent, honest unknown outcomes, reorg handling, and independent fresh-profile recovery with the source retained. This is not release acceptance.
- The reconciliation pins published application PR #41 at `70d8bf6ec37a5ea61868b9de2a3cea60e22ca6d2`; missing consolidation `7979e6f` remains unresolved there. Its earlier application observations cannot be automatically transferred to this checkout or PR #47.
- Inspected current test bodies and implementation seams listed below. **No application, browser, contract, lint, build, or test suite was executed.** Test presence is evidence of intended assertions, not evidence that they pass.

### Existing coverage by requested scenario

All paths and assertions in this table refer to inspected checkout `0014bc5b26c7487ea1f9fb230194c36673193236`, not the uninspected PR #47 head.

| Scenario | Existing tests and concrete coverage | Qualification still absent from inspected evidence |
| --- | --- | --- |
| Interrupted payment | `apps/web/src/lib/walletJournal.test.ts`: “writes before wallet invocation and blocks an invoice retry with a freshly rebuilt transaction”, lost-response handling, and returned-hash preservation after storage failure. `apps/web/e2e/flows.spec.ts`: “retains a late wallet hash after seller-session, account and provider changes, and requires confirmed clearing before retry”. | That browser scenario unmounts checkout while its provider promise remains alive; it does not terminate the JavaScript realm or close the browser. Reload during a lost response and approval/payment interruption need separate evidence. |
| Cancellation | `apps/web/src/views/Pay.test.tsx`: “delay: nothing is signed while waiting, can be cancelled, or skipped with … send now”; expired-delay refusal; user rejection blocks blind retry. `apps/web/src/lib/scanClient.test.ts`: cancellation between pages, during RPC, during independent rollback confirmation, and hung Worker reply. `apps/web/src/views/SellerKeys.test.tsx`: closed import disclosure prevents late key installation; explicit vault-deletion cancellation. | Browser-level cancellation across delayed approval, key unlock, and scan persistence is not established by these component/unit assertions. |
| Uncertain broadcast | `apps/web/src/lib/walletJournal.test.ts`: lost provider response leaves `unknown`; journal failure after broadcast preserves hash in `WalletBroadcastError`. `apps/web/src/views/Pay.test.tsx`: “WEB-APP-02: after the wallet broadcast, a verification failure never re-enables Send and never says nothing was sent”. `apps/web/src/lib/payExec.test.ts`: invisible transaction and reverted receipt cases. `apps/web/src/lib/sweep.test.ts`: lock after direct broadcast begins still reports submitted; mismatched returned hash is rejected. | Direct/relayed sweep transport accepting an operation but losing its response is not the same as a successful late return. No end-to-end proof of safe repeat behavior for those transport failures was identified. |
| Replay | `apps/web/src/lib/duplicateAttemptJournal.test.ts`: no expiry of unknown outcomes, no unresolved eviction, confirmed clearing, old/new late hashes retained. `apps/web/src/lib/walletJournal.test.ts`: same signed invoice remains blocked after payer switch. `apps/web/src/lib/scanClient.test.ts`: replay announcements deduplicated across pages; later genuine router evidence replaces direct replay. | Wallet retry suppression, scanner evidence deduplication, and legitimate double payment are distinct requirements; no browser proof combining them was found. |
| Reorg | `apps/web/src/lib/scanClient.test.ts`: durable invalidation precedes replacement processing; invalidation failure stops/wipes; independently confirmed rollback; conflicting-provider quarantine; finalized replay tail; orphaned matches dropped. `apps/web/src/lib/reconciliationVault.test.ts`: tombstones survive deletion/import; canonical rescan hash survives old-history invalidation; saturation becomes durable read-only. `apps/web/src/components/ReconciliationLedger.test.tsx`: cross-tab/focus invalidation and delayed action cannot overwrite newer reorg refresh. | Full Worker → durable vault → displayed receipt/sweep eligibility → old-backup import sequence is not established by the inspected E2E. |
| Vault restore | `apps/web/e2e/passphrase-vault.spec.ts`: “encrypted seller vault survives reload, rejects a wrong passphrase, then unlocks the same keys”. `apps/web/src/lib/keyVault.test.ts`: ciphertext only, identity after simulated reload, wrong passphrase, atomic competing saves. `apps/web/src/views/SellerKeys.test.tsx`: encrypted export and file import. `apps/web/src/lib/reconciliationVault.test.ts`: preview/explicit activation never promotes imported history to proof. | Reload in one profile is not independent-profile file recovery. Key vault and reconciliation backup are separate formats/authorities; importing history cannot prove restored spend authority. |
| Stale session | `apps/web/src/lib/session.test.ts`: pending unlock cannot replace changed session; empty-to-loaded guard invalidation; closed-import lifecycle guard. `apps/web/src/lib/keyVault.test.ts`: session changes during storage reads refuse unlock/save. `apps/web/src/lib/reconciliationVault.test.ts`: crossing lock/re-unlock while storage waits rejects. `apps/web/src/lib/sweep.test.ts`: lock during RPC aborts before signing. `apps/web/src/views/Pay.test.tsx`: deferred preparation/context refresh cannot replace current invoice. `apps/web/e2e/flows.spec.ts`: final account recheck refusal and late-hash preservation. | A systematic browser matrix covering authority changes at each asynchronous boundary is not established. Equal public identity after lock/re-unlock must not revive an old operation. |

## Findings

**Facts from current code:** `apps/web/src/lib/duplicateAttemptJournal.ts` stores attempts in `sessionStorage`, writes `unknown` before wallet invocation, retains unresolved attempts without expiry, and requires explicit confirmation to clear. Its own comment states clearing cannot cancel or roll back a wallet request. This is tab-scoped suppression, not global exactly-once payment enforcement. A new independent context cannot be assumed to inherit it.

`apps/web/src/lib/payExec.ts` preserves the returned hash before follow-up RPC checks and wraps follow-up failure in `PostBroadcastError`. `grantApproval` is a separate transaction from checkout. An approval being accepted does not prove payment occurred. `apps/web/src/lib/sweep.ts` has a final pre-submission guard for relayed orders and avoids treating a successfully returned submission as unsent after a session lock. A lost response requires its own qualification.

`apps/web/src/lib/reconciliationVault.ts` keeps invalidation history across deletion and backup import. Imported historical observations require separate live verification; encryption authenticates stored data, not canonical chain truth. `docs/specs/02-scanner-robustness-and-payment-verification.md` also distinguishes pending/final evidence, replay, provider disagreement and invoice reconciliation. Its proposed types/checklist must not be mistaken for implemented behavior.

`docs/specs/ideas/04-encrypted-backup-restore.md` proposes a broader combined backup container and drill. It is a design source, not proof that its APIs or acceptance gates ship. The lean scope explicitly preserves combined backup/tag work for later unless a supported dependency makes it necessary.

**Hypotheses requiring reproduction:** an interrupted approval journey, sweep accepted-but-response-lost outcome, and restored historical evidence after a fork may expose integration gaps. The reviewed evidence does not demonstrate failures. These are reasons to design tests, not findings that funds can be lost.

Authoritative boundaries: EIP-1193 defines provider errors/events, including user rejection (`4001`), `accountsChanged`, `chainChanged`, and disconnect. It does not supply a cancellation or reversal primitive for an already submitted transaction. Ethereum JSON-RPC permits an absent receipt while a transaction is pending; absence alone is not proof of non-submission. EIP-5564 announcement emission is not itself token-transfer proof. ERC-20 approval and transfer are separate operations. The HTML standard defines session storage by page session; it supplies no cross-profile payment journal guarantee.

## Proposed independent tests

These are executable specifications to implement only after ownership/source reconciliation. Use existing Vitest/Testing Library and Playwright, fake signed manifests and deterministic wallet/RPC fixtures. No network transactions. Use deferred promises and explicit barriers rather than timing sleeps; capture method calls before releasing each barrier. Each example is a fresh test with isolated state.

Runner contract: existing library build prerequisite is `npm run build:libs`; current unit suite is `npm test --workspace @ghostpay/web`; current browser suite is `npm run test:e2e --workspace @ghostpay/web`. These commands were read, not run. `apps/web/playwright.config.ts` builds with checked-in fake E2E deployment trust and blocks service workers. Its Chromium setup says never run `playwright install`; retain that configuration. Proposed specs must exercise production KDF/security settings without reducing gates.

### AT-1 — interrupted payment and reload

```gherkin
Scenario Outline: A wallet request survives loss of the initiating checkout
  Given a verified fake EVM invoice and an explicitly reviewed payment
  And the mock provider records the request before withholding its response
  When the user sends once and the journal contains unknown
  And checkout is interrupted by <boundary>
  And the same signed invoice is reopened in the same tab
  Then another explicit send causes no second eth_sendTransaction
  And the prior attempt remains visible with honest uncertain wording
  And changing payer account does not bypass that invoice attempt
Examples:
  | boundary                         |
  | navigation to seller keys        |
  | reload before a provider response |
```

The navigation variant already substantially exists in `flows.spec.ts`; retain it. For reload, keep acceptance state in the Node-side mock server so it survives page teardown. Do not pretend a destroyed page's promise can later update its journal. A new independent tab is a separate limitation test, not a guarantee of suppression.

### AT-2 — cancellation before and after submission

```gherkin
Scenario: Cancelling a delayed payment removes authority to send
  Given a reviewed delayed payment with no wallet request yet
  When the user cancels and the delay barrier is released
  Then signature and send call counts remain zero
  And payment requires fresh review and consent

Scenario: Cancelling while a wallet request is outstanding cannot undo it
  Given a request already recorded by the provider
  When checkout closes and the provider returns a hash
  Then the original attempt retains that hash while its realm remains alive
  And no cancellation or nothing-sent claim is displayed
  And no automatic replacement request occurs
```

Also run the pre-submission variant with vault authorization and scan rollback-confirmation barriers: cancellation must prevent key installation/new signatures and rollback persistence respectively. Existing component/library cancellation tests are the baseline; do not rewrite them as new work.

### AT-3 — uncertain submission and interrupted approval

```gherkin
Scenario Outline: Transport acceptance does not imply a trustworthy response
  Given a mock <transport> records acceptance exactly once
  When its response is lost or rejects after acceptance
  Then the UI reports uncertainty without claiming no operation was sent
  And it never automatically retries or falls back
  And it retains every locally available identifier for checking the outcome
Examples:
  | transport                    |
  | wallet eth_sendTransaction   |
  | direct eth_sendRawTransaction |
  | relayer sweep submission     |

Scenario: Approval interruption never advances checkout silently
  Given the exact reviewed ERC-20 approval was submitted
  When its response is lost and checkout is reopened
  Then no router payment is submitted automatically
  And approval uncertainty is distinguished from payment evidence
  And continuation requires fresh allowance checks and explicit payment consent
```

For direct signed transactions, compare any retained local transaction hash with the hash of the exact signed bytes. For relayed orders, assert only identifiers the actual API exposes; do not invent an order-status endpoint. Returned hash plus RPC timeout, absent receipt, reverted receipt, and wrong returned hash are separate variants. Retain the existing native-payment unit/component coverage.

### AT-4 — replay versus distinct payment

```gherkin
Scenario: Repeated evidence cannot create a second credit
  Given the same canonical announcement is repeated within and across pages
  When scanning is resumed and the same pages are replayed
  Then one observation and one credit remain for that evidence identity
  And direct claimed evidence cannot demote a verified router observation

Scenario: A distinct genuine payment is not discarded as replay
  Given two genuine transfers for the same invoice use distinct chain evidence
  When both are independently verified
  Then both remain distinguishable
  And reconciliation reports the duplicate payment rather than hiding value
```

Assert chain identity explicitly. Reuse existing scan replay fixtures; add only missing integrated evidence. Invoice digest retry suppression must not be used as the scanner's transfer identity.

### AT-5 — fork, restored history, and cancellation

```gherkin
Scenario: Old encrypted history cannot resurrect orphaned payment evidence
  Given a verified observation and an encrypted backup from fork A
  And two independent mocked providers confirm replacement fork B
  When invalidation commits before replacement logs are processed
  And the older backup is previewed and explicitly activated
  Then fork A observations remain invalidated or imported untrusted
  And they cannot authorize a new verified receipt or sweep selection
  And canonical fork B evidence can become verified only after rescan

Scenario: Cancelled rollback confirmation changes no durable history
  Given independent rollback confirmation is held at a barrier
  When scanning is cancelled before that barrier resolves
  Then releasing it performs no rollback write or checkpoint advancement
```

Assert persisted ciphertext state by reopening the vault, not only rendered text. Add provider disagreement and invalidation-write-failure variants: no checkpoint crosses uncertain evidence. Existing scanner/vault tests already cover these primitives; the missing candidate is their supported browser journey.

### AT-6 — independent-profile recovery with source retained

```gherkin
Scenario: An exported encrypted key file restores an independent receiver
  Given profile A exports encrypted keys and records its public identity
  When profile B starts with independent empty browser storage
  Then a wrong passphrase imports no session and writes no replacement vault
  When B explicitly imports the same file with the correct passphrase
  Then B has the same meta-address and independent invoice-signing identity
  And B can rediscover a matching fake-chain payment
  And A retains its original session and encrypted source copy
  And no backup bytes or passphrase leave the allowed local application
```

Use two browser contexts and the actual exported file bytes, not copied localStorage/IndexedDB or `storageState`. Verify signing-key equality to A, and separation from spend/view keys, using public identities or signature verification. Import reconciliation history separately and require an untrusted label until rescan. This is same-engine independent-profile evidence; cross-engine/device recovery remains separate.

### AT-7 — stale authority matrix

For each applicable asynchronous boundary—invoice preparation, final wallet-account check, vault read/decrypt, permit read/signature, direct-sweep RPC read, relayer quote/permit read, reconciliation preview/activation—hold a deterministic barrier and change one authority: seller keys, lock/re-unlock with the same keys, invoice, payer account, chain, or provider. Only pair changes with operations that actually depend on that authority.

Before submission: release the barrier and assert zero new signatures, sends, key installations, or persistent writes, plus a requirement for fresh authorization. After submission begins: preserve known outcome evidence, suppress stale UI/session mutation, and never report rollback. Existing unit and E2E examples define baseline behavior; the matrix must reference them and add only missing combinations.

## Ownership and overlaps

Supplied ownership snapshot (not live-confirmed):

| Owner | Recorded head | Overlap/disposition |
| --- | --- | --- |
| PR #47, integrated client-only core | `f8193502e602c99bb24ff956f142671750b744a0` | All proposed supported-journey tests may duplicate its code/tests. **Blocked** pending exact-head comparison and owner allocation. Preserve its integrated work. |
| PR #52, separate four-agent QA workflow | `68dc5b502f25ed192f3ca82ee4fece8ee91d3bce` | QA orchestration, lane dispatch, report integration belong here. Do not create agents or another workflow. This report used no external agents. |
| PR #51, recurring backlog automation | `5835736c12968231ac7b3152e394077bee453622` | Scheduling/backlog integration overlap; no workflow modifications proposed. |
| PR #31, detect → receipt E2E | `a2217ea1ccdd29f4e67ebdde9e6606eaa0fde523` | Reconciliation says its sole E2E file matched published development; never replay the older file. Current inspected Worker test alone does not prove the entire invoice-bound receipt journey. |
| PR #41 and #39, scanner/security follow-ups | `70d8bf6ec37a5ea61868b9de2a3cea60e22ca6d2`; `1d28f24d86f40c7af5d4187f5d0b3b0d0bf79c78` | Reorg/replay/session behavior overlaps; preserve newer guards and independently reconcile before changing tests. |
| PR #30, wider engineering waves | `7373172db4cf40ce5622e5a92a55b2b086e5e7cb` | Permit/relayer and extension work may intersect AT-3/AT-7. No expansion or generic fallback work is authorized by this report. |

Other supplied active contributions are preserved: #49 (`6bffb63d1638253e677511672ffd32c24ac8f2f6`), #45 (`277e490857a654f11e564ce8b208ee236ffbeb13`), #34 (`212967febe05a8afc8e481e9c6b91d70558d5894`) dependencies; #32 (`b34edd5a7fccbc3d904d004135d1352bf2838ca1`) action updates; #44 (`fd710eb367eff8bbc250024f5a4317875930736b`) audit report mode; #42 (`c9a8c3d3cf549799a9fc93a7053f2d9ccb5d0483`) and #43 (`8d1bde36bb7d16374a2f9ad0ac2c39f46c086951`) handoff documents; #40 (`63994db6cff8b3b3ca698427eee9e95904230546`) secret-loader repair; #36 (`cb917c67bf8a621c48ef02e7d70caf5eadb7b4e2`) hosting kit. No tests, dependencies, application code, workflow files, or existing documents were changed.

Three separately implementable future slices, **all blocked until nonduplication against PR #47 and QA ownership is established**:

1. **AT-1/AT-3 interruption fixture and browser cases:** a Node-side acceptance ledger survives page reload and records exactly which mock requests were accepted. Add only missing reload/approval/response-loss cases. Overlaps #47; relayer aspects also #30.
2. **AT-5 fork-to-history browser case:** exercise real Worker and encrypted reconciliation storage through reorg, backup import and canonical rescan. Overlaps #47, #41, #39 and receipt journey #31.
3. **AT-6/AT-7 recovery boundary cases:** independent-profile encrypted-file recovery plus stale unlock/cancel barriers, retaining the source. Overlaps #47; integration into QA belongs to #52, with scheduling owned by #51.

There is no verified nonduplicative implementation assignment available in this pass. These are conditional task boundaries, not permission to start competing changes.

## Remaining uncertainties

- Current public PR states/heads, PR #47 test inventory, and differences between that candidate and local main remain unavailable. The ownership snapshot cannot resolve this.
- No green-test, browser, coverage, performance, physical-device, live-wallet or network claim follows from source inspection. No tests were run here.
- Private-review assignments and missing consolidation bytes remain outside the inspected evidence. No private findings are reconstructed or closed.
- Payment retry suppression across new tabs, browser restart, cleared storage, or independent devices is not guaranteed by the tab-scoped journal. Whether broader persistence is desired is a product/security decision, not a test assumption.
- Exact support for invoice-bound receipt creation after reorg and restored-history sweep eligibility needs candidate-specific reproduction. A backup's authenticated ciphertext does not settle either question.
- Public standards below were cited by canonical URL and known interface scope; external retrieval could not be completed in this environment. Project-specific guarantees remain local acceptance proposals.

## Sources

Repository source links are pinned to [inspected commit `0014bc5`](https://github.com/djshellshoxxx/GhostPay/tree/0014bc5b26c7487ea1f9fb230194c36673193236). Exact paths:

- `README.md`; `docs/handoffs/LEAN_RELEASE_SCOPE.md`; `docs/handoffs/SOURCE_RECONCILIATION_2026-11-02.md`; supplied untracked `active-pr-ownership.md`.
- `docs/specs/02-scanner-robustness-and-payment-verification.md`; `docs/specs/ideas/04-encrypted-backup-restore.md` (design proposal).
- `apps/web/src/lib/duplicateAttemptJournal.ts`; `apps/web/src/lib/payExec.ts`; `apps/web/src/lib/session.ts`; `apps/web/src/lib/reconciliationLedger.ts`; `apps/web/src/lib/reconciliationVault.ts`; `apps/web/src/lib/sweep.ts`; `apps/web/src/views/Sweep.tsx`.
- `apps/web/src/lib/walletJournal.test.ts`; `apps/web/src/lib/duplicateAttemptJournal.test.ts`; `apps/web/src/lib/payExec.test.ts`; `apps/web/src/lib/scanClient.test.ts`; `apps/web/src/lib/session.test.ts`; `apps/web/src/lib/keyVault.test.ts`; `apps/web/src/lib/reconciliationLedger.test.ts`; `apps/web/src/lib/reconciliationVault.test.ts`; `apps/web/src/lib/sweep.test.ts`; `apps/web/src/lib/txGuard.test.ts`.
- `apps/web/src/views/Pay.test.tsx`; `apps/web/src/views/Scan.test.tsx`; `apps/web/src/views/Sweep.test.tsx`; `apps/web/src/views/SellerKeys.test.tsx`; `apps/web/src/components/ReconciliationLedger.test.tsx`; `apps/web/src/components/WalletAttempts.test.tsx`.
- `apps/web/e2e/flows.spec.ts`; `apps/web/e2e/passphrase-vault.spec.ts`; `apps/web/e2e/app.spec.ts`; `apps/web/e2e/helpers.ts`; `apps/web/playwright.config.ts`; `apps/web/package.json`.

Ownership references: [PR #47](https://github.com/djshellshoxxx/GhostPay/pull/47), [PR #52](https://github.com/djshellshoxxx/GhostPay/pull/52), [PR #51](https://github.com/djshellshoxxx/GhostPay/pull/51), [PR #41](https://github.com/djshellshoxxx/GhostPay/pull/41), [PR #39](https://github.com/djshellshoxxx/GhostPay/pull/39), [PR #31](https://github.com/djshellshoxxx/GhostPay/pull/31), [PR #30](https://github.com/djshellshoxxx/GhostPay/pull/30). Heads above come from supplied documents, not fetched PR source.

Public authoritative specifications:

- [EIP-1193: Ethereum Provider JavaScript API](https://eips.ethereum.org/EIPS/eip-1193): request errors and authority-change events.
- [Ethereum JSON-RPC API](https://ethereum.org/en/developers/apis/json-rpc/): `eth_sendRawTransaction`, `eth_getTransactionReceipt`, and receipt status/absence semantics.
- [EIP-5564: Stealth Addresses](https://eips.ethereum.org/EIPS/eip-5564): announcement structure and stealth-address scheme.
- [EIP-20: Token Standard](https://eips.ethereum.org/EIPS/eip-20): allowance/approval versus transfers.
- [EIP-2612: Permit](https://eips.ethereum.org/EIPS/eip-2612): domain-bound signed approval, nonce and deadline; not proof of a completed payment.
- [HTML Living Standard: Web storage](https://html.spec.whatwg.org/multipage/webstorage.html): session-storage scope and limitations.
