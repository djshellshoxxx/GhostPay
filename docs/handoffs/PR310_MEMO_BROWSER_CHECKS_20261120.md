# PR #310 invoice-file memo browser checks

Base: `976d26ee791836c176431c8a5d0b825486f78caf` on
`future/f03-private-payment-links`. Task branch: `fix/pr310-invoice-file-memo`.
Reviewed test-file blob: `085bbccd0ad1d434e8c6f67965d7fbdf1fe72d4f`.

## Observed failure and repair

[CI run 44692101562](https://github.com/djshellshoxxx/GhostPay/actions/runs/44692101562)
failed the same four invoice-file scenarios in both profiles:
[full job 136181689920](https://github.com/djshellshoxxx/GhostPay/actions/runs/44692101562/job/136181689920)
reported 4 failed, 84 passed and 1 skipped;
[lean job 136181689927](https://github.com/djshellshoxxx/GhostPay/actions/runs/44692101562/job/136181689927)
reported 4 failed, 72 passed and 3 skipped.

`Pay.tsx` renders each memo in a paragraph containing a nested `Memo:` label.
Playwright exact text locators therefore need the combined `Memo: <value>` text.
The bare-value exact locators failed after successful invoice opening. The same
mistake made the old negative memo checks unable to detect a labeled memo.

The test-only repair scopes exact positive memo checks to the existing accessible
`Review payment` region. Global substring absence checks detect confidential or
superseded memo text with or without a label. Additional assertions check memo
absence after a wrong passphrase and removal of request B after reopening A.
All original amount, signature, explicit-preview/open, unchanged-envelope,
wallet, network, storage, URL and invalid-file assertions remain.

Independent reviewer `/root/memo_review` reviewed the exact test-file blob above
and found no blockers. No runtime, dependency, configuration or gate changes.

## Validation at publication

Local environment: Node `24.22.3`, npm `11.19.1`, repository-locked dependencies.

| Check | Result |
| --- | --- |
| Scoped typed ESLint on `apps/web/e2e/payment-request-file.spec.ts` | Passed, exit 0 |
| Full web TypeScript check with original `apps/web/tsconfig.json`, 1280 MiB heap | Passed, exit 0 |
| Original Playwright full configuration, focused `--list` | Six tests collected; exit 0 |
| Original Playwright lean configuration, focused `--list` | Six tests collected; exit 0 |
| Repository secret scan and `git diff --check` | Passed, exit 0 |
| Local Chromium | Blocked before any page/assertion: `socket() failed: Operation not permitted` |

The initial target build finished the web dependency builds but exited 137 during
the web compiler stage. A 768 MiB compiler attempt exhausted its heap. A subsequent
1280 MiB attempt exposed the missing local `relayer-guard` workspace needed by web
tests; that workspace was restored from the lockfile and built before the final
compiler check. These incomplete attempts are not successful build results.

Browser collection and source review are not browser execution evidence. The
unchanged full/lean GitHub Actions jobs must qualify the updated PR head. This
repair keeps PR #310 draft; main integration and deployment are separate work.
