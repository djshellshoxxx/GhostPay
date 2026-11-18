# Independent merchant implementation review — 2026-11-16

Reviewer: Team B registry, separate from the merchant implementation worker.
Reviewed source: `4655bab8bde68bba3338a52de6e3535d6bedb5bf` on `codex/unified-merchant`.
Review-note branch: `codex/unified-registry`.

## Scope and result

Reviewed `merchantIdentity.ts`, `MerchantProfilePanel.tsx`, `embedHost.ts`, `App.tsx`, the version 2 embed SDK and
their focused tests. No blocking issue remains in this reviewed change after the corrections below. This is a
scoped independent AI source review, not an external audit or full release qualification.

The remote request remains explicit, bound to HTTPS, excludes credentials/referrers/redirects and has byte/time
limits. Late responses, cancellation and profile expiry are checked before presentation. Remote profiles must
include their source origin in the signed fields. Inline profiles cannot silently establish an origin pin. Template
fields are displayed as signed descriptions and never substitute invoice fields or payment authorization. Pin
storage is public advisory browser state, protected against cooperating concurrent writers by Web Locks; it is
not protected from arbitrary code controlling the checkout origin.

## Findings resolved during review

1. **Remote-profile iframe timeout.** A remote profile requires a payer action and fetch before the checkout can
   acknowledge the embed handshake. The existing SDK would remove the frame after four seconds and try a popup
   outside the original click gesture. Remote `gpmu` checkouts now open the popup immediately from the click.
   The author added and reproduced a failing regression before the fix; inline iframe behavior is retained.
2. **Concurrent advisory-pin overwrite/removal.** Separate `localStorage` read/write operations could accept a
   stale absent/saved state across tabs. The reviewer independently reproduced an overwritten concurrent key.
   Save and removal now use the same exclusive, nonwaiting origin lock and refuse unavailable or held locks.
   State and current profile are checked inside the critical section; another checkout-origin script that ignores
   the lock is outside this protection and remains documented.
3. **Revoked consent during asynchronous pin mutation.** Clearing full-key confirmation or retracting the removal
   checkbox while waiting for a lock callback previously left the mutation authorized. `pinRevision` now changes
   on confirmation edits, checkbox changes and storage/focus refresh. Both the critical section and completion
   callback check it. The author reproduced the failing delayed-lock regression before the correction.
4. **Missing-lock fixture portability.** Node 24 exposes `navigator.locks`; passing `undefined` to a parameter with
   a default does not simulate missing locks. The test now explicitly stubs unavailable locks and restores globals.

The earlier identity warning also said no identity pin existed even after a saved-key match. The integration owner
owns the coordinated critical-locale correction; the final notice must describe key-control and identity limits
without contradicting the saved-key display.

## Evidence

- The reviewer executed ten independent native Node assertions covering concurrent saves, mismatched removal,
  revoked removal/save guards, explicit valid removal, final storage state and unavailable-lock refusal: all passed.
  Tested helper blob: `8859aeb207e4b839838bdc3a5c8d9433fd9ae308`, confirmed equal to the file at reviewed commit.
- The implementation worker reports **116/116** focused App/privacy/SDK/profile/helper tests and full web
  typecheck passing on the committed source. These results were reported by the worker; the reviewer did not rerun
  that whole suite or add its overlapping counts to the independent assertions.
- The new Playwright merchant/cross-tab scenario was source-reviewed but had not executed when this note was written.
- Focused lint was still running when the source commit was supplied. The coordinator must record its final result
  and requalify the combined candidate.

## Remaining boundaries

Real merchant hosting/CORS, browsers and devices, native-language review, release SDK hash publication and the
broader independently audited release remain pending. Web Locks and storage are required to change saved keys;
their absence refuses the mutation. No contract, wallet authority, custody key or production deployment changed.
