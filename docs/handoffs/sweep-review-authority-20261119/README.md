# Sweep review authority at signing boundaries

## Finding and correction

PR #272 rejects obsolete reviews at its journal/handoff callback. The existing low-level helpers still signed after the user changed the recipient, balance, or selected review while asynchronous work was pending. A valid seller session alone did not establish that the review remained authorized.

The focused regression retains real signing and key derivation and observes their call counts. On the unchanged helper, 11 cases failed and three post-handoff controls passed. The correction adds an optional `assertReviewCurrent` callback, composes it with the existing session guard, and checks it before deriving a spending key, at each existing asynchronous checkpoint, immediately before signatures, and before handoff. The final component supplies its current review guard for direct and relayed calls.

The callback remains optional to preserve existing lower-level callers. The component binding is mandatory for the protected UI path and must be reviewed on the integration candidate. The helper does not claim to cancel cryptographic work already executing. It rejects the result and prevents journal/transport handoff when authority changed during signing. Existing RPC network grants remain responsible for cancelling nested requests while helpers such as permit construction are pending.

All original quote checks, session checks, key wiping, journal callbacks and post-handoff submitted/uncertain-outcome handling remain in place. Once the transport begins, a later UI change does not erase the transaction outcome.

## Executed evidence

Source implementation: `1d8445b656bdc6a78449dcc3b112b57322e3f482`. Regression-only source: `5fedb1be`.

- Original helper plus new regression file: 11 failed / 3 passed / 0 skipped.
- Corrected helper plus new regression file: 14 passed / 0 skipped.
- Corrected helper, existing sweep and destination-privacy files: 126 passed / 0 skipped.
- Original type-aware ESLint on the helper and new test file: exit 0.

Commands from `apps/web`:

```sh
node ../../node_modules/vitest/vitest.mjs run src/lib/sweep.reviewAuthority.test.ts --maxWorkers=1 --coverage.enabled=false
node ../../node_modules/vitest/vitest.mjs run src/lib/sweep.reviewAuthority.test.ts src/lib/sweep.test.ts src/lib/sweep.destinations.privacy.test.ts --maxWorkers=1 --coverage.enabled=false
```

Typed lint from repository root:

```sh
node node_modules/eslint/bin/eslint.js --config eslint.config.js apps/web/src/lib/sweep.ts apps/web/src/lib/sweep.reviewAuthority.test.ts
```

The machine-readable receipt includes hashes of original logs and explicit execution limits. No assertion, timeout, coverage gate, security tool, contract, dependency, deployment or published release was changed. Final-source full qualification remains the coordinator's responsibility.

## Independent review

A separate provenance reviewer inspected the regression observations before implementation and confirmed that real crypto remains in use and post-handoff outcomes are tested. The same independent reviewer inspected final helper commit `1d8445b6` (runtime blob `6ea4e3713c2f314e4dff89cc0a93a30fce2f50cc`), found no introduced source blocker, and independently reran all 14 new cases successfully with zero skips. The reviewer also verified both component callback bindings at `04ded6b5`. This worker independently reviewed the coordinator's component composition at `04ded6b5` and the network clock repair at `676093a3`, with no introduced blocker found in those bounded source deltas. Those reviews do not constitute an external audit or whole-product release approval.


## Native balance consent follow-up

The direct native helper used its new RPC balance to choose the transfer amount even when that balance differed from the value the user had reviewed. The new regression proves that both increases and decreases, a changed response to a pending balance request, and a same-nonce replacement could be signed and handed off despite that mismatch. The unchanged helper failed four of the five selected cases; the control passed. Fourteen earlier authority cases were deliberately unselected in that RED run.

Implementation `3f6fcb845320a6d898e996d4a11d6fa22816b671` rejects a native balance that differs from `i.amount` immediately after the fresh balance request and authority check. Early key derivation still proves target ownership before disclosing the address to the RPC; mismatch is inside the existing `finally` that wipes the derived secret. Refusal occurs before gas estimation, signing or journal creation. ERC-20 transfer amounts and native gas-balance checks remain unchanged. The existing translated unexpected-balance error is used; the user must explicitly read the balance again before retrying.

Eight existing fixture lines used `1n` as an ignored native amount. They now pass the same balance those fixtures already return so their original gas caps, L1/oracle errors, dry-run failures and uncertain-outcome assertions still run. No assertion was changed. The final three-file selection passed **131/131 cases, zero skips**; original typed ESLint passed on all three files. The same-balance control verifies the actual serialized transaction and sender, and proves a deposit arriving after the preflight read cannot enlarge the signed value.

This fix does not introduce an exact gas/fee preview in the direct Sweep UI. That remains a separately identified testnet acceptance requirement. It does not affect the payments-disabled demonstration.
