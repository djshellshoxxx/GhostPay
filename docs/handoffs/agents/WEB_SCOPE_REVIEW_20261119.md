# Independent focus and lean-buffer test review — 2026-11-19

Reviewer: `contract_security`. Reviewed coordinator source:
`cbed997a1fd8398975feac8fa23f9162a65f7e73`.

**Result: PASS for source review.** The change adds two focused acceptance
boundaries without changing runtime behavior or relaxing existing assertions.

## Focus scope

`apps/web/e2e/focus-scope.spec.ts` covers the existing AppShell `[view, fragment]`
effect. A rejected paste preserves the Read control and leaves focus there.
A valid in-view paste loads the invoice, removes that control and puts focus on
`main#main`. The assertions check both DOM removal and the actual active element.
This accurately pins the accepted in-view fragment-change behavior rather than
claiming focus moves only on deep-link arrival. It does not change or broaden the
runtime focus effect.

## Existing v1 buffer in supported profiles

`apps/web/src/views/Pay.supported.test.tsx` exercises the same case in `full` and
`lean` profiles. It requires the v1 gas-buffer checkbox to start unchecked, the
extra native amount to remain absent before opt-in, and the amount and public
linkage explanation to appear after an explicit click. It also verifies that
this opt-in never starts wallet discovery. The synthetic RPC includes the
existing OP fee read; this mocked UI test is not proof of actual OP chain fees.

`docs/handoffs/LEAN_RELEASE_SCOPE.md` accurately distinguishes the existing
payer-opted v1 buffer from the deferred v2 seller buffer policy and keeps
real-chain buffered-sweep acceptance separate. Nothing in these tests enables
the deferred policy or claims additional privacy.

## Evidence boundary

This reviewer inspected the full three-file commit and the relevant current
source semantics. The coordinator owns execution evidence. No new browser or
web test run was performed by this reviewer for this review. A Playwright
`--list` result establishes discovery only, not browser execution. The
coordinator's later focused test/lint receipts must be cited separately from
this source-review approval.
