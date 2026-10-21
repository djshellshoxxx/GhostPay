# Phase B feature reviews

Playbook Phase B asks for a short post-implementation security review per built feature. Audit 01 (G-10, D-10, D-12) found none. The files here are those records.

**What these are:** dated, self-run reviews by the documentation author, tied to existing test names, with the residual risk and the gaps stated. They read the code and the test lists; they did not execute new adversarial tests. Rule: nothing is claimed as covered unless a named test covers it, and tests that exist only against mocks are labelled as such.

**What these are not:** independent reviews or audits. Every feature here is also subject to the whole-system findings in [audit 03](../audits/03-security-review-client-relayer.md) and [audit 04](../audits/04-independent-design-analysis.md).

| Record | Feature | Built scope | Biggest open point |
|---|---|---|---|
| [2026-10-21-F1-gas-buffer.md](2026-10-21-F1-gas-buffer.md) | F1 gas buffer | Router `payERC20WithBuffer`, client sizing, opt-in toggle | No invoice-level policy, no fiat estimate, no permit+buffer, fixed 100 000 gas estimate |
| [2026-10-21-F2-embed-popup.md](2026-10-21-F2-embed-popup.md) | F2 embed | Popup-only SDK taking a full invoice link | No merchant profile, no iframe, no fuzzing, no SRI/hash publication |
| [2026-10-21-F4-local-tags.md](2026-10-21-F4-local-tags.md) | F4 local tags | Encrypted tag vault in IndexedDB | No export/import or rotation; record splicing |
| [2026-10-21-F6-jitter.md](2026-10-21-F6-jitter.md) | F6 payment delay | CSPRNG delay with cancel and revalidation | Only unit/mocked tests; no browser suspend test |
| [2026-10-21-P1-quote-preview.md](2026-10-21-P1-quote-preview.md) | P1 quote preview | Fee/gross/net preview, calldata equality, Chainlink reader | Fiat path has no verified feeds; preview trusts the manifest |
| [2026-10-21-P2-wallet-handoff.md](2026-10-21-P2-wallet-handoff.md) | P2 wallet handoff | EIP-6963/1193, QR, receipts | Mock wallets only; no a11y audit |

P3 (policy account) has no client feature to review; see [ADR-0014](../adr/ADR-LOG.md) and [audit 02](../audits/02-security-review-contracts.md).
