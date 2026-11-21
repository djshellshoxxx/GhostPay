# Address reuse — generation 2 review, repair and handoff

Date: 2026-11-20 UTC. Feature: `v11-01-address-reuse`, v1.1 Beta, issue #287. Fresh successor `/root/address_gen2` reviewed the predecessor's exact source and completed the next local review and repair milestone. **Browser coverage and combined release qualification remain open.**

## Exact source and ownership

- Released predecessor head: `69edfae56fa629f8d35c29d5007dc566d5585b22`.
- Independently reviewed predecessor runtime: `19fee82e88a72f38ad2fad87a216b508d6285f8e`.
- Specification, committed before implementation: `bbcf71b79d4efd00892948faa833cb7d8f471406`, `docs/privacy-release/v11-01-address-reuse.md`.
- Generation 2 ownership: `506866fd5448235ac9550a575e9ebf01d9128aa2`.
- Failing regression without its runtime repair: `86a9798b08ac23e83da715ad2791c06b084a0fcc`.
- Repaired runtime, tests and copy: `976f8d5eba33e4de24f2534f670f3b18ec63470e`.
- Repaired implementation tree: `27e06b9a0b47523825c5e0c8a22ab4dbe75b3453`.
- Branch: `privacy/v11-address-reuse-20261120`.
- Worktree: `/workspace/scratch/dc1ef37f4621/privacy-address`.

This following evidence commit changes documentation only. The branch was continued after the predecessor released ownership, as the coordinator explicitly requested. No remote mutation, integration-branch change, deployment or release occurred. The coordinator's publication rejection remains in effect.

## Findings and changes

### Captured connection callback could restore a disposed hook

The predecessor cleared its ledger and detached listeners during unmount, but a captured `bind` function could subsequently attach provider listeners again and accept observations. A local regression reproduced `reused` after unmount when `unavailable` was expected.

The repair adds a mounted lifetime ref. Effect setup enables it; cleanup disables it before detaching subscriptions; `bind` returns when the lifetime has ended. Revocation also avoids scheduling a React state update after unmount. The normal Strict Mode setup/cleanup/setup cycle still permits a current binding. No transaction authority, payment state, wallet request, dependency or persistence behavior changed.

### Submission wording exceeded the actual evidence

The predecessor's detected/retry/repeat text described a payment as having used or gone to a destination. The Pay caller intentionally observes a known hash even when `PostBroadcastError` says verification failed. A returned hash does not establish that the transaction actually used the previewed destination.

The four `address.reuse.*` copy entries now describe the intended destination named by a payment request that returned a hash. The scope text explicitly says that this check does not verify the transaction's actual destination. The neutral notice and its linkability warning remain. English source and the three existing English fallback entries were updated together; they are not claimed to be reviewed translations. Existing tests were updated to assert the narrower claim and retain the no-raw-address check.

### Other concrete paths reviewed

The pure classifier remains unchanged. Review confirmed strict viem address validation before normalization, chain/account scoping, canonical digest validation, no record on inspection, same-invoice retry and deliberate-repeat distinctions, a 256-observation bound, preservation of earlier evidence on saturation, and an explicit incomplete-history status. The predecessor's 22 classifier cases were not rerun; they concern unchanged source.

The hook's same-provider/account/chain reconnect replaces the active wallet object while retaining local observations. A different provider clears the history, including when account and chain values match. Old wallet objects cannot record into the replacement binding. Added checks cover a registration function that throws after attaching, synchronous account/chain/disconnect events during registration, and a provider that refuses listener removal. In the last case its old callbacks remain inert and do not revoke or populate the new provider's binding. Physical listener removal remains best effort when the provider itself throws.

Pay observations remain restricted to a returned submission hash or a **payment-stage** `PostBroadcastError`. A known approval hash does not record payment destination use. Two additional real-Pay journeys disconnect, open a new invoice, reconnect the same provider/account, and only then resolve or reject the old submission; neither late outcome repopulates the new local ledger. The existing previous-transaction notice still preserves the old known hash. Unknown-hash requests remain excluded. No Pay production code change was needed.

