# GhostPay continuation — 2026-11-16

Candidate: [PR #182](https://github.com/djshellshoxxx/GhostPay/pull/182),
`codex/ghostpay-caveman-completion-20261116`, based on published #179
`b4be8866f6ff883fbbedc49be88b5b251a7d270e`. Implementation continued with the Caveman workflow, using one assistant
sequentially. No new independent worker review or external audit is claimed.

## Source and integration

- The #179 baseline now has 33 successful GitHub checks and three intentionally skipped release/deployment checks.
  Application CI: [43845832042](https://github.com/djshellshoxxx/GhostPay/actions/runs/43845832042).
- Integrated recovery #180 `ffd957e2` and #181 `98f77953`, plus newer completion #164 `0d2ea8b4`.
- Preserved the existing linear parsers when #164 supplied equivalent alternatives. Both sets of regression tests run.
- Initial publication `7abb31233917c068ee0de1f93a4159b7f84874ba` has tree
  `d28bd42a106d7a6096bd81de98fe0013ab28fd26`, exactly matching local `47f92f6f`. Every newly uploaded blob was checked
  against its local Git hash. Git transport lacked credentials; the connected GitHub API published the verified tree.
- Recovered only the two isolated custody patches from local `dded4c02` and `f12f9418`, not their surrounding unpublished
  branch. Local combined implementation `a8331a2d` adds those reviewed source changes and their regressions.

## Implemented behavior

1. **Linked invoice amount reporting:** exact bigint sums, below/equal/above comparisons, distinct observation counts,
   and a possible-duplicate-payment review prompt. Explicit links remain seller annotations, not settlement proof.
   Imported history, pending/claimed evidence and known reorg invalidations cannot contribute. The two reproduced
   conflict failures are fixed by validating/deduplicating the entire seller/chain scope before invoice/asset filtering.
   An immutable index avoids rescanning every record for each invoice. UI, catalog/security classification and user
   instructions are wired; automatic exact-amount matching is unchanged.
2. **ERC-6538 helpers:** nonce read/invalidation and on-behalf calldata builders are integrated and publicly exported.
   They validate the registrant, scheme-1 meta-address and bounded opaque signature, but do not sign or send. The
   canonical interface was checked against the [Final EIP](https://eips.ethereum.org/EIPS/eip-6538).
3. **Analyzer reporting:** Mythril rejects nonzero exits, missing/wrong-shaped data and multiple reports. Existing
   Echidna completeness checks remain intact. These are output-gate tests, not completed symbolic-analysis campaigns.
4. **Latest audit fixes:** enlarged QR views retain the privacy warning; sponsor sends serialize per chain and receipt
   failures return an unknown outcome with the transaction hash; pool relayer admission is bounded. Additional review
   reproduced eight invalid/mutable queue-limit failures and fixed them with validated, captured capacity.
5. **Solidity source gate:** the earlier line scanner missed `tx`, `.`, `origin` on three lines and comments between
   tokens. A small lexical scan now handles comments and strings separately, preserves conservative string/trailing-
   comment checks and reports source locations. Two new regression groups failed before correction.
6. **Custody recovery:** password strength now uses the same NFKC normalization as the existing KDF, without changing
   backup encryption/decryption. Vault unlock requires verified recovery evidence both before and after reading storage;
   an unverified download cannot authorize replacing keys, including when another tab replaces the saved vault. Explicit
   destructive confirmation remains available. Five tests reproduced the old behavior before the fixes.

## Executed evidence

Counts overlap. Do not add them into a unique-test total. Commands ran with one or two workers and bounded Node heaps;
cryptographic parameters, coverage thresholds and assertions were not weakened.

| Check | Result |
| --- | --- |
| `npm ci --ignore-scripts --no-fund --no-audit --prefer-offline`; `npm run build:libs` | Passed. |
| Vault package, full coverage | 277 passed; statements 96.28%, branches 93.14%, functions 99.68%, lines 98.65%. This run precedes the later password-policy recovery. |
| Invoice helper | 19 passed, including 300 seeded bigint/duplicate property cases; two original conflict tests failed before correction. |
| Invoice UI, ledger integration and security keys | 33 passed. Manual 40 + 60 links produce a 100-unit comparison without automatic linking. |
| Registry suites and public package exports | 40 passed, including 200 generated cases; built exports, typecheck and corrected lint passed. |
| Mythril + Echidna fault injection | 32 passed. |
| i18n / operations-monitor suites | 215 + 107 passed; unchanged coverage gates pass. Incoming test-only lint errors corrected and lint rerun successfully. |
| Pool relayer full suite | 43 passed, 9 explicit Anvil/circuit prerequisite skips; unchanged coverage passes. Eight queue regressions failed before correction. Real pool proof integration remains unqualified here. |
| Payer sponsor full suite | 139 passed, zero skipped, `REQUIRE_ANVIL=1`, native Anvil 1.8.5; coverage passes. Eight reused solc-0.8.28 fixtures matched 124 compiler source hashes against this checkout. No new contract compilation is claimed. |
| Solidity gate and analyzer regressions | 42 passed; source scan covers 39 Solidity files. Shell syntax checks pass. |
| Custody/session/IndexedDB/SellerKeys suites | 112 passed in five files on the combined custody worktree; baseline had five failures and 39 passes in the two directly affected files. |
| Catalog checks/extraction | Four catalogs, zero errors; 154 untranslated/review warnings retained. No missing source keys. |
| Library/web and changed package typecheck/lint | Passed before custody recovery; final combined reruns recorded below. Initial web typecheck ran before library builds finished and failed on missing declarations; rerun after the build passed. |

An initial local full web coverage run on the pre-custody source was stopped without a completed result when the missing
custody fixes were discovered. It is not a pass. Final combined web coverage and no-coverage suites are running on
`a8331a2d`; results must be appended before claiming a full local web pass. Hosted CI on the original #182 head had no
failures at inspection; those results do not qualify a later source head.

## Still incomplete

This is not all-spec completion. Keep `GHOSTPAY_SPEC_STATUS_2026-11-16.md` as the broader inventory, with these updates:
spec 02 now has explicit local amount reporting, and spec 06 now has the three transaction/call builders. Neither change
satisfies all remaining items in those specifications.

- Further implementation/qualification: canonical block-time reconciliation, ENS lookup, signed merchant-profile UI
  integration, original metrics-listener/stats/webhook requirements, and supported external adapter acceptance.
- Verified deployment data: per-chain announcer/registry runtime provenance, enabled feed/deployment matrix and signed
  manifests. No addresses, code hashes or oracle data were invented to clear these requirements.
- Product/authority decisions: guardian recovery, policy-hash privacy/AA ABI changes, and the separately scoped escrow
  product require agreed models before implementation can honestly satisfy their drafts.
- Release evidence: dedicated origin/ADR-0029, approved release-signing trust root, physical wallets/cameras/Safari and
  native-language checks, private CodeQL/Sonar clearance and independent external security review.
- Pool proof artifacts and real Mythril/Echidna campaigns remain separate unqualified gates.

No production deployment, public-chain transaction, release signing, protected-main merge or real-funds operation occurred.
Continue from the latest #182 head and recheck remote ownership/checks before editing. Do not return to stale main or
reapply the recovered patches from #180/#181, #164, or the local custody worktrees.
