# Clipboard #580 completion — 2026-11-24

## Scope and source

This completion continues PR #580, `feat/remaining-sensitive-clipboard-286`, from
exact parent `b634e816a403ac6b07a6685bac575ca683a17cb5` (tree
`25bc4361de93a0639c2a86e4f9fc7f4c20a6f177`). The PR remains stacked on #553 at
`068fbc36b80311c107dfd3619d631fca794fac58`; that parent branch is unchanged.
Main was observed at `f76904301cff0b24d65ea4e31cbf37d470db4d95`.

The only code change is in `apps/web/src/lib/clipboardPrivacy.test.ts`:
the shared fake clipboard now retains `Mock<ClipboardPort['writeText']>` and
`Mock<ClipboardPort['readText']>`. `ReturnType<typeof vi.fn>` erased the concrete
promise-returning signatures, so ESLint interpreted the delayed replacements as
promise-returning functions supplied where a void-returning function was expected.
The existing test bodies, fixtures, assertions, timers and production code remain
unchanged. No rule, threshold or test is disabled.

## Reproduction and validation

The original hosted lint job
[138271835214](https://github.com/djshellshoxxx/GhostPay/actions/runs/45335023155/job/138271835214)
reported exactly two `@typescript-eslint/no-misused-promises` errors at lines
151 and 168. The same typed ESLint command reproduced both locally before the
correction and exited successfully afterward:

```sh
cd apps/web
NODE_OPTIONS=--max-old-space-size=1024 node ../../node_modules/eslint/bin/eslint.js \
  --config ../../eslint.config.js src/lib/clipboardPrivacy.test.ts
```

Native regression selection: **64 tests passed in five files, zero skips**, exit 0:

```sh
cd apps/web
NODE_OPTIONS=--max-old-space-size=768 node ../../node_modules/vitest/vitest.mjs run \
  src/lib/clipboardPrivacy.test.ts \
  src/components/SensitiveClipboard.test.tsx \
  src/components/CopyButton.clipboard.fuzz.test.tsx \
  src/components/SecretBackup.test.tsx \
  src/components/Common.test.tsx --maxWorkers=1
```

This selection covers opt-in delay, denied APIs, richer clipboard formats,
unrelated/newer copies, repeated copies, delayed native writes, preference
revocation, unmounting, confirmed backups and the existing seeded recopy property.
Repository secret scan and `git diff --check` passed.

Environment: Node 24.22.3, TypeScript 5.9.3, Vitest 5.0.5 and ESLint 10.15.0.
Installed external dependencies were reused through an isolated dependency view;
workspace links target this checkout. `core-crypto`, `invoice-schema` and
`chain-adapters` were built from this checkout with the original build commands.
The first test invocation stopped before collecting tests because those build
outputs were missing. After building the prerequisites, the original invocation
passed. No dependency or lockfile changed.

## Independent review

The separate `/root/completion_review` agent compared the correction with the
original PR head and found no blocker. TypeScript 5.9.3 transpilation emitted
byte-identical JavaScript for the original and corrected test. The reviewer
confirmed that the concrete mock types restore the promise return contracts and
that all assertions and production source remain unchanged. This is independent
AI-assisted source review, not a formal external audit or submitted GitHub review.

## Integration boundary

The original head's other substantive hosted CI jobs, including full and lean
browser suites, typechecking and build, passed; lint was the observed failure.
Those results belong to the original head. This continuation still requires its
own hosted qualification after publication. Refresh both branch heads and respect
the repository integration lock and parent #553 before any shared-branch merge.
No deployment, release, real funds, contract or payment-execution change is part
of this completion.
