# Sweep quote and relayed handoff lifecycle correction — 2026-11-19

## Source and ownership

- Parent: PR #252, `4085622463411d3ba27f4efb7b73a70575170535`.
- Branch: `review/ghostpay-sweep-quote-lifecycle-20261119`.
- Regression-first commit: `ab40d79a4452e618dd3f6f462fde2829f5ba7e05`.
- Owned code: `apps/web/src/views/Sweep.tsx` and `Sweep.quoteLifecycle.test.tsx`.
- Root coordinator owns main integration. Original #231/#252/#262/#264 branches are untouched.

## Reproduced problem

A quote begun for one balance could complete after a fresh balance read cleared
the old quote. Its delayed result restored stale net proceeds and the signing
control. Pending quotes also survived recipient, payment, provider and relayer
changes. An already displayed quote could be inherited by a different relayer.

Before the execution environment failed, an isolated run of the exact original
handler bodies reproduced balance 20 with displayed net 9 from an earlier
balance-10 / fee-1 quote. This demonstrates stale review data, not a loss-of-funds
exploit. The repository relayer binds quote tokens to amount and destination and
rejects mismatches. No relayer, contract or fee policy is modified.

The adjacent relayed action also needed an explicit context check after vault/RPC
work and immediately before submission. A user changing the displayed recipient,
balance, provider or mode before handoff must cancel the old review.

## Correction

Quote work binds to its generation and complete review context: balance and its
read generation, recipient, payment/asset/chain, RPC URL/factory, session, mode,
relayer URL, manifest and services. Changes clear displayed quotes. Guards run
before sending quote parameters and before applying a result or provider error.

Relayed signing captures the same context and both operation generations. The
existing session/vault guard is checked together with that context after vault
authorization, after RPC/manifest awaits and in `onBeforeHandoff`, before writing
the attempt journal. A stale context uses the existing fixed cancellation message.

Once handoff occurs, the existing helper catch, refusal classification,
compare-and-swap journal update, submitted hash and uncertain-outcome handling
remain byte-identical to the parent. A later UI edit cannot erase evidence that
an order may have been sent. Already dispatched requests cannot be recalled;
no transport-abort guarantee is claimed.

## Existing parallel work reviewed

Fresh broad PR #262 at `cb7cfc9ec4f6c051e99805a25132c9458beb7af0` has an
authority-epoch/abort mechanism for some context changes. It does not include
balance-refresh quote binding or this final `onBeforeHandoff` context check.
That branch's network-policy APIs and destination ledger remain owned by its
integration coordinator. This standalone correction introduces neither API.

Independent source review identified mode switching as another cancellation
boundary. Mode is included in the final context and regression cases. Published
head review and exact-head CI remain required.

## Validation status at initial publication

- Exact original handler execution reproduced the stale balance/net result.
- An earlier quote-only patch accepted valid context and rejected refresh,
  replaced context and unmount in exact-source native handler probes.
- The final mode and relayed-handoff additions have source review only.
- The new file contains 34 component cases: 20 quote cases, eight pending
  vault/RPC cases, four pre-handoff cases and two post-handoff outcome controls.
  These cases are authored; **none has executed at initial publication**.
- The execution environment became unavailable during dependency setup, and its
  temporary worktree disappeared on recovery. Source/tests were reconstructed
  from the recorded patches and pinned parent source through the GitHub API.
- Component RED/GREEN, typecheck, lint, build and hosted acceptance are pending.
  Earlier native probes and inherited #252 results do not qualify this new head.

The candidate stays draft. Restore the checkout and execute from `apps/web`:

```sh
vitest run src/views/Sweep.quoteLifecycle.test.tsx src/views/Sweep.privacy.test.tsx src/views/Sweep.test.tsx --coverage.enabled=false --maxWorkers=1
```

Run the new file against the unmodified parent `Sweep.tsx` first to record real
component regression failures, then restore this source and require the full
focused selection to pass. Run scoped type-aware lint, web typecheck, build and
all applicable exact-head hosted checks. Reconcile the latest main and active
integration ownership before any merge.

No real transaction, deployment, release publication or main mutation occurred.
