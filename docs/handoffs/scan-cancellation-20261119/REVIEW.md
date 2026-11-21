# Scan caller-cancellation assertion reconciliation

## Pinned scope

Base candidate: `e76451ad56ba1634eed9d03468961900433fd130`.
Test repair: `9ae57de3ef8a432c1592ddfb496de8b0fd0a6fee`.
Claim: `22cad8f8` on `codex/ghostpay-scan-privacy-fixtures-20261119`.
Recovered test source: `5c926889d424392c67185b3c13974d0fcd589780`.

The coordinator's complete unit selection exposed four failing expectations in
`scanPrivacy.authorization.test.ts`. These are cancellation-sentinel integration
mismatches, not malformed-profile fixtures or a production authorization defect.

## Cause and existing repair

`assertScanActive` intentionally throws the fixed `scan-aborted` error, without
propagating the caller's arbitrary abort reason. The Scan view recognizes this
sentinel, and the existing scheduler and client tests already expect it. This
newer caller-authorization test had retained an older `RPC_URL_REJECTED` / `scan
cancelled` error shape. Cancellation itself stopped dispatch as designed.

The prior integration commit `5c926889` already reconciled exactly these three
assertion lines. This patch restores that existing test blob byte-for-byte. The
two pre-aborted bootstrap cases expect the shared sentinel, as do cancellation
of a queued window and cancellation during jitter. It preserves the zero-RPC /
zero-fetch checks, one-window request bound, single jitter call, and the live
indexer request's abort propagation and bounded error assertion. No test case,
production code, error handling, parser, consent behavior, configuration or
threshold changes.

## Executed evidence

From `apps/web`, Node `24.22.3`, Vitest `5.1.0`, the original repository Vite
configuration, one worker and a 384 MiB heap:

```sh
NODE_OPTIONS=--max-old-space-size=384 ../../node_modules/.bin/vitest run src/lib/scanPrivacy.authorization.test.ts --maxWorkers=1 --coverage.enabled=false
```

- Unchanged candidate: **4 failed, 1 passed**, 2.49 seconds. The bounded live
  indexer cancellation case is the passing control.
- Restored expectations: **5 passed**, zero failures, 2.10 seconds.
- `git diff --check`: passed.
- The complete repaired test is byte-identical to the recovered source above.

The isolated checkout used existing compiled package outputs copied from the
coordinator's candidate checkout; package links resolve inside the isolated
checkout. No source-alias configuration was used. Raw output is retained under
`evidence/` with only trailing blank lines removed. Source hashes identify the
test and unchanged `scanPrivacy.ts` / `Scan.tsx` runtime inputs. This focused run
does not establish full coverage, lint, build or browser qualification.

## Independent review and integration

The recovery worker independently reviewed exact implementation
`9ae57de3ef8a432c1592ddfb496de8b0fd0a6fee`, verified that the complete test blob
matches the prior integration and that runtime source is unchanged, and found no
introduced blocker. The fixed helper sentinel and retained dispatch/cancellation
assertions were reviewed. This is source review; the author's focused runtime
results are not relabeled as an independent replay. The coordinator owns
integration and combined-source qualification. This worker made no root source,
remote branch, main merge, deployment or release change.
