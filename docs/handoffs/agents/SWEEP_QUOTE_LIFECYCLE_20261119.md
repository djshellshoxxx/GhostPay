# Sweep review and handoff lifecycle correction — 2026-11-19

## Source and ownership

- Parent: PR #252, `4085622463411d3ba27f4efb7b73a70575170535`.
- Branch: `review/ghostpay-sweep-quote-lifecycle-20261119`; draft PR #272.
- Initial quote/relayed head: `9e4ec2da024ef9a706e9d6cefa988d0a5dd9f7ac`.
- Initial regression-first commit: `ab40d79a4452e618dd3f6f462fde2829f5ba7e05`.
- Final product source blob: `2b832d371229385a2a1228e16320aceb9a64ee59`.
- Final focused test blob: `41baa63e14fad5ea0dcf54c202b2ef3b0faa5476`.
- Owned code: `apps/web/src/views/Sweep.tsx` and `Sweep.quoteLifecycle.test.tsx`.
- Root coordinator owns main integration. Original #231/#252/#262/#264 branches are untouched.

## Reproduced problems

A quote begun for one balance could complete after a fresh balance read cleared
the old quote. Its delayed result restored stale net proceeds and the signing
control. Pending quotes also survived recipient, payment, provider and relayer
changes; an already displayed quote could be inherited by a different relayer.
The exact original handler reproduced balance 20 with displayed net 9 from an
earlier balance-10 / fee-1 quote. This proves stale review data; no loss-of-funds
exploit is claimed. The repository relayer rejects mismatched quote-token bindings.

Pending relayed, direct and same-nonce replacement actions could also retain old
review context across vault/RPC work and helper awaits. Direct sweep is the
active Pages path. Edits before handoff must prevent submission using the old
review; edits after handoff must preserve evidence of transactions that may land.

## Correction

Quote work binds to its generation and complete review context: balance and read
generation, recipient, payment/asset/chain, RPC URL/factory, session, mode,
relayer URL, manifest and services. Changes clear displayed quotes. Guards run
before sending quote parameters and before applying a result or provider error.

All three signing paths capture the same context and both operation generations.
The existing session/vault guard is checked together with that context after
vault authorization, after RPC/manifest awaits and in `onBeforeHandoff`, before
creating or replacing the attempt journal. A stale context uses the existing
fixed cancellation message.

The direct helper and relayed helper are unchanged. Both final callbacks are
synchronous immediately before external handoff. Work already running inside a
helper may finish locally before its callback rejects handoff; this is not a
transport-abort guarantee.

The original post-handoff catch and outcome updates remain byte-identical:
explicit relayer refusal classification, submitted/uncertain journal state,
direct simulation warning and replacement compare-and-swap with retained hashes.
A later UI edit cannot erase submitted or unknown-outcome evidence.

## Regression and qualification evidence

The executor was initially unavailable; the original publication accurately
recorded unexecuted tests. Recovery restored the published files byte-for-byte.
Dependencies use the committed lockfile and Node 24.22.3.

| Source under test | Actual result |
| --- | --- |
| Original #252 Sweep source with the initial 34 lifecycle cases | RED: 28 failed, 6 passed, 0 skipped |
| Initial `9e4ec2da` source, lifecycle/privacy/existing Sweep selection | GREEN: 106 passed, 0 skipped |
| Initial `9e4ec2da` source with the final 70 lifecycle cases | RED: 30 failed, 40 passed, 0 skipped |
| Final product/test blobs above, lifecycle/privacy/existing Sweep selection | GREEN: 142 passed, 0 skipped |
| Type-aware ESLint on both final TSX files | Passed |
| Repository secret scan and `git diff --check` | Passed |

The 70 lifecycle cases cover the original 34 quote/relayed cases and 36 direct/
replacement cases. For each direct flow, pending vault, RPC creation and helper
handoff work are interrupted by recipient, balance refresh, provider, mode and
selection edits. Tests assert no stale helper entry or transport handoff, no new
owner lock, and byte-identical original persisted journals, including prior
hashes. Fresh direct/replacement controls pass. Submitted and unknown outcomes
after handoff retain the current and older hashes; the unavailable-simulation
warning also survives.

The existing 17 privacy and 55 Sweep tests pass alongside the new 70 cases,
including actual-helper journal-write refusal and same-nonce replacement tests.
New lifecycle helper spies test the component boundary; they do not establish
cryptographic transaction acceptance.

Independent `clock_hosting_review` reviewed both final blobs above, found no
introduced blocker, and checked that the direct post-handoff suffix matches
`9e4ec2da` byte-for-byte. The lower helper source remains blob
`ef73a7ec629cf33da5dba4fa8b3d9f80913bbb1a`.

## Commands and remaining gates

Executed from `apps/web`, using the shared exact-lock Vitest executable:

```sh
NODE_OPTIONS=--max-old-space-size=768 node /tmp/ghostpay-0bed53303053-tests/node_modules/vitest/vitest.mjs run src/views/Sweep.quoteLifecycle.test.tsx src/views/Sweep.privacy.test.tsx src/views/Sweep.test.tsx --coverage.enabled=false --maxWorkers=1
```

The final RED run selected only the lifecycle file while `Sweep.tsx` still
matched `9e4ec2da`. The guard was then applied and the full focused selection ran
GREEN. Scoped lint from the repository root:

```sh
NODE_OPTIONS=--max-old-space-size=768 node /tmp/ghostpay-0bed53303053-tests/node_modules/eslint/bin/eslint.js --config eslint.config.js apps/web/src/views/Sweep.tsx apps/web/src/views/Sweep.quoteLifecycle.test.tsx
bash scripts/scan-secrets.sh
git diff --check
```

Full web typecheck/build on the earlier `9e4ec2da` source was environment-limited:
768 MiB exhausted V8 heap (exit 134); the coordinated 1536 MiB attempt was killed
(exit 137) during TypeScript checking without source diagnostics. These are
failed executions, not typecheck or build passes. Full typecheck/build and
browser acceptance have not qualified the final direct/replacement extension.
Applicable hosted CI at the final published head remains required.

Fresh broad #262 was inspected at `cb7cfc9ec4f6c051e99805a25132c9458beb7af0`.
Its network-policy APIs and destination ledger are not imported. This stacked
PR keeps #252 as its parent; retarget or combine only through the main
coordinator after checking current main, active ownership and exact-head gates.

No real transaction, deployment, release publication or main mutation occurred.
