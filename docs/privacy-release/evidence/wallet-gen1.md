# Wallet lifecycle privacy: generation 1 handoff

Branch `privacy/v1-wallet-lock-20261120`, base `bbcf71b79d4efd00892948faa833cb7d8f471406`. Tested runtime `74cb34cbc5f3f193e70430d17bef1ccafd00afca`, tree `0ed6c862ea9ea6c41eb3c9a0663b5bac7820743c`. Claim a19a8614; original behavioral regressions af38d8ce; implementation e7866912; reconnection regression0be006bb; final repair74cb34cb. Worktree `/workspace/scratch/dc1ef37f4621/privacy-wallet`. Ownership is released after this evidence commit. Three untracked nested dependency symlinks were coordinator-created and not staged.

## Implemented

`useWalletPrivacy` owns disposable view authority, revision, AbortSignal, session-version check and subscriptions to app lock, seller-session changes and established provider account/chain/disconnect events. Captured callbacks cannot revive an unmounted view. Listener cleanup handles Strict Mode, partial registration errors, synchronous events and failed removal. The module never receives/deletes keys, ciphertext, backups or journal records.

`observeWalletLifecycle` is a bounded EIP-1193 subscription helper whose retained callbacks become inert before cleanup. `connectWallet` gains compatible optional guard/signal arguments3/4, checks authority before and after awaits and before chain switching, accepts initial permission account/network events, and allows only the requested chain-switch event after resolving the initial account. It rechecks final chain and account. Abort detaches listeners without waiting for an uncooperative pending provider promise.

Pay, Registry and Policy clear connected-account details and stale preparation on revocation. Submitted/uncertain evidence and duplicate protection remain. Policy discovery/connection now respect picker scopes; its deployment revision cancels old payment/receive authority. Registry discovery and operation guards share lifecycle scope. Pay rediscovers available wallets after revocation, then requires a fresh explicit connect. Existing session and custody modules were reused; no external code, dependency, crypto/fee/contract/wire format or egress change.

## Evidence

At tracked production baseline af38d8ce, twelve new low-level/real-route cases produced **11 failures,1 pass,exit1**,8.91seconds. The new hook draft was untracked and not imported by these baseline cases. Failures demonstrate stale connected accounts in all three views, late post-lock connection restoration and follow-up RPC after authority loss. The permitted initial account/requested switch case passed.

Initial acceptance passed59/59 in5files,exit0,9.44seconds. Additional reconnection assertions at0be006bb then exposed Pay clearing wallets while rediscovery observed only phase:1 failed,2 passed,3 filtered,exit1. The one-line effect dependency repair permits a new explicit connection.

Final command from apps/web:

```sh
NODE_OPTIONS=--max-old-space-size=1024 ../../node_modules/.bin/vitest run src/lib/wallet.lifecycle.test.ts src/lib/useWalletPrivacy.test.tsx src/views/WalletPrivacy.lifecycle.test.tsx src/lib/wallet.test.ts src/lib/walletJournal.test.ts --coverage=false --maxWorkers=1
```

Final source above: **59 passed,5files,zero skips,exit0**,15.72seconds. Original wallet/journal cases retain hashes after authority loss, preserve unknown outcomes, refuse before send on storage failure and block automatic duplicate requests. Secret scan and full feature-range whitespace check passed. Compressed unmodified logs and hashes are in wallet-gen1/evidence.json. Counts overlap across red/green selections.

## Fresh successor task

1. Review helper and all three real callers independently. Exercise competing connect intents, unmount/abort timing, silent provider changes, reentrant subscriptions, expected chain switches and late hashes. Preserve submitted/uncertain evidence and sole-copy recovery. Inspect remaining post-broadcast messages for stale account details. Providers with no event hooks cannot proactively signal changes; pre-sign account/chain rechecks remain essential. Do not claim provider truthfulness.
2. Run relevant original Policy/Registry/Pay journeys beyond the focused milestone. Policy may remove stale subviews immediately where older tests expected an error in that stale view: assess intent before adapting fixtures. Verify any real long-running observer found in this exact source; no standalone PolicyMonitor component exists here, so do not import an unrelated unpublished module based on historical notes.
3. Sibling history_gen2 separately owns the four WalletAttempts wallet-prop spans in Pay, Registry and PolicyPay. Those spans are untouched in this lane. This tested source does not contain the sibling fix.
4. For v1.1, preserve disclosure's optional fifth connect argument and WalletSession.disclosure while integrating this guard/signal, complete connection lifetime observer and final account check. disclosure_gen2 owns explicit per-request approval test helpers. Adapt this lane's new real-view cases with that helper only in the combinedv1.1 snapshot; v1.0 must remain independently buildable.
5. Full original typecheck, typed lint, complete coverage/suite, browser and hosted acceptance remain open. This lane did not run heavy checks because root reserved resources; other-source exit137 results are not diagnostics for this branch. Preserve gates, pin successor source and deliver the next tested handoff.

No remote publication/deployment/release/main merge/shared integration-lock mutation was performed.
