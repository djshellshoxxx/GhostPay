# PR #585 native typecheck repair — 2026-11-24 UTC

Worker: `/root/recover_local_workers`; coordinator and publication owner: `/root`.
Isolated successor: `resume/privacy-minimal-typecheck-20261124`.
Saved parent: PR #585, `b82be893d3d360064222fafcce8cef2033cd23a5` on `feature/287-minimal-invoice-sharing`.
Main observed: `f76904301cff0b24d65ea4e31cbf37d470db4d95`.

## Cause and correction

Native TypeScript reproduced TS2769 at `apps/web/src/views/CreateInvoice.ordering.test.tsx:78`: Testing Library's `ByRoleOptions` does not accept `exact`. The installed `@testing-library/dom` 10.4.2 implementation passes the computed accessible name to `matches`, which compares a string matcher using strict equality. Removing only `exact: true` therefore preserves the exact `Link` accessible-name expectation.

The only test-code change is:

```diff
-    expect(screen.queryByRole('textbox', { name: 'Link', exact: true })).toBeNull();
+    expect(screen.queryByRole('textbox', { name: 'Link' })).toBeNull();
```

Corrected test blob: `d04084036106ed67f00c12fc98ba6948b34809f6`.

The stale-result test still switches into minimal mode and back, resolves the pending itemized result, and requires both the Link textbox and invoice-download action to remain absent. The neighboring newer-result ordering assertions remain unchanged. No production source, privacy-minimal payload format, payment fields, signature behavior, test assertion, dependency, timeout, or coverage threshold changed.

## Native verification

All checks used the source-matched isolated checkout, Node 24.22.3, npm 11.19.1, TypeScript 5.9.3, Vitest 5.0.5, and the existing pinned Testing Library packages.

| Check | Command | Actual result |
| --- | --- | --- |
| Original failure | `node scripts/build-workspaces.mjs --workspace @ghostpay/web --deps-only` | Exit 2; reproduced TS2769 at the original line. The build script ignores the unused `--deps-only` argument and entered the normal web TypeScript build. |
| Existing additional build dependency | `npm run build -w @ghostpay/relayer-guard` | Exit 0. This resolved initially unbuilt declarations imported by web integration-test types. |
| Focused existing ordering tests, from `apps/web` | `../../node_modules/.bin/vitest run src/views/CreateInvoice.ordering.test.tsx --coverage=false --maxWorkers=1` | 3/3 passed, 1 file, no skips. |
| Full web typecheck | `npm run typecheck -w @ghostpay/web` | Exit 0. |
| Scoped typed lint, from `apps/web` | `../../node_modules/.bin/eslint --config ../../eslint.config.js src/views/CreateInvoice.ordering.test.tsx` | Exit 0. |
| Secret scan | `bash scripts/scan-secrets.sh` | Exit 0; no committed env files or key material found. |
| Patch whitespace | `git diff --check` | Exit 0. |

The initial build also reported missing declarations from the unbuilt `@ghostpay/relayer-guard` workspace; those were setup errors resolved by building that existing library, not by changing source. External dependency cache reuse kept separate local `@ghostpay/*` links, and the already recovered pinned `@bufbuild/protobuf` 2.17.0 package supplied the current dependency graph. All relevant internal libraries were built from this successor's actual source.

## Handoff

This repair clears the verified TS2769 blocker while preserving PR #585's feature work. It does not assert completion of the entire privacy-minimal feature, full browser qualification, hosted exact-head CI, or integration. Root must independently review the one-line patch and publish the reviewed successor. #586, #571, Pay paths, original owner branches, main, workflows, deployments, and real-funds operations were untouched.
