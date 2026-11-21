# GP-BUG-R10: Explicit HTTPS default-port and empty-port parsing

Date: 2026-11-21 (UTC). Scope: existing Pages/browser `@ghostpay/ux-intake` deep-link policy, no feature work.

## Exact source and ownership

- Repository: `djshellshoxxx/GhostPay`
- Baseline main: `eb59d93cffed7848c4aac37d0e9650b87239c6da`
- Task branch: `automation/20261121/bug/deeplink-explicit-port-r10`
- Original production blob: `66c9528051296551a2d29df07dffad569092518e`
- Repaired production blob: `0e7ec2e925b38ea3c48dfe985e13b81ddb9f26b1`
- Test blob: `d701167e47aa86caabf5cb582e37e8eb40144f93` at `packages/ux-intake/src/deeplink.ports.test.ts`
- Owned source: `packages/ux-intake/src/deeplink.ts`; owned new regression: `packages/ux-intake/src/deeplink.ports.test.ts`; additive registry claim and this handoff only.
- At inventory time, GitHub REST listed 182 open PRs across two pages, and all 182 changed-file inventories were inspected. No open PR modified either owned source/test path. Broad #238/#262/#264/#278/#372 own separate `ux-intake` manifest, `nlamount.test.ts`, or `payload.test.ts` paths, not the two owned paths. Recheck ownership before promotion.

## Reproduction / impact

The existing `parseDeepLink` contract rejects HTTPS links that explicitly specify a port, and its existing test rejects `:444`. It used `new URL(s).port !== ''` as the only port test. WHATWG URL parsing normalizes `:443`, `:0443`, and a bare trailing `:` to `port === ''`. Therefore a link explicitly violating this policy navigated normally. The bug is a narrow strict-policy parsing correctness defect, not evidence of theft, exploitability or an off-origin redirect.

Node v22.16.0 baseline authority-check reproduction against the identified source logic: `https://merchant.example:443/pay`, `:0443/pay`, and `:/pay` all returned `navigate` instead of `port-not-allowed`; unported navigation and `:444` rejection were correct. This was source-equivalent extraction, **not a complete repository checkout or a Vitest run**.

## Regression-first implementation

1. Coordination claim commit: `ac5ba79b5c3caa99b4d88f157bc63ebd1c1c155b`.
2. Failing four-case Vitest regression committed first: `f84df5dcce39fe1097f119b542a40ae16d10bd7b`.
3. Smallest production correction committed next: `fe8727cefb1ff84edb9b15f85a6cf1c361a00b97`.

The repair checks the explicit HTTPS authority for `:<digits>` or empty `:` before trusting `URL.port`, after the existing credential check. It preserves ordinary no-port links, existing nondefault-port rejection, and the existing host/path/redirect/fragment logic; custom schemes are unchanged.

## Verification and outstanding gates

- Isolated Node v22.16.0 checks of the source-equivalent repaired authority predicate: **524/524 passed** (three representative default forms, an empty separator, 256 zero-padded variants, nondefault ports, valid unported cases, uppercase scheme, IPv6 and credential priority).
- GitHub connector source fetch confirms exact fixed blob `0e7ec2e925b38ea3c48dfe985e13b81ddb9f26b1` and exact test blob `d701167e47aa86caabf5cb582e37e8eb40144f93`. No locally cloned repo exists: `git ls-remote` failed with `Could not resolve host: github.com`.
- Repository Vitest, workspace typecheck, lint, builds and native browser verification: **not run locally**. All require exact-head hosted GitHub CI or other real verifier; isolated assertions do not substitute.
- No genuine separate independent reviewer was available here; independent review is **outstanding**.
- PR #390 was rechecked at exact head `b655bc273a6704c9c140287b8adcdf4085b91882`: 36 GitHub check runs successful, 3 skipped, none failed; combined Snyk status success; zero submitted reviews or unresolved review threads. #419 separately edits `displayText.ts`, while #422 stacks their composition on #390. Neither owner branch was changed in this task.
- Durable `automation/ghostpay-integration-lock/integration-lock.json` is held by external owner `994a0d214fb9-root-r3`, generation 11, metadata blob `97523a9ce00231ac883b32178ab48a547eb0dd8f`. Even an expired timestamp provides no takeover authorization. No merge, branch deletion, deployment or release.

Next worker: inspect the draft PR exact head checks, investigate any genuine CI failure test-first on this owned branch, request a genuine separate code reviewer, perform applicable browser verification, reconcile PR owners and lock. Merge only if all required exact-head checks, independent review and legitimate integration ownership are satisfied. Otherwise leave draft.

## R10 follow-up source review — normalized slash forms

After initial PR publication, source-equivalent review found that WHATWG URL also accepts `https:merchant.example:443/pay`, `https:/merchant.example:443/pay`, multiple slashes, and a backslash variant as HTTPS URLs and normalizes away `443`. The first fix only captured a literal `https://` prefix, so it did not yet enforce the same explicit-port rule for these existing accepted spellings.

- Added an additional failing Vitest regression **before** the follow-up production change: `a3303edf0ee7d547929242e8ae8e4deab4d2d5b5`.
- Narrowly corrected raw authority capture to handle the same HTTPS special-scheme slash/backslash normalization: `2bb6223ac4e02fa3e566b0b3862a74aa9439296d`. No unrelated URL/parser feature change.
- Current production blob `1c6134dd449cf7d94305e6135dfc3ab7eedb57be` supersedes the earlier `0e7ec2e925b38ea3c48dfe985e13b81ddb9f26b1` blob; current test blob `341db1aa278ce03c10aa888e975de1d45a8a64e8` supersedes the earlier `d701167e47aa86caabf5cb582e37e8eb40144f93`.
- Follow-up isolated Node v22.16.0 tests of exact source-equivalent authority predicate: **526/526 pass**, including four normalized-slash cases, 256 zero-padded ports, 256 nondefault ports, credentials, unported and wrong-host controls.
- This remains **source-equivalent Node evidence, not local repository Vitest or native-browser proof**. Only exact-head hosted checks after the updated branch, and genuine separate review, can qualify the PR. Earlier hosted checks against older heads cannot substitute.
- Draft PR: https://github.com/djshellshoxxx/GhostPay/pull/424 . Preserve the held integration lock; leave draft and do not merge pending all required gates.
