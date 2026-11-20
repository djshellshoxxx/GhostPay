# Address reuse — generation 1 milestone and successor handoff

Date: 2026-11-20 UTC. Feature: `v11-01-address-reuse` (v1.1 Beta, issue #287). **M1 implemented; M2 independent review and M3 release qualification remain open.**

## Exact source

- Published baseline: `137628961463fc5abd8b7927b2efe6b18a0a206a`.
- Specs before code: `bbcf71b79d4efd00892948faa833cb7d8f471406`.
- Ownership claim: `7aaafae3316c4701ef845acc105ccca8b231fa2c`.
- Implementation and original tests: `19fee82e88a72f38ad2fad87a216b508d6285f8e`.
- Implementation tree: `129d57f96df342c4a29e70d5e0065281638bfd6c`.
- Branch: `privacy/v11-address-reuse-20261120`.
- Worktree: `/workspace/scratch/dc1ef37f4621/privacy-address`.

This evidence commit adds documentation only after the tested implementation. No remote write, merge or deployment was performed. The coordinator reported that automatic approval review rejected publication; that boundary was preserved.

## Implemented behavior

`lib/addressReuse.ts` contains a pure, bounded, in-memory ledger. It validates chain/account scope, EVM checksum/address shape, canonical invoice-digest shape and repeat intent. It distinguishes a same-invoice retry, an intended repeat and a distinct invoice reusing an observed destination. Case normalization uses the installed viem functions. Rendering or inspecting does not record an observation. At most 256 distinct destination/invoice observations are retained; overflow preserves older observations and exposes incomplete history instead of evicting evidence silently.

`lib/useAddressReuse.ts` owns lifecycle effects separately. It subscribes to provider account/chain/disconnect events and app lock/session invalidation, detaches listeners and clears the ledger on revocation, provider replacement and unmount. Reconnecting the same provider/account/chain in the mounted Pay view retains observations. Old wallet session objects cannot record into a replacement binding. Providers without removable lifecycle subscriptions receive an unavailable check; payment itself is not blocked. The hook makes no provider request.

The supported integration is the EVM invoice `Pay` view. After connecting, it shows `AddressReuseNotice` before the existing final payment preview. It records the prepared destination and canonical invoice digest only after `sendPayment` returns a transaction hash or a payment-stage `PostBroadcastError` carries a hash. Preparations, renders, approvals and requests without a known hash are not recorded. Existing transaction submission, custody, approval and recovery authority are unchanged.

The notice repeats neither raw address nor invoice content. Its text states that the check is local and incomplete, does not confirm payment, and cannot prove global nonuse. The seven additive `address.reuse.*` keys are explicitly classified as security-critical; draft locale catalogs contain English fallback copy, not claimed reviewed translations.

## Reuse and authorship

The preimplementation [reuse research](../REUSE.md) identified the existing pinned **viem 2.57.19, MIT** address utilities. This implementation imports `isAddress` and `getAddress` from that installed dependency rather than copying or rewriting checksum code. The ledger, hook, notice and integration tests were authored for GhostPay's session and invoice semantics. No external source was copied, no dependency or lockfile was changed, and no crypto, contract or network behavior was added.

## Executed verification

Root prepared locked dependencies centrally and supplied source-aligned workspace outputs; this worker did not run another install. The final run used the unchanged original Vitest configuration, bounded memory and one worker:

```sh
cd /workspace/scratch/dc1ef37f4621/privacy-address/apps/web
NODE_OPTIONS=--max-old-space-size=1024 ../../node_modules/.bin/vitest run \
  src/views/Pay.addressReuse.test.tsx \
  src/lib/addressReuse.test.ts \
  src/lib/useAddressReuse.test.tsx \
  src/components/AddressReuseNotice.test.tsx \
  src/i18n/securityKeys.test.ts \
  --coverage=false --maxWorkers=1
```

Observed result on the exact implementation above: **exit 0; 5 test files passed; 50 tests passed; 37.55 seconds**. The source was frozen during that final run and committed immediately afterwards. These are focused test results, not a full suite or coverage qualification.

The three Pay integration journeys render the actual React App/Pay path with synthetic local invoices and offline mocked wallets/RPC/submission. They verify distinct-invoice reuse warnings after a known-hash submission, no recording from preparing/rendering alone, and clearing after an account event. They intentionally simulate two invoices producing the same prepared destination. No real wallet transaction was sent.

Other focused tests cover invalid inputs, case/checksum normalization, chain/account isolation, same-payment retries, intended repeats, capacity overflow, provider replacement, late stale session callbacks, lifecycle cleanup, lock/session invalidation, unavailable lifecycle support, neutral disclosure and security-critical key policy.

Additional commands from the worktree root:

```sh
git diff --cached --check
bash scripts/scan-secrets.sh
```

Both exited 0. The secret scan reported `OK: no committed env files or key material found.`

Earlier development evidence is not substituted for current-source evidence: the initial four-file suite passed 47 tests before the Pay journeys and final observation semantics; the first five-file run had 48 passing and two failing tests because those tests looked for `Payment submitted` instead of the existing `Submitted` heading. Only the test expectation was corrected; the final source run above passed all 50.

## Explicit coverage boundary

- This is one supported EVM Pay flow, not every address-bearing flow. Existing Sweep `DestLedger` was not replaced.
- Memory lasts only while the Pay view and wallet/app session remain valid. Refreshing, navigating away, locking or changing wallet scope can remove observations. There is no local/session storage or remote history.
- Known hashes are local submission evidence, not confirmation that the prepared destination received a payment. Unknown-hash outcomes are intentionally absent. No RPC or explorer query tries to fill missing history.
- The optional intended-repeat policy is tested in the pure module; this milestone does not introduce a new repeat-payment UI.
- No full typecheck, lint, full unit suite, coverage gate, browser E2E, hosted qualification or independent review was run by this worker. The coordinator reserved those checks for the combined exact source. No configuration or gate was weakened.
- Dependency symlinks in this worktree are local setup artifacts and were not committed.

## Internal next-generation assignment

Start from implementation `19fee82e88a72f38ad2fad87a216b508d6285f8e` and this handoff in a separate review worktree. Read AGENTS.md, the workflow/security invariants and `docs/privacy-release/v11-01-address-reuse.md`; append your own ownership claim before source edits. Independently review the ledger's validation/cap behavior, event subscription failure/reentrancy, no-hash versus known-hash observation boundaries, stale asynchronous callbacks and preservation of transaction/recovery authority. Prioritize actual missing failure-path coverage, including payment-stage post-broadcast errors and provider event subscription failure; add fixes or tests only for concrete gaps. Review copy against the fact that a known hash does not establish the eventual transaction destination or outcome.

Coordinate shared Pay changes with the wallet-disclosure team. The new Pay integration tests will need to acknowledge a newly introduced disclosure gate when those branches are combined; do not mock away its security behavior to make tests pass. Keep `address.reuse.*` additions separate from other locale prefixes and preserve critical English fallback policy. Ask the coordinator for the exclusive typecheck/lint window before heavy commands. Record an exact reviewed/fixed source and actual command results, then return a bounded successor handoff. Do not describe this M1 as globally complete privacy protection or a qualified release, and do not publish or alter gates.