`clearSession(false)` was also traced: the production caller in `session.install` immediately installs the replacement and emits the ordinary session notification. The hook clears on that notification. This review does not claim direct silent session mutations by arbitrary callers are observed asynchronously by the hook.

## Existing Sweep overlap

The source already has a supported sweep warning; adding another destination registry or new flow was unnecessary for this milestone.

| Existing boundary | Source behavior reviewed |
| --- | --- |
| UI | `views/Sweep.tsx` computes `destinationWarning` from the current in-memory snapshot and renders `sweep.destination.used` or `sweep.destination.knownWallet` beside the destination field. It remains advisory. |
| Direct and relayed submission | Both flows capture `captureDestinationLedgerGuard` before asynchronous work and call `recordSweepDestination` after a normal returned submission result. |
| History lifetime | `lib/sweep.ts` resets on app lock and seller-session changes, detects silent session identity changes on access, and rejects observations from an obsolete epoch/session. |
| Persistence | The wrapper removes the old plaintext storage key best effort. It never reads/imports or writes source/destination history to browser storage. Returned snapshots do not mutate the live ledger. |
| Reuse semantics | `packages/hygiene` tracks chain/destination/source links. `canUse` permits another sweep from the same source, and distinguishes a different source; the current UI's factual “used earlier” warning may appear for either. |
| Scope differences | Sweep uses the seller session and source addresses; Pay uses wallet provider/account/chain plus invoice identity. Sweep's wrapper is not the new Pay ledger, does not inherit its 256-observation cap, and the current Sweep call does not supply an external known-wallet list. |

The existing Sweep tests were inspected, not rerun. This overlap review does not claim all Sweep failure outcomes are recorded: its call sites record normal returned results, and the existing unknown-outcome branches preserve their separate attempt journal. No new RPC, explorer lookup, address graph persistence or cross-flow correlation was introduced.

## Verification and actual outcomes

The coordinator supplied the original locked dependencies and source-aligned workspace outputs. All commands below used the unchanged original Vitest configuration in `apps/web`, one worker, and `NODE_OPTIONS=--max-old-space-size=1024`.

### Demonstrated failure

```sh
../../node_modules/.bin/vitest run src/lib/useAddressReuse.test.tsx \
  -t 'captured connection callback' --coverage=false --maxWorkers=1
```

With the runtime repair absent and the regression at `86a9798b`, this exited **1: one failed, nine intentionally filtered cases skipped**, 6.04 seconds. The assertion received `reused` instead of `unavailable` after unmount. This is a local lifecycle regression, not a live-wallet test.

### Repair and outcome checks

The first repaired hook run passed **16/16**, exit 0, 5.38 seconds. The first focused Pay extension run passed **4 cases with 3 intentionally filtered predecessor cases skipped**, exit 0, 11.84 seconds. A final hook-fixture cleanup kept provider methods bound to their fixture receiver, then this combined run verified the final hook source and all added Pay outcomes:

```sh
../../node_modules/.bin/vitest run \
  src/lib/useAddressReuse.test.tsx src/views/Pay.addressReuse.test.tsx \
  -t 'address reuse lifecycle|known payment hash|approval hash|late payment' \
  --coverage=false --maxWorkers=1
```

Result: **exit 0; 2 files passed; 20 cases passed; 3 predecessor Pay cases intentionally filtered**, 25.40 seconds. The hook runtime and its test bytes are unchanged in `976f8d5e`. Pay text expectations from this run were subsequently updated for the narrower copy, then rechecked below.

After the final copy correction, all Pay address-reuse journeys, notice cases and security-key cases ran:

