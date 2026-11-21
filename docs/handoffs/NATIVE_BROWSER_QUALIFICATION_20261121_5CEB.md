# Native browser qualification continuation

Owner: `5ceb6203640a-root`; isolated branch `qualify/ghostpay-native-browsers-20261121-5ceb`.
Application starting point: `bd024ca06cd3f55afcf0a4ba543f963eb6b0499b`. Incorporate the final independently repaired recovery candidate before publication; this handoff alone is not a mainline merge authorization.

## Purpose and implementation

The existing browser projects use Chromium, including the iPhone/iPad viewport descriptors. The supplemental configuration selects actual Playwright Firefox and WebKit engines, and WebKit at iPhone SE and iPad Mini sizes. It reuses the existing application journeys, ephemeral signed manifest, build/profile guards, network fixtures, timeouts and assertions. It explicitly replaces inherited launch options so a locally configured Chromium executable cannot be used for another engine. The original web TypeScript configuration now checks the new configuration file.

The new workflow uses the repository's pinned actions and existing exact-lock library setup. It runs four read-only jobs: Firefox/WebKit × full/lean. WebKit also executes its two mobile viewport projects. Only GitHub-hosted runners install the pinned browser binaries. The workflow has no deployment/release step, repository write permission, wallet integration or real-network transaction. JSON results and source/commit/tree identities are retained as ordinary CI artifacts; a failed or absent result is not a pass.

## Explicit qualification boundaries

The supplemental native configuration excludes the two virtual-camera spec files, which inject Chromium-specific fake-capture switches, and the clipboard spec whose permission grant is Chromium-specific. One master-backup KDF race case uses Chromium DevTools CPU throttling and remains in the original Chromium gate. All other stealth-export cases, including fresh-profile recovery and secret-leak checks, remain selected for both native engines. The ordinary Chromium configuration and its acceptance assertions are unchanged. Local-devnet journeys remain under their existing dedicated configurations.

Those exclusions are unexecuted native-engine acceptance work, not native passes. Browser viewport emulation is not a physical-device test. Firefox is not Tor Browser, and these jobs do not attest Tor routing or real RPC/provider privacy. Unsupported hardware/permission acceptance remains explicit.

## Executed local validation

- `npm exec --workspace @ghostpay/web -- playwright test --config=playwright.native.config.ts --list` loaded the original configuration and all selected test modules: full profile **282 cases in 31 files discovered**, no browser/application test executed.
- A temporary reporter inspected Playwright's resolved projects while `GHOSTPAY_CHROMIUM=/usr/bin/chromium` deliberately selected a real Chromium path in the inherited configuration. Both native desktop projects retained their requested engine and empty launch options; both WebKit mobile projects retained WebKit and their mobile descriptors. Full: Firefox136, WebKit136, mobile5+5. Lean: Firefox126, WebKit126, mobile5+5; **262 discovered**, none executed.
- `NODE_OPTIONS=--max-old-space-size=1536 npm run typecheck --workspace @ghostpay/web` passed, including the new configuration.
- `bash scripts/check-actions-pinned.sh` passed **120** action references.
- YAML parsing and assertions confirmed the two-engine/two-profile matrix, fail-fast=false, a single job definition and contents:read permissions.

These commands ran on the isolated configuration worktree before its source commit; raw outputs and file hashes are preserved in the coordinator's evidence packet. Final source/parent reconciliation requires a fresh typecheck/discovery receipt. Local browser launch is unavailable because of Chromium Unix-socket restrictions and missing pinned Firefox/WebKit binaries. Hosted browser results and independent source review are still required.

## Integration

Publish as an owned child of the recovery candidate after its final source is frozen. Keep it draft until exact-source hosted jobs and independent review complete. The generation-11 shared integration lease remains held by `994a0d214fb9-root-r3`; no main or existing integration branch may be updated until ownership is reconciled. No required check or approval is waived by this supplemental workflow.
