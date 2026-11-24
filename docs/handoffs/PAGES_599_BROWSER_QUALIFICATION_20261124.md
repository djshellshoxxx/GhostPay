# Exact-head Pages qualification for PR #599

Observed **2026-11-24 09:10 UTC**. Worker: `resume_package_qualification`. The missing local Pages/Anvil qualification is complete: **16/16 passed in one original-runner execution**, no retries or skips, at published head `0c7f680d0791668a68c3a92d7d4ba44087dcf2b8`.

## Ownership and source review

The existing [PR #599](https://github.com/djshellshoxxx/GhostPay/pull/599), `resume/seller-reconciliation-20261124`, already repaired imported-history expectations and added the contradictory-event fixture. It supersedes this worker's unpublished overlapping repair at `d2cb576b2bb210d045a32827d8133e8ecee56418`. Its code is reused unchanged. This evidence-only child is `qualification/20261124/pages-599`; it does not publish a parallel code fix.

The tested PR remains a child of [#575](https://github.com/djshellshoxxx/GhostPay/pull/575) at `5a225f6cdaeeaf9c6dad8d8a11f3f437fff83727`. Preserve the existing #575 → #546 → #533 dependency order. Both published head and base were reread after the run; #599 remained open, draft and unmerged at that head.

Independent source review found no blocking issues:

- Browser blob `a4fde9a716f6831e2b43047af8efe0e11510347c` scopes the imported/unverified and zero-credited-summary checks to the registered invoice. Saving the freshly rescanned observation must produce a verified link, equal expected amount and one distinct observation. Backup rejection, digest preservation, one saved record and refusal to sweep the spent payment remain intact.
- Native fixture blob `d4d1eb99506c4e497ab77fb1bc8e07a4a9678fd3` explicitly rejects contradictory copies of one event and requires zero stored records. Distinct event IDs then exercise independent amount/asset mismatch controls. This matches `observeInvoicePayments` without changing production behavior or discarding those controls.

The PR author's existing `SELLER_RECOVERY_FIXTURE_QUALIFICATION_20261124.md` records 72 native tests and typed lint passing. This worker reviewed those changes and supplied the missing browser qualification; no independent rerun of those 72 native tests is claimed.

## Fresh build and complete browser run

The tracked tree was clean at the exact published head before and after the run. The original runner and Playwright configuration were unchanged:

```sh
PATH=/workspace/scratch/efb8df2579c9/gp-foundry-tools:$PATH \
FOUNDRY_SOLC=/workspace/scratch/efb8df2579c9/gp-foundry-tools/solc-0.8.28 \
GHOSTPAY_CHROMIUM=/workspace/scratch/efb8df2579c9/mobile-browser-runtime/chrome-headless-shell-linux64/chrome-headless-shell \
BROWSER_DEVNET_MODE=pages BROWSER_DEVNET_KEEP=1 \
BROWSER_DEVNET_PORT=8546 BROWSER_DEVNET_PAGES_PORT=4175 \
bash scripts/beta/browser-devnet.sh
```

The runner started a fresh local Anvil, deployed the unchanged contracts, switched to chain 84532, signed and verified the devnet manifest, and built a fresh lean Pages artifact. Typecheck/build, bundle scanning, assembled-site verification and served-byte SHA256SUMS checks passed. Build-info commit equaled Git HEAD.

**Result: 16 passed (1.9 minutes), exit 0, zero retries, zero skips.** The same-nonce cancellation case passed unchanged in **43.9 seconds**. Coverage includes:

- Signed invoice, explicit wallet confirmation, real native payment and duplicate-send refusal after reload.
- Pending/final scan evidence, invoice-bound receipt, one ledger entry, real direct sweep and refusal of another sweep.
- Actual browser restart, vault unlock, clean-profile recovery, damaged/wrong-passphrase backup rejection, explicit unverified imported history and zero credit, then exactly one verified credited observation after saving fresh scan evidence.
- Real same-nonce higher-fee zero-value cancellation; original hash retained as submitted, absent original receipt and seller credit, no scan receipt, and no duplicate send after reload.
- Tampered/expired invoices, invalid RPC settings, RPC outage, wallet rejection, Home release hash and strict network routing.

The journey recorded 211 requests, 7 distinct subpath resources and 166 RPC calls; no foreign origin or path outside `/GhostPay/`. The ERC20 selector case preserves the fixture boundary: the lean UI exposes canonical Base Sepolia USDC/EURC, which this local deployment does not deploy; it does not fabricate an ERC20 transfer.

Runtime: Node 24.22.3, Playwright 1.64.1, Chrome Headless Shell 156.0.8078.4, Foundry 1.8.5 (`51a52c59cffd940f76eddd0b4bb1791aa4b5ac7f`), solc 0.8.28 (`7893614a`). ESLint/typescript-eslint were present at repository pins 10.15.0/8.73.0. Foundry and solc came from official release artifacts. Public local-development accounts only; no remote chain or real funds.

Dependencies and 65 built library outputs were copied from this worker's built #575 child after equality checks: both package trees are `d1cc0fea8b921adece47a197235f01a0a7f09c83`; root package manifest and lockfile are identical. Workspace links resolve into the new checkout. The web artifact itself was rebuilt at #599. No separate clean `npm ci` or local Node 22 execution is claimed.

## Earlier cancellation investigation

The unpublished `d2cb576b2bb210d045a32827d8133e8ecee56418` child passed 15/16 cases in its full run. Recovery passed; cancellation exceeded the original 60-second pending-result wait. The replacement's on-chain checks passed, and the snapshot retained the original hash, disabled send button and `Waiting for inclusion…`, with no confirmed payment.

A single focused replay on unchanged `d2cb576b` source and the identical verified artifact passed in 46.5 seconds. The pending-result assertion completed after 40,859 ms, consistent with the production poll's 20 two-second sleeps plus request/scheduling time. Submitted-journal, zero seller match/receipt, reload refusal and unchanged send/nonce/balance checks then passed. The baseline #575 cancellation case also passed. A transient execution delay is consistent with this evidence; its exact scheduler cause was not proven. No production code, timeout, cancellation assertion or separately owned #589 retry-warning assertion changed.

These results retain their actual source attribution. The uninterrupted 16/16 #599 run closes the local single-run qualification gap. Historical report SHA256: `455f765639011f219ec4a2c441f6cfba34f777f26a044d727cbbcd4247b27e19`; trace SHA256: `8bf24a9689fdcf088d03a98d767f84b0bb3840a7651266c5fe09f741613c134a`.

## Evidence and remaining hosted gates

`docs/qa/pages-599-20261124/qualification.json` preserves the complete successful runner output, source blobs, dependency equality, runtime, artifact evidence hashes, historical cancellation outcome and hosted snapshot.

- Current log: `/workspace/scratch/efb8df2579c9/gp599-pages-exact.log`; current artifact/deployment/evidence: `/tmp/ghostpay-browser-devnet.DdR0jZ/`.
- Prior full run: `/workspace/scratch/efb8df2579c9/gp575-pages-candidate.log`, `/tmp/ghostpay-browser-devnet.2Xxrwp/`.
- Prior focused replay: `/workspace/scratch/efb8df2579c9/gp575-pages-focused-cancellation.log`, `/tmp/ghostpay-browser-devnet.hErhOb/`.
- The superseded unpublished repair and detailed historical handoff remain locally at `6f424bb9` on `test/20261124/pages-restored-history-status`.

At 09:10 UTC, all five hosted groups were still queued at #599's exact head: CI `45360469409`, Pages `45360469438`, Beta acceptance `45360469327`, Hosting kit `45360469302`, CLI qualification `45360469316`. Local success does not establish hosted success, and this source review is not a formal GitHub approval.

The bounded local qualification is complete. Reread heads and ownership before integration, retain the existing PR and ancestry, and observe hosted completion. This child adds only claim/evidence files; no original-branch push, shared merge, deployment, production edit or gate weakening occurred.
