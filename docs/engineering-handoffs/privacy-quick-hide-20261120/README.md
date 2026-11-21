# Independent privacy quick-hide feature

## Result and source

This branch adds a one-way **Alt+Shift+H** shortcut and an accessible, visibly labelled button for users who already enabled privacy mode. The action revokes temporary global and private-history reveals through the existing privacy model. Repeated use never reveals anything. It does not enable or disable privacy mode, lock the vault, erase data, cancel transactions, rewrite preferences, or delete sole-copy recovery material.

- Worker: `/root/new_feature_gen1`.
- Branch: `feat/ghostpay-privacy-quick-hide-20261120`.
- Frozen dependency: `8be152897a717447e33642c99a976cdbb76b709f`, the existing local privacy masking/history implementation.
- Claim: `1d92ca4d`; baseline shell regression: `c0339ee8`.
- Implementation and tested source: `052ac56c36cf62419941223318d1b6a366954625`.
- Runtime delta: new 28-line `PrivacyQuickHide.tsx` and one import plus one mount in `AppShell.tsx`. Existing privacy semantics, Settings, catalogs, clipboard, network, fees, contracts and gates are unchanged.

The original privacy implementation is actively owned and continued advancing during this task. This frozen dependency must not replace that owner's newer source. Root must reconcile dependency/ownership and publish this as an isolated feature candidate before any integration. This worker performed no remote mutation.

## Behavior and bounds

The listener runs only while privacy mode is enabled. It accepts Alt+Shift+H (case insensitive for H), rejects extra Control/Meta modifiers and ignores composition, repeated keydown and already-handled events. Ordinary typing and other key combinations are not prevented. An accepted chord prevents its own default action and invokes only the existing global hide function. The listener is removed on component unmount or privacy disable.

The button exposes `aria-keyshortcuts="Alt+Shift+H"`; its localized action label reuses the existing reviewed `privacyUx.hide` text. The visible keyboard combination adds no catalog entry. Existing `PrivacyBoundary` behavior removes hidden content from display/accessibility and transfers focus out of sensitive fields. It preserves mounted drafts. History still requires its existing unlock and explicit reveal conditions.

This is visual masking. It does not erase DOM/JavaScript memory, clipboard history or encrypted backups, and it is not a vault-lock shortcut. Native browser/OS shortcut delivery remains to be qualified in a functioning browser.

## Executed verification

Node 24.22.3, repository Vitest 5.1.0. The worktree reuses the coordinator's already-installed dependency tree; no install, lockfile, configuration, threshold or timeout change occurred.

1. The first unchanged-source baseline attempt did not start its forks worker before the configured deadline. It ran no test and is recorded as an infrastructure failure in `STARTUP_ERROR.log.gz`, not RED evidence.
2. The unchanged-source retry executed the committed shell regression and failed **1/1** at `expect(isInaccessible(draft)).toBe(true)`: Alt+Shift+H left the sensitive draft accessible. See `BASELINE_RED.log.gz`. The unmounted new component existed on disk at the end of the run but was not imported by the unchanged shell and could not handle the event.
3. On source `052ac56c`, the new shell/component suites plus the existing privacy model/shell suites passed **40/40 tests in 4 files**, zero failures or skips. See `FOCUSED_GREEN.log.gz`.
4. Initial full web TypeScript and scoped typed ESLint executions were each terminated with `Killed`, exit 137, without source diagnostics. Preserve `TYPECHECK.log.gz` and `LINT.log.gz`; these are not passes. The sequential 1536 MiB Node heap retry passed scoped typed ESLint (exit 0, `LINT_RETRY.log.gz`), while TypeScript was again killed (137, `TYPECHECK_RETRY.log.gz`). After root stopped its concurrent library build, a final TypeScript-only 1536 MiB attempt was also killed (137, `TYPECHECK_SERIAL.log.gz`). No compiler diagnostic was produced, but full web typechecking remains unqualified on this source. Further local retries stopped. Original project configuration, compiler options, assertions, timeouts and gates remain unchanged.
5. `git diff --check 8be15289..052ac56c` passed.

The 40 tests cover the new one-way shortcut/button, all modifier/composition/prevented-event controls, listener removal, independent history hide/reveal and relock, sensitive focus transfer, exact preference-byte preservation, the same unsaved invoice draft node, and the same loaded seller session. Existing privacy model and shell regression suites also pass.

### Commands

```sh
npm exec --workspace @ghostpay/web -- vitest run src/AppShell.quickHide.test.tsx --maxWorkers=1
npm exec --workspace @ghostpay/web -- vitest run \
  src/AppShell.quickHide.test.tsx src/components/PrivacyQuickHide.test.tsx \
  src/lib/privacyMode.test.tsx src/AppShell.privacy.test.tsx --maxWorkers=1
NODE_OPTIONS=--max-old-space-size=1536 npm run typecheck --workspace @ghostpay/web
NODE_OPTIONS=--max-old-space-size=1536 npm exec --workspace @ghostpay/web -- \
  eslint --config ../../eslint.config.js src/AppShell.tsx src/AppShell.quickHide.test.tsx \
  src/components/PrivacyQuickHide.tsx src/components/PrivacyQuickHide.test.tsx
```

### Product/test SHA-256 at the freeze

| Path | SHA-256 |
| --- | --- |
| `apps/web/src/AppShell.tsx` | `956b71b282cadd2c9186e0b32e5842a7519d75829ed7c6353351ede803ffe47e` |
| `apps/web/src/AppShell.quickHide.test.tsx` | `b0e79a49d8387e378569d7b450d1f353ada5faf06c7903c322e8232b5bf3c281` |
| `apps/web/src/components/PrivacyQuickHide.tsx` | `be3d365c37806aa59a3a91e2427a4b5e30626ec0fe8d7f9e48b3f05b8f82ea93` |
| `apps/web/src/components/PrivacyQuickHide.test.tsx` | `28d964c298a137bc336ea86e80f5e394ec034f5230bd0509d35c8187649ea49c` |

## Fresh successor handoff

Fresh independent reviewer `/root/security_review_gen2` was given the exact implementation freeze and test results. Its results belong to its separate review record; this author report does not claim them prospectively.

Review the new event handler and two-line shell integration against the latest privacy-owner branch, then independently execute the focused suites. Verify repeated chord/button use cannot reveal hidden data, relocked history cannot be revealed, input/OS modifiers are respected, and no vault/session/network authority call is introduced. Complete full web TypeScript in a sufficiently resourced execution window; three killed runs do not qualify the source. Require original exact-head hosted CI and actual browser/keyboard/accessibility qualification after reconciliation. This branch does not complete issue #286 or qualify a beta release. No deployment, release, real-funds operation, fee activation or gate bypass occurred.
