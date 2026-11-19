# PR 87 SOCKS socket compatibility repair — 19 November 2026

## Source and scope

| Item | Exact source |
|---|---|
| Original PR #87 | `bbc8ff3ba6c8e3786ccea9bd5c2679d0527bc6aa` |
| Compared main | `58d89b39b27a66454ebf392bcd35d5c68b57b2f8` |
| Isolated branch | `repair/ghostpay-pr-87-20261119-local` |
| Ownership claim | `b3a9ecaf` |
| Combined source | `a014cabcf0313facf80d603b9ed6d01b76db9ee2` |
| Production repair | `1f2b336be5656d527133aeec35eafba5d9c3a8b2` |
| Final source/test head | `3d7889af94c398517e10c09100de3aa305d11206` |
| Independently reviewed tree | `af1a7c12ca4f2d5242f256529ddfb4a3ebc29c8d` |

The isolated branch retains both original PR and current-main ancestry. Only the additive
`ACTIVE_WORK.md` records conflicted during integration; both were retained. All 69 files
originally changed by #87 remain byte-identical to its original head, including lockfile
blob `6f777b6e5453a20f9ae018c2dd3f3491e3937a2b`.

The live 49-open-PR filename inventory had no competing net-harness source edit. The only
overlaps in that package were dependency manifests in #87, #210 and #238. This repair
changes only `socks5Server.ts`, its regression in `harness.test.ts`, and documentation.
It changes no dependency, lockfile, network policy, test exclusion or security gate.

### Main refresh after publication

The coordinator published the scoped repair as PR #253, then requested reconciliation
with newer main `e454de6abfefda70d82784fafc1d8949b277c334`. The merge simulation was clean,
and merge `a7cb79c7b4f906230b59d499b5c9293afd75a05b` produced tree
`7d7a3e58e910f337b1166163c11d8a922350f4cc` without manual conflict resolution. Net-harness
source and its manifest remain byte-identical to the independently reviewed repair.
The full 28-test net-harness suite was rerun with coverage after this merge: 28 passed,
0 skipped, exit 0, with the same 96.16/90.62/96.96/99.12 coverage percentages below.
This ancestry refresh does not qualify the broader dependency upgrade.

## Reproduced failure and correction

