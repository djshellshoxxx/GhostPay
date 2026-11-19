# Independent integration source review — 2026-11-18

Reviewer: branch archaeology worker, separate from the coordinator and recovery implementation worker.
Starting main: `dfc75ef2087fa6463ae59e0818abec01796c578d`.

This is a focused source review. It is not a claim that every feature or the combined candidate is qualified.
The branch/PR matrix records hosted check snapshots separately. The coordinator owns combined-source tests and merging.

## Narrow first-stage repairs

| PR / exact source | Review result | Required integrated verification |
|---|---|---|
| #227 `613667be4eeb132c7d21ccd06c627f9a7144d85b` | No introduced blocker found. Both wall and monotonic time detect rollback or expiry before activity resets the timer. The intentional sole-copy recovery exemption remains: unsaved, unverified keys are not destroyed. | AppShell idle-clock, backup/recoverability and session tests; actual sleep/wake qualification remains distinct. |
| #231 `d9ff386807de724eb1a1c4d400c882df0fc20bb7` | No introduced blocker found. Every displayed balance query requires a click. Selection, chain, token, RPC, session, lock and unmount changes invalidate the result. The guard runs after asynchronous client acquisition and before disclosing the address. | Sweep privacy/unit suites and browser journeys after privacy branch integration. |
| #235 `a5076f4d4e8d2dc515bdc31f304b6c6ce75bf3b1` | No introduced blocker found. HKDF-SHA256 v4 slots require the matching loaded viewing key. Cached names are bound to the current session object. v1/v2/both ambiguous v3 formats are purged or ignored. | Scan checkpoint, slot-namer, session-switch/lock, resume and storage-denial tests. Preserve v4 through #211/#222 conflicts. |
| #234 `5e9e7be70399a9818579cf87bd494e013e25d4f9` | No introduced blocker found. Required pinning rejects invalid signatures before unpinned signers. Missing pins trust nobody. A passphrase prompt remains explicitly unauthenticated. Default parsing is unchanged. | Invoice-schema and ux-core error-guidance tests. This shared API does not automatically enable required pinning in the Pay UI. |
| #237 `7109290b7e4f029c36d9743bde9fd664d1da5474` | No introduced blocker found. Only hidden-file inclusion changes; the upload path remains the explicit beta `.log` glob. Permissions and retention remain unchanged. Fixtures use local Anvil accounts. | Workflow/action validation and an actual artifact-producing beta run. Log retention does not fix browser test failures. |

V4 protects the slot from derivation using only public seller identifiers. Cursor contents remain public chain data;
this review does not claim encrypted storage, resistance to arbitrary same-origin script compromise, or anonymous RPC access.

## Security/tooling extraction recommendations

- #220: take the coherent RPC `credentials: omit`, `referrerPolicy: no-referrer`, `cache: no-store` change and regression;
  take viewing-key/one-time-key boundary documentation and its executable proof; take both original and follow-up
  workflow path-policy restrictions. Do not take the reverted D-1 ambiguity-only payer-proof guard. That attempted
  fix was bypassable and could block honest confirmations. No `@ghostpay/ux-flow` import was found in `apps/web`.
- #212 + #225: the standalone checker may be retained as an unwired utility. #225 rejects abnormal runner exits,
  misleading clean output followed by failure, and malformed or duplicated error annotations. Clean report counting
  does not prove target coverage/provenance. Keep the current Mythril gate unchanged. The deployment-validation npm
  entrypoint and its command-line regression are useful independent changes.
- #224 + #226: take the static helper corrections together. #224 alone still misses symlink escapes, malformed raw
  URLs and filesystem exceptions. The final helper resolves real paths, checks containment by path components and
  reads before returning success. It remains a local audit helper, not a deployed service.
- #224: HTTPS-only redirects preserve existing download content hashes. Bidirectional-character escape changes are
  intended to preserve literal values while making source characters visible. Keep current action pins and runner
  selection when extracting security workflow changes from older bases.

## Independent review of recovery worker additions

Reviewed commits:

- `933bdedc07dfeb6024f1ea23045bacbbc81972fb`: visible disclosure of payment-address RPC exposure before secret export.
- `f2ed1ed4240f91ef2fb41f3edaf3ea6546e87e60`: archive test reconciled with #229 metadata disclosure.

No introduced source blocker was found. The disclosure appears before credential fields and encrypted/raw export
actions. Opening the panel and exporting the public record remain request-free. The archive assertion now checks
the authenticated but readable header and entry linkage; it does not weaken secret handling assertions.

Independent execution on `f2ed1ed4240f91ef2fb41f3edaf3ea6546e87e60`, Node v24.22.1, Vitest v5.0.5:

```text
cwd: recovery/apps/web
NODE_OPTIONS=--max-old-space-size=768
../../node_modules/.bin/vitest run src/components/StealthExportPayment.test.tsx src/i18n/securityKeys.test.ts --coverage.enabled=false --maxWorkers=1
exit 0; 2 files passed; 24 tests passed; 0 skipped; duration 7.17 seconds
```

Log: `security-tooling-evidence/recovery-independent-export-ui.log` in the execution workspace.
This result covers the two selected suites only. The full recovery branch and final combined candidate require their
own acceptance evidence. Hosted CI, public-testnet, Tor and hardware-wallet qualification are not implied.
