# Pages late-payment handling

Base `main` is `8ddb344973e80b8e1eda6821e970ee6a2b808b29`. Work is isolated on `codex/ghostpay-late-payment-20261123`.

- Reuse ADR-0026 and the M3 inventory at `6b6a030c598b0beeb3d38846e753a8b2249e96d6`. Its owner branch `claude/keen-volta-8ctx9x` was at `d3bbc9aa555fa9f8eaea31ddc8c6d6e5e7a232ea` with M1 journal changes and no seller implementation. The late-invoice-focus ref `23cc6db4b924943ba99b169ac83c214272dcaa10` is keyboard focus coverage already in main. PR #186 canonical block time is also on main. #455 is the recovery audit. #383 covers registration cleanup and #427–#443 own wallet attempt integrity.
- `pay.ts` caps the GhostPay web deadline at the last payable second. `payExec.ts` and `Pay.tsx` distinguish receipt failure from timeout. An external payer using the same router and a later deadline can deliver funds. A bare transfer or public announcement without the existing router evidence is outside automatic verification. Seller attribution is local because the chain carries no invoice reference.
- `scanClient.ts` checks router transaction and receipt evidence and chain-specific finality. `Scan.tsx` and the encrypted CAS vault already handle canonical rollback. `reconciliation-portable.ts` currently refuses late links and the registered-invoice UI ignores unresolved matches. Work targets those gaps using the existing scope and backing store.
- Planned checks: focused unit/component tests, local-chain deadline and browser journeys, web/vault typecheck/lint/build, privacy and bundle checks, exact-head independent review. Integration lock was released, generation 12 at `082e754f44944ebb4be283f89176b966bf8f7b4f`. Refresh before shared integration. No main merge, deployment, release or real funds.

The seller path uses the registered-invoice scope and existing direct router evidence. The invoice identifier is
not present in the transaction. Review is explicit and local. A candidate never proves payment intent. The current
payer outcome/journal interfaces cover reverts and uncertain broadcasts; the independent M1 durable recovery effort
remains on its existing branch. No payer journal changes were needed here. The Create form warns before issuing a
potential replacement, and expired ledger entries show case-specific warnings.

Limitations: registered fixed-token invoices on supported EVM chains only. Unannounced bare transfers remain outside
the scanner's existing evidence model. Encrypted backup imports retain earlier decisions as untrusted history.
A browser reload with the same local encrypted vault can recover observations when the seller unlocks it again.
