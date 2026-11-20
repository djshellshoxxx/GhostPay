# Receipt transaction-hash validation — 20261120T0115Z

## Source and ownership

- Base: PR #278 `417f7c71daf8645e1432f2ec8f070110879b80bd`.
- Branch: `automation/20261120T0115Z/worker/receipt-hash-validation`.
- Implementer: native ChatGPT `/root/spec_verification_review`, explicitly assigned by the coordinator.
- Claim: `0f13f0f1a31b078624306cafbfc9ee065fb3493f`.
- Tests and fixture repairs: `be7fb39bc7bb6e66b54f89bdd3628d308fb9c676`.
- Frozen production and test source: `d08b8ec3ea3cb01c40e1de2ab4998a1c6f546c67`. This handoff commit changes documentation only.
- Coordinator-published counterparts on the same isolated branch (GitHub connector commit metadata differs, trees verified equal): claim `e7d5ef8722f922f50cd9256150e7535c40feb657`; regression `d9e385654d7da49409991d1286a438462a5842e4`; production `a221a9d5199bde11e45e1bc822e7305f4fe01bb9`. The production tree is `e4c236f8e03e3cb5169f4349997b14750bb0ccc7`, identical to local `d08b8ec3`. Local execution pins remain explicit; hosted qualification is separate.
- Runtime blob `apps/web/src/lib/wallet.ts`: `3320a5650eab89763e16649e05ba8b4fa2ddeab9`.
- Wallet test blob: `d76eae2520f89b14208485a79f8e686117382a55`; payment test blob: `4deb9d710209a5a83a8ae9d5dcecf3aac1058748`.

## Confirmed defect and minimal repair

At the base, `apps/web/src/lib/wallet.ts:478–505` accepted an RPC receipt without reading its `transactionHash`. An otherwise valid success or reverted receipt for hash `0x88…88` could therefore be associated with requested hash `0x99…99`. The existing `submitTx` consumer in `apps/web/src/lib/payExec.ts:136–144` separately compares the submitted transaction with its preview, but that comparison does not associate the returned receipt with the transaction. Its local receipt builder can consequently assign an unrelated inclusion/revert result to the submitted hash.

Classification: confirmed transaction-status correlation correctness defect; low security severity, high confidence. Practical impact depends on an inconsistent or malicious user-selected RPC returning an unrelated receipt; this does not demonstrate unauthorized transaction construction or signing. Existing transaction preview, destination, chain and duplicate-attempt checks remain effective within their scopes. A consistently lying RPC is not made trustworthy by this repair, and receipt inclusion is not finality.

The five-line runtime change at `wallet.ts:492–496` requires a primitive string matching the existing 32-byte `0x` hash validator, then compares hexadecimal identity case-insensitively. Missing, non-string or malformed hashes use the existing fixed `UserFacingError` receipt-shape descriptor. A valid but different hash uses existing `SubmissionMismatchError('hash')`. No coercion hook is invoked. Null/pending polling, destination validation, matching success/revert, allowance readbacks, transaction construction and confirmation policy are unchanged.

The wallet regression matrix covers missing and fourteen malformed hash categories, unrelated success and reverted receipts, an object with a coercion hook, both hexadecimal case directions, and a pending/pending/matching sequence. The new payment consumer regression demonstrates the original hash is retained in `PostBroadcastError` and the attempt journal, one broadcast occurs, and an explicit repeat cannot resend.

## Fixture repairs

The wallet unit fixture now supplies its matching transaction hash. Seven existing consumer/browser receipt-return fixtures also lacked this mandatory JSON-RPC field and now supply the queried hash:

- `apps/web/src/lib/payExec.test.ts`: ordinary success, explicit reverted receipt, and delayed-transaction approval receipt (three fixtures).
- `apps/web/src/lib/payExec.acceptance.test.ts`: ERC-20 acceptance receipt.
- `apps/web/src/views/Pay.test.tsx`: ordinary success and receipt-without-transaction UI fixtures (two fixtures).
- `apps/web/e2e/flowMocks.ts`: ordinary routed receipt.

