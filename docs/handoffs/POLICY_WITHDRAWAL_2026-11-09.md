# Policy withdrawal continuation — 2026-11-09

Experimental, disabled-by-default scope. No deployment profile, production contract, fee policy, CI gate,
ordinary invoice/payment state or release configuration changes.

## Source and ownership

- Starting product source: `cfc7b0f3325a550df830584e86db4c38bcc9d6b2` (PR #89).
- Worker: `codex/gp-policy-withdrawal`, isolated worktree.
- Prerequisites: policy deployment authentication `18142e68`, independent payment evidence `911bf6de`,
  catalogs `826d426b` and `1cd34cbe`. Their local cherry-pick identities are not additional deliverables.
- Withdrawal implementation: `5044c885644dc03c48bba42856d82108a7a2ba8b`;
  tested tree `b1237d486624e4e01a4cda2d52a5b4bffd190d22`.
- This handoff and extraction hints are a documentation/comment-only successor. The coordinator owns publication
  and integrated validation, including the source from other lanes.

## Delivered behavior

`withdrawalState.ts` reconstructs current account state from an authenticated deployment profile, starting at
that profile's factory origin block rather than the first payment announcement. It re-authenticates the deployment
at one canonical block, checks the deterministic account address and exact EIP-1167 implementation runtime,
and reads account owner/delay/policy/root, balance, rolling window and proposed nonce using the canonical
block-hash selector. The selected asset must belong to the authenticated asset profile.

Bounded log pages are ordered by block and log index. Malformed, removed, duplicated, out-of-range or conflicting
logs fail closed. Each event must occur in a successful receipt at its canonical block with an identical receipt
log. Request transitions must be complete and legal. The replay is cross-checked against `requests(id)`,
`requestDestination(id)`, token limit/window proof, current destination and pending proposal state at the anchor.
Missing origin history, readback disagreements, canonical-block changes or chain drift prevent authorization.

`PolicyReceive` reads this fresh snapshot inside the serialized operation before deriving a signature. Pending
requests reduce the next plan; the selected nonce is checked without an unchecked second random retry. A
broadcast hash no longer creates an optimistic execution button or estimated acceptance time. Checking the
account after reload reconstructs pending requests and actual on-chain execution times. Execution refreshes
state again and checks request status, captured destination, timelock, balance and current window headroom.
Cancels also refresh the relevant pending request/proposal. Seller and deployment guards survive the awaited
reads, signing work, wallet rechecks and queued browser lock.

`withdrawalJournal.ts` reuses the existing bounded `WalletAttempt` schema and begin/finish/clear implementation,
with durable `localStorage` for policy actions. No parallel stored-request format was added. The logical action
key binds seller public keys, chain, deployment, account and token, with separate identities for requests,
deployment, cancellation and execution. It is independent of the relaying wallet and regenerated calldata/nonce.
The global Web Lock serializes all tabs' read/prepare/begin/send/finish work for this journal. Missing storage or
Web Locks prevents submission. Unknown outcomes remain locked; returned hashes are persisted even if the initiating
seller session changes. A storage failure after broadcast retains the returned hash in `WalletBroadcastError`.

The account panel shows saved attempts and offers explicit confirmed clearing. Clearing cannot cancel a transaction.
The same explicit action is required after a reorg: an absent or orphaned transaction is not proof it cannot mine.
The new wallet options preserve existing ordinary payment and transaction key semantics unless the explicit,
bounded logical-transaction option or explicit storage is supplied.

## Persistence and evidence boundaries

- LocalStorage survives reload and browser restart until the site's data is cleared. Other browser profiles/devices
  do not share this journal. Clearing site data removes its unknown-outcome protection.
- Stored fields are the hashed logical action key, chain, public relayer address, UUID, timestamp, status and optional
  transaction hash. No seller secrets, invoice, calldata, withdrawal signature or authoritative account snapshot is stored.
- The panel discloses this persistence. All new safety copy stays on reviewed-English fallback in every draft locale.
- The configured RPC must return complete successful `eth_getLogs` pages. Receipt/readback consistency detects many
  contradictions, but this is not a cryptographic proof against a provider fabricating or silently omitting all evidence.
- Reads are as of the captured canonical block. Another party can act after that block; on-chain nonce, destination,
  status, timelock and window enforcement remain authoritative. No client snapshot reserves funds.
- History is bounded to 50 configured RPC ranges and 256 events; oversized or incomplete history blocks rather than
  silently planning from a partial result. No automatic eviction or inferred expiry clears attempts.
- Lost-key recovery and seller-key/policy-record backup restoration remain separate features. This code does not rotate
  an owner key or satisfy the undecided recovery-authority design.

## Acceptance matrix

| Boundary | Status | Evidence or remaining prerequisite |
| --- | --- | --- |
| Coherent clone/owner/policy/asset reads | Implemented; locally validated | Unit adversarial checks and real local deployment |
| Complete bounded request reconstruction | Implemented; locally validated | Canonical receipts, ordering, transition and storage checks; origin/cap failures block |
| Reload and browser-restart attempt retention | Implemented; locally validated | Durable schema with cross-tab Web Lock; new-context tests preserve submitted/unknown outcomes |
| Competing requests and used nonce | Implemented; locally validated | Fresh conservative plan and nonce read; local Anvil exercises both |
| Request → reload → maturity → execution → reorg | Implemented; locally validated | Real Anvil lifecycle test using unchanged contracts |
| Session/deployment changes during asynchronous actions | Implemented; locally validated | UI session tests and post-history/queued-operation guards |
| Public deployment or enabled product flow | Externally blocked | No accepted authenticated profile is shipped; feature remains disabled |
| Actual owner-key-loss recovery | Design-blocked | Separate recovery model/authority review; unchanged deployed contract behavior |

## Validation

Node 24.22.1, Vitest 5.0.5, Anvil 1.8.5. No dependency, artifact or gate changes.

Commands on implementation `5044c885`:

- `npm run typecheck -w @ghostpay/web`: exit 0.
- `node_modules/.bin/eslint --config eslint.config.js apps/web/src/features/policy apps/web/src/lib/wallet.ts`: exit 0.
- In `apps/web`, `ANVIL_BIN=/workspace/scratch/0eeb5e74bd49/tooling/anvil POLICY_SCHEME_ARTIFACTS=/workspace/scratch/32332a6254be/gp-policy-evidence/packages/contracts/out REQUIRE_ANVIL=1 ../../node_modules/.bin/vitest run src/features/policy src/lib/walletJournal.test.ts src/lib/wallet.test.ts --maxWorkers=2`:
  **273 passed, 14 files, no skips.** This includes all four real Anvil cases in the evidence suite; three were already
  supplied by the evidence lane and one is the withdrawal lifecycle. It includes 33 withdrawal-state and 8 journal/key
  tests. These are overlapping subsets, not extra counts to add.
- `git diff --check`: exit 0.
- `node scripts/i18n/extract.mjs` from the repository root: zero missing keys. Initial invocation from `apps/web`
  failed because that script is at the repository root; rerun used the correct path. Comment-only hints mark all
  descriptor-only withdrawal messages discoverable. Unused keys from other in-progress localization work are not removed.

Regression evidence:

- Replacing only `PolicyReceive.tsx` with PR #89's version makes the new real UI assertion fail: the old code offers
  **Execute withdrawal** immediately after a broadcast without a mined request. The corrected UI waits for canonical
  request reconstruction.
- Replacing only `wallet.ts` with PR #89's version makes the new persistent-attempt regression fail: the returned hash
  lands in tab-only storage and the durable store is empty. Corrected code persists it and blocks a regenerated nonce
  or another relaying wallet after recreating the browser context.
- Initial test-helper failures (ABI field naming, account-spread in the local Anvil sender and layered test spies)
  were corrected. They are not unresolved product failures or counted as passing executions.

No browser E2E or whole-workspace qualification is claimed by this lane. The coordinator must run those on the
integrated source. No funded wallet, remote-chain submission, production deployment or source-branch publication
was performed by the worker.
