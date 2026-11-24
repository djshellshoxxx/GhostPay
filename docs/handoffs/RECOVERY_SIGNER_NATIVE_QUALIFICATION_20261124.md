# GP-PAGES-02 signer recovery: resumed native qualification

Date: 2026-11-24. Worker: `/root/resume_recovery_verification`. Coordinator: `/root`. Independent source reviewer: `/root/recover_local_workers`.

## Source and scope

This continuation starts from [PR #577](https://github.com/djshellshoxxx/GhostPay/pull/577), branch `codex/gp-pages-02-retain-suspended-signer`, head `2363943571de84bfd5da0b3f167699f34eb53ce7`. The isolated repair branch is `resume/recovery-native-20261124`. The parent remains #544 at `4b077d2b13f956cfcf9bce1726f929cca40c7394`; its idle-lock and suspension implementation is preserved.

The only test-source change gives the existing signer spy a concrete return type:

```typescript
const signer = vi.fn<() => void>();
```

The untyped spy previously made `withSessionSecrets(signer)` infer `any`, failing the two `no-unsafe-return` checks in the regression. The corrected file blob is `4f87129bf9c4bb2e7aa03c62e24e3e2f65454b99`. No assertion, test timeout, production code, workflow, dependency manifest, backup format, or release gate changed.

The independent reviewer checked the actual `withSessionSecrets<T>` signature and every preserved assertion. The test still requires both ordinary-access attempts to fail, zero signer calls, a disabled invoice action, encrypted recovery of the original public identity, and the normal unlocked state after import. TypeScript transpilation of the original and corrected files produces identical JavaScript, SHA-256 `cf985152d23ee6d0a991fffd380b41f08003fe1e0b76c2ffa80dad8ea9b8abf8`.

## Executed local verification

The commands below ran in an isolated checkout of the saved PR source. External cached packages matched the installed React 19.3.1, Vitest 5.0.5, Vite 8.3.5, TypeScript 5.9.3 and jsdom 30.1.3 versions. All 68 `@ghostpay` workspace links point into this checkout; old workspace source was not reused.

| Check | Result |
| --- | --- |
| Original `eslint --config ../../eslint.config.js src/App.test.tsx` from `apps/web` | Failed with exactly two `@typescript-eslint/no-unsafe-return` errors at 164:20 and 171:20, matching the hosted failure. |
| Same typed ESLint command after the one-line correction | Passed, zero diagnostics. |
| `vitest run src/App.test.tsx src/lib/session.idleLock.test.ts src/views/SellerKeys.recovery.test.tsx src/views/SellerKeys.test.tsx --maxWorkers=1` from `apps/web` | Four files, 76 tests passed, zero skipped or failed, 47.20 seconds. |
| `npm run build --workspace @ghostpay/web` | Passed full web TypeScript checking, production Vite build, and the original postbuild bundle scan. The scan checked 19 files. |
| Original-versus-corrected TypeScript transpilation | Byte-identical emitted JavaScript. |
| `git diff --check` | Passed. |

The 76 native checks cover the resumed signer-recovery regression, ordinary private-key access refusal during suspension, encrypted backup and verification while suspended, stale asynchronous results, backup cancellation and interruption, wrong passwords, damaged files, seller replacement, vault deletion, and the existing seller-key controls. These are synthetic fixtures; no real funds or user keys are used.

The native test log SHA-256 is `31ccc6f0ca4f45b3ae668c20f3d3215e59728e44139905b136b9ceaa79f3946b`. The build log SHA-256 is `3552e2535f3f8cc32f52cf4495b97a51c3a7333e63ae68bbbc1ec2dbe05db39d`.

Two setup attempts are retained as limitations rather than passing checks. The initial all-library build stopped because the older external cache lacked `@bufbuild/protobuf`. The exact lockfile version, 2.17.0, was installed with scripts disabled in a temporary prefix. The initial web-target build then stopped because its test imports required the not-yet-built `relayer-guard` library. Rebuilding that existing library from this checkout resolved the setup error. The final web build passed. Its existing warnings concerned `help.css`, a browser-externalized `node:http` import, mixed static/dynamic QR imports, and chunk size; no warning policy was changed.

## Hosted evidence already present on the original PR

The aggregate CI workflow was still recorded as queued when inspected, but its individual jobs exposed a finished lint failure. [Job 138272360991](https://github.com/djshellshoxxx/GhostPay/actions/runs/45334694462/job/138272360991) contains the exact two errors repaired here.

The same original source had successful full and lean browser E2E jobs and TypeScript checking. [Pages run 45334694476](https://github.com/djshellshoxxx/GhostPay/actions/runs/45334694476), tested through merge ref `72a7b91abd6cc653036912bde29ced36ce726239`, passed all 17 Anvil browser scenarios. Its first scenario explicitly verifies that an unbacked invoice signer survives idle only for encrypted recovery into a fresh profile. Deployment and post-deployment steps were skipped. These hosted results belong to the original PR source and are not claimed as checks on the new repair commit.

## Related recovery lanes and remaining gates

- [PR #572](https://github.com/djshellshoxxx/GhostPay/pull/572), individual payment-key export, remains at `28bba11cdaebc13edc4d100761ee00750c3f396f`. Pages run `45335656930` passed 16 Anvil browser scenarios; its core workflow `45335656982` still had queued/running jobs. The new individual-export full/lean browser qualification must be read from its own completed jobs before acceptance.
- [PR #573](https://github.com/djshellshoxxx/GhostPay/pull/573), seller-file recovery and sole-copy safeguards, remains at `56fb25aa2ff098737dbc181fa88c0aac06425c8e`. Pages run `45334789788` passed 16 Anvil browser scenarios, including fresh-profile restoration and its added payment-recovery assertions. Core workflow `45334789740` still had queued jobs.
- #572 and #573 were inspected without modifying their source or claims. Their separate parent branches and acceptance obligations remain intact.
- The coordinator should publish this reviewed narrow repair, obtain fresh applicable hosted checks for the published source, and reconcile the existing parent/owner dependencies before integration. No main merge, deployment, release, or whole-feature completion is claimed by this qualification.

This worker's bounded repair and native verification are complete. The coordinator owns publication and subsequent integration; existing recovery and idle-lock ownership remains unchanged.