All existing assertions, null pending fixtures, timeouts and gates were preserved. The E2E fixture was source-reviewed and typechecked; browser execution is not claimed. Other receipt validators and canonical-evidence helpers were not changed.

## Author execution evidence

Environment: native ChatGPT shell, Node `24.22.3`, repository Vitest `5.1.0`; no external agent, paid API, real wallet or RPC was used. Installed dependencies were copied from the coordinator's matching package/lock checkout. After the coordinator completed its library build, 64 package output trees were reused only after exact tracked package-tree equality; the differing `merchant-ledger` package and its invoice-schema prerequisite were built locally at this source. No dependency or configuration file changed.

Commands use the original repository configuration, a single Vitest worker, and a 1536 MiB heap cap for compiler/lint commands:

| Check | Source | Result |
| --- | --- | --- |
| Initial wallet/payment test collection | `be7fb39b` | Failed before collection because `@ghostpay/tx-review` was still being built while outputs were copied. Zero tests ran. This is setup evidence, not regression RED. Recopying its completed source-identical output resolved it. |
| `vitest run src/lib/wallet.test.ts src/lib/payExec.test.ts --maxWorkers=1` from `apps/web` | `be7fb39b`, unchanged runtime | **19 failed, 93 passed; exit 1.** Eighteen wallet failures and one real consumer failure demonstrate the defect. |
| `vitest run src/lib/wallet.test.ts src/lib/payExec.test.ts src/lib/payExec.acceptance.test.ts src/views/Pay.test.tsx --maxWorkers=1` from `apps/web` | `d08b8ec3` | **4 files, 180 passed, zero skips; exit 0**, 32.38 seconds. |
| `NODE_OPTIONS=--max-old-space-size=1536 ../../node_modules/.bin/eslint --config ../../eslint.config.js src/lib/wallet.ts src/lib/wallet.test.ts src/lib/payExec.test.ts src/lib/payExec.acceptance.test.ts src/views/Pay.test.tsx e2e/flowMocks.ts` from `apps/web` | `d08b8ec3` | **Exit 0**, no diagnostics. |
| `NODE_OPTIONS=--max-old-space-size=1536 npm run build --workspace @ghostpay/merchant-ledger` from repository root | `d08b8ec3` | **Exit 0**, including its existing invoice-schema prerequisite. This is dependency preparation, not a new merchant feature qualification. |
| `NODE_OPTIONS=--max-old-space-size=1536 npm run typecheck --workspace @ghostpay/web` from repository root | `d08b8ec3` | **Exit 0**, original full web TypeScript project. |
| `git diff --check` | `d08b8ec3` | **Exit 0.** |

## Independent review and coordinator build

Independent native reviewer `/root/final_checkpoint_review` completed source and test review at `d08b8ec3ea3cb01c40e1de2ab4998a1c6f546c67` with **no blocking scoped finding**. The reviewer independently ran the same four committed repository suites in a separate detached worktree: **180 passed, zero skips, exit 0**, 46.95 seconds. It also checked the committed regression source `be7fb39b` against the unchanged baseline runtime: **19 failed, 93 passed, exit 1**, 3.43 seconds, comprising eighteen wallet failures and one consumer failure. The review worktree was restored cleanly to `d08b8ec3`; the author worktree was untouched.

The reviewer confirmed the five-line guard, single-read primitive validation without coercion, distinct fixed malformed/mismatch errors, required fixture-field repairs, and original-hash/no-resend behavior. Its evidence packet is `receipt-review-20261120T0115Z/independent-review.json`, with RED/GREEN logs, receipts and `SHA256SUMS.json`. This is independent native engineering review, not a formal GitHub approval or authorization to merge/release. The reviewer reused source-matched dependency outputs and did not independently rebuild, repeat compiler/lint, execute browser acceptance or claim full coverage. Earlier source-standards review is historical pre-patch assessment, not implementation approval.

