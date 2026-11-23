# GP-BUG-R11 — Invoice classifier accepts normalized-away HTTPS ports

Date: 2026-11-23 UTC. Status: isolated bug-only repair, **not integrated or released**.

## Live source and ownership

- Repository: `djshellshoxxx/GhostPay`
- Read and complied with `AGENTS.md`, `docs/ai/WORKFLOW.md`, `docs/ai/HANDOFF.md` and `docs/ai/ACTIVE_WORK.md`.
- Exact live `main` baseline: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Branch: `automation/20261123/bug/intake-invoice-default-port-r11`.
- Owned production path: `packages/ux-intake/src/payload.ts`; original blob `72edfb42a2a4df5d4b7def55a966d756f7b821ef`, fixed blob `346b89759b44e2861c3e0279c6135ffbbdc062ba`.
- Dedicated new regression: `packages/ux-intake/src/payload.default-port.test.ts`; blob `7d72afa386c0512df652741d838bc47234c41824`.
- Other branch-only edits: additive claim at the front of `docs/ai/ACTIVE_WORK.md` and this handoff.
- At selection, paginated 251 open PRs (100+100+51) and individually inspected each PR's complete changed-file inventory. No PR owned either selected source or new test path. Existing PR #424 fixes the **separate** `parseDeepLink` function in `deeplink.ts`; #238/#262/#264/#278/#372 own unrelated `ux-intake` tests. Do not override or edit them.
- Refresh live main, inventory and owners before any integration.

## Observed bug

`classifyPayload` uses `parseInvoiceLink` to validate HTTPS invoice links. Its security contract explicitly disallows URL ports. Existing code checked only `url.port !== ''`. The WHATWG URL parser normalizes default HTTPS ports `:443`, `:0443`, `:000443` and an empty `:` to `URL.port === ''`. Accepted WHATWG HTTPS slash spellings also normalize away the port. Consequently, prohibited explicit-port invoice URLs were classified as valid invoice links, inconsistent with the package's no-port invariant. This is a parsing/canonicalization defect, **not** evidence of theft, live compromise, or a redirected payment.

Node.js v22.16.0 reproduced seven invalid authority forms returning the baseline equivalent of `OK` rather than `port-not-allowed`: `:443`, `:0443`, `:000443`, empty `:`, and `https:`, `https:/`, `https:////` normalization. Three baseline controls (unported URL acceptance, nondefault-port rejection, credential rejection) passed.

## Regression-first commit trail

1. Exact-main branch and additive file-ownership claim: `c0c6678e1565f02eb91c86a303e07a734f8d26d2`.
2. Failing four-case Vitest suite **committed before production fix**: `1a6f3733cd50d361db793f27d7ccfbe817b7c71f`. The suite checks the seven bypass forms and unchanged valid URL, bare fragment, nondefault port, credential and host behavior.
3. Minimal production correction: `bfd02bc4bcdfdbdd0a64754d6d40db48ee45b0f7`. After the pre-existing credential guard, inspect the raw HTTPS authority for explicit numeric/empty ports **before** trusting normalized `URL.port`. Reuse the same raw-authority validation already used by PR #424 for the sibling deep-link parser. No new dependencies, features, schemas, or changed public interfaces.
4. This additive, source-pinned handoff is the last pre-PR code commit. Record final PR head and CI checks in a PR comment after publication; its SHA will differ from the production commit.

## Verification, truth in evidence

- Executed Node 22.16.0 native URL semantics for the seven failing inputs and three controls **before** production repair. Baseline reproduced **7/7 forbidden forms accepted**.
- Executed **524/524 source-equivalent authority checks** after repair: 256 different zero-padded default-port URLs, 256 nondefault ports, seven normalized default/empty forms, three unported valid URLs, one credential priority check and one wrong-host check. These are direct, source-equivalent Node.js checks, **not** the checked-in Vitest tests or an execution of the complete TypeScript repository.
- Source and regression blobs were read back from GitHub after the fix and matched the exact blob hashes listed above. No local repo was cloned. `git ls-remote` returned `Could not resolve host: github.com`, so **no** local Vitest, coverage, lint, typecheck, full build or real-browser verification is claimed.
- A genuine separate independent verifier was not available; self-review must not be counted as reviewer approval. Hosted exact-head GitHub workflows and applicable browser jobs must complete and be examined before merge.

## Other gates and strict scope

- PR #390 (`safeText` rendered display bound) rechecked: exact head `b655bc273a6704c9c140287b8adcdf4085b91882`, all five hosted workflows completed success (CI, Hosting kit, Pages, Beta acceptance, CLI operator qualification), **zero submitted independent reviews**. GitHub now marks it **open and ready for review, not draft**. Its source and owner-controlled branch remained untouched.
- Integration metadata branch `automation/ghostpay-integration-lock` at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`, file blob `97523a9ce00231ac883b32178ab48a547eb0dd8f`: generation 11, status `held`, owner `994a0d214fb9-root-r3`. Its expired timestamp is **not** authorization to take or override it.
- No merge, lock takeover, branch consolidation, deployment/release, payment/contracts/wallet/funds interaction, external traffic attack or dependency modification.
- Leave draft until exact-final-head required CI GREEN, native browser verification where applicable, independent review, no dependency/ownership collision and legitimate integration lease ownership. Repair any genuine CI issue test-first on this isolated branch only; otherwise hand off unmerged.
