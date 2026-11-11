# GhostPay owner source disposition — 2026-11-02

The owner authorized continuing implementation from the verified published
application source while preserving the reported `7979e6f` consolidation as
explicitly unavailable. This is a disposition permitting overlapping engineering;
it is not recovery of that commit, its unique source or its unavailable assets.

The implementation baseline is published
`70d8bf6ec37a5ea61868b9de2a3cea60e22ca6d2`, tree
`86214bc44259326379239a99bfd2c3bd8572997a`. Canonical main's documentation at
`c148ee13ef8273660b9cf16477329e5fedede4b9` is preserved. Existing refs, deferred
features and their tests remain available; no absent feature packet is inferred
from memory. If the unavailable source later becomes accessible, preserve it and
compare its unique changes before adopting or superseding them.

The accepted first milestone remains the client-only one-EVM flow in
`LEAN_RELEASE_SCOPE.md`. Implementation will reuse available recovered lean-build
work and current cryptographic/receipt helpers while retaining newer key-loss,
session, cancellation, payment and sweep safeguards.

This decision does not waive required independent engineering review, unchanged
quality/coverage/security gates, final-source qualification or named release
gates. It grants no deployment, release/tag, production transaction, permission
expansion, new spending, credential change, license choice or production trust
configuration authority. Missing private review assignments remain unresolved.