```sh
../../node_modules/.bin/vitest run \
  src/views/Pay.addressReuse.test.tsx \
  src/components/AddressReuseNotice.test.tsx \
  src/i18n/securityKeys.test.ts \
  --coverage=false --maxWorkers=1
```

Result on the committed source: **exit 0; 3 files passed; 23 cases passed**, 30.94 seconds. Together with the unchanged final 16-case hook source this covers **39 distinct relevant cases across four files**, not the sum of every repeated development run. The three older Pay journeys were rerun because their copy expectations changed. The unchanged 22-case classifier suite remains predecessor evidence.

All Pay journeys render the actual App/Pay React path with offline synthetic invoices and mocked provider/RPC/submission results. No transaction was broadcast. These are jsdom integration tests, not browser E2E or full coverage qualification.

The following commands also exited 0 after staging the final owned source:

```sh
git diff --cached --check
bash scripts/scan-secrets.sh
```

The scan reported `OK: no committed env files or key material found.` A scoped typed-lint call was **aborted before dispatch** when the coordinator reserved the exclusive typecheck/lint window for the invoice team; there is no lint result from this generation. No full typecheck, browser test, hosted gate or full suite was attempted.

## Selected Git blob receipts

| Path | Git blob at repaired runtime |
| --- | --- |
| `apps/web/src/lib/addressReuse.ts` | `13381202cdf23ba9c03d7d51443b346df860fea2` |
| `apps/web/src/lib/useAddressReuse.ts` | `376bba605fed4fd34ef5ac9962663c6e2a0bf802` |
| `apps/web/src/lib/useAddressReuse.test.tsx` | `810f79aeebc387da0a5283940d0761a0ee542789` |
| `apps/web/src/views/Pay.tsx` | `d3ec19c5f8b9a753468642e734180c48572577c8` |
| `apps/web/src/views/Pay.addressReuse.test.tsx` | `96cf2eaf01bf252a30cd1612b51e9e6137b5b148` |
| `apps/web/src/components/AddressReuseNotice.test.tsx` | `18502f13798af23eb3df196519f0106396354b00` |
| `apps/web/src/lib/sweep.ts` | `2acd7e6fee3f508ef5b55608c8d90fb7684852dc` |
| `apps/web/src/views/Sweep.tsx` | `6da18522b825c99b4073fd238174f63a8a2b7b38` |
| `packages/hygiene/src/ledger.ts` | `05d7f8eb0cb723266eac7a9a644053e29c2d653c` |

## Reuse and scope

The predecessor's [source reuse decision](../REUSE.md) remains: use the installed pinned viem address utilities, with GhostPay-specific local lifecycle/identity code authored here. The successor's lifetime guard and tests are authored changes. No external source was copied, and no package/lockfile, cryptographic primitive, contract, fee, network authority or release gate was changed.

## Internal successor assignment

Start from `976f8d5eba33e4de24f2534f670f3b18ec63470e` plus this evidence commit. Read the feature spec, AGENTS/workflow instructions and both evidence files; claim ownership before writes. The next bounded work is the combined integration, not another classifier rewrite: independently inspect the mounted-lifetime repair and narrower known-hash wording; reconcile Pay with the disclosure team's actual gate, and adapt the test user journey to acknowledge that gate rather than mocking it away. Preserve the seven address-reuse security keys and the old Pay API until the coordinator performs final integration.

Use the coordinator's exclusive resource window for original typed lint/typecheck. Then qualify the actual combined source with the required browser and hosted gates. Address a new concrete failure only; do not add a repeat-payment UI, persistent history, another sweep registry or a future privacy feature. Keep no-hash outcomes and incomplete local history explicit. If a provider throws on removal, retain inert callbacks rather than restoring state. Do not infer global destination freshness or actual transfer from a returned hash.

Record exact source and actual command results in the next handoff. Local dependency symlinks remain untracked setup artifacts. Publication is blocked by the coordinator's prior automatic approval rejection; preserve local work for its bundle and do not push, merge remotely, deploy or waive a gate.