The original [typecheck job](https://github.com/djshellshoxxx/GhostPay/actions/runs/44258519283/job/134650170554)
stopped while building net-harness. The exact PR-pinned TypeScript 7.0.2 compiler and
Node 26.6.6 typings reproduced the same failure locally:

```text
src/socks5Server.ts(287,16): error TS2345: Argument of type 'string | NonSharedBuffer'
is not assignable to parameter of type 'Buffer<ArrayBufferLike>'.
```

The socket event is typed to allow decoded strings. The SOCKS handshake cursor requires
original bytes; converting a string back to bytes cannot recover invalid UTF-8 already
replaced by a decoder. The repair closes an unexpectedly text-decoded connection before
feeding the cursor. The ordinary Buffer path, parsing, authentication, loopback checks,
early bytes and tunnel behavior are unchanged. There is no cast or forced conversion.

The regression uses a real loopback socket with test-only UTF-8 decoding. Before the
repair, it caused an uncaught `ERR_INVALID_ARG_TYPE` in `Buffer.concat` and the Vitest
run exited 1. Independent review found that the first test version's generic exchange
helper could mistake client timeout cleanup for server close. The final regression now
waits for peer close with `once(..., { signal: AbortSignal.timeout(1_000) })`; timeout
rejects before client cleanup. It also requires no reply, greeting or recorded request.

## Executed checks

Runtime: Node 22.23.5. Affected direct dependency versions were checked against #87's
manifest. TypeScript 7.0.2 runs from the workspace; root TypeScript 5.9.3 remains as
specified by #87's lock for existing ESLint peers. Node typings 26.6.6 and undici-types
8.9.0 tarballs were verified against that lock's integrity values. Vitest and coverage-v8
are 5.0.5; ESLint is 10.15.0. No monorepo dependency reinstallation was needed.

From `packages/net-harness`, using that Node runtime:

```sh
node node_modules/typescript/bin/tsc -p tsconfig.build.json
node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
node ../../node_modules/vitest/vitest.mjs run --coverage
node ../../node_modules/eslint/bin/eslint.js --config ../../eslint.config.js src
```

| Check | Result |
|---|---|
| Production build with exact compiler/types | Passed; production source unchanged after this check |
| Final full-package typecheck | Passed |
| Final full-package tests | 28 passed, 0 skipped, no unhandled errors |
| Coverage | Statements 96.16%, branches 90.62%, functions 96.96%, lines 99.12% |
| Existing coverage thresholds | Unchanged: 95%, 90%, 95%, 95% respectively |
| Final full-package ESLint | Passed |
| Repository secret scan | Passed |
| Whitespace/error-marker check | Passed |

An independent review agent cleared the final source/test head after running the new
peer-close test and the original binary no-auth tunnel test under Node 22.23.5, plus the
exact TypeScript 7.0.2 typecheck. Its additional real-socket probes confirmed binary
greeting success and peer close without replies/records for decoded ASCII and high-byte
greetings. This is scoped code review, not an external security audit or full-PR approval.

## Remaining combined-candidate gates

The first net-harness compile defect is repaired. The major dependency PR remains
unqualified until its broader compatibility and hosted checks pass. The affected graph
also includes `packages/net-transport` and `apps/web`; their combined-head checks were
not claimed by this bounded repair.

A concrete compiler-API incompatibility remains. Existing
`apps/web/src/privacyInvariants.test.ts` and the separate scanner AST repair use APIs
such as `createSourceFile` and `ScriptKind`. #87 pins TypeScript 7.0.2 inside apps/web.
The following exact probe, executed from the affected workspace, records what that
package exports:

```sh
node -e "const ts = require('typescript'); process.stdout.write(JSON.stringify({resolved: require.resolve('typescript'), version: ts.version, createSourceFile: typeof ts.createSourceFile, ScriptKind: typeof ts.ScriptKind}, null, 2));"
```

```json
{
  "resolved": "/workspace/scratch/171008b2cfcc/classrupted/node_modules/.pnpm/typescript@7.0.2/node_modules/typescript/lib/version.cjs",
  "version": "7.0.2",
  "createSourceFile": "undefined",
  "ScriptKind": "undefined"
}
```

The resolved path identifies the exact cached package used for this probe. Root tooling
currently uses the lock-hoisted 5.9.3 compiler, whose API is compatible with those calls.
A separate, bounded dependency reconciliation must retain a compatible compiler for
API consumers and regenerate the lock with npm, preserving security scanners and test
coverage. No dependency adjustment or hand-edited lock was made in this repair.

### Compiler dependency correction remains blocked

A separate child worktree attempted the authorized exact root/web 5.9.3 declarations.
Three normal commands completed with exit 0 but did not produce the requested web
compiler resolution. Each began from the original lock; no force or legacy-peer flag
was used:

```sh
# npm 11.9.0, after setting both approved manifests to exact 5.9.3:
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
# npm 10.9.9, matching original CI:
npm install --workspace @ghostpay/web --include-workspace-root --save-dev --save-exact typescript@5.9.3 --package-lock-only --ignore-scripts --no-audit --no-fund
# npm 11.9.0, explicit single workspace:
npm install --workspace=apps/web --save-dev --save-exact typescript@5.9.3 --package-lock-only --ignore-scripts --no-audit --no-fund
```

The expected lock resolution was root 5.9.3 / web 5.9.3; all three retained root 5.9.3 /
web 7.0.2. The first left web's manifest at 5.9.3 with nested 7.0.2, and `npm ls
--package-lock-only --workspace @ghostpay/web typescript --json` returned `ELSPROBLEMS`.
The latter commands retained or restored web's manifest to 7.0.2. Generated metadata also
changed optional EDR libc selectors; those outputs were rejected, not selectively edited.

Read-only diagnostics confirmed the intended child prefix and web workspace cwd/package
path. The manifests are regular files inside that worktree, with no node_modules directory
or workspace symlink. Save is enabled; global, dry-run, force and legacy-peer modes are
disabled. No wrong-directory/shared-module explanation or peer error was observed; the
underlying unsuccessful-update cause remains unestablished. All experimental manifest and
lock edits were restored, and no dependency correction was committed or published.

Machine-readable attempts, exact commands, before/after lock resolutions, target diagnostics,
and the independent source review are saved under `analysis/pr87-repair` for the readiness
ledger. Cached Hardhat 2.29.2 does not validate candidate 3.22.0, and the broader upgrade
remains NOT_READY. A future valid lock and matching install must precede affected API and
full candidate qualification.

Root owns publication, fresh exact-head hosted checks and any integration. This work
does not authorize or claim a deployment, release, paid-agent activation or completed
qualification of the full major upgrade.
