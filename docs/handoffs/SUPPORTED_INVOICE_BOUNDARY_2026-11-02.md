# Supported invoice boundary — 2026-11-02

The accepted lean release defers fiat conversion and invoice buffer-policy v2.
Hiding optional routes does not enforce this boundary: an incoming signed link
can still contain either policy. Preserve the shared schema and full build;
refuse unsupported invoices before payment context, RPC or wallet interaction.

`Pay` accepts an optional `supportedOnly` property, default false. The lean shell
sets it true. Supported invoices have `v === 1` and `amountPolicy.mode ===
'fixed_token'`. A seller-stated fiat label on a fixed-token invoice remains
unverified metadata, not conversion. Existing v1 buffer safety checks remain.

Enforce the rule after ordinary/passphrase opening, before context creation and
at final signing guards. Include the profile in QR/import and async authority
scope so changing the profile invalidates stale work. Retain deferred source,
full-build tests, and production trust/network/fee decisions.

Tests exercise actual shared-shell/Pay composition: fixed-v1 acceptance, v2/fiat
refusal without effects, passphrase refusal, full preservation and stale context
after profile change. Unexecuted runtime checks remain explicitly unqualified.
