# Settings exchange disclosure assertion reconciliation

## Pinned scope

Base candidate: `e76451ad56ba1634eed9d03468961900433fd130`.
Test repair: `83bc4f52767d88e6896d986a29f6d3495e8c22c4`.
Claim: `7204788f` on `codex/ghostpay-settings-exchange-20261119`.

The coordinator's complete unit selection reported a failure in
`Settings.exchange.test.tsx` at the export-selection disclosure assertion. The
isolated reproduction confirms obsolete test wording, not missing runtime
consent, a missing warning, or incorrect exported sections.

## Failure and narrow correction

The old test looked for `they show which providers you use`. The existing warning
instead says the QR contains complete exported endpoint URLs and reveals the
providers used. It also explains that session-only RPCs and detected credential
endpoints are omitted, while detection can miss secrets. The complete disclosure
was visible in the failing DOM output.

The test now matches the current provider disclosure both before and after
endpoint selection. Its positive assertion requires the complete-URL warning,
and an additional independent assertion requires the omission/detection caveat.
All original preferences-only defaults, unticked sections, exact listings,
hidden endpoint paths, disabled empty sections, import confirmations, atomic
save behavior and export-action checks remain. The production component,
exchange helper, locales, consent behavior, configuration and thresholds are
unchanged. The relevant test history contained no existing repair to reuse.

## Executed evidence

Using Node `24.22.3`, Vitest `5.1.0`, the original repository Vite configuration,
one worker and a 384 MiB heap, from `apps/web`:

```sh
NODE_OPTIONS=--max-old-space-size=384 ../../node_modules/.bin/vitest run   src/views/Settings.exchange.test.tsx --maxWorkers=1 --coverage.enabled=false
```

- Unchanged candidate test: **1 failed, 10 passed**; 28.00 seconds. The sole
  failure is the obsolete provider-warning matcher at line 72.
- Repaired complete file: **11 passed**, zero failures; 9.93 seconds.
- `git diff --check`: passed.

The isolated checkout copied existing compiled workspace outputs from the
coordinator's candidate checkout. Workspace package links resolve within this checkout;
no local source-alias configuration was used or added. These are focused unit
results, not a full coverage, lint, build or browser qualification. Raw outputs
are retained in `evidence/` with only trailing blank lines removed; hashes pin the
changed test and three
unchanged runtime/locale inputs.

## Independent review and integration

The recovery worker independently reviewed exact commit
`83bc4f52767d88e6896d986a29f6d3495e8c22c4`, verified the committed test hash, and
confirmed the component, exchange helper and English locale are unchanged from
the base. It found no introduced blocker, retained all original default/listing/
privacy assertions, and confirmed the explicit omission caveat. This was source
review; the author's runtime results are not relabeled as an independent replay.

No root checkout source, remote branch, main merge, deployment or release was
modified by this worker. The coordinator retains combined-source qualification.
