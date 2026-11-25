# Web residual recovery — 2026-11-24

## Scope and source pins

Integration-only recovery of existing missing web fixes. No new application logic
or regression payloads were authored. Original branches remain unchanged.

- Worker: `chatgpt-f80482f352bc/ui_data_review`; independent review and promotion owner: root coordinator.
- Branch: `integration/web-residuals-20261124`.
- Worktree: `/workspace/scratch/f80482f352bc/web-residuals`.
- Base: `84e5128dbe86d2061106e5e167e3272b5dee8958`, tree `1117502d4876bd66367712111e2c173277a3199f`.
- Pre-edit ownership claim: `85fe206cae2230adf0d24e60f003cebb9424f549`.
- Qualified application/test source: `6dc8be59520bdaf01ddadd3338f32c19ebfd958c`.
- Qualified source tree: `591de592aa0a7e1b7512ee502047261c67b414a2`.
- The final handoff commit changes documentation only.

| Source | Preserved original head | Integration merge |
| --- | --- | --- |
| #301 amount parser runtime contract | `7523da612ba365451f1d5c2dbc01d0bdeedbe8c7` | `fef0ecc103ee698f7da3ac967292fd0e4981dc9e` |
| #274 monotonic invoice expiry | `a4c6f945adef0438bfd0b347fb7c11057e3973ce` | Included through #515 below |
| #515 independent expiry qualification | `f2b262c2afe5d51c258e466d9be1d22798817135` | `c5d065de60017a2f956a1e6cdfd125462679334f` |
| #305 canonical ERC-20 simulation result | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` | `6dc8be59520bdaf01ddadd3338f32c19ebfd958c` |

