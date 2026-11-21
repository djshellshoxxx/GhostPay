# Sweep journal validation qualification

The correction passed **70 tests in four selected complete files** and fresh
independent source review. Source/egress scanning and all **114** Actions pins
passed. Broader application and hosted qualification remain pending.

## Source and scope

- Base: #307 `5a745d4b5fba69b66a9779f88aefc63c253a4f27`.
- Regression first: `2a1c878f5b57a0135bf353bf7a1522db31381ad5`.
- Runtime correction: `526f9849233f3d809a2847565f732415fe9dbcd2`.
- Independent approval: `JOURNAL_REVIEW.md`, originally `0bb42dea7112f5266f131faa6e88cf058f0fe6b9`.

Only `apps/web/src/lib/sweepAttemptJournal.ts` and its new strict-JSON test change
in application/test paths. The runtime imports the existing invoice-schema
strict parser, already used by the wallet journal. Invalid saved records retain
the existing typed unavailable error and are not overwritten. Writer-produced
direct, replacement and relayed records remain compatible, including safe-integer
bounds and decimal-string uint256 nonces. The independent review explains the
additional refusal of noncanonical numeric spellings the writer never emits.

Storage lifetime, capacity, eviction, transaction authorization, cryptography,
fees, networks, refund policy and all repository gates remain unchanged. This
does not add cross-tab coordination or durable recovery after session loss.

## Executed outcomes

| Check | Outcome |
| --- | --- |
| Journal/wallet selection, one worker | 70 passed; 4 files; exit 0; coverage disabled only for the focused command |
| Independent source review | Approved; source-diff/log hashes verified; reviewer did not rerun tests |
| Original source/egress scan | Passed |
| Original Actions pin check | Passed, 114 references |
| Whitespace | Passed |
| Initial default-worker focused run | Killed, exit 137 |
| First all-library build | Failed because selected cached installation was incomplete; generated dependency trees replaced with a complete matching cache |
| Complete-cache all-library build | Killed, exit 137 in external-pools |
| Explicit web-library build graph | Aggregate exit 137 after killed address-safety/core-crypto operations; no aggregate success claimed |
| Scoped original typed ESLint | Killed, exit 137 |
| Original full-web typecheck, 256 MiB heap | Explicit V8 heap exhaustion, exit 134 |
| Same original typecheck, 768 MiB heap | Killed, exit 137 |
| Full coverage, production builds, browser, Pages and hosted gates | Not successfully qualified by this cycle |

Exit 137 establishes process termination, not its precise cause. All failed
attempts are retained. No assertions, timeouts, configuration, dependency pins,
thresholds or skips were relaxed. Tests were committed before the correction;
no new baseline regression result is asserted.

Passing selection:

```sh
NODE_OPTIONS=--max-old-space-size=384 npm exec -w @ghostpay/web -- vitest run src/lib/sweepAttemptJournal.strictJson.test.ts src/lib/sweepAttemptJournal.test.ts src/lib/duplicateAttemptJournal.test.ts src/lib/walletJournal.test.ts --maxWorkers=1 --coverage.enabled=false
```

## Provenance and handoff

Local Node 24.22.3 / npm 11.19.1 execution reused an installed cache after matching
76 manifest/configuration files and every required nonoptional installed path.
External package files were hardlinked into separate dependency directories;
workspace links target this task's source. This was not a fresh npm installation.
`JOURNAL_QUALIFICATION.json` retains lossless outputs, available command records,
exit codes, source identities, dependency provenance and verified SHA-256 hashes.
The passing run's uncommitted diff hash matches the final corrective commit;
later changes are documentation only.

The separate #338 Bitcoin feature retains its existing authoritative PR. Its
563-case package results in `SECURITY_BTC_QUALIFICATION.*` are not results for this
change. The full 410-branch and 111-PR snapshots extend `ACTIVE_WORK.md`; they do
not replace that registry or qualify all branches. No open PR owned these two
journal paths at the frozen comparison.

Publish this contribution as draft for exact-head CI. The integration lease is
held by external coordinator `994a0d214fb9-root-r3`, generation 11. Shared main and
integration refs require that coordinator's qualified composition and current
lease. No release, deployment, deletion, force-push or live payment is included.
