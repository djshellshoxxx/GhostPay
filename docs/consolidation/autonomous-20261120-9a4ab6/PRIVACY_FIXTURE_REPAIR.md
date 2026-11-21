# Current-wallet privacy fixture and reviewed RPC inventory repair

## Result

Two lines change at corrective source
`a02d640b7f847c006526d561467db9f348910d5a`:

- The existing WalletAttempts locale fixture supplies the same account and chain
  as its recorded attempt.
- Pay's documented `reference:getRpc` count changes from six to seven after
  independent review. Its `call:getRpc` count remains three.

The two complete affected component files passed **20/20 tests**, and the original
network-inventory suite passed **6/6 tests**, with zero failures or skips. No
retry was needed. Production code and every original assertion remain unchanged.
These are focused results, not a whole-web coverage or release qualification.

Existing [PR #336](https://github.com/djshellshoxxx/GhostPay/pull/336) remains the
authoritative privacy acceptance stack. This is a minimal stacked correction on
its exact head `410353a23631234aa888e46f38df22291c699a26`, not a new privacy feature.

## Source and ownership

Worker: `/root/privacy_fixture_repair`; coordinator: `9a4ab6c3d117-root`.
Branch: `test/ghostpay-privacy-fixtures-20261120-9a4ab6`.
Claim commit: `422f42e34415f310bdebdf0c9a3c04a624120f40`, before source edits.

`AGENTS.md`, WORKFLOW, HANDOFF, relevant ACTIVE_WORK claims, the completed privacy
release review and actual hosted failure logs were inspected. The live #336 head
was refreshed and matched the assigned source. The full frozen 111-PR path
inventory and newer PRs #345–#347 were checked. Existing earlier locale, network
and devnet owners retain their broader claims; no shared ref or live lease changed.
The scope and ownership record is `PRIVACY_FIXTURE_OWNERSHIP.json`.

Outside additive coordination and scoped evidence, only these paths change:

| Path | Exact change |
| --- | --- |
| `apps/web/src/components/SharedComponents.i18n.test.tsx` | One render supplies `wallet` with the fixture's existing chain 1 and account. |
| `docs/privacy/network-egress-inventory.json` | Only `networkReferenceCounts["apps/web/src/views/Pay.tsx"]["reference:getRpc"]`: 6 to 7. |

The source proof verifies the entire locale file equals its baseline with just
that one render replaced. The complete parsed inventory equals its baseline with
only the specified count changed. All other counters, surface records, authority
descriptions and gates remain exact. Existing browser files are unchanged.

## Why the locale fixture needed current wallet context

At the pinned source, `WalletAttempts` always filters details by the current
wallet account and chain. Without that context it preserves the journal and
warning while hiding account/hash details and the clear control. `PrivateHistory`
adds its existing separate temporary reveal when privacy mode is enabled.

The locale test had created a chain-1 payment attempt but rendered the component
without a wallet. Expecting the clear control in that state contradicted the
current presentation contract. The correction supplies exactly the same chain
and account already in that test record. It changes no user authorization path,
privacy default, disclosure policy, component implementation or stored record.
Every existing heading, warning, English clear-control and chain-line assertion
remains byte-for-byte intact.

The selection also ran the complete existing `WalletAttempts.test.tsx`. Its four
cases retain checks for disconnected-account concealment, unchanged journal
bytes and duplicate refusal, account/chain filtering, confirmed clearing, and a
separate temporary history reveal that does not revive on reconnection. Those
existing safeguards were not removed to make the locale fixture pass.

## Independent review of the extra network reference

Reviewer: `/root/privacy_fixture_repair/rpc_inventory_review`, separate from the
fixture author. It read source/history/inventory only, changed no file, ran no
test and approved only the single count correction.

The seventh reference is `app.getRpc` in `refreshContext`'s `useCallback`
dependency array at Pay line 555. Commit
`74dccc419bf5c82b21875d205ed5a97d0c4e69b6` replaced a broad `app` dependency with
explicit execution dependencies. Evaluating the function reference does not call
it. Callback recreation can change, so this is not a claim of identical scheduling.

| Pay line at #336 | Existing counted reference |
| --- | --- |
| 426, 427 | Capture/refresh `app.getRpc` in the `latest` ref. |
| 517 | Destructure the function from `latest.current`. |
| 534 | First acquisition call, for context preflight. |
| 555 | Additional non-invoking callback dependency. |
| 603 | Second acquisition call, for buffer-quote preflight. |
| 836 | Third acquisition call, for wallet-operation runtime. |

All three calls still use `action: 'payment-preflight'`, the selected invoice or
wallet chain, and existing cancellation ownership. Runtime acquisition combines
wallet privacy and network signals and checks current privacy authority after the
await. AppShell still binds authorization to the selected URL, RPC category and
EVM chain before creating the client. Existing inventory surfaces already own
Pay and those preflight/deployment boundaries. No new dispatcher, network
permission, surface exception or rule relaxation is needed.

Exact reviewed blobs and the history origin are in `PRIVACY_FIXTURE_SOURCE.json`.
This review is bounded source evidence, not a live network or finality assessment.

## Executed checks and evidence

Both commands ran on committed corrective source `a02d640b`, with an empty tracked
working diff, Node `v24.22.3` and matching cached dependencies. Tests retain their
original configuration, assertions, 60-second timeout and skip policy.

| Command from repository root | Actual result |
| --- | --- |
| `NODE_OPTIONS=--max-old-space-size=384 npm exec -w @ghostpay/web -- vitest run src/components/SharedComponents.i18n.test.tsx src/components/WalletAttempts.test.tsx --maxWorkers=1 --coverage.enabled=false` | Exit 0; 20 tests, two complete files, zero skips; wrapper 9.280 seconds. Coverage is disabled only for this focused selection. |
| `NODE_OPTIONS=--max-old-space-size=256 node --test scripts/tests/network-egress-inventory.test.mjs` | Exit 0; all six original inventory tests, zero skips; wrapper 1.351 seconds. |

`PRIVACY_FIXTURE_UNIT.json` and `PRIVACY_FIXTURE_INVENTORY.json` preserve exact
arguments, source identity, environment overrides, timestamps, exit status and
complete output as text plus lossless base64 with SHA-256/byte counts. The npm
configuration warning remains in the original output. Worker concurrency is one;
the original pool still creates separate isolates for the two files.

The dependency proof establishes 78 byte-identical manifests/configuration files,
684 matching external lock records, no missing required installed path and 68
workspace links resolving into this worktree. All 65 reused compiled packages
have matching tracked production/build inputs and copied output hashes. External
files were hardlinked into separate dependency directories with separate caches;
compiled outputs were independently copied. This was reuse of a matching existing
installation, not a fresh npm install or new build execution.

## Preserved failures and remaining gates

The original hosted failures remain failures. Their checkout
`de0abd3f33f5f147a506743f87919230ad038197` has the exact #336 tree
`a506f54f1cd2c7ee5bbc007299e4a82a78d62a87`:

- [Web unit job 136570703109](https://github.com/djshellshoxxx/GhostPay/actions/runs/44805158399/job/136570703109): 4,202 passed, one failed, one skipped; the missing-wallet locale fixture failed.
- [Rest-0 job 136570703240](https://github.com/djshellshoxxx/GhostPay/actions/runs/44805158399/job/136570703240): its final Node suite recorded 413 passed and one failed; the documented reference count was stale.

Both complete original logs are retained losslessly in
`PRIVACY_FIXTURE_PRIOR_FAILURES.json.gz`, with archive/per-log hashes and lengths
in its adjacent JSON index. No baseline vulnerability reproduction was performed.
The new focused passes do not retroactively change these full-command outcomes.

Full-web coverage, full compiler, typed lint, broad build and final-head hosted
qualification were not rerun here. The coordinator's shared environment had just
recorded scoped typed-lint V8 exhaustion at 512 MiB and a killed sole 768 MiB retry
on the policy worker's different source. This task does not repeat those broad
resource costs and does not relabel those failures as results for this source.
Changed-head compiler/lint qualification remains open.

The local devnet driver requires Anvil and Forge; both are absent from PATH and
its documented `~/.foundry/bin` fallback. Consequently no browser/devnet run or
browser fixture modification is included. The Pages/Beta post-reload fixtures
still need explicit wallet reconnection before journal details can be expected.
Their existing hash, storage, duplicate, no-send and chain-outcome assertions must
be preserved. Separate focus/cancellation failures remain with the privacy owner.
No browser, real wallet, financial service, release or deployment was exercised.

## Independent coordinator source review

The coordinator independently approved exact correction `a02d640b` after reading
the complete two-line diff, WalletAttempts' current account/chain filter, and all
seven Pay `getRpc` occurrences. The supplied scope matches `beginAttempt`; no
assertion or disclosure behavior changes. The added dependency-array reference
introduces no acquisition call and the call count remains three. This approval
is separate from the worker's executed 20 component and six inventory tests.
Browser fixtures remain unchanged and their failures remain open.

## Handoff

Root owns independent final review, publication as a draft into the existing #336
branch, and applicable final-head CI. Keep its original privacy stack and the
separate v1.0/v1.1 release boundaries. This worker releases its source paths and
heavy execution slot after preserving the completed evidence. No shared target,
lease, PR, remote branch or release was changed by the worker.