The production donor commits are `f49cd29b27766afe6cb42c07ab5cfd2d8b2e6f51`
(#301), `dbe6e9759cfa711eeb0c345d122bc8bb79eceed4` (#274), and
`510e615b31d4d40d6936a2ee4c37461d35a47a4a` (#305). Live GitHub PR reads before
integration confirmed all four original heads above. Each donor's delta was
limited to the stated source, existing tests, ownership registry and handoff.
#515 adds one test file and documentation on top of #274, with no additional
production change or broad stack dependency.

## Resulting behavior and preservation

- `parseUnits` returns `undefined` for invalid runtime text or decimal precision,
  preserving normal decimal parsing, whitespace trimming, integer base-unit
  arithmetic and the existing 0–36 precision domain.
- `DelayScheduler` anchors invoice expiry to elapsed monotonic time as well as
  observed wall time. Existing cancellation, delay readiness, terminal states and
  Send now behavior remain; a wall-clock rollback cannot extend the invoice's
  waiting deadline.
- ERC-20 simulations retain legacy empty return data and canonical true success,
  canonical false refusal, existing RPC error classification and generic
  non-Boolean simulation behavior. Noncanonical Boolean results are classified
  as unavailable using the original warning path.

All seven TypeScript source/test paths and four donor documentation paths are
byte-identical to their original donor blobs. The three production blobs are:

| Path | Blob |
| --- | --- |
| `apps/web/src/lib/format.ts` | `9ba8ea7b418eab5cf18e900923572cf3e255aedd` |
| `apps/web/src/lib/jitter.ts` | `9845576adfb522c17db145b1772276f66523180c` |
| `apps/web/src/lib/txGuard.ts` | `c5e7b6ea5ac9525395cb4bc8c63f923db40d2e23` |

There were no source or test conflicts. Each merge conflicted only in
`docs/ai/ACTIVE_WORK.md`; both sides were retained in order. A final ordered-line
subsequence check confirmed preservation of the base registry and every donor
registry. All four donor heads are ancestors of the qualified source.

### Separate #614 formatter ownership

PR #614 was inspected read-only at
`9aff7941bdeec30c4ebeab10795da4df9903d08a`. Its `formatCountdown` change and #301's
`parseUnits` guard affect separate functions. A three-way text composition against
the common formatter base merged without conflicts and retained both guards.
This compatibility check did not modify either branch or import #614. The
candidate's countdown implementation remains exactly the base implementation;
the separate owner's countdown change still belongs to that integration.

## Qualification

Executed against source `6dc8be59520bdaf01ddadd3338f32c19ebfd958c` on Node
`v24.22.3`, Vitest `5.0.5`. Checks ran sequentially with one test worker.

| Check | Actual result |
| --- | --- |
| Existing targeted and consumer suites | 20 files, 512 tests passed, zero skips; exit 0; 87.54 seconds |
| Full web TypeScript check | Passed; exit 0 |
| Typed ESLint on all seven changed TypeScript paths | Passed; exit 0 |
| Donor blob/ancestry preservation and registry union | Passed |
| `git diff --check` from the exact base | Passed |

From `apps/web`:

```sh
npm exec -- vitest run --maxWorkers=1 \
  src/lib/format.test.ts \
  src/lib/jitter.test.ts \
  src/lib/jitter.expiry-qualification.test.ts \
  src/lib/txGuard.test.ts \
  src/lib/invoiceCreate.test.ts \
  src/lib/pay.test.ts \
  src/lib/payExec.test.ts \
  src/lib/payExec.acceptance.test.ts \
  src/lib/sweep.test.ts \
  src/views/Pay.test.tsx \
  src/views/Pay.supported.test.tsx \
  src/views/Pay.i18n.test.tsx \
  src/views/Pay.invoiceQr.test.tsx \
  src/views/CreateInvoice.test.tsx \
  src/views/CreateInvoice.supported.test.tsx \
  src/views/CreateInvoice.buffer.test.tsx \
  src/views/CreateInvoice.ordering.test.tsx \
  src/views/CreateInvoice.register.test.tsx \
  src/components/SharedComponents.i18n.test.tsx \
  src/components/InvoicePaymentSummary.test.tsx
```

From the worktree root:

```sh
npm run typecheck --workspace @ghostpay/web
npm exec -- eslint --config eslint.config.js \
  apps/web/src/lib/format.ts \
  apps/web/src/lib/format.test.ts \
  apps/web/src/lib/jitter.ts \
  apps/web/src/lib/jitter.test.ts \
  apps/web/src/lib/jitter.expiry-qualification.test.ts \
  apps/web/src/lib/txGuard.ts \
  apps/web/src/lib/txGuard.test.ts
git diff --check 84e5128dbe86d2061106e5e167e3272b5dee8958..HEAD
```

Raw evidence files are in `/workspace/scratch/f80482f352bc/` for the coordinator:

| File | SHA-256 |
| --- | --- |
| `web-residuals-tests.log` | `fe9d90e46c393bfe6d5988c7aa12e6115910e591ace8beb62444839d77335535` |
| `web-residuals-typecheck.log` | `65249328340e32d53c1ce4dce307a434743bf21d4339fbf97b36a10251373f5e` |
| `web-residuals-lint.log` | `9aac3da9a7039a99c345545c32f286aa65c358d571bfce7e00d94625d095c829` |

### Dependencies and boundaries

External dependency artifacts were reused from the coordinator's existing
installation. All 68 `@ghostpay` workspace links resolve inside this worktree;
65 existing library build outputs were copied for local package resolution. An
existing web output was also copied during setup but is not a build of this new
source and was not used as qualification. No dependency or lockfile was changed.
The lockfile SHA-256 remains
`e025d878c55cc215315286fc2df277ce5c79116c1507bba79419c789669e0e4e`.

The test command ran the existing focused suites without coverage measurement;
it is not a full web-suite or coverage-threshold claim. No baseline regression
reproduction, new negative payload, native browser, hosted workflow, remote ref
mutation, deployment or live-service operation was performed. Final full/lean
builds, independent combined review and required hosted gates belong to root's
combined implementation. No implementation blocker was found during recovery.
