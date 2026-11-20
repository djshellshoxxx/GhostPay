# Independent signer fixture follow-up — 2026-11-20

**Approve exact `f2b991f7eb2c843e96bb533729d71b6a537b9293` for integration and combined qualification.** The unchanged selected-seller case independently reproduces the missing-Continue failure. The full signer test file passes all eleven cases after the narrowly scoped synchronization repair. No production, signer-policy, network-authorization, timeout, or gate change was found.

This is another continuing independent follow-up turn by `qa_review_gen3`, not a newly spawned fresh agent. It uses its own isolated worktree and branch, `review/ghostpay-signer-followup-20261120`, from `3dc86fbc49e919e664230b63dae372ff79430fc5`, with ownership claim `c26ffefc`. The browser follow-up remains separate at evidence commit `97fd030ac9d06d62073e489603174d4a22d47024`.

## Source review

The reviewed commit has parent `bf8cb2dc` and changes only one assertion in `apps/web/src/views/Pay.signer.test.tsx`, then adds a check of the continuing mismatch state:

```ts
expect((await screen.findByRole<HTMLButtonElement>('button', { name: 'Continue' })).disabled).toBe(true);
expect(screen.getByText(MISMATCH)).toBeTruthy();
```

The original code performed the same disabled-state assertion with immediate `getByRole`. The selected-seller mismatch is a local verification result. The signer panel is deliberately rendered even while the current manifest-dependent payment review is not ready. In this fixture, `makeServices` resolves the manifest as `absent`; after that asynchronous state settles, the review can render its disabled Continue control. A visible mismatch message does not imply that this control already exists.

Waiting for the control fixes the observation order without changing the required state. The assertion still requires `disabled === true`. The existing absence of the old matching-pin result remains, the new assertion confirms the mismatch persists after the wait, and the same `createRpc` and `discoverWallets` spies must still have no calls. These network and wallet assertions now also cover the interval during which the manifest-dependent view finishes rendering. The test remains responsible for checking the selected seller only; it does not permit another saved seller's key to satisfy that selection.

The existing product guards are unchanged: parsed trust is tied to the active verification scope, payment review waits for the current manifest state, and Continue is disabled for a blocked signer, review blockers, or absent payment context. No test timeout or retry count was changed.

## Independent execution

| Execution | Result |
| --- | --- |
| Unchanged selected-seller case on the review base | **1 failed** with missing accessible Continue button; the other ten cases were not executed because of the explicit name filter. |
| Full `Pay.signer.test.tsx` after applying the exact repair | **11 passed, 0 failed, 0 skipped; exit 0.** |

The fixed commit was cherry-picked into the review checkout as `b69d472b`. Both executions used Node `v22.23.4`, the existing installed/compiled dependency graph, the original Vite/Vitest configuration, and `--maxWorkers=1`. No fixture behavior other than the reviewed change was altered for either run.

The baseline's completed JSON report survives the interrupted review turn and records the exact failure. Its former process-completion handle was no longer available when the reviewer resumed, so no separate baseline process-exit receipt is asserted. The fixed execution has a complete command and exit-code receipt.

- [Source and command receipt](evidence/source-receipt.json).
- [Baseline focused result](evidence/baseline.json) and [log](evidence/baseline.log).
- [Fixed full-file result](evidence/fixed.json), [log](evidence/fixed.log), and [execution receipt](evidence/fixed-receipt.json).

Source hashes independently match the exact reviewed commit. The related Pay, signer-panel, Disclosure, and fixture-service runtime source plus the Vite configuration and lockfile match the original review base. The patch adds no production changes.

## Hosted corroboration and remaining qualification

The supplied original hosted d74 web log for job `135981023399` independently shows the same selected-seller case failing to find Continue. Its observed totals are **3,849 passed, one failed, one skipped**. The raw log's SHA-256 is recorded in the source receipt, and a [normalized failure excerpt](evidence/hosted-web-failure.txt) is retained. These are the original hosted results, not results for the repaired source.

The root's combined follow-up should run the original full web and browser qualification on its final source head. This review provides the focused independent RED reproduction, full-file GREEN, and source assessment; it does not claim a full workspace, browser, lint, or typecheck run. No remote operation was performed by this reviewer.
