# Browser self-check footer — isolated candidate (2026-11-21)

Source base `eb59d93cffed7848c4aac37d0e9650b87239c6da`. Isolated branch `chatgpt/ghostpay-browser-selfchecks-20261121`; ownership claim `7190c6c617d393bce024ee282a0f21cde3f6c82d`, test-first revision `d63de11d8f8957ab394503f4624109a9ec2aa909`.

This Pages-only slice adds a shared self-check disclosure in the AppShell footer, visible across all SPA views. Startup, focus, pageshow, visible-tab refresh and one-minute visible-tab periodic checks exercise local secure-context reporting, WebCrypto SHA-256 known-answer validation, and a transient browser-storage round trip with best-effort probe cleanup. Only the public outcome category is displayed. The temporary localStorage probe has no secrets; the code makes no network requests, sends no telemetry, reads no keys and performs no wallet actions.

The disclaimer explicitly refuses to equate successful self-tests with independently verified application code, chain trust, wallet authenticity, payment safety or recovery. This is a bounded first layer of the broader self-check workstream, not a completed code-integrity or fund-safety subsystem. Follow-up work: actual verified release artifact identity/SRI authority, chain/RPC provider readiness, encrypted recovery readiness, and integration with application security states, all with user privacy preserved.

Added deterministic unit and React component regressions for real SHA-256, wrong/rejected digests, insecure contexts, blocked/missing storage, transient cleanup, accessible footer and stale async run suppression. Added 11 message keys to each shipped locale, with security-sensitive limitation text classified in the IN-3 protected English-only group for unreviewed translations.

Exact-head CI and external browser/device QA: PENDING. Independent review: PENDING. Known overlap with large existing PR #278 (AppShell/locales) and #307 (CSS/locales); integration ownership and reconciliation required. No deployment, production transaction or merge into main is authorized by this isolated branch.
