# Independent source review and regression replay

Reviewer: `/root/privacy_change_review`, separate from the implementation and
initial `/root/privacy_browser_triage` investigation.

Base: `28f1e4bd0960a0d57ba2636b6456e7c1b3096e94` (#352).
Baseline: `4d8828cd205ad45b095c0a1e01e6c36282da207e`.
Fixed: `14c52cad022193289a64ba1dc2848b6a55ab822a`.

**No blocking source issue; bounded change approved**, subject to remaining
compiler, lint, native browser and hosted gates. This is independent AI-assisted
review and execution, not a GitHub review approval or an external audit.

| Path | Exact Git blob |
| --- | --- |
| `apps/web/src/components/WalletDisclosure.tsx` | `094b9d4cce058b060c13821c7723449bafe0a743` |
| `apps/web/src/components/WalletDisclosure.test.tsx` | `96144da7ab938bea7aa6649e28b251d08bf9f264` |
| `apps/web/e2e/app.spec.ts` | `c99fc0ace227b09a13e24b3ba6ea8a3e9fbbf51d` |
| `apps/web/e2e/flows.spec.ts` | `a539f43c50aaf3e448102f612fbb350e67c8305a` |

Replacement-dialog ownership is checked first. Normal opener restoration and
focus trapping remain unchanged. Fallback excludes body/root and disabled
openers and verifies actual focus success. Tests exercise real DOM focus and the
real presenter; cancellation still yields zero provider requests.

Keyboard traversal explicitly includes the existing header switch and reaches
Home by Tab. Account-change expectations match current Pay invalidation, require
reconnection and preserve all three original no-send/transaction/journal checks;
direct zero-provider-send verification is added.

No changes occur in native quick-hide assertions, newer devnet journal cases,
Pay runtime, controller, wallet privacy hook, masking boundary, test configuration
or dependency manifests. Scope and whitespace checks pass.

In a separate clean worktree, the reviewer independently reproduced **4 failed /
9 passed** on the baseline and **13/13 passed** at the fixed commit, using original
Vitest config and one worker at 256 MiB. Failures were exactly body, document
element, disabled and nonfocusable openers. The reviewer compared 2,227 package/
build inputs before reusing 65 source-built dependency directories. Both logs,
command records and hashes are preserved in the adjacent independent evidence.
These thirteen cases overlap the coordinator's 68 focused cases.

The reviewer identified the initial combined command's SIGKILL correctly as a
failed invocation. Independent replay does not establish native browser,
whole-web compiler/lint, coverage, build or release acceptance.
