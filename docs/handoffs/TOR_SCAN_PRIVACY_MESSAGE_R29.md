# GhostPay R29 — Tor static browser save-message regression handoff

**Status:** isolated test-only repair, **not merge-qualified**. No application, wallet, contract, relayer, deployment or security-policy changes.

## Source and ownership

- Repository: `djshellshoxxx/GhostPay`.
- Protected default branch remained `eb59d93cffed7848c4aac37d0e9650b87239c6da` at discovery.
- Parent: recovery/privacy PR [#372](https://github.com/djshellshoxxx/GhostPay/pull/372) head `055d33e042c63edf1d5bbbdd7833d3c1ef93733d`, unmerged and already subject to separate review.
- Dedicated stacked branch: `automation/20261122/tor-scan-saved-message-contract-r29`, based exactly on that head. Isolated ownership claim commit `9b209865b68bab3fc8b93e180a34ede289a8383c`.
- Test-source correction commit `53b3c0e374954ac8fb1585f5768286a1d1a5a0b7`, `scripts/tor/browser-acceptance.mjs` blob before `1f57b2d5a102f398cfc111e349dfc2684d498518`, after `9f6732a60662664617c623a3dca9c5644ed20c90`.
- Changed paths on this branch are only the Tor browser acceptance test, append-only coordination claim in `docs/ai/ACTIVE_WORK.md`, and this handoff. The Tor acceptance harness itself was originally owned by [#363](https://github.com/djshellshoxxx/GhostPay/pull/363); the ownership conflict must be explicitly resolved before integrating. Neither #363 nor #372 branch is overwritten.

## Confirmed failure and cause

- [PR #372 Tor static hosting run 44879664025](https://github.com/djshellshoxxx/GhostPay/actions/runs/44879664025), failing job [136771948240](https://github.com/djshellshoxxx/GhostPay/actions/runs/44879664025/job/136771948240), source at `055d33e042c63edf1d5bbbdd7833d3c1ef93733d`.
- Browser acceptance failed with `locator.waitFor: Timeout 30000ms exceeded` on `scripts/tor/browser-acceptance.mjs:81`. The test waited for exact literal `Scan privacy settings saved. They apply to the next scan.` after selecting Tor Browser scan transport and clicking Save scan privacy.
- In the *same parent source*, `apps/web/locales/en.json` blob `6fb5c75583dc60d0b058c696114c1503b4e650cb` defines `settings.scanPrivacy.saved` as `Network privacy settings saved. Pending network operations were cancelled; start a new action to use these settings.`
- `apps/web/src/views/Settings.tsx` at this head generates the confirmation with `{ key: 'settings.scanPrivacy.saved' }`; therefore the assertion text disagrees with the actual English catalog. A different, genuine runtime failure remains possible until the new exact-head browser acceptance is observed.

## Minimal repair and existing regression test

- Read the already checked-in `../../apps/web/locales/en.json` using `readFile(new URL(..., import.meta.url), 'utf8')`, without network access or new dependency.
- Fail immediately unless the catalog's `settings.scanPrivacy.saved` is a nonempty string.
- Preserve `getByText(..., { exact: true }).waitFor()` as a strict user-visible confirmation assertion, but expect that catalog value rather than a duplicated stale English literal.
- Existing offline Chromium Tor acceptance (two paths/origins) serves as the red regression and must now pass on the *combined* parent + child head. All other network-egress denial, CSP/header, WebCrypto, hashed static bundle, storage separation, no fallback, local key generation and persistence assertions are untouched.
- The separate [Contract analysis / Mythril run 44879663933](https://github.com/djshellshoxxx/GhostPay/actions/runs/44879663933) failed at #372 head and is **not addressed** by this change. Do not conflate Tor acceptance repair with full recovery qualification.

## Verification gates and limitations

- Parent exact-head baseline failure reproduced from hosted GitHub log and parent English source; the revised script and catalog were read back from branch source.
- Repository checkout, local Node/Playwright, containerized Tor, native Tor Browser, live onion and real-funds tests were **not** executed in this coordinator environment. Hosted exact-head workflows must be checked on the new PR, including actual Tor static acceptance where supported.
- Requires distinct independent reviewer, #363 harness owner coordination, #372 parent readiness, successful source-composed Tor/browser and Mythril/security gates, and legitimate held-lock release/transfer before protected integration.
- Integration ref `automation/ghostpay-integration-lock` at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79` has status `held`, generation `11`, owner `994a0d214fb9-root-r3`; old expiration is **not** takeover authorization.
- No deploy, release, force push, shared-parent update, real RPC, wallet operations or funds movement performed.

## Next worker

Read this branch's last exact head, CI logs and ownership records. Verify actual Tor browser acceptance at the combined head; if the literal mismatch is resolved but a second failure appears, create a separate failing regression without suppressing any privacy/egress assertion. Review with #363 and #372 owners before selectively integrating. Do not claim that success of the isolated workflow qualifies the full beta or guarantees recovery, refund or custody.
