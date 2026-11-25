# FC-03: Solana/TRON meta-address and memo interoperability alignment

Testnet and proof-of-concept scope only. Nothing here enables mainnet; nothing is deployed or audited.

## Provenance
- Donor: PR #376, branch `recover/ghostpay-chain-interop-20261121-5ceb`, head `f717157271fe494eb8094e504e9fec8276d51fcc` (base `eb59d93c`).
- Integration base: `origin/main` `f18e8c0c949459f6ecbe8d2c6d71ea208a6d160f` (main had moved from the assigned `c8e131c1`).
- Branch: `claude/fc03-chain-interop-20261125`, merged with `--no-ff`. Merge commit `166a9b114747eb3bf6ba3d66050fa9ba44687f31`.
- Conflict: only `docs/ai/ACTIVE_WORK.md`, resolved by union; the FC-03 claim sits at the top. No code changed beyond the merge.
- Changed workspaces (34 non-docs files): `packages/chain-solana`, `packages/chain-tron`, `packages/cli`, plus `test-vectors/meta-address-sol-tron-v1.json`.

## Browser-alignment check
- The web app imports `@ghostpay/solana-stealth` and `@ghostpay/tron-adapter` (`apps/web/src/features/{solana,tron}/wallet.ts`), not `chain-solana`/`chain-tron`. Neither web-side package is changed by the donor.
- The donor's `packages/chain-solana/src/interop.test.ts` and `packages/chain-tron/src/interop.test.ts` load the web-side source and `test-vectors/solana-stealth.json` plus the new shared vectors, and compare field by field. They pass in the runs below, which is the alignment evidence on current main.
- `packages/payment-uri` handles plain addresses only (no `st:sol`, `st:trx` or `gpst1` strings), so no overlap with this change.
- TRON `buildPaymentRequest` still throws `MEMO_NOT_BOUND` (`packages/chain-tron/src/adapter.ts`, covered by `adapter.test.ts`). The Solana adapter comment states mainnet is deliberately absent.

## Commands and outcomes (Windows host, shared machine)
- `npm ci --ignore-scripts`: completed.
- `npm run build:libs`: NOT completed. Stopped at about 24 of 69 libraries because of machine load; `chain-solana`, `chain-tron` and `cli` were built; `solana-stealth` and `tron-adapter` were not.
- `git diff --check origin/main...HEAD`: clean.
- typecheck and lint for chain-solana, chain-tron, cli: no errors printed (output was piped through `tail`; exit codes not captured).
- `chain-tron` `npm test`: 54/54 passed; coverage 100% statements, branches, functions, lines.
- `chain-solana` `npm test`: see results appended below.
- `cli` `npm test`: see results appended below.
- Hosted CI: pending.

## Limitations
- Local host uses CRLF checkout (`core.autocrlf=true`); `packages/chain-solana/src/adapter-types.test.ts` parses `packages/chain-adapters/src/adapter.ts` with an LF-only regex, so it fails locally regardless of this change (neither file is changed by the donor).
- KDF-heavy cli tests can time out under load on this machine.