The coordinator executed the existing `bash scripts/pages/build-pages.sh /workspace/scratch/a13b43b0f3c9/receipt-pages-20261120T0115Z` at frozen `d08b8ec3`; it completed with exit 0 in 26.96 seconds. This was a payments-disabled development build with no configured manifests, release keys or production origin. The existing Pages verifier was rerun with `--expect-commit d08b8ec3ea3cb01c40e1de2ab4998a1c6f546c67`: exit 0, all 16 `SHA256SUMS` entries matched, `release=false`, and `paymentsEnabledChainIds=[]`. No deployment or browser acceptance was performed. The artifact does not qualify enabled payments or a release.

Coordinator receipts: `receipt-build-20261120T0115Z/pages-build-result.json` and `pages-reverify-result.json`; full build and verification logs are alongside them. Author logs and SHA-256 metadata are collected in `receipt-author-20261120T0115Z/author-qualification.json`. These paths are relative to the shared task scratch root; the full failure transcripts are also preserved below in this committed handoff.

Primary requirements, independently consulted by the reviewer:

- [Ethereum execution API — eth_getTransactionReceipt](https://ethereum.github.io/execution-apis/api/methods/eth_getTransactionReceipt/).
- [Ethereum JSON-RPC documentation](https://ethereum.org/developers/docs/apis/json-rpc/#eth_gettransactionreceipt).
- [EIP-1474 receipt method](https://eips.ethereum.org/EIPS/eip-1474#eth_gettransactionreceipt), corroborating historical API documentation; its status is Stagnant, not a finalized standard.


## Integration and remaining gates

This isolated worker made no remote writes, merged nothing, and acquired no integration lock. The existing #278 and other active branches remain untouched. The coordinator owns publication, exact-head hosted CI refresh, dependency-aware queue and no-deployment checks. Full web coverage, browser acceptance, release qualification and unrelated security/contract findings are not certified by this focused repair. No cryptography, fees, contracts, production settings, workflows, release gates or schedules changed.

Next action: publish this frozen repair as an isolated draft against the freshly reconciled #278 dependency, retain the test-first history, and require hosted and integration gates before any merge. Do not interpret source review or a payments-disabled development artifact as authorization to enable payments or deploy.

## Preserved failure transcripts

### Initial incomplete dependency collection

```text

 RUN  v5.1.0 /workspace/scratch/a13b43b0f3c9/GhostPay-receipt-hash/apps/web

 ❯ src/lib/payExec.test.ts (0 test)
 ❯ src/lib/wallet.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/payExec.test.ts [ src/lib/payExec.test.ts ]
 FAIL  src/lib/wallet.test.ts [ src/lib/wallet.test.ts ]
Error: Failed to resolve entry for package "@ghostpay/tx-review". The package may have incorrect main/module/exports specified in its package.json.
 ❯ src/lib/txGuard.ts:2:1
      1| import { ChainAdapterError, FEE_SCHEDULE, tokensForChain, type Address…
      2| import {
       | ^
      3|   ReviewRefusedError,
      4|   TxReviewError,
 ❯ src/lib/pay.ts:42:1

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯


 Test Files  2 failed (2)
      Tests  no tests
   Start at  17:25:11
   Duration  2.40s (worker 97%, environment 3%)

```

### Committed regression RED against unchanged runtime

```text

 RUN  v5.1.0 /workspace/scratch/a13b43b0f3c9/GhostPay-receipt-hash/apps/web

 ❯ src/lib/payExec.test.ts (62 tests | 1 failed) 1321ms
   ❯ native payment end to end (mock wallet, mock RPC) (12)
     × rejects another transaction receipt after broadcast while preserving the submitted hash and preventing resend 70ms
 ❯ src/lib/wallet.test.ts (50 tests | 18 failed) 53ms
   ❯ pollReceipt (23)
     × rejects a receipt for another transaction with status 0x1 11ms
     × rejects a receipt for another transaction with status 0x0 1ms
     × rejects a receipt without a transaction hash 1ms
     × rejects a malformed receipt transaction hash: undefined 1ms
     × rejects a malformed receipt transaction hash: null 1ms
     × rejects a malformed receipt transaction hash: number 1ms
     × rejects a malformed receipt transaction hash: boolean 0ms
     × rejects a malformed receipt transaction hash: array 1ms
     × rejects a malformed receipt transaction hash: array-like object 1ms
     × rejects a malformed receipt transaction hash: object 0ms
     × rejects a malformed receipt transaction hash: symbol 0ms
     × rejects a malformed receipt transaction hash: empty 1ms
     × rejects a malformed receipt transaction hash: short 0ms
     × rejects a malformed receipt transaction hash: long 0ms
     × rejects a malformed receipt transaction hash: nonhex 0ms
     × rejects a malformed receipt transaction hash: missing prefix 0ms
     × rejects a malformed receipt transaction hash: uppercase prefix 1ms
     × rejects an object hash without invoking its coercion hook 1ms

⎯⎯⎯⎯⎯⎯ Failed Tests 19 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/payExec.test.ts > native payment end to end (mock wallet, mock RPC) > rejects another transaction receipt after broadcast while preserving the submitted hash and preventing resend
AssertionError: promise resolved "{ …(3) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "hash": "0x9999999999999999999999999999999999999999999999999999999999999999",
+   "receipt": {
+     "blockNumber": 100n,
+     "status": "success",
+   },
+   "verification": "verified",
  }

 ❯ src/lib/payExec.test.ts:140:20
    138|     const hash = `0x${'9'.repeat(64)}`;
    139|     const p = sendPayment(session, ctx, built, rt, noStatus);
    140|     await expect(p).rejects.toThrow(PostBroadcastError);
       |                    ^
    141|     await expect(p).rejects.toMatchObject({ hash, outcome: { phase: 'v…
    142|     expect(JSON.parse(journal.get(ATTEMPT_JOURNAL_KEY) ?? '[]')).toMat…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/19]⎯

 FAIL  src/lib/wallet.test.ts > pollReceipt > rejects a receipt for another transaction with status 0x1
AssertionError: promise resolved "{ status: 'success', blockNumber: 16n }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "blockNumber": 16n,
+   "status": "success",
  }

 ❯ src/lib/wallet.test.ts:275:20
    273|   it.each(['0x1', '0x0'])('rejects a receipt for another transaction w…
    274|     const p = pollReceipt(rpc(() => receipt({ transactionHash: `0x${'8…
    275|     await expect(p).rejects.toThrow(SubmissionMismatchError);
       |                    ^
    276|     await expect(p).rejects.toMatchObject({ field: 'hash' });
    277|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/19]⎯

 FAIL  src/lib/wallet.test.ts > pollReceipt > rejects a receipt for another transaction with status 0x0
AssertionError: promise resolved "{ status: 'reverted', blockNumber: 16n }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "blockNumber": 16n,
+   "status": "reverted",
  }

 ❯ src/lib/wallet.test.ts:275:20
    273|   it.each(['0x1', '0x0'])('rejects a receipt for another transaction w…
    274|     const p = pollReceipt(rpc(() => receipt({ transactionHash: `0x${'8…
    275|     await expect(p).rejects.toThrow(SubmissionMismatchError);
       |                    ^
    276|     await expect(p).rejects.toMatchObject({ field: 'hash' });
    277|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/19]⎯

 FAIL  src/lib/wallet.test.ts > pollReceipt > rejects a receipt without a transaction hash
AssertionError: promise resolved "{ status: 'success', blockNumber: 16n }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "blockNumber": 16n,
+   "status": "success",
  }

 ❯ src/lib/wallet.test.ts:282:20
    280|     delete missing['transactionHash'];
    281|     const p = pollReceipt(rpc(() => missing), HASH as `0x${string}`, R…
    282|     await expect(p).rejects.toThrow(UserFacingError);
       |                    ^
    283|     await expect(p).rejects.toMatchObject({ translation: { key: 'error…
    284|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/19]⎯

 FAIL  src/lib/wallet.test.ts > pollReceipt > rejects a malformed receipt transaction hash: undefined
 FAIL  src/lib/wallet.test.ts > pollReceipt > rejects a malformed receipt transaction hash: null
 FAIL  src/lib/wallet.test.ts > pollReceipt > rejects a malformed receipt transaction hash: number
 FAIL  src/lib/wallet.test.ts > pollReceipt > rejects a malformed receipt transaction hash: boolean
 FAIL  src/lib/wallet.test.ts > pollReceipt > rejects a malformed receipt transaction hash: array
 FAIL  src/lib/wallet.test.ts > pollReceipt > rejects a malformed receipt transaction hash: array-like object
 FAIL  src/lib/wallet.test.ts > pollReceipt > rejects a malformed receipt transaction hash: object
 FAIL  src/lib/wallet.test.ts > pollReceipt > rejects a malformed receipt transaction hash: symbol
 FAIL  src/lib/wallet.test.ts > pollReceipt > rejects a malformed receipt transaction hash: empty
 FAIL  src/lib/wallet.test.ts > pollReceipt > rejects a malformed receipt transaction hash: short
 FAIL  src/lib/wallet.test.ts > pollReceipt > rejects a malformed receipt transaction hash: long
 FAIL  src/lib/wallet.test.ts > pollReceipt > rejects a malformed receipt transaction hash: nonhex
 FAIL  src/lib/wallet.test.ts > pollReceipt > rejects a malformed receipt transaction hash: missing prefix
 FAIL  src/lib/wallet.test.ts > pollReceipt > rejects a malformed receipt transaction hash: uppercase prefix
AssertionError: promise resolved "{ status: 'success', blockNumber: 16n }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "blockNumber": 16n,
+   "status": "success",
  }

 ❯ src/lib/wallet.test.ts:302:20
    300|   ])('rejects a malformed receipt transaction hash: %s', async (_label…
    301|     const p = pollReceipt(rpc(() => receipt({ transactionHash })), HAS…
    302|     await expect(p).rejects.toThrow(UserFacingError);
       |                    ^
    303|     await expect(p).rejects.toMatchObject({ translation: { key: 'error…
    304|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/19]⎯

 FAIL  src/lib/wallet.test.ts > pollReceipt > rejects an object hash without invoking its coercion hook
AssertionError: promise resolved "{ status: 'success', blockNumber: 16n }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "blockNumber": 16n,
+   "status": "success",
  }

 ❯ src/lib/wallet.test.ts:308:20
    306|     const coerce = vi.fn(() => HASH);
    307|     const p = pollReceipt(rpc(() => receipt({ transactionHash: { [Symb…
    308|     await expect(p).rejects.toThrow(UserFacingError);
       |                    ^
    309|     await expect(p).rejects.toMatchObject({ translation: { key: 'error…
    310|     expect(coerce).not.toHaveBeenCalled();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/19]⎯


 Test Files  2 failed (2)
      Tests  19 failed | 93 passed (112)
   Start at  17:25:31
   Duration  3.53s (tests 45%, import 40%, transform 14%)

```

### Author GREEN at frozen production source

```text

 RUN  v5.1.0 /workspace/scratch/a13b43b0f3c9/GhostPay-receipt-hash/apps/web


 Test Files  4 passed (4)
      Tests  180 passed (180)
   Start at  17:25:48
   Duration  32.38s (tests 75%, transform 10%, import 10%, environment 5%)

    Isolate  4 workers spawned · ~557ms startup each (spawn + environment, per file)
             at least ~1.67s faster with isolate: false — reuses workers across files instead of one per file

```
