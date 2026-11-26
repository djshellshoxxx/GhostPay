# Internal F03 worker execution brief

Read AGENTS.md, docs/ai/WORKFLOW.md and the F03 SPEC.md before editing. The current owner instruction
authorizes this feature; historical proposal labels do not block it. Work only in the dedicated
branch and owned paths. Preserve unrelated changes, transaction approval, crypto and release gates.

Codec worker: own new invoice-schema request-file module, tests, exports and package documentation.
Reuse strict JSON/base64url; no dependencies, network or duplicated invoice verification.

Browser worker: own new request-file UI components, focused tests, minimal CreateInvoice/Pay hooks
and additive English messages. Use the existing preview/open/review path. Treat files as untrusted.
Preserve lifecycle guards and prevent stale reads, implicit network actions and automatic payment.

QA worker: own independent real-envelope interchange tests and browser acceptance fixtures. Use
synthetic local invoices and dummy keys only. No live payments or third-party security testing.

The coordinator commits, publishes and runs combined gates. Do not stage other workers' changes
or push. Record actual checks and source pins. After implementation, give fresh auditors the spec,
base/head and evidence for independent standards, specification and defensive privacy review.
Fix concrete findings and re-review before claiming completion. Keep prompts internal.
